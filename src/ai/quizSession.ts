import type { AssessmentItem, AssessmentKind, AssessmentResult, CorrectAnswerIndex } from "./aiTypes";
import {
  buildQuizReport,
  emptyAnswerMap,
  isOptionIndex,
  type FlashcardReviewMark,
  type QuizAnswerMap,
  type QuizReport,
  type ShortAnswerSelfAssessment,
} from "./quizScoring";

export interface UnansweredQuestion {
  index: number;
  id: string;
  label: string;
}

export interface QuizSession {
  id: string;
  kind: AssessmentKind;
  /** The generated items. Navigation does not replace this list. */
  items: readonly AssessmentItem[];
  index: number;
  answers: QuizAnswerMap;
  revealed: Readonly<Record<string, true>>;
  submitted: boolean;
  report?: QuizReport;
  createdAt: string;
}

export type VisibleQuestion =
  | {
      kind: "mcq";
      id: string;
      question: string;
      options: [string, string, string, string];
      selectedIndex: CorrectAnswerIndex | null;
    }
  | {
      kind: "short_answer";
      id: string;
      question: string;
      response: string;
    }
  | {
      kind: "flashcard";
      id: string;
      front: string;
      back: string | null;
      revealed: boolean;
      mark: FlashcardReviewMark | null;
    };

function itemMatchesKind(item: AssessmentItem, kind: AssessmentKind): boolean {
  if (kind === "mcq") {
    return "options" in item;
  }
  if (kind === "short_answer") {
    return "referenceAnswer" in item;
  }
  return "front" in item && "back" in item;
}

function labelFor(item: AssessmentItem): string {
  const text = "question" in item ? item.question : item.front;
  const trimmed = text.trim();
  return trimmed.length > 120 ? `${trimmed.slice(0, 117)}...` : trimmed;
}

function isAnswered(session: QuizSession, item: AssessmentItem): boolean {
  if (session.kind === "mcq" && "options" in item) {
    return session.answers.mcq[item.id] !== undefined;
  }
  if (session.kind === "short_answer" && "referenceAnswer" in item) {
    return (session.answers.shortAnswer[item.id]?.text.trim().length ?? 0) > 0;
  }
  if ("front" in item) {
    return session.answers.flashcard[item.id] !== undefined;
  }
  return false;
}

/**
 * Start a quiz from a validated assessment result.
 * Returns undefined when there are no items to take. Nothing is invented.
 */
export function createQuizSession(
  result: AssessmentResult,
  options: { id: string; now: string },
): QuizSession | undefined {
  if (result.status !== "ok" || result.items.length === 0) {
    return undefined;
  }
  if (!result.items.every((item) => itemMatchesKind(item, result.kind))) {
    return undefined;
  }
  return {
    id: options.id,
    kind: result.kind,
    items: result.items.slice(),
    index: 0,
    answers: emptyAnswerMap(),
    revealed: {},
    submitted: false,
    createdAt: options.now,
  };
}

export function quizPosition(session: QuizSession): { index: number; total: number } {
  return { index: session.index, total: session.items.length };
}

export function goToQuestion(session: QuizSession, index: number): QuizSession {
  if (!Number.isInteger(index) || index < 0 || index >= session.items.length || index === session.index) {
    return session;
  }
  return { ...session, index };
}

export function nextQuestion(session: QuizSession): QuizSession {
  return goToQuestion(session, session.index + 1);
}

export function previousQuestion(session: QuizSession): QuizSession {
  return goToQuestion(session, session.index - 1);
}

export function selectMcq(session: QuizSession, itemId: string, optionIndex: number): QuizSession {
  if (session.submitted || session.kind !== "mcq" || !isOptionIndex(optionIndex)) {
    return session;
  }
  const item = session.items.find((candidate) => candidate.id === itemId && "options" in candidate);
  if (!item) {
    return session;
  }
  return {
    ...session,
    answers: {
      ...session.answers,
      mcq: { ...session.answers.mcq, [itemId]: optionIndex },
    },
  };
}

export function setShortAnswer(session: QuizSession, itemId: string, text: string): QuizSession {
  if (session.submitted || session.kind !== "short_answer") {
    return session;
  }
  const item = session.items.find((candidate) => candidate.id === itemId && "referenceAnswer" in candidate);
  if (!item) {
    return session;
  }
  const previous = session.answers.shortAnswer[itemId];
  return {
    ...session,
    answers: {
      ...session.answers,
      shortAnswer: {
        ...session.answers.shortAnswer,
        [itemId]: {
          text,
          selfAssessment: previous?.selfAssessment ?? "unrated",
        },
      },
    },
  };
}

export function markFlashcard(
  session: QuizSession,
  itemId: string,
  mark: FlashcardReviewMark,
): QuizSession {
  if (session.submitted || session.kind !== "flashcard") {
    return session;
  }
  if (mark !== "known" && mark !== "needs_revision") {
    return session;
  }
  const item = session.items.find((candidate) => candidate.id === itemId && "front" in candidate);
  if (!item) {
    return session;
  }
  return {
    ...session,
    answers: {
      ...session.answers,
      flashcard: { ...session.answers.flashcard, [itemId]: mark },
    },
  };
}

export function revealFlashcard(session: QuizSession, itemId: string): QuizSession {
  if (session.kind !== "flashcard" || session.revealed[itemId]) {
    return session;
  }
  const item = session.items.find((candidate) => candidate.id === itemId && "front" in candidate);
  if (!item) {
    return session;
  }
  return { ...session, revealed: { ...session.revealed, [itemId]: true } };
}

export function listUnanswered(session: QuizSession): UnansweredQuestion[] {
  const unanswered: UnansweredQuestion[] = [];
  session.items.forEach((item, index) => {
    if (!isAnswered(session, item)) {
      unanswered.push({ index, id: item.id, label: labelFor(item) });
    }
  });
  return unanswered;
}

export function visibleQuestion(session: QuizSession): VisibleQuestion | undefined {
  const item = session.items[session.index];
  if (!item) {
    return undefined;
  }
  if (session.kind === "mcq" && "options" in item) {
    const selected = session.answers.mcq[item.id];
    return {
      kind: "mcq",
      id: item.id,
      question: item.question,
      options: [item.options[0], item.options[1], item.options[2], item.options[3]],
      selectedIndex: selected === undefined ? null : selected,
    };
  }
  if (session.kind === "short_answer" && "referenceAnswer" in item) {
    return {
      kind: "short_answer",
      id: item.id,
      question: item.question,
      response: session.answers.shortAnswer[item.id]?.text ?? "",
    };
  }
  if ("front" in item && "back" in item) {
    const revealed = session.revealed[item.id] === true;
    return {
      kind: "flashcard",
      id: item.id,
      front: item.front,
      back: revealed ? item.back : null,
      revealed,
      mark: session.answers.flashcard[item.id] ?? null,
    };
  }
  return undefined;
}

export type SubmitQuizResult =
  | { status: "already_submitted"; session: QuizSession; report: QuizReport }
  | { status: "needs_confirmation"; session: QuizSession; unanswered: UnansweredQuestion[] }
  | { status: "submitted"; session: QuizSession; report: QuizReport };

function submittedSession(session: QuizSession, submittedAt: string): QuizSession {
  const report = buildQuizReport(session.id, session.kind, session.items, session.answers, submittedAt);
  return { ...session, submitted: true, report };
}

/**
 * First submit with blank items asks for confirmation and does not score.
 * A second call after a report exists returns that report and does not build another.
 */
export function requestSubmit(session: QuizSession, submittedAt: string): SubmitQuizResult {
  if (session.submitted && session.report) {
    return { status: "already_submitted", session, report: session.report };
  }
  const unanswered = listUnanswered(session);
  if (unanswered.length > 0) {
    return { status: "needs_confirmation", session, unanswered };
  }
  const next = submittedSession(session, submittedAt);
  return { status: "submitted", session: next, report: next.report as QuizReport };
}

export function confirmSubmit(session: QuizSession, submittedAt: string): SubmitQuizResult {
  if (session.submitted && session.report) {
    return { status: "already_submitted", session, report: session.report };
  }
  const next = submittedSession(session, submittedAt);
  return { status: "submitted", session: next, report: next.report as QuizReport };
}

export function setShortAnswerSelfAssessment(
  session: QuizSession,
  itemId: string,
  value: Exclude<ShortAnswerSelfAssessment, "unrated">,
): QuizSession {
  if (!session.submitted || !session.report || session.kind !== "short_answer") {
    return session;
  }
  const shortAnswers = session.report.shortAnswers.slice();
  const index = shortAnswers.findIndex((item) => item.id === itemId && item.response.length > 0);
  if (index < 0) {
    return session;
  }
  const current = shortAnswers[index];
  if (!current) {
    return session;
  }
  shortAnswers[index] = { ...current, selfAssessment: value, verifiedGrade: null };
  const report: QuizReport = { ...session.report, shortAnswers };
  const previous = session.answers.shortAnswer[itemId];
  return {
    ...session,
    report,
    answers: {
      ...session.answers,
      shortAnswer: {
        ...session.answers.shortAnswer,
        [itemId]: { text: previous?.text ?? current.response, selfAssessment: value },
      },
    },
  };
}
