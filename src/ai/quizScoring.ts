import type {
  AssessmentItem,
  AssessmentKind,
  CorrectAnswerIndex,
  FlashcardItem,
  McqItem,
  ShortAnswerItem,
  SourceReference,
} from "./aiTypes";

/** The comparison target is the validated model index, not an external grade. */
export const MCQ_BASIS = "model_marked_option" as const;

export const MCQ_BASIS_NOTE =
  "Each MCQ is compared with the option index stored on the assessment. That index was structurally validated. It is the local model's selection, not an independently verified grade.";

export const SHORT_ANSWER_NOTE =
  "The reference answer is shown for comparison. Understood and needs review are self-assessments. They are not a verified grade, and similar wording is not treated as correctness.";

export type McqOutcome = "correct" | "incorrect" | "unanswered";
export type ShortAnswerSelfAssessment = "understood" | "needs_review" | "unrated";
export type FlashcardReviewMark = "known" | "needs_revision";
export type FlashcardMark = FlashcardReviewMark | "unreviewed";

export interface ScoredMcq {
  id: string;
  question: string;
  options: [string, string, string, string];
  selectedIndex: CorrectAnswerIndex | null;
  markedIndex: CorrectAnswerIndex;
  outcome: McqOutcome;
  topics: string[];
  sources: SourceReference[];
}

export interface ScoredShortAnswer {
  id: string;
  question: string;
  response: string;
  referenceAnswer: string;
  selfAssessment: ShortAnswerSelfAssessment;
  verifiedGrade: null;
  sources: SourceReference[];
}

export interface ScoredFlashcard {
  id: string;
  front: string;
  back: string;
  mark: FlashcardMark;
  topics: string[];
  sources: SourceReference[];
}

export interface QuizReport {
  sessionId: string;
  kind: AssessmentKind;
  submittedAt: string;
  mcqCorrect: number;
  mcqIncorrect: number;
  mcqUnanswered: number;
  /** Null when the quiz has no MCQ items. Never a stand-in for "not attempted". */
  mcqAccuracyPercent: number | null;
  mcqBasis: typeof MCQ_BASIS;
  mcqBasisNote: string;
  shortAnswerNote: string;
  mcqItems: ScoredMcq[];
  shortAnswers: ScoredShortAnswer[];
  flashcards: ScoredFlashcard[];
}

export interface QuizAnswerMap {
  mcq: Readonly<Record<string, CorrectAnswerIndex>>;
  shortAnswer: Readonly<Record<string, { text: string; selfAssessment: ShortAnswerSelfAssessment }>>;
  flashcard: Readonly<Record<string, FlashcardReviewMark>>;
}

export function emptyAnswerMap(): QuizAnswerMap {
  return { mcq: {}, shortAnswer: {}, flashcard: {} };
}

/**
 * Percentage of correct MCQs among every MCQ in the quiz, including blanks.
 * One decimal place. Returns null when there is nothing to score or the counts disagree.
 */
export function accuracyPercent(correct: number, attempted: number): number | null {
  if (!Number.isInteger(correct) || !Number.isInteger(attempted)) {
    return null;
  }
  if (attempted < 1 || correct < 0 || correct > attempted) {
    return null;
  }
  return Math.round((correct / attempted) * 1000) / 10;
}

export function isOptionIndex(value: number): value is CorrectAnswerIndex {
  return value === 0 || value === 1 || value === 2 || value === 3;
}

export function topicLabel(source: SourceReference): string | undefined {
  const name = source.documentName.trim();
  if (name.length === 0) {
    return undefined;
  }
  const section = source.section?.trim();
  if (section && section.length > 0) {
    return `${name} — ${section}`;
  }
  return name;
}

export function topicsFromSources(sources: readonly SourceReference[]): string[] {
  const topics: string[] = [];
  for (const source of sources) {
    const label = topicLabel(source);
    if (label !== undefined && !topics.includes(label)) {
      topics.push(label);
    }
  }
  return topics;
}

export function scoreMcqSelection(
  markedIndex: CorrectAnswerIndex,
  selectedIndex: CorrectAnswerIndex | null,
): McqOutcome {
  if (selectedIndex === null) {
    return "unanswered";
  }
  return selectedIndex === markedIndex ? "correct" : "incorrect";
}

/**
 * Short answers are not graded by comparing words.
 * Both strings are checked only so a non-string cannot be stored as a grade.
 */
export function evaluateShortAnswer(
  response: string,
  referenceAnswer: string,
): { verifiedGrade: null; selfAssessment: "unrated" } {
  if (typeof response !== "string" || typeof referenceAnswer !== "string") {
    return { verifiedGrade: null, selfAssessment: "unrated" };
  }
  return { verifiedGrade: null, selfAssessment: "unrated" };
}

function isMcqItem(item: AssessmentItem): item is McqItem {
  return "options" in item && "correctAnswerIndex" in item;
}

function isShortAnswerItem(item: AssessmentItem): item is ShortAnswerItem {
  return "referenceAnswer" in item;
}

function isFlashcardItem(item: AssessmentItem): item is FlashcardItem {
  return "front" in item && "back" in item;
}

function copySources(sources: readonly SourceReference[]): SourceReference[] {
  return sources.map((source) => ({ ...source }));
}

export function buildQuizReport(
  sessionId: string,
  kind: AssessmentKind,
  items: readonly AssessmentItem[],
  answers: QuizAnswerMap,
  submittedAt: string,
): QuizReport {
  const mcqItems: ScoredMcq[] = [];
  const shortAnswers: ScoredShortAnswer[] = [];
  const flashcards: ScoredFlashcard[] = [];

  for (const item of items) {
    if (kind === "mcq" && isMcqItem(item)) {
      const selected = answers.mcq[item.id];
      const selectedIndex = selected === undefined ? null : selected;
      const outcome = scoreMcqSelection(item.correctAnswerIndex, selectedIndex);
      mcqItems.push({
        id: item.id,
        question: item.question,
        options: [item.options[0], item.options[1], item.options[2], item.options[3]],
        selectedIndex,
        markedIndex: item.correctAnswerIndex,
        outcome,
        topics: topicsFromSources(item.sources),
        sources: copySources(item.sources),
      });
    } else if (kind === "short_answer" && isShortAnswerItem(item)) {
      const draft = answers.shortAnswer[item.id];
      const response = draft?.text.trim() ?? "";
      const evaluated = evaluateShortAnswer(response, item.referenceAnswer);
      const selfAssessment =
        response.length === 0 ? "unrated" : (draft?.selfAssessment ?? evaluated.selfAssessment);
      shortAnswers.push({
        id: item.id,
        question: item.question,
        response,
        referenceAnswer: item.referenceAnswer,
        selfAssessment,
        verifiedGrade: null,
        sources: copySources(item.sources),
      });
    } else if (kind === "flashcard" && isFlashcardItem(item)) {
      const mark = answers.flashcard[item.id] ?? "unreviewed";
      flashcards.push({
        id: item.id,
        front: item.front,
        back: item.back,
        mark,
        topics: topicsFromSources(item.sources),
        sources: copySources(item.sources),
      });
    }
  }

  const mcqCorrect = mcqItems.filter((item) => item.outcome === "correct").length;
  const mcqIncorrect = mcqItems.filter((item) => item.outcome === "incorrect").length;
  const mcqUnanswered = mcqItems.filter((item) => item.outcome === "unanswered").length;

  return {
    sessionId,
    kind,
    submittedAt,
    mcqCorrect,
    mcqIncorrect,
    mcqUnanswered,
    mcqAccuracyPercent:
      kind === "mcq" ? accuracyPercent(mcqCorrect, mcqCorrect + mcqIncorrect + mcqUnanswered) : null,
    mcqBasis: MCQ_BASIS,
    mcqBasisNote: MCQ_BASIS_NOTE,
    shortAnswerNote: SHORT_ANSWER_NOTE,
    mcqItems,
    shortAnswers,
    flashcards,
  };
}

export function withShortAnswerSelfAssessment(
  report: QuizReport,
  itemId: string,
  value: Exclude<ShortAnswerSelfAssessment, "unrated">,
): QuizReport | undefined {
  const index = report.shortAnswers.findIndex((item) => item.id === itemId && item.response.length > 0);
  if (index < 0) {
    return undefined;
  }
  const shortAnswers = report.shortAnswers.slice();
  const current = shortAnswers[index];
  if (!current) {
    return undefined;
  }
  shortAnswers[index] = { ...current, selfAssessment: value, verifiedGrade: null };
  return { ...report, shortAnswers };
}
