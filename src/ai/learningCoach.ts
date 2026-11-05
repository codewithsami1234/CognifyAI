import type {
  AssessmentKind,
  AssessmentRequest,
  DocumentChunk,
  LearningCoachRequest,
  RagAnswer,
  RevisionRecommendation,
  TopicScore,
} from "./aiTypes";
import { answerQuestion } from "./ragPipeline";
import { retrieveKeywords } from "./keywordRetrieval";
import type { ModelRuntime } from "./modelRuntime";
import { INSUFFICIENT_EVIDENCE_MESSAGE } from "./contextPreparation";

export const COACH_METHOD_NOTE =
  "Weak topics and revision suggestions use recorded scores and keyword overlap. They are threshold rules, not trained predictions.";

export const DEFAULT_WEAK_ACCURACY = 0.6;
export const DEFAULT_PRACTICE_COUNT = 2;

const NO_HISTORY_MESSAGE =
  "There is no recorded MCQ history yet, so no weak topic or practice assessment was chosen.";

const NO_WEAK_TOPIC_MESSAGE =
  "Recorded MCQ accuracy is above the threshold. No revision topic was selected.";

const NO_PASSAGE_MESSAGE =
  "No imported passage shares content words with the recorded topic. Nothing was added from outside the notes.";

export interface PassageRecommendation {
  status: "passages" | "insufficient_evidence";
  message: string;
  methodNote: string;
  query: string;
  passages: Array<{
    documentName: string;
    chunkId: string;
    pageNumber?: number;
    section?: string;
    text: string;
  }>;
}

export type PracticePlan =
  | {
      status: "ready";
      topic: string;
      methodNote: string;
      request: AssessmentRequest;
    }
  | {
      status: "insufficient_evidence";
      message: string;
      methodNote: string;
      reason: "no_history" | "no_weak_topic" | "no_matches" | "invalid_threshold";
    };

function isFraction(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

export function topicAccuracy(score: TopicScore): number | undefined {
  if (!Number.isInteger(score.correct) || !Number.isInteger(score.attempted)) {
    return undefined;
  }
  if (score.attempted < 1 || score.correct < 0 || score.correct > score.attempted) {
    return undefined;
  }
  return score.correct / score.attempted;
}

/**
 * Topics at or below the caller's accuracy threshold.
 * A topic with no attempts is omitted. Nothing is inferred from a topic name alone.
 */
export function identifyWeakTopics(scores: readonly TopicScore[], weakAccuracyAtOrBelow: number): TopicScore[] {
  if (!isFraction(weakAccuracyAtOrBelow)) {
    return [];
  }
  return scores
    .filter((score) => {
      const accuracy = topicAccuracy(score);
      return accuracy !== undefined && accuracy <= weakAccuracyAtOrBelow;
    })
    .sort((left, right) => {
      const accuracyGap = (topicAccuracy(left) ?? 1) - (topicAccuracy(right) ?? 1);
      if (accuracyGap !== 0) {
        return accuracyGap;
      }
      return left.topic.localeCompare(right.topic);
    });
}

/**
 * Rule-based revision list. The reason text names the threshold.
 * It does not describe a trained model.
 */
export function recommendRevision(request: LearningCoachRequest): RevisionRecommendation[] {
  const limit = request.maxRecommendations ?? 3;
  if (!Number.isInteger(limit) || limit < 1) {
    return [];
  }
  const weak = identifyWeakTopics(request.scores, request.weakAccuracyAtOrBelow);
  return weak.slice(0, Math.min(limit, 10)).map((score) => {
    const accuracy = topicAccuracy(score) ?? 0;
    const recommendation: RevisionRecommendation = {
      topic: score.topic,
      accuracy,
      reason: `Rule: recorded accuracy ${Math.round(accuracy * 1000) / 10}% is at or below ${Math.round(request.weakAccuracyAtOrBelow * 1000) / 10}%. This uses stored MCQ results, not a trained prediction.`,
      sources: (score.sources ?? []).map((source) => ({ ...source })),
    };
    return recommendation;
  });
}

export function recommendPassages(chunks: readonly DocumentChunk[], query: string): PassageRecommendation {
  const retrieval = retrieveKeywords(query, chunks, { topK: 3 });
  if (retrieval.outcome !== "ranked" || retrieval.hits.length === 0 || retrieval.evidenceStrength === "weak") {
    return {
      status: "insufficient_evidence",
      message: retrieval.outcome === "empty_documents" ? INSUFFICIENT_EVIDENCE_MESSAGE : NO_PASSAGE_MESSAGE,
      methodNote: COACH_METHOD_NOTE,
      query,
      passages: [],
    };
  }
  return {
    status: "passages",
    message: "These passages share content words with the query. Shared words are not proof that the passage answers it.",
    methodNote: COACH_METHOD_NOTE,
    query,
    passages: retrieval.hits.map((hit) => {
      const passage: PassageRecommendation["passages"][number] = {
        documentName: hit.chunk.documentName,
        chunkId: hit.chunk.chunkId,
        text: hit.chunk.text,
      };
      if (hit.chunk.pageNumber !== undefined && Number.isInteger(hit.chunk.pageNumber) && hit.chunk.pageNumber >= 1) {
        passage.pageNumber = hit.chunk.pageNumber;
      }
      if (hit.chunk.section !== undefined && hit.chunk.section.trim().length > 0) {
        passage.section = hit.chunk.section;
      }
      return passage;
    }),
  };
}

/**
 * A practice request for generateAssessment.
 * The focus is a recorded weak topic, and only when keyword retrieval finds passages.
 */
export function buildPracticeAssessment(input: {
  chunks: readonly DocumentChunk[];
  scores: readonly TopicScore[];
  kind?: AssessmentKind;
  weakAccuracyAtOrBelow?: number;
  count?: 1 | 2 | 3;
}): PracticePlan {
  const threshold = input.weakAccuracyAtOrBelow ?? DEFAULT_WEAK_ACCURACY;
  if (!isFraction(threshold)) {
    return {
      status: "insufficient_evidence",
      message: "The accuracy threshold is not between 0 and 1, so no practice assessment was generated.",
      methodNote: COACH_METHOD_NOTE,
      reason: "invalid_threshold",
    };
  }
  if (input.scores.length === 0) {
    return {
      status: "insufficient_evidence",
      message: NO_HISTORY_MESSAGE,
      methodNote: COACH_METHOD_NOTE,
      reason: "no_history",
    };
  }
  const weak = identifyWeakTopics(input.scores, threshold);
  if (weak.length === 0) {
    return {
      status: "insufficient_evidence",
      message: NO_WEAK_TOPIC_MESSAGE,
      methodNote: COACH_METHOD_NOTE,
      reason: "no_weak_topic",
    };
  }
  for (const score of weak) {
    const retrieval = retrieveKeywords(score.topic, input.chunks, { topK: 2 });
    if (retrieval.outcome === "ranked" && retrieval.hits.length > 0) {
      const request: AssessmentRequest = {
        chunks: input.chunks.slice(),
        kind: input.kind ?? "mcq",
        count: input.count ?? DEFAULT_PRACTICE_COUNT,
        focus: score.topic,
      };
      return {
        status: "ready",
        topic: score.topic,
        methodNote: `${COACH_METHOD_NOTE} The practice focus is the weakest recorded topic that shares words with the imported notes.`,
        request,
      };
    }
  }
  return {
    status: "insufficient_evidence",
    message: NO_PASSAGE_MESSAGE,
    methodNote: COACH_METHOD_NOTE,
    reason: "no_matches",
  };
}

/**
 * Explain a question with the tutor's evidence gate.
 * Retrieval misses do not call the model.
 */
export async function explainWithEvidence(
  runtime: ModelRuntime,
  chunks: readonly DocumentChunk[],
  question: string,
): Promise<RagAnswer> {
  return answerQuestion(runtime, {
    question,
    chunks: chunks.slice(),
    maxTokens: 256,
    temperature: 0.2,
  });
}
