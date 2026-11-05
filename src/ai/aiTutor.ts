import type { DocumentChunk, FollowUpContext, ModelStatus, RagAnswer, RagRequest } from "./aiTypes";
import { DEFAULT_MAX_CONTEXT_CHARS, DEFAULT_MAX_QUESTION_CHARS } from "./contextPreparation";
import { chunkText } from "./textChunking";
import { retrieveKeywords, stemStudyToken, studyContentTerms, tokenizeStudyText } from "./keywordRetrieval";
import { answerQuestion } from "./ragPipeline";
import { DEFAULT_N_CTX, DEFAULT_N_GPU_LAYERS } from "./llamaRnRuntime";
import type { ModelRuntime } from "./modelRuntime";

/**
 * Text the caller already extracted from a student file.
 * This service does not open PDFs, images, or the network.
 */
export interface StudyMaterialInput {
  documentId: string;
  documentName: string;
  text: string;
  /** Only when the importer knows it. Omitted values stay omitted. */
  pageNumber?: number;
  section?: string;
}

export interface PreparedStudyMaterial {
  chunkCount: number;
  documentNames: string[];
  chunkIds: string[];
}

export interface AiTutorOptions {
  runtime: ModelRuntime;
  /** App-private path or file URI of a GGUF file already on disk. */
  modelPath: string;
  nCtx?: number;
  nGpuLayers?: number;
  topK?: number;
  maxContextChars?: number;
  maxQuestionChars?: number;
  maxTokens?: number;
  temperature?: number;
  chunkMaxChars?: number;
  chunkOverlapChars?: number;
  /**
   * Optional local retrieval. When it returns chunks, those chunks are the
   * evidence. When it returns nothing, keyword retrieval is unchanged.
   */
  retrieveEvidence?: (
    question: string,
    chunks: readonly DocumentChunk[],
  ) => Promise<RagRequest["evidence"] | undefined>;
}

export interface AiTutor {
  initialize(): Promise<ModelStatus>;
  isReady(): boolean;
  prepareStudyMaterial(materials: readonly StudyMaterialInput[]): PreparedStudyMaterial;
  askQuestion(question: string): Promise<RagAnswer>;
  /** Drops the prepared chunks and releases the model context. */
  dispose(): Promise<void>;
  /**
   * The next initialize loads again. Call this when another feature
   * initializes the same runtime with different context settings.
   */
  forgetInitialization(): Promise<void>;
  getStatus(): ModelStatus;
}

function assertMaterial(material: StudyMaterialInput): void {
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
      "pageNumber must be a positive integer when it is provided. The tutor does not invent page numbers.",
    );
  }
}

function chunkMaterial(material: StudyMaterialInput, options: AiTutorOptions): DocumentChunk[] {
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
  if (options.chunkMaxChars !== undefined) {
    chunkOptions.maxChars = options.chunkMaxChars;
  }
  if (options.chunkOverlapChars !== undefined) {
    chunkOptions.overlapChars = options.chunkOverlapChars;
  }
  return chunkText(material.text, chunkOptions);
}

const FOLLOW_UP_CUES: ReadonlySet<string> = new Set([
  "it",
  "its",
  "they",
  "them",
  "their",
  "that",
  "this",
  "these",
  "those",
  "he",
  "she",
  "her",
  "him",
]);

/** A follow-up with more of its own content words is treated as a new question. */
const MAX_FOLLOW_UP_OWN_TERMS = 2;
const MAX_TOPIC_TERMS = 8;

function expandFollowUp(
  question: string,
  priorTerms: readonly string[],
): { addedTerms: string[] } | undefined {
  if (priorTerms.length === 0) {
    return undefined;
  }
  const tokens = tokenizeStudyText(question);
  if (!tokens.some((token) => FOLLOW_UP_CUES.has(token))) {
    return undefined;
  }
  const own = studyContentTerms(question);
  if (own.length > MAX_FOLLOW_UP_OWN_TERMS) {
    return undefined;
  }
  const ownStems = new Set(own.map((term) => stemStudyToken(term)));
  const addedTerms = priorTerms.filter((term) => !ownStems.has(stemStudyToken(term)));
  if (addedTerms.length === 0) {
    return undefined;
  }
  return { addedTerms };
}

function notReadyAnswer(
  question: string,
  chunks: readonly DocumentChunk[],
  status: ModelStatus,
  retrievalText?: string,
): RagAnswer {
  const started = Date.now();
  const retrieval = retrieveKeywords(retrievalText ?? question, chunks);
  return {
    status: "error",
    answer: "The local model is not ready, so no answer was generated.",
    sources: [],
    retrieval,
    error: status.error ?? {
      code: "MODEL_NOT_LOADED",
      message: `Model runtime is ${status.state}. Initialize it with a local GGUF path before answering.`,
    },
    timings: {
      retrievalMs: 0,
      totalMs: Date.now() - started,
    },
    contextCharCount: 0,
    usedChunkIds: [],
    truncatedContext: false,
  };
}

/**
 * Offline tutor over the existing chunker, keyword retrieval, and local runtime.
 *
 * A returned answer is generated text. Source fields are copied from the chunks
 * that were retrieved, never parsed from the model completion. Keyword overlap,
 * including shared word endings, does not prove a passage answers the question.
 *
 * After an answered question, a short later question that says "it", "that",
 * or "they" reuses that question's content terms for retrieval only. Replacing
 * the notes clears those terms. A follow-up that still matches nothing does
 * not call the model.
 *
 * Initialize, ask, forget, and dispose run one at a time. A second initialize
 * is skipped when this service already loaded the same path and context and
 * the runtime is still ready.
 */
export function createAiTutor(options: AiTutorOptions): AiTutor {
  const nCtx = options.nCtx ?? DEFAULT_N_CTX;
  const nGpuLayers = options.nGpuLayers ?? DEFAULT_N_GPU_LAYERS;
  const requestedKey = `${options.modelPath}\0${nCtx}\0${nGpuLayers}`;
  let appliedKey: string | undefined;
  let storedChunks: DocumentChunk[] = [];
  let topicTerms: string[] = [];
  let topicQuestion: string | undefined;
  let materialGeneration = 0;
  let chain: Promise<unknown> = Promise.resolve();

  const enqueue = <T>(operation: () => Promise<T>): Promise<T> => {
    const run = chain.then(operation, operation);
    chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };

  const ragRequest = (question: string): RagRequest => {
    const request: RagRequest = {
      question,
      chunks: storedChunks,
      maxContextChars: options.maxContextChars ?? DEFAULT_MAX_CONTEXT_CHARS,
      maxQuestionChars: options.maxQuestionChars ?? DEFAULT_MAX_QUESTION_CHARS,
    };
    if (options.topK !== undefined) {
      request.topK = options.topK;
    }
    if (options.maxTokens !== undefined) {
      request.maxTokens = options.maxTokens;
    }
    if (options.temperature !== undefined) {
      request.temperature = options.temperature;
    }
    return request;
  };

  return {
    initialize(): Promise<ModelStatus> {
      return enqueue(async () => {
        const current = options.runtime.getStatus();
        if (current.state === "ready" && current.modelPath === options.modelPath && appliedKey === requestedKey) {
          return current;
        }
        const next = await options.runtime.initialize({
          modelPath: options.modelPath,
          nCtx,
          nGpuLayers,
          retrySmallerContext: true,
        });
        appliedKey = next.state === "ready" ? requestedKey : undefined;
        return next;
      });
    },

    isReady(): boolean {
      return options.runtime.getStatus().state === "ready" && appliedKey === requestedKey;
    },

    getStatus(): ModelStatus {
      return options.runtime.getStatus();
    },

    prepareStudyMaterial(materials: readonly StudyMaterialInput[]): PreparedStudyMaterial {
      for (const material of materials) {
        assertMaterial(material);
      }
      materialGeneration += 1;
      topicTerms = [];
      topicQuestion = undefined;
      storedChunks = materials.flatMap((material) => chunkMaterial(material, options));
      return {
        chunkCount: storedChunks.length,
        documentNames: [...new Set(storedChunks.map((chunk) => chunk.documentName))],
        chunkIds: storedChunks.map((chunk) => chunk.chunkId),
      };
    },

    askQuestion(question: string): Promise<RagAnswer> {
      return enqueue(async () => {
        const generation = materialGeneration;
        const trimmed = question.trim();
        const followUp = trimmed.length > 0 ? expandFollowUp(trimmed, topicTerms) : undefined;
        const request = ragRequest(question);
        if (followUp) {
          request.retrievalText = `${trimmed} ${followUp.addedTerms.join(" ")}`;
          if (topicQuestion) {
            request.priorQuestion = topicQuestion;
          }
        }
        if (options.retrieveEvidence && trimmed.length > 0 && storedChunks.length > 0) {
          try {
            const evidence = await options.retrieveEvidence(request.retrievalText ?? trimmed, storedChunks);
            if (evidence && evidence.chunks.length > 0) {
              request.evidence = evidence;
            }
          } catch {
            // Keyword retrieval still runs when local semantic search cannot.
          }
        }

        let answer: RagAnswer;
        if (trimmed.length === 0) {
          answer = await answerQuestion(options.runtime, request);
        } else {
          const status = options.runtime.getStatus();
          if (status.state !== "ready") {
            answer = notReadyAnswer(question, storedChunks, status, request.retrievalText);
          } else {
            answer = await answerQuestion(options.runtime, request);
          }
        }

        if (followUp && topicQuestion) {
          const context: FollowUpContext = {
            priorQuestion: topicQuestion,
            addedTerms: followUp.addedTerms,
          };
          answer = { ...answer, followUp: context };
        }

        if (
          answer.status === "answered" &&
          !followUp &&
          generation === materialGeneration &&
          trimmed.length > 0
        ) {
          const terms = studyContentTerms(trimmed).slice(0, MAX_TOPIC_TERMS);
          if (terms.length > 0) {
            topicTerms = terms;
            topicQuestion = trimmed;
          }
        }
        return answer;
      });
    },

    dispose(): Promise<void> {
      return enqueue(async () => {
        storedChunks = [];
        topicTerms = [];
        topicQuestion = undefined;
        materialGeneration += 1;
        appliedKey = undefined;
        await options.runtime.release();
      });
    },

    forgetInitialization(): Promise<void> {
      return enqueue(async () => {
        appliedKey = undefined;
      });
    },
  };
}
