export type { DocumentChunk, SourceReference, AiError, AiErrorCode } from "./aiTypes";
export type {
  GenerationRequest,
  GenerationResult,
  ModelStatus,
  ModelInitOptions,
  ModelFileInfo,
  FileStat,
  FileStatter,
  RetrievalHit,
  KeywordRetrievalResult,
  RetrievalOutcome,
  RagAnswer,
  RagRequest,
  FollowUpContext,
  RagStatus,
  InsufficientReason,
  InferenceProbeReport,
  ResourceSnapshot,
  TutorRequest,
  TutorResponse,
  AssessmentKind,
  CorrectAnswerIndex,
  McqItem,
  ShortAnswerItem,
  FlashcardItem,
  AssessmentItem,
  AssessmentStatus,
  AssessmentRequest,
  AssessmentResult,
  TopicScore,
  RevisionRecommendation,
  LearningCoachRequest,
} from "./aiTypes";

export { chunkText } from "./textChunking";
export type { ChunkTextOptions } from "./textChunking";

export {
  retrieveKeywords,
  normalizeStudyText,
  tokenizeStudyText,
  isContentToken,
  studyContentTerms,
  stemStudyToken,
  STUDY_SYNONYM_GROUPS,
  synonymStemsFor,
  STOPWORDS,
} from "./keywordRetrieval";
export type { KeywordRetrievalOptions } from "./keywordRetrieval";

export { toSourceReference } from "./sourceReferences";

export {
  prepareGroundedPrompt,
  isModelDecline,
  DEFAULT_MAX_CONTEXT_CHARS,
  DEFAULT_MAX_QUESTION_CHARS,
  INSUFFICIENT_EVIDENCE_SENTINEL,
  INSUFFICIENT_EVIDENCE_MESSAGE,
} from "./contextPreparation";
export type { PreparedPrompt } from "./contextPreparation";

export { answerQuestion } from "./ragPipeline";

export { interpretStudyExtraction, MAX_STUDY_DOCUMENT_BYTES } from "./studyImport";
export type {
  ExtractedPage,
  ImportedStudyDocument,
  StudyExtraction,
  StudyImportResult,
} from "./studyImport";

export { createAiTutor } from "./aiTutor";
export type { AiTutor, AiTutorOptions, PreparedStudyMaterial, StudyMaterialInput } from "./aiTutor";

export { generateAssessment, chunksFromStudyMaterials } from "./assessmentGenerator";

export {
  accuracyPercent,
  buildQuizReport,
  emptyAnswerMap,
  evaluateShortAnswer,
  isOptionIndex,
  MCQ_BASIS,
  MCQ_BASIS_NOTE,
  scoreMcqSelection,
  SHORT_ANSWER_NOTE,
  topicLabel,
  topicsFromSources,
  withShortAnswerSelfAssessment,
} from "./quizScoring";
export type {
  FlashcardMark,
  FlashcardReviewMark,
  McqOutcome,
  QuizAnswerMap,
  QuizReport,
  ScoredFlashcard,
  ScoredMcq,
  ScoredShortAnswer,
  ShortAnswerSelfAssessment,
} from "./quizScoring";

export {
  confirmSubmit,
  createQuizSession,
  goToQuestion,
  listUnanswered,
  markFlashcard,
  nextQuestion,
  previousQuestion,
  quizPosition,
  requestSubmit,
  revealFlashcard,
  selectMcq,
  setShortAnswer,
  setShortAnswerSelfAssessment,
  visibleQuestion,
} from "./quizSession";
export type { QuizSession, SubmitQuizResult, UnansweredQuestion, VisibleQuestion } from "./quizSession";

export { clearQuizDraft, loadQuizDraft, saveQuizDraft } from "./quizDraft";
export type { QuizDraftLoad } from "./quizDraft";

export {
  appendStudyActivity,
  clearLearningProgress,
  emptyLearningProgress,
  learningRecordsFromProgress,
  emptyProgressSummary,
  loadLearningProgress,
  MAX_STUDY_ACTIVITIES,
  missedQuestions,
  progressFileBytes,
  recordQuiz,
  replaceQuizReport,
  revisionCards,
  saveLearningProgress,
  summarizeProgress,
  topicScoresFromProgress,
} from "./learningProgress";
export type {
  LearningProgress,
  ProgressLoad,
  ProgressSummary,
  StudyActivity,
  StudyActivityKind,
} from "./learningProgress";

export {
  buildPracticeAssessment,
  COACH_METHOD_NOTE,
  DEFAULT_PRACTICE_COUNT,
  DEFAULT_WEAK_ACCURACY,
  explainWithEvidence,
  identifyWeakTopics,
  recommendPassages,
  recommendRevision,
  topicAccuracy,
} from "./learningCoach";
export type { PassageRecommendation, PracticePlan } from "./learningCoach";

export {
  addImportedDocument,
  addPastedDocument,
  documentTypeFromFileName,
  emptyDocumentLibrary,
  getDocument,
  libraryFileBytes,
  loadDocumentLibrary,
  provenanceLine,
  removeDocument,
  saveDocumentLibrary,
} from "./documentLibrary";
export type {
  DocumentLibrary,
  LibraryDocument,
  LibraryDocumentType,
  LibraryLoad,
} from "./documentLibrary";

export {
  chooseStoredText,
  createMemoryTextStore,
  isStoreName,
  LIBRARY_STORE_NAME,
  PROGRESS_STORE_NAME,
  QUIZ_DRAFT_STORE_NAME,
  utf8ByteLength,
} from "./textStore";
export type { TextStore } from "./textStore";
export {
  MAX_ASSESSMENT_COUNT,
  MIN_ASSESSMENT_COUNT,
  MIN_ASSESSMENT_EVIDENCE_CHARS,
  DEFAULT_ASSESSMENT_TOP_K,
  DEFAULT_ASSESSMENT_MAX_CONTEXT_CHARS,
  DEFAULT_ASSESSMENT_MAX_TOKENS,
  MAX_ASSESSMENT_MAX_TOKENS,
  MAX_ASSESSMENT_CONTEXT_CHARS,
  DEFAULT_ASSESSMENT_TEMPERATURE,
} from "./assessmentGenerator";

export {
  validateMcqDraft,
  validateShortAnswerDraft,
  validateFlashcardDraft,
  parseAssessmentDrafts,
  MAX_ASSESSMENT_FIELD_CHARS,
} from "./assessmentValidation";
export type {
  McqDraft,
  ShortAnswerDraft,
  FlashcardDraft,
  DraftParse,
} from "./assessmentValidation";

export { ModelRuntimeError, toAiError } from "./errors";

export {
  withGenerationQueue,
  readNodeResourceSnapshot,
  assertReady,
} from "./modelRuntime";
export type { ModelRuntime } from "./modelRuntime";

export {
  createLlamaRnRuntime,
  toFileUri,
  DEFAULT_N_CTX,
  DEFAULT_N_GPU_LAYERS,
  DEFAULT_STOP_WORDS,
} from "./llamaRnRuntime";
export type { LlamaRnModule, LlamaRnRuntimeOptions } from "./llamaRnRuntime";

export { createScriptedRuntime } from "./scriptedRuntime";
export type { ScriptedRuntimeHandle, ScriptedRuntimeOptions } from "./scriptedRuntime";

export { runInferenceProbe } from "./inferenceProbe";
export type { InferenceProbeOptions } from "./inferenceProbe";

export { parseGgufMetadata, fileTypeName } from "./ggufMetadata";
export type { GgufMetadata, GgufMetadataRead } from "./ggufMetadata";

export { MODEL_CHOICES, identifyModelChoice, architectureMatchesChoice, PRIMARY_MODEL_ID, FALLBACK_MODEL_ID } from "./modelCatalog";
export type { ModelChoice } from "./modelCatalog";

export { evaluateRetrieval } from "./retrievalEval";
export type { RetrievalEvalCase, RetrievalEvalReport } from "./retrievalEval";

export { evaluateGroundingCase, unsupportedContentTerms } from "./groundingEval";
export type { GroundingCase, GroundingCaseResult } from "./groundingEval";

export { reviewMcqAgainstSource } from "./assessmentQuality";
export type { ReviewedMcq } from "./assessmentQuality";

export { inspectModelFile } from "./modelFile";
export type { PrefixReader } from "./modelFile";

export { PHOTOSYNTHESIS_TEXT, RESPIRATION_TEXT, PROCESS_TEXT, sampleStudyChunks } from "./fixtures/sampleStudyMaterial";
