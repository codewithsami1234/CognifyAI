import type { TopicScore } from "./aiTypes";
import type { QuizReport, ScoredFlashcard, ScoredMcq } from "./quizScoring";
import { PROGRESS_STORE_NAME, type TextStore, utf8ByteLength } from "./textStore";

export const MAX_STUDY_ACTIVITIES = 100;

export type StudyActivityKind =
  | "quiz_completed"
  | "document_imported"
  | "document_removed"
  | "tutor_question"
  | "coach_practice"
  | "coach_explanation";

export interface StudyActivity {
  id: string;
  at: string;
  kind: StudyActivityKind;
  label: string;
}

export interface LearningProgress {
  schemaVersion: 1;
  quizzes: QuizReport[];
  activities: StudyActivity[];
}

export interface ProgressSummary {
  quizzesAttempted: number;
  questionsAttempted: number;
  mcqCorrect: number;
  mcqIncorrect: number;
  mcqUnanswered: number;
  mcqAccuracyPercent: number | null;
  shortAnswerUnderstood: number;
  shortAnswerNeedsReview: number;
  shortAnswerUnrated: number;
  flashcardsKnown: number;
  flashcardsNeedsRevision: number;
  flashcardsReviewed: number;
  completionTimestamps: string[];
  activities: StudyActivity[];
}

export type ProgressLoad =
  | { status: "empty"; progress: LearningProgress }
  | { status: "ok"; progress: LearningProgress }
  | { status: "unreadable"; progress: LearningProgress };

const ACTIVITY_KINDS: ReadonlySet<string> = new Set([
  "quiz_completed",
  "document_imported",
  "document_removed",
  "tutor_question",
  "coach_practice",
  "coach_explanation",
]);

/** Quiz rows the Learning Coach reads. The JSON progress file is the only store. */
export function learningRecordsFromProgress(progress: LearningProgress): { quizzes: LearningProgress["quizzes"] } {
  return { quizzes: progress.quizzes.slice() };
}

export function emptyLearningProgress(): LearningProgress {
  return { schemaVersion: 1, quizzes: [], activities: [] };
}

export function emptyProgressSummary(): ProgressSummary {
  return summarizeProgress(emptyLearningProgress());
}

function accuracyPercent(correct: number, attempted: number): number | null {
  if (attempted < 1) {
    return null;
  }
  return Math.round((correct / attempted) * 1000) / 10;
}

export function summarizeProgress(progress: LearningProgress): ProgressSummary {
  let questionsAttempted = 0;
  let mcqCorrect = 0;
  let mcqIncorrect = 0;
  let mcqUnanswered = 0;
  let shortAnswerUnderstood = 0;
  let shortAnswerNeedsReview = 0;
  let shortAnswerUnrated = 0;
  let flashcardsKnown = 0;
  let flashcardsNeedsRevision = 0;
  const completionTimestamps: string[] = [];

  for (const quiz of progress.quizzes) {
    questionsAttempted += quiz.mcqItems.length + quiz.shortAnswers.length + quiz.flashcards.length;
    mcqCorrect += quiz.mcqCorrect;
    mcqIncorrect += quiz.mcqIncorrect;
    mcqUnanswered += quiz.mcqUnanswered;
    completionTimestamps.push(quiz.submittedAt);
    for (const item of quiz.shortAnswers) {
      if (item.selfAssessment === "understood") {
        shortAnswerUnderstood += 1;
      } else if (item.selfAssessment === "needs_review") {
        shortAnswerNeedsReview += 1;
      } else {
        shortAnswerUnrated += 1;
      }
    }
    for (const card of quiz.flashcards) {
      if (card.mark === "known") {
        flashcardsKnown += 1;
      } else if (card.mark === "needs_revision") {
        flashcardsNeedsRevision += 1;
      }
    }
  }

  return {
    quizzesAttempted: progress.quizzes.length,
    questionsAttempted,
    mcqCorrect,
    mcqIncorrect,
    mcqUnanswered,
    mcqAccuracyPercent: accuracyPercent(mcqCorrect, mcqCorrect + mcqIncorrect + mcqUnanswered),
    shortAnswerUnderstood,
    shortAnswerNeedsReview,
    shortAnswerUnrated,
    flashcardsKnown,
    flashcardsNeedsRevision,
    flashcardsReviewed: flashcardsKnown + flashcardsNeedsRevision,
    completionTimestamps,
    activities: progress.activities.slice(),
  };
}

/**
 * Store a finished quiz once.
 * The same session id leaves the history unchanged.
 */
export function recordQuiz(progress: LearningProgress, report: QuizReport): LearningProgress {
  if (progress.quizzes.some((quiz) => quiz.sessionId === report.sessionId)) {
    return progress;
  }
  const activity: StudyActivity = {
    id: `quiz-${report.sessionId}`,
    at: report.submittedAt,
    kind: "quiz_completed",
    label: activityLabel(report),
  };
  return {
    schemaVersion: 1,
    quizzes: progress.quizzes.concat(report),
    activities: appendActivity(progress.activities, activity),
  };
}

function activityLabel(report: QuizReport): string {
  if (report.kind === "mcq") {
    const accuracy = report.mcqAccuracyPercent === null ? "no score" : `${report.mcqAccuracyPercent}%`;
    return `MCQ quiz finished, ${accuracy} against the model's marked options`;
  }
  if (report.kind === "short_answer") {
    return `Short-answer quiz finished, ${report.shortAnswers.length} reference comparison(s)`;
  }
  const review = report.flashcards.filter((card) => card.mark !== "unreviewed").length;
  return `Flashcard review finished, ${review} card(s) marked`;
}

export function replaceQuizReport(progress: LearningProgress, report: QuizReport): LearningProgress {
  const index = progress.quizzes.findIndex((quiz) => quiz.sessionId === report.sessionId);
  if (index < 0) {
    return progress;
  }
  const quizzes = progress.quizzes.slice();
  quizzes[index] = report;
  return { ...progress, quizzes };
}

export function appendStudyActivity(progress: LearningProgress, activity: StudyActivity): LearningProgress {
  if (!isActivity(activity)) {
    return progress;
  }
  return { ...progress, activities: appendActivity(progress.activities, activity) };
}

function appendActivity(activities: readonly StudyActivity[], activity: StudyActivity): StudyActivity[] {
  if (activities.some((existing) => existing.id === activity.id)) {
    return activities.slice();
  }
  const next = activities.concat(activity);
  if (next.length <= MAX_STUDY_ACTIVITIES) {
    return next;
  }
  return next.slice(next.length - MAX_STUDY_ACTIVITIES);
}

export function topicScoresFromProgress(progress: LearningProgress): TopicScore[] {
  const totals = new Map<string, { correct: number; attempted: number; sources: TopicScore["sources"] }>();
  for (const quiz of progress.quizzes) {
    for (const item of quiz.mcqItems) {
      for (const topic of item.topics) {
        const current = totals.get(topic) ?? { correct: 0, attempted: 0, sources: [] };
        current.attempted += 1;
        if (item.outcome === "correct") {
          current.correct += 1;
        }
        for (const source of item.sources) {
          const known = current.sources?.some((existing) => existing.chunkId === source.chunkId) === true;
          if (!known) {
            current.sources = (current.sources ?? []).concat({ ...source });
          }
        }
        totals.set(topic, current);
      }
    }
  }
  return Array.from(totals.entries())
    .map(([topic, tally]) => {
      const score: TopicScore = {
        topic,
        correct: tally.correct,
        attempted: tally.attempted,
      };
      if (tally.sources && tally.sources.length > 0) {
        score.sources = tally.sources;
      }
      return score;
    })
    .sort((left, right) => left.topic.localeCompare(right.topic));
}

export function missedQuestions(progress: LearningProgress): ScoredMcq[] {
  return progress.quizzes.flatMap((quiz) => quiz.mcqItems.filter((item) => item.outcome === "incorrect"));
}

export function revisionCards(progress: LearningProgress): ScoredFlashcard[] {
  return progress.quizzes.flatMap((quiz) => quiz.flashcards.filter((card) => card.mark === "needs_revision"));
}

export async function saveLearningProgress(store: TextStore, progress: LearningProgress): Promise<void> {
  await store.write(PROGRESS_STORE_NAME, JSON.stringify(progress));
}

export async function loadLearningProgress(store: TextStore): Promise<ProgressLoad> {
  const raw = await store.read(PROGRESS_STORE_NAME);
  if (raw === null || raw.trim().length === 0) {
    return { status: "empty", progress: emptyLearningProgress() };
  }
  const progress = parseProgress(raw);
  if (!progress) {
    return { status: "unreadable", progress: emptyLearningProgress() };
  }
  return { status: "ok", progress };
}

/**
 * Deletes the progress file only.
 * Library documents and the GGUF model are other files and are not touched.
 */
export async function clearLearningProgress(store: TextStore): Promise<void> {
  await store.remove(PROGRESS_STORE_NAME);
}

export async function progressFileBytes(store: TextStore): Promise<number> {
  const raw = await store.read(PROGRESS_STORE_NAME);
  if (raw === null) {
    return 0;
  }
  return utf8ByteLength(raw);
}

function parseProgress(raw: string): LearningProgress | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return undefined;
  }
  const record = parsed as { schemaVersion?: unknown; quizzes?: unknown; activities?: unknown };
  if (record.schemaVersion !== 1 || !Array.isArray(record.quizzes) || !Array.isArray(record.activities)) {
    return undefined;
  }
  if (!record.quizzes.every(isQuizReport) || !record.activities.every(isActivity)) {
    return undefined;
  }
  return {
    schemaVersion: 1,
    quizzes: record.quizzes,
    activities: record.activities,
  };
}

function isQuizReport(value: unknown): value is QuizReport {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const quiz = value as QuizReport;
  return (
    typeof quiz.sessionId === "string" &&
    quiz.sessionId.length > 0 &&
    (quiz.kind === "mcq" || quiz.kind === "short_answer" || quiz.kind === "flashcard") &&
    typeof quiz.submittedAt === "string" &&
    Number.isInteger(quiz.mcqCorrect) &&
    Number.isInteger(quiz.mcqIncorrect) &&
    Number.isInteger(quiz.mcqUnanswered) &&
    (quiz.mcqAccuracyPercent === null || typeof quiz.mcqAccuracyPercent === "number") &&
    quiz.mcqBasis === "model_marked_option" &&
    typeof quiz.mcqBasisNote === "string" &&
    typeof quiz.shortAnswerNote === "string" &&
    Array.isArray(quiz.mcqItems) &&
    Array.isArray(quiz.shortAnswers) &&
    Array.isArray(quiz.flashcards)
  );
}

function isActivity(value: unknown): value is StudyActivity {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const activity = value as StudyActivity;
  return (
    typeof activity.id === "string" &&
    activity.id.length > 0 &&
    typeof activity.at === "string" &&
    typeof activity.label === "string" &&
    activity.label.length > 0 &&
    ACTIVITY_KINDS.has(activity.kind)
  );
}
