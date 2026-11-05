import type {
  AiError,
  InsufficientReason,
  KeywordRetrievalResult,
  RagAnswer,
  RagRequest,
  RagStatus,
  SourceReference,
} from "./aiTypes";
import {
  DEFAULT_MAX_CONTEXT_CHARS,
  DEFAULT_MAX_QUESTION_CHARS,
  INSUFFICIENT_EVIDENCE_MESSAGE,
  isModelDecline,
  prepareGroundedPrompt,
} from "./contextPreparation";
import { toAiError } from "./errors";
import { retrieveKeywords } from "./keywordRetrieval";
import type { ModelRuntime } from "./modelRuntime";

function buildAnswer(partial: {
  status: RagStatus;
  answer: string;
  retrieval: KeywordRetrievalResult;
  started: number;
  retrievalMs: number;
  sources?: SourceReference[];
  insufficientReason?: InsufficientReason;
  error?: AiError;
  rawModelText?: string;
  generationMs?: number;
  contextCharCount?: number;
  usedChunkIds?: string[];
  truncatedContext?: boolean;
  retrievalMethod?: RagAnswer["retrievalMethod"];
}): RagAnswer {
  const answer: RagAnswer = {
    status: partial.status,
    answer: partial.answer,
    sources: partial.sources ?? [],
    retrieval: partial.retrieval,
    timings: {
      retrievalMs: partial.retrievalMs,
      totalMs: Date.now() - partial.started,
    },
    contextCharCount: partial.contextCharCount ?? 0,
    usedChunkIds: partial.usedChunkIds ?? [],
    truncatedContext: partial.truncatedContext ?? false,
  };
  if (partial.generationMs !== undefined) {
    answer.timings.generationMs = partial.generationMs;
  }
  if (partial.insufficientReason !== undefined) {
    answer.insufficientReason = partial.insufficientReason;
  }
  if (partial.error !== undefined) {
    answer.error = partial.error;
  }
  if (partial.rawModelText !== undefined) {
    answer.rawModelText = partial.rawModelText;
  }
  if (partial.retrievalMethod !== undefined) {
    answer.retrievalMethod = partial.retrievalMethod;
  }
  return answer;
}

function retrievalFromEvidence(evidence: NonNullable<RagRequest["evidence"]>): KeywordRetrievalResult {
  if (evidence.chunks.length === 0) {
    return {
      hits: [],
      queryTerms: [],
      ignoredTerms: [],
      expandedTerms: [],
      evidenceStrength: "none",
      outcome: "no_matches",
    };
  }
  return {
    hits: evidence.chunks.map((chunk) => ({
      chunk,
      score: evidence.scores?.[chunk.chunkId] ?? 1,
      matchedTerms: [],
    })),
    queryTerms: [],
    ignoredTerms: [],
    expandedTerms: [],
    evidenceStrength: "sufficient",
    outcome: "ranked",
  };
}

/**
 * Retrieve keyword passages, bound the evidence, and ask a local model to
 * answer from that evidence only.
 *
 * Source references are copied from the chunk records that were actually
 * placed in the prompt. Model text is never parsed for document names or pages.
 * A successful return does not prove the answer is factually correct.
 */
export async function answerQuestion(
  runtime: ModelRuntime,
  request: RagRequest,
): Promise<RagAnswer> {
  const started = Date.now();
  const retrievalStarted = Date.now();
  const usingEvidence = request.evidence !== undefined;
  const retrieval = usingEvidence
    ? retrievalFromEvidence(request.evidence as NonNullable<RagRequest["evidence"]>)
    : retrieveKeywords(request.retrievalText ?? request.question, request.chunks, {
        topK: request.topK ?? 3,
      });
  const retrievalMs = Date.now() - retrievalStarted;
  const retrievalMethod = usingEvidence ? request.evidence?.method : undefined;
  const maxQuestionChars = request.maxQuestionChars ?? DEFAULT_MAX_QUESTION_CHARS;

  if (request.question.trim().length === 0) {
    return buildAnswer({
      status: "error",
      answer: "Enter a question before asking the study tutor.",
      retrieval,
      started,
      retrievalMs,
      error: {
        code: "EMPTY_QUESTION",
        message: "The question is empty.",
      },
    });
  }

  if (request.question.trim().length > maxQuestionChars) {
    return buildAnswer({
      status: "error",
      answer: "This question is too long for the proof-of-concept context budget.",
      retrieval,
      started,
      retrievalMs,
      error: {
        code: "CONTEXT_TOO_LONG",
        message: `The question is ${request.question.trim().length} characters. The limit is ${maxQuestionChars}.`,
      },
    });
  }

  if (
    !usingEvidence &&
    (retrieval.outcome === "empty_query" ||
      retrieval.outcome === "empty_documents" ||
      retrieval.outcome === "no_matches" ||
      retrieval.evidenceStrength === "weak")
  ) {
    return buildAnswer({
      status: "insufficient_evidence",
      answer: INSUFFICIENT_EVIDENCE_MESSAGE,
      retrieval,
      started,
      retrievalMs,
      insufficientReason: retrieval.evidenceStrength === "weak" || retrieval.outcome === "ranked" ? "below_minimum" : retrieval.outcome,
    });
  }

  if (usingEvidence && retrieval.outcome !== "ranked") {
    return buildAnswer({
      status: "insufficient_evidence",
      answer: INSUFFICIENT_EVIDENCE_MESSAGE,
      retrieval,
      started,
      retrievalMs,
      insufficientReason: "no_matches",
      retrievalMethod,
    });
  }

  const prepared = prepareGroundedPrompt(
    request.question,
    retrieval.hits,
    request.maxContextChars ?? DEFAULT_MAX_CONTEXT_CHARS,
    request.priorQuestion,
  );

  if (prepared.usedChunkIds.length === 0) {
    return buildAnswer({
      status: "insufficient_evidence",
      answer: INSUFFICIENT_EVIDENCE_MESSAGE,
      retrieval,
      started,
      retrievalMs,
      insufficientReason: "no_matches",
    });
  }

  const modelStatus = runtime.getStatus();
  if (modelStatus.state !== "ready") {
    return buildAnswer({
      status: "error",
      answer: "The local model is not ready, so no answer was generated.",
      retrieval,
      started,
      retrievalMs,
      sources: prepared.sources,
      usedChunkIds: prepared.usedChunkIds,
      contextCharCount: prepared.contextCharCount,
      truncatedContext: prepared.truncated,
      error: modelStatus.error ?? {
        code: "MODEL_NOT_LOADED",
        message: `Model runtime is ${modelStatus.state}. Initialize it with a local GGUF path before answering.`,
      },
    });
  }

  try {
    const generated = await runtime.generate({
      prompt: prepared.prompt,
      maxTokens: request.maxTokens ?? 256,
      temperature: request.temperature ?? 0.2,
    });

    if (generated.text.trim().length === 0) {
      return buildAnswer({
        status: "error",
        answer: "The model returned no text. No source was taken from the empty completion.",
        retrieval,
        started,
        retrievalMs,
        sources: prepared.sources,
        usedChunkIds: prepared.usedChunkIds,
        contextCharCount: prepared.contextCharCount,
        truncatedContext: prepared.truncated,
        rawModelText: generated.text,
        generationMs: generated.generationTimeMs,
        error: {
          code: "MALFORMED_OUTPUT",
          message: "The model completion was empty.",
        },
      });
    }

    if (isModelDecline(generated.text)) {
      return buildAnswer({
        status: "insufficient_evidence",
        answer: INSUFFICIENT_EVIDENCE_MESSAGE,
        retrieval,
        started,
        retrievalMs,
        sources: prepared.sources,
        usedChunkIds: prepared.usedChunkIds,
        contextCharCount: prepared.contextCharCount,
        truncatedContext: prepared.truncated,
        rawModelText: generated.text,
        generationMs: generated.generationTimeMs,
        insufficientReason: "model_declined",
      });
    }

    return buildAnswer({
      status: "answered",
      answer: generated.text.trim(),
      retrieval,
      started,
      retrievalMs,
      sources: prepared.sources,
      usedChunkIds: prepared.usedChunkIds,
      contextCharCount: prepared.contextCharCount,
      truncatedContext: prepared.truncated,
      rawModelText: generated.text,
      generationMs: generated.generationTimeMs,
      retrievalMethod,
    });
  } catch (error) {
    return buildAnswer({
      status: "error",
      answer: "Local generation failed before an answer could be produced.",
      retrieval,
      started,
      retrievalMs,
      sources: prepared.sources,
      usedChunkIds: prepared.usedChunkIds,
      contextCharCount: prepared.contextCharCount,
      truncatedContext: prepared.truncated,
      error: toAiError(
        error,
        "INFERENCE_FAILED",
        "Local generation failed. No cloud model was called.",
      ),
    });
  }
}
