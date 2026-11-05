import type { StudyMaterialInput } from "./aiTutor";
import type {
  AiError,
  AssessmentItem,
  AssessmentKind,
  AssessmentRequest,
  AssessmentResult,
  AssessmentStatus,
  DocumentChunk,
  FlashcardItem,
  InsufficientReason,
  KeywordRetrievalResult,
  McqItem,
  RetrievalHit,
  ShortAnswerItem,
  SourceReference,
} from "./aiTypes";
import {
  parseAssessmentDrafts,
  type FlashcardDraft,
  type McqDraft,
  type ShortAnswerDraft,
} from "./assessmentValidation";
import { INSUFFICIENT_EVIDENCE_SENTINEL } from "./contextPreparation";
import { toAiError } from "./errors";
import { retrieveKeywords } from "./keywordRetrieval";
import type { ModelRuntime } from "./modelRuntime";
import { toSourceReference } from "./sourceReferences";
import { chunkText } from "./textChunking";

/** The local 1B model is asked for at most this many items. */
export const MIN_ASSESSMENT_COUNT = 1;
export const MAX_ASSESSMENT_COUNT = 3;

/**
 * Packed passage text shorter than this does not call the model.
 * This is a length gate, not a judgment that the text is relevant or true.
 */
export const MIN_ASSESSMENT_EVIDENCE_CHARS = 20;

export const DEFAULT_ASSESSMENT_TOP_K = 2;
export const DEFAULT_ASSESSMENT_MAX_CONTEXT_CHARS = 600;
export const DEFAULT_ASSESSMENT_MAX_TOKENS = 320;
export const MAX_ASSESSMENT_MAX_TOKENS = 512;
export const MAX_ASSESSMENT_CONTEXT_CHARS = 2000;
export const DEFAULT_ASSESSMENT_TEMPERATURE = 0;

const ASSESSMENT_EVIDENCE_MESSAGE =
  "The supplied study material does not contain enough text to generate this assessment.";

const ASSESSMENT_FOCUS_MESSAGE =
  "The focus does not contain a content word, so no passages were selected. Leave the focus blank to use the study text in order.";

const UNVERIFIED_MESSAGE =
  "The model returned assessment items from the retrieved passages. They are not verified as correct.";

interface PackedEvidence {
  passages: string[];
  sources: SourceReference[];
  usedChunkIds: string[];
  contextCharCount: number;
  truncated: boolean;
}

interface Selection {
  retrievalMs: number;
  retrieval?: KeywordRetrievalResult;
  insufficientReason?: InsufficientReason;
  message?: string;
  packed: PackedEvidence;
  prompt?: string;
}

function isAssessmentKind(value: unknown): value is AssessmentKind {
  return value === "mcq" || value === "short_answer" || value === "flashcard";
}

function isReadableChunk(value: unknown): value is DocumentChunk {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const chunk = value as DocumentChunk;
  return (
    typeof chunk.documentId === "string" &&
    typeof chunk.documentName === "string" &&
    typeof chunk.chunkId === "string" &&
    typeof chunk.text === "string"
  );
}

function emptyPack(): PackedEvidence {
  return {
    passages: [],
    sources: [],
    usedChunkIds: [],
    contextCharCount: 0,
    truncated: false,
  };
}

/**
 * Copy source fields from packed chunks.
 * A page number that is not a positive integer is omitted rather than shown.
 */
function copySources(sources: readonly SourceReference[]): SourceReference[] {
  return sources.map((source) => {
    const copy: SourceReference = {
      documentId: source.documentId,
      documentName: source.documentName,
      chunkId: source.chunkId,
    };
    if (source.pageNumber !== undefined && Number.isInteger(source.pageNumber) && source.pageNumber >= 1) {
      copy.pageNumber = source.pageNumber;
    }
    if (source.section !== undefined && source.section.trim().length > 0) {
      copy.section = source.section;
    }
    if (source.startOffset !== undefined) {
      copy.startOffset = source.startOffset;
    }
    if (source.endOffset !== undefined) {
      copy.endOffset = source.endOffset;
    }
    return copy;
  });
}

/**
 * Keep passage text inside the character budget.
 * Labels are [1], [2], ... Document names and page numbers stay out of the prompt.
 */
function packEvidence(hits: readonly RetrievalHit[], maxContextChars: number): PackedEvidence {
  const passages: string[] = [];
  const sources: SourceReference[] = [];
  const usedChunkIds: string[] = [];
  let contextCharCount = 0;
  let truncated = false;

  for (let index = 0; index < hits.length; index += 1) {
    const hit = hits[index];
    if (!hit) {
      continue;
    }
    const remaining = maxContextChars - contextCharCount;
    if (remaining <= 0) {
      continue;
    }
    let passage = hit.chunk.text.trim();
    if (passage.length === 0) {
      continue;
    }
    if (passage.length > remaining) {
      passage = passage.slice(0, remaining).trimEnd();
      truncated = true;
    }
    if (passage.length === 0) {
      continue;
    }
    passages.push(passage);
    sources.push(toSourceReference(hit.chunk));
    usedChunkIds.push(hit.chunk.chunkId);
    contextCharCount += passage.length;
    if (truncated) {
      break;
    }
  }

  return {
    passages,
    sources: copySources(sources),
    usedChunkIds,
    contextCharCount,
    truncated,
  };
}

function instructionFor(kind: AssessmentKind, count: number): string {
  if (kind === "mcq") {
    return [
      `Write ${count} multiple-choice questions when the passages support them.`,
      "Each question has exactly 4 different non-empty options and exactly one correct option.",
      "The correct option must be supported by the passages. Do not invent facts to fill the count.",
      'Use this shape: {"items":[{"question":"...","options":["...","...","...","..."],"correctAnswerIndex":0,"explanation":"..."}]}',
      "correctAnswerIndex is the number 0, 1, 2, or 3. explanation is optional.",
    ].join(" ");
  }
  if (kind === "short_answer") {
    return [
      `Write ${count} short-answer questions when the passages support them.`,
      "referenceAnswer is a short fact from the passages. Do not invent facts to fill the count.",
      'Use this shape: {"items":[{"question":"...","referenceAnswer":"..."}]}',
    ].join(" ");
  }
  return [
    `Write ${count} flashcards when the passages support them.`,
    "front is a term or question. back is the definition or answer from the passages.",
    "Do not invent facts to fill the count.",
    'Use this shape: {"items":[{"front":"...","back":"..."}]}',
  ].join(" ");
}

function buildAssessmentPrompt(kind: AssessmentKind, count: number, passages: readonly string[]): string {
  const blocks = passages.map((passage, index) => `[${index + 1}]\n${passage}`);
  return [
    "You write a study assessment using only the evidence passages.",
    "Do not use outside knowledge.",
    "Do not name documents, pages, slides, or file names.",
    "If the passages do not contain enough information for even one item, reply with exactly this line and nothing else:",
    INSUFFICIENT_EVIDENCE_SENTINEL,
    "Otherwise reply with JSON only. No markdown and no commentary.",
    instructionFor(kind, count),
    "",
    "Evidence:",
    blocks.join("\n\n"),
    "",
    "JSON:",
  ].join("\n");
}

function evidenceMessage(reason: InsufficientReason): string {
  if (reason === "empty_query") {
    return ASSESSMENT_FOCUS_MESSAGE;
  }
  return ASSESSMENT_EVIDENCE_MESSAGE;
}

function selectEvidence(
  chunks: readonly DocumentChunk[],
  kind: AssessmentKind,
  count: number,
  focus: string,
  topK: number,
  maxContextChars: number,
): Selection {
  const retrievalStarted = Date.now();
  let hits: RetrievalHit[] = [];
  let retrieval: KeywordRetrievalResult | undefined;
  let insufficientReason: InsufficientReason | undefined;

  if (focus.length > 0) {
    retrieval = retrieveKeywords(focus, chunks, { topK });
    if (retrieval.outcome !== "ranked" || retrieval.evidenceStrength === "weak") {
      insufficientReason = retrieval.evidenceStrength === "weak" || retrieval.outcome === "ranked" ? "below_minimum" : retrieval.outcome;
    } else {
      hits = retrieval.hits;
    }
  } else {
    const usable = chunks.filter((chunk) => chunk.text.trim().length > 0);
    if (usable.length === 0) {
      insufficientReason = "empty_documents";
    } else {
      hits = usable.slice(0, topK).map((chunk) => ({
        chunk,
        score: 0,
        matchedTerms: [],
      }));
    }
  }

  const retrievalMs = Date.now() - retrievalStarted;
  if (insufficientReason !== undefined) {
    return {
      retrievalMs,
      retrieval,
      insufficientReason,
      message: evidenceMessage(insufficientReason),
      packed: emptyPack(),
    };
  }

  const packed = packEvidence(hits, maxContextChars);
  if (packed.usedChunkIds.length === 0) {
    const reason: InsufficientReason = focus.length > 0 ? "no_matches" : "empty_documents";
    return {
      retrievalMs,
      retrieval,
      insufficientReason: reason,
      message: evidenceMessage(reason),
      packed,
    };
  }
  if (packed.contextCharCount < MIN_ASSESSMENT_EVIDENCE_CHARS) {
    return {
      retrievalMs,
      retrieval,
      insufficientReason: "below_minimum",
      message: ASSESSMENT_EVIDENCE_MESSAGE,
      packed,
    };
  }

  return {
    retrievalMs,
    retrieval,
    packed,
    prompt: buildAssessmentPrompt(kind, count, packed.passages),
  };
}

function buildResult(partial: {
  started: number;
  kind: AssessmentKind;
  requestedCount: number;
  status: AssessmentStatus;
  message: string;
  retrievalMs: number;
  items?: AssessmentItem[];
  rejectedCount?: number;
  sources?: SourceReference[];
  insufficientReason?: InsufficientReason;
  error?: AiError;
  rawModelText?: string;
  generationMs?: number;
  contextCharCount?: number;
  usedChunkIds?: string[];
  truncatedContext?: boolean;
  retrieval?: KeywordRetrievalResult;
}): AssessmentResult {
  const result: AssessmentResult = {
    status: partial.status,
    kind: partial.kind,
    items: partial.items ?? [],
    rejectedCount: partial.rejectedCount ?? 0,
    requestedCount: partial.requestedCount,
    sources: partial.sources ?? [],
    message: partial.message,
    timings: {
      retrievalMs: partial.retrievalMs,
      totalMs: Date.now() - partial.started,
    },
    contextCharCount: partial.contextCharCount ?? 0,
    usedChunkIds: partial.usedChunkIds ?? [],
    truncatedContext: partial.truncatedContext ?? false,
  };
  if (partial.generationMs !== undefined) {
    result.timings.generationMs = partial.generationMs;
  }
  if (partial.insufficientReason !== undefined) {
    result.insufficientReason = partial.insufficientReason;
  }
  if (partial.error !== undefined) {
    result.error = partial.error;
  }
  if (partial.rawModelText !== undefined) {
    result.rawModelText = partial.rawModelText;
  }
  if (partial.retrieval !== undefined) {
    result.retrieval = partial.retrieval;
  }
  return result;
}

function requestProblem(request: AssessmentRequest): string | undefined {
  if (!isAssessmentKind(request.kind)) {
    return "Assessment kind must be mcq, short_answer, or flashcard.";
  }
  if (!Number.isInteger(request.count) || request.count < MIN_ASSESSMENT_COUNT || request.count > MAX_ASSESSMENT_COUNT) {
    return `Assessment count must be a whole number from ${MIN_ASSESSMENT_COUNT} to ${MAX_ASSESSMENT_COUNT}.`;
  }
  if (!Array.isArray(request.chunks)) {
    return "Assessment chunks must be an array.";
  }
  const focusValue = (request as { focus?: unknown }).focus;
  if (focusValue !== undefined && typeof focusValue !== "string") {
    return "Assessment focus must be a string when it is provided.";
  }
  if (request.topK !== undefined && (!Number.isInteger(request.topK) || request.topK < 1)) {
    return "topK must be a positive integer when it is provided.";
  }
  if (
    request.maxContextChars !== undefined &&
    (!Number.isInteger(request.maxContextChars) ||
      request.maxContextChars < 1 ||
      request.maxContextChars > MAX_ASSESSMENT_CONTEXT_CHARS)
  ) {
    return `maxContextChars must be a whole number from 1 to ${MAX_ASSESSMENT_CONTEXT_CHARS}.`;
  }
  if (
    request.maxTokens !== undefined &&
    (!Number.isInteger(request.maxTokens) || request.maxTokens < 1 || request.maxTokens > MAX_ASSESSMENT_MAX_TOKENS)
  ) {
    return `maxTokens must be a whole number from 1 to ${MAX_ASSESSMENT_MAX_TOKENS}.`;
  }
  if (
    request.temperature !== undefined &&
    (!Number.isFinite(request.temperature) || request.temperature < 0 || request.temperature > 1)
  ) {
    return "temperature must be a number from 0 to 1 when it is provided.";
  }
  return undefined;
}

function assignItems(
  kind: AssessmentKind,
  drafts: readonly (McqDraft | ShortAnswerDraft | FlashcardDraft)[],
  sources: readonly SourceReference[],
): AssessmentItem[] {
  return drafts.map((draft, index) => {
    const itemSources = copySources(sources);
    if (kind === "mcq") {
      const mcq = draft as McqDraft;
      const item: McqItem = {
        id: `mcq-${index + 1}`,
        question: mcq.question,
        options: mcq.options,
        correctAnswerIndex: mcq.correctAnswerIndex,
        sources: itemSources,
      };
      if (mcq.explanation !== undefined) {
        item.explanation = mcq.explanation;
      }
      return item;
    }
    if (kind === "short_answer") {
      const short = draft as ShortAnswerDraft;
      const item: ShortAnswerItem = {
        id: `short-answer-${index + 1}`,
        question: short.question,
        referenceAnswer: short.referenceAnswer,
        sources: itemSources,
      };
      return item;
    }
    const card = draft as FlashcardDraft;
    const item: FlashcardItem = {
      id: `flashcard-${index + 1}`,
      front: card.front,
      back: card.back,
      sources: itemSources,
    };
    return item;
  });
}

function assertStudyMaterial(material: StudyMaterialInput): void {
  if (material.documentId.trim().length === 0 || material.documentName.trim().length === 0) {
    throw new Error(
      "Study material needs a documentId and a documentName. Page numbers are optional and are not inferred.",
    );
  }
  if (
    material.pageNumber !== undefined &&
    (!Number.isInteger(material.pageNumber) || material.pageNumber < 1)
  ) {
    throw new Error(
      "pageNumber must be a positive integer when it is provided. Page numbers are not inferred.",
    );
  }
}

/**
 * Chunk imported or pasted study text the same way the tutor does.
 * Page and slide fields are copied only when the caller already knows them.
 */
export function chunksFromStudyMaterials(
  materials: readonly StudyMaterialInput[],
  options?: { maxChars?: number; overlapChars?: number },
): DocumentChunk[] {
  const chunks: DocumentChunk[] = [];
  for (const material of materials) {
    assertStudyMaterial(material);
    const chunkOptions: {
      documentId: string;
      documentName: string;
      pageNumber?: number;
      section?: string;
      maxChars?: number;
      overlapChars?: number;
    } = {
      documentId: material.documentId.trim(),
      documentName: material.documentName.trim(),
    };
    if (material.pageNumber !== undefined) {
      chunkOptions.pageNumber = material.pageNumber;
    }
    const section = material.section?.trim();
    if (section) {
      chunkOptions.section = section;
    }
    if (options?.maxChars !== undefined) {
      chunkOptions.maxChars = options.maxChars;
    }
    if (options?.overlapChars !== undefined) {
      chunkOptions.overlapChars = options.overlapChars;
    }
    chunks.push(...chunkText(material.text, chunkOptions));
  }
  return chunks;
}

/**
 * Generate MCQs, short answers, or flashcards from study chunks.
 *
 * The model is not called when the chunks are missing, too short, or have no
 * keyword overlap with a focus. Source fields on each item are copied from the
 * chunks placed in the prompt. A validated item is still not marked correct.
 */
export async function generateAssessment(
  runtime: ModelRuntime,
  request: AssessmentRequest,
): Promise<AssessmentResult> {
  const started = Date.now();
  const kind: AssessmentKind = isAssessmentKind(request.kind) ? request.kind : "mcq";
  const requestedCount = Number.isInteger(request.count) ? request.count : 0;
  const problem = requestProblem(request);
  if (problem !== undefined) {
    return buildResult({
      started,
      kind,
      requestedCount,
      status: "error",
      message: problem,
      retrievalMs: 0,
      error: {
        code: "INVALID_REQUEST",
        message: problem,
      },
    });
  }

  const readable = request.chunks.filter(isReadableChunk);
  const focus = request.focus?.trim() ?? "";
  const selection = selectEvidence(
    readable,
    kind,
    request.count,
    focus,
    request.topK ?? DEFAULT_ASSESSMENT_TOP_K,
    request.maxContextChars ?? DEFAULT_ASSESSMENT_MAX_CONTEXT_CHARS,
  );

  if (selection.insufficientReason !== undefined || selection.prompt === undefined) {
    return buildResult({
      started,
      kind,
      requestedCount: request.count,
      status: "insufficient_evidence",
      message: selection.message ?? ASSESSMENT_EVIDENCE_MESSAGE,
      retrievalMs: selection.retrievalMs,
      sources: selection.packed.sources,
      insufficientReason: selection.insufficientReason ?? "no_matches",
      contextCharCount: selection.packed.contextCharCount,
      usedChunkIds: selection.packed.usedChunkIds,
      truncatedContext: selection.packed.truncated,
      retrieval: selection.retrieval,
    });
  }

  const modelStatus = runtime.getStatus();
  if (modelStatus.state !== "ready") {
    return buildResult({
      started,
      kind,
      requestedCount: request.count,
      status: "error",
      message: "The local model is not ready, so no assessment was generated.",
      retrievalMs: selection.retrievalMs,
      sources: selection.packed.sources,
      contextCharCount: selection.packed.contextCharCount,
      usedChunkIds: selection.packed.usedChunkIds,
      truncatedContext: selection.packed.truncated,
      retrieval: selection.retrieval,
      error: modelStatus.error ?? {
        code: "MODEL_NOT_LOADED",
        message: `Model runtime is ${modelStatus.state}. Initialize it with a local GGUF path before generating an assessment.`,
      },
    });
  }

  try {
    const generated = await runtime.generate({
      prompt: selection.prompt,
      maxTokens: request.maxTokens ?? DEFAULT_ASSESSMENT_MAX_TOKENS,
      temperature: request.temperature ?? DEFAULT_ASSESSMENT_TEMPERATURE,
    });
    const common = {
      started,
      kind,
      requestedCount: request.count,
      retrievalMs: selection.retrievalMs,
      sources: selection.packed.sources,
      rawModelText: generated.text,
      generationMs: generated.generationTimeMs,
      contextCharCount: selection.packed.contextCharCount,
      usedChunkIds: selection.packed.usedChunkIds,
      truncatedContext: selection.packed.truncated,
      retrieval: selection.retrieval,
    };

    if (kind === "mcq") {
      return interpretDrafts(common, parseAssessmentDrafts(generated.text, "mcq"), selection.packed.sources);
    }
    if (kind === "short_answer") {
      return interpretDrafts(
        common,
        parseAssessmentDrafts(generated.text, "short_answer"),
        selection.packed.sources,
      );
    }
    return interpretDrafts(common, parseAssessmentDrafts(generated.text, "flashcard"), selection.packed.sources);
  } catch (error) {
    return buildResult({
      started,
      kind,
      requestedCount: request.count,
      status: "error",
      message: "Local generation failed before an assessment could be produced.",
      retrievalMs: selection.retrievalMs,
      sources: selection.packed.sources,
      contextCharCount: selection.packed.contextCharCount,
      usedChunkIds: selection.packed.usedChunkIds,
      truncatedContext: selection.packed.truncated,
      retrieval: selection.retrieval,
      error: toAiError(error, "INFERENCE_FAILED", "Local generation failed. No cloud model was called."),
    });
  }
}

function interpretDrafts<T extends McqDraft | ShortAnswerDraft | FlashcardDraft>(
  common: {
    started: number;
    kind: AssessmentKind;
    requestedCount: number;
    retrievalMs: number;
    sources: SourceReference[];
    rawModelText: string;
    generationMs: number;
    contextCharCount: number;
    usedChunkIds: string[];
    truncatedContext: boolean;
    retrieval?: KeywordRetrievalResult;
  },
  parsed: { status: "declined" } | { status: "malformed" } | { status: "items"; drafts: T[]; rejectedCount: number },
  sources: readonly SourceReference[],
): AssessmentResult {
  if (parsed.status === "declined") {
    return buildResult({
      ...common,
      status: "insufficient_evidence",
      message: ASSESSMENT_EVIDENCE_MESSAGE,
      insufficientReason: "model_declined",
    });
  }
  if (parsed.status === "malformed") {
    return buildResult({
      ...common,
      status: "error",
      message: "The model output could not be read as assessment JSON. It is not shown as an assessment.",
      error: {
        code: "MALFORMED_OUTPUT",
        message: "The model output could not be read as assessment JSON.",
      },
    });
  }
  const kept = parsed.drafts.slice(0, common.requestedCount);
  if (kept.length === 0) {
    const message =
      parsed.rejectedCount > 0
        ? "Every generated item failed validation. Nothing is shown as an assessment."
        : "The model returned no assessment items.";
    return buildResult({
      ...common,
      status: "error",
      message,
      rejectedCount: parsed.rejectedCount,
      error: {
        code: "MALFORMED_OUTPUT",
        message,
      },
    });
  }
  return buildResult({
    ...common,
    status: "ok",
    message: UNVERIFIED_MESSAGE,
    items: assignItems(common.kind, kept, sources),
    rejectedCount: parsed.rejectedCount,
  });
}
