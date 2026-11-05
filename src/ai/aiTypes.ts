/**
 * Shared types for Cognify AI.
 *
 * Implemented: document chunks, retrieval, grounded answers, the local model
 * runtime, the offline tutor service in aiTutor.ts, assessment generation
 * in assessmentGenerator.ts, quiz scoring, local progress, the document
 * library, and the rule-based learning coach.
 *
 * Learning-coach request types below are the contract recommendRevision uses.
 * Recommendations are threshold rules on recorded scores, not a trained model.
 */

export interface DocumentChunk {
  documentId: string;
  documentName: string;
  chunkId: string;
  text: string;
  /** Present when the document processor knows a page or slide number. */
  pageNumber?: number;
  /** Present when the document processor knows a heading or section label. */
  section?: string;
  /**
   * Start offset into the source string passed to the chunker.
   * Offsets are UTF-16 code units, the same units as String.slice.
   */
  startOffset?: number;
  /** End offset, exclusive, in the same units as startOffset. */
  endOffset?: number;
}

export interface SourceReference {
  documentId: string;
  documentName: string;
  chunkId: string;
  pageNumber?: number;
  section?: string;
  startOffset?: number;
  endOffset?: number;
}

export type AiErrorCode =
  | "EMPTY_QUESTION"
  | "EMPTY_DOCUMENTS"
  | "INSUFFICIENT_EVIDENCE"
  | "MODEL_NOT_LOADED"
  | "MODEL_LOAD_FAILED"
  | "MODEL_FILE_MISSING"
  | "MODEL_FILE_INVALID"
  | "INFERENCE_FAILED"
  | "CONTEXT_TOO_LONG"
  | "MALFORMED_OUTPUT"
  | "INVALID_REQUEST"
  | "RUNTIME_UNAVAILABLE";

export interface AiError {
  code: AiErrorCode;
  message: string;
  /** Original error message when one was caught. Never includes secrets. */
  cause?: string;
}

export interface GenerationRequest {
  prompt: string;
  /** Maximum new tokens. The runtime may ignore this if the backend uses another name. */
  maxTokens?: number;
  temperature?: number;
  stop?: string[];
}

export interface GenerationResult {
  text: string;
  /** Wall-clock time spent inside the runtime generate call, in milliseconds. */
  generationTimeMs: number;
  /** Backend-reported token count when the runtime actually provides one. */
  tokenCount?: number;
  /** Wall-clock time until the first token callback. Absent when the runtime never called it. */
  firstTokenMs?: number;
}

export type ModelRuntimeState =
  | "uninitialized"
  | "loading"
  | "ready"
  | "failed"
  | "released";

export interface ModelStatus {
  state: ModelRuntimeState;
  modelPath?: string;
  /** Identifier of the runtime implementation, such as "llama.rn" or "scripted". */
  runtimeId: string;
  error?: AiError;
  initTimeMs?: number;
  lastGenerationTimeMs?: number;
}

export interface ModelInitOptions {
  /**
   * Absolute path or file URI of a GGUF model already stored on disk.
   * Initialization must not download a model.
   */
  modelPath: string;
  nCtx?: number;
  /** Layers to offload. The proof of concept defaults to 0 (CPU) when omitted by the adapter. */
  nGpuLayers?: number;
  /**
   * When the first load fails with a memory error, try once more with half
   * the context, down to 256. Missing files are not retried.
   */
  retrySmallerContext?: boolean;
}

export interface ModelFileInfo {
  path: string;
  exists: boolean;
  sizeBytes?: number;
  /** True when the first four bytes are the GGUF magic. Absent when the file was not read. */
  ggufMagic?: boolean;
  readable: boolean;
  error?: string;
}

export interface FileStat {
  exists: boolean;
  sizeBytes?: number;
  error?: string;
}

export type FileStatter = (path: string) => Promise<FileStat>;

export interface RetrievalHit {
  chunk: DocumentChunk;
  /**
   * Explainable overlap score. A positive score means some query terms occur
   * in the chunk. It does not mean the chunk answers the question.
   */
  score: number;
  matchedTerms: string[];
}

export type RetrievalOutcome =
  | "ranked"
  | "empty_query"
  | "empty_documents"
  | "no_matches";

/**
 * sufficient: a content term, or a listed synonym of one, matched a passage.
 * weak: only a very short incidental token matched. The tutor does not generate.
 * none: no passage was kept.
 * This is keyword overlap, not a semantic embedding score.
 */
export type EvidenceStrength = "sufficient" | "weak" | "none";

export interface KeywordRetrievalResult {
  hits: RetrievalHit[];
  /** Content terms kept from the question after normalization. */
  queryTerms: string[];
  /** Tokens removed as common words or too-short tokens. */
  ignoredTerms: string[];
  /** Listed synonyms consulted for the query. Empty when none applied. */
  expandedTerms: string[];
  evidenceStrength: EvidenceStrength;
  outcome: RetrievalOutcome;
}

export interface RagTimings {
  retrievalMs: number;
  generationMs?: number;
  totalMs: number;
}

export type RagStatus = "answered" | "insufficient_evidence" | "error";

export type InsufficientReason =
  | "no_matches"
  | "empty_documents"
  | "empty_query"
  | "model_declined"
  | "below_minimum";

/** Set when a short follow-up reused terms from an earlier answered question. */
export interface FollowUpContext {
  priorQuestion: string;
  /** Content terms added for retrieval. They are not new facts. */
  addedTerms: string[];
}

export interface RagAnswer {
  status: RagStatus;
  /** Text safe to show the student. Sources are not parsed out of this string. */
  answer: string;
  /** Unmodified model text when a generation call was made. */
  rawModelText?: string;
  sources: SourceReference[];
  retrieval: KeywordRetrievalResult;
  insufficientReason?: InsufficientReason;
  error?: AiError;
  timings: RagTimings;
  contextCharCount: number;
  usedChunkIds: string[];
  truncatedContext: boolean;
  /** Present when retrieval was widened with the previous question's terms. */
  followUp?: FollowUpContext;
  /**
   * Set when the caller supplied evidence chunks. Absent on the keyword path.
   * "semantic" and "hybrid" are only set by the hybrid search caller.
   */
  retrievalMethod?: "keyword" | "semantic" | "hybrid" | "selection";
}

export interface RagRequest {
  question: string;
  chunks: DocumentChunk[];
  /**
   * Text used only for keyword retrieval. Defaults to `question`.
   * A follow-up can add terms from the previous question here without
   * replacing the question the model is asked.
   */
  retrievalText?: string;
  /**
   * Earlier student question, included so words such as "it" can be read
   * against the passages. It is not evidence.
   */
  priorQuestion?: string;
  /** Number of chunks to consider, before the context budget drops some. Default 3. */
  topK?: number;
  /** Maximum characters of evidence text placed in the prompt. Default 3500. */
  maxContextChars?: number;
  /** Questions longer than this are rejected. Default 1000. */
  maxQuestionChars?: number;
  maxTokens?: number;
  temperature?: number;
  /**
   * When set, these chunks are the only evidence. Keyword retrieval does not
   * drop them. Sources are still copied from these chunk records.
   */
  evidence?: {
    chunks: DocumentChunk[];
    scores?: Readonly<Record<string, number>>;
    method: "keyword" | "semantic" | "hybrid" | "selection";
  };
}

export interface ResourceSnapshot {
  source: "node-process" | "unavailable";
  heapUsedBytes?: number;
  rssBytes?: number;
  note: string;
}

export interface InferenceProbeReport {
  runtimeId: string;
  modelPath: string;
  loaded: boolean;
  generated: boolean;
  initTimeMs?: number;
  generationTimeMs?: number;
  firstTokenMs?: number;
  tokenCount?: number;
  outputText?: string;
  error?: AiError;
  status: ModelStatus;
  resourcesBefore: ResourceSnapshot;
  resourcesAfter: ResourceSnapshot;
}

/**
 * Narrow question shape. Prefer createAiTutor, which also prepares chunks
 * from imported text.
 */
export interface TutorRequest {
  question: string;
  chunks: DocumentChunk[];
}

export type TutorResponse = RagAnswer;

export type AssessmentKind = "mcq" | "short_answer" | "flashcard";

export type CorrectAnswerIndex = 0 | 1 | 2 | 3;

/**
 * One multiple-choice question.
 * `sources` are copied from retrieved chunks. They are not read from model text.
 * `correctAnswerIndex` is the model's selection. It is not a verified grade.
 */
export interface McqItem {
  id: string;
  question: string;
  options: [string, string, string, string];
  correctAnswerIndex: CorrectAnswerIndex;
  /** Present only when the model returned a non-empty explanation string. */
  explanation?: string;
  sources: SourceReference[];
}

export interface ShortAnswerItem {
  id: string;
  question: string;
  referenceAnswer: string;
  sources: SourceReference[];
}

export interface FlashcardItem {
  id: string;
  front: string;
  back: string;
  sources: SourceReference[];
}

export type AssessmentItem = McqItem | ShortAnswerItem | FlashcardItem;

export type AssessmentStatus = "ok" | "insufficient_evidence" | "error";

export interface AssessmentRequest {
  chunks: DocumentChunk[];
  kind: AssessmentKind;
  /**
   * How many items to ask for. Only 1, 2, or 3 are accepted.
   * A larger count is an error. It is not silently reduced.
   */
  count: number;
  /**
   * When this contains a content word, keyword retrieval selects passages.
   * When it is omitted or blank, passages are taken in chunk order.
   */
  focus?: string;
  /** Chunks to consider before the character budget. Default 2. */
  topK?: number;
  /** Maximum characters of passage text in the prompt. Default 600. */
  maxContextChars?: number;
  /** Maximum new tokens. Default 320. Values above 512 are rejected. */
  maxTokens?: number;
  /** Default 0, so the small model is more likely to stay on the JSON shape. */
  temperature?: number;
}

export interface AssessmentResult {
  status: AssessmentStatus;
  kind: AssessmentKind;
  /** Valid items only. Empty unless status is "ok". */
  items: AssessmentItem[];
  /** Items read from the model output and rejected. Not a count of dropped extras. */
  rejectedCount: number;
  requestedCount: number;
  /** Passages actually placed in the prompt. Empty when retrieval found nothing. */
  sources: SourceReference[];
  /** Sentence safe to show. It is not a generated question. */
  message: string;
  insufficientReason?: InsufficientReason;
  error?: AiError;
  /** Unmodified model text when a generation call was made. Not a validated assessment. */
  rawModelText?: string;
  timings: RagTimings;
  contextCharCount: number;
  usedChunkIds: string[];
  truncatedContext: boolean;
  /** Present when a focus string was used for keyword retrieval. */
  retrieval?: KeywordRetrievalResult;
}

export interface TopicScore {
  topic: string;
  correct: number;
  attempted: number;
  /** Optional links back to source chunks. Supplied by the app data layer, not invented here. */
  sources?: SourceReference[];
}

export interface RevisionRecommendation {
  topic: string;
  accuracy: number;
  reason: string;
  sources: SourceReference[];
}

export interface LearningCoachRequest {
  scores: TopicScore[];
  /** Topics at or below this accuracy are weak. The caller chooses the threshold. */
  weakAccuracyAtOrBelow: number;
  maxRecommendations?: number;
}
