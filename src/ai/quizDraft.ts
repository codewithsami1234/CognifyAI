/**
 * One unfinished quiz, stored as a local JSON file.
 * A submitted quiz is not written here. Completed attempts live in learning progress.
 * This module does not open the network and does not log question text.
 */

import type { AssessmentItem, AssessmentKind, CorrectAnswerIndex, SourceReference } from "./aiTypes";
import { MAX_ASSESSMENT_COUNT } from "./assessmentGenerator";
import { MAX_ASSESSMENT_FIELD_CHARS } from "./assessmentValidation";
import type { LearningProgress } from "./learningProgress";
import type { QuizSession } from "./quizSession";
import type { FlashcardReviewMark, QuizAnswerMap, ShortAnswerSelfAssessment } from "./quizScoring";
import { emptyAnswerMap } from "./quizScoring";
import { QUIZ_DRAFT_STORE_NAME, type TextStore } from "./textStore";

export { QUIZ_DRAFT_STORE_NAME };

const MAX_RESPONSE_CHARS = 4000;

export type QuizDraftLoad =
  | { status: "empty" }
  | { status: "ready"; session: QuizSession }
  | { status: "already_recorded"; sessionId: string }
  | { status: "unreadable" };

interface StoredDraftSession {
  id: string;
  kind: AssessmentKind;
  items: AssessmentItem[];
  index: number;
  answers: QuizAnswerMap;
  revealed: Record<string, true>;
  createdAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOptionalInt(value: unknown, minimum: number): boolean {
  return value === undefined || (typeof value === "number" && Number.isInteger(value) && value >= minimum);
}

function isShortText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

function isSource(value: unknown): value is SourceReference {
  if (!isRecord(value)) {
    return false;
  }
  if (!isShortText(value.documentId, 200) || !isShortText(value.documentName, 300) || !isShortText(value.chunkId, 200)) {
    return false;
  }
  if (!isOptionalInt(value.pageNumber, 1)) {
    return false;
  }
  if (value.section !== undefined && (typeof value.section !== "string" || value.section.length > 300)) {
    return false;
  }
  if (!isOptionalInt(value.startOffset, 0)) {
    return false;
  }
  if (!isOptionalInt(value.endOffset, 0)) {
    return false;
  }
  return true;
}

function isSources(value: unknown): value is SourceReference[] {
  return Array.isArray(value) && value.length > 0 && value.every(isSource);
}

function isIndex(value: unknown): value is CorrectAnswerIndex {
  return value === 0 || value === 1 || value === 2 || value === 3;
}

function isItem(value: unknown, kind: AssessmentKind): value is AssessmentItem {
  if (!isRecord(value) || !isShortText(value.id, 80) || !isSources(value.sources)) {
    return false;
  }
  if (kind === "mcq") {
    return (
      isShortText(value.question, MAX_ASSESSMENT_FIELD_CHARS) &&
      Array.isArray(value.options) &&
      value.options.length === 4 &&
      value.options.every((option) => isShortText(option, MAX_ASSESSMENT_FIELD_CHARS)) &&
      isIndex(value.correctAnswerIndex)
    );
  }
  if (kind === "short_answer") {
    return (
      isShortText(value.question, MAX_ASSESSMENT_FIELD_CHARS) &&
      isShortText(value.referenceAnswer, MAX_ASSESSMENT_FIELD_CHARS)
    );
  }
  return isShortText(value.front, MAX_ASSESSMENT_FIELD_CHARS) && isShortText(value.back, MAX_ASSESSMENT_FIELD_CHARS);
}

function isSelfAssessment(value: unknown): value is ShortAnswerSelfAssessment {
  return value === "understood" || value === "needs_review" || value === "unrated";
}

function isFlashcardMark(value: unknown): value is FlashcardReviewMark {
  return value === "known" || value === "needs_revision";
}

function parseAnswers(value: unknown, items: readonly AssessmentItem[], kind: AssessmentKind): QuizAnswerMap | undefined {
  if (!isRecord(value) || !isRecord(value.mcq) || !isRecord(value.shortAnswer) || !isRecord(value.flashcard)) {
    return undefined;
  }
  const ids = new Set(items.map((item) => item.id));
  const answers = emptyAnswerMap();
  const mcq: Record<string, CorrectAnswerIndex> = {};
  const shortAnswer: Record<string, { text: string; selfAssessment: ShortAnswerSelfAssessment }> = {};
  const flashcard: Record<string, FlashcardReviewMark> = {};

  for (const [id, selected] of Object.entries(value.mcq)) {
    if (!ids.has(id) || !isIndex(selected)) {
      return undefined;
    }
    mcq[id] = selected;
  }
  for (const [id, entry] of Object.entries(value.shortAnswer)) {
    if (!ids.has(id) || !isRecord(entry) || typeof entry.text !== "string" || entry.text.length > MAX_RESPONSE_CHARS) {
      return undefined;
    }
    if (!isSelfAssessment(entry.selfAssessment)) {
      return undefined;
    }
    shortAnswer[id] = { text: entry.text, selfAssessment: entry.selfAssessment };
  }
  for (const [id, mark] of Object.entries(value.flashcard)) {
    if (!ids.has(id) || !isFlashcardMark(mark)) {
      return undefined;
    }
    flashcard[id] = mark;
  }

  if (kind === "mcq" && (Object.keys(shortAnswer).length > 0 || Object.keys(flashcard).length > 0)) {
    return undefined;
  }
  if (kind === "short_answer" && (Object.keys(mcq).length > 0 || Object.keys(flashcard).length > 0)) {
    return undefined;
  }
  if (kind === "flashcard" && (Object.keys(mcq).length > 0 || Object.keys(shortAnswer).length > 0)) {
    return undefined;
  }

  return { ...answers, mcq, shortAnswer, flashcard };
}

function parseSession(value: unknown): StoredDraftSession | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const kind = value.kind;
  if (kind !== "mcq" && kind !== "short_answer" && kind !== "flashcard") {
    return undefined;
  }
  if (!isShortText(value.id, 80) || !isShortText(value.createdAt, 40)) {
    return undefined;
  }
  if (!Array.isArray(value.items) || value.items.length < 1 || value.items.length > MAX_ASSESSMENT_COUNT) {
    return undefined;
  }
  if (!value.items.every((item) => isItem(item, kind))) {
    return undefined;
  }
  const items = value.items as AssessmentItem[];
  if (new Set(items.map((item) => item.id)).size !== items.length) {
    return undefined;
  }
  if (!Number.isInteger(value.index) || (value.index as number) < 0 || (value.index as number) >= items.length) {
    return undefined;
  }
  const answers = parseAnswers(value.answers, items, kind);
  if (!answers) {
    return undefined;
  }
  if (!isRecord(value.revealed)) {
    return undefined;
  }
  const revealed: Record<string, true> = {};
  for (const [id, flag] of Object.entries(value.revealed)) {
    if (!items.some((item) => item.id === id) || flag !== true) {
      return undefined;
    }
    revealed[id] = true;
  }
  return {
    id: value.id,
    kind,
    items,
    index: value.index as number,
    answers,
    revealed,
    createdAt: value.createdAt,
  };
}

function toSession(stored: StoredDraftSession): QuizSession {
  return {
    id: stored.id,
    kind: stored.kind,
    items: stored.items,
    index: stored.index,
    answers: stored.answers,
    revealed: stored.revealed,
    submitted: false,
    createdAt: stored.createdAt,
  };
}

/**
 * Write the unfinished session. A submitted session is left untouched so a
 * completed record is not also stored as a draft.
 */
export async function saveQuizDraft(store: TextStore, session: QuizSession, savedAt: string): Promise<boolean> {
  if (session.submitted || session.report) {
    return false;
  }
  const payload = {
    schemaVersion: 1 as const,
    savedAt,
    session: {
      id: session.id,
      kind: session.kind,
      items: session.items,
      index: session.index,
      answers: session.answers,
      revealed: session.revealed,
      createdAt: session.createdAt,
    },
  };
  await store.write(QUIZ_DRAFT_STORE_NAME, JSON.stringify(payload));
  return true;
}

/**
 * Restore an unfinished quiz. If learning history already contains the same
 * session id, the draft is stale and must not be recorded again.
 * Unreadable JSON is left in the store.
 */
export async function loadQuizDraft(store: TextStore, progress: LearningProgress): Promise<QuizDraftLoad> {
  const raw = await store.read(QUIZ_DRAFT_STORE_NAME);
  if (raw === null) {
    return { status: "empty" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: "unreadable" };
  }
  if (!isRecord(parsed) || parsed.schemaVersion !== 1) {
    return { status: "unreadable" };
  }
  const session = parseSession(parsed.session);
  if (!session) {
    return { status: "unreadable" };
  }
  if (progress.quizzes.some((quiz) => quiz.sessionId === session.id)) {
    return { status: "already_recorded", sessionId: session.id };
  }
  return { status: "ready", session: toSession(session) };
}

/** Delete only the unfinished-quiz file. */
export async function clearQuizDraft(store: TextStore): Promise<void> {
  await store.remove(QUIZ_DRAFT_STORE_NAME);
}
