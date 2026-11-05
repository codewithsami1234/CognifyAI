import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AssessmentResult, McqItem, ShortAnswerItem, FlashcardItem, SourceReference } from "../aiTypes";
import {
  accuracyPercent,
  evaluateShortAnswer,
  MCQ_BASIS,
  scoreMcqSelection,
} from "../quizScoring";
import {
  confirmSubmit,
  createQuizSession,
  goToQuestion,
  listUnanswered,
  markFlashcard,
  nextQuestion,
  previousQuestion,
  requestSubmit,
  revealFlashcard,
  selectMcq,
  setShortAnswer,
  setShortAnswerSelfAssessment,
  visibleQuestion,
} from "../quizSession";

const source: SourceReference = {
  documentId: "notes-cell",
  documentName: "Cell Energy Notes",
  chunkId: "notes-cell:photo",
  pageNumber: 2,
  section: "Photosynthesis",
};

function mcqItem(id: string, marked: 0 | 1 | 2 | 3): McqItem {
  return {
    id,
    question: `Question ${id}`,
    options: ["Light", "Sound", "Heat", "Gravity"],
    correctAnswerIndex: marked,
    sources: [source],
  };
}

function shortItem(id: string): ShortAnswerItem {
  return {
    id,
    question: `Explain ${id}`,
    referenceAnswer: "Chlorophyll absorbs light.",
    sources: [source],
  };
}

function cardItem(id: string): FlashcardItem {
  return {
    id,
    front: `Term ${id}`,
    back: "A fact from the notes.",
    sources: [source],
  };
}

function result(items: AssessmentResult["items"], kind: AssessmentResult["kind"]): AssessmentResult {
  return {
    status: "ok",
    kind,
    items,
    rejectedCount: 0,
    requestedCount: items.length,
    sources: [source],
    message: "The model returned assessment items from the retrieved passages. They are not verified as correct.",
    timings: { retrievalMs: 1, totalMs: 2 },
    contextCharCount: 40,
    usedChunkIds: [source.chunkId],
    truncatedContext: false,
  };
}

describe("MCQ scoring", () => {
  it("marks a matching index correct and a different index incorrect", () => {
    assert.equal(scoreMcqSelection(0, 0), "correct");
    assert.equal(scoreMcqSelection(2, 1), "incorrect");
    assert.equal(scoreMcqSelection(3, null), "unanswered");
  });

  it("calculates percentage accuracy to one decimal and refuses empty or impossible counts", () => {
    assert.equal(accuracyPercent(1, 2), 50);
    assert.equal(accuracyPercent(1, 3), 33.3);
    assert.equal(accuracyPercent(2, 3), 66.7);
    assert.equal(accuracyPercent(0, 2), 0);
    assert.equal(accuracyPercent(0, 0), null);
    assert.equal(accuracyPercent(3, 2), null);
    assert.equal(accuracyPercent(1.5, 2), null);
  });

  it("scores a quiz against the validated index and keeps the model-mark basis", () => {
    const session = createQuizSession(result([mcqItem("mcq-1", 0), mcqItem("mcq-2", 1), mcqItem("mcq-3", 2)], "mcq"), {
      id: "quiz-mcq",
      now: "2026-10-31T00:00:00.000Z",
    });
    assert.ok(session);
    const answered = selectMcq(selectMcq(selectMcq(session, "mcq-1", 0), "mcq-2", 0), "mcq-3", 2);
    const submitted = confirmSubmit(answered, "2026-10-31T00:01:00.000Z");
    assert.equal(submitted.status, "submitted");
    if (submitted.status !== "submitted") {
      return;
    }
    assert.equal(submitted.report.mcqCorrect, 2);
    assert.equal(submitted.report.mcqIncorrect, 1);
    assert.equal(submitted.report.mcqUnanswered, 0);
    assert.equal(submitted.report.mcqAccuracyPercent, 66.7);
    assert.equal(submitted.report.mcqBasis, MCQ_BASIS);
    assert.match(submitted.report.mcqBasisNote, /not an independently verified grade/);
    assert.equal(submitted.report.mcqItems[1]?.outcome, "incorrect");
    assert.equal(submitted.report.mcqItems[1]?.markedIndex, 1);
  });

  it("lets the student change an MCQ selection before submission", () => {
    const session = createQuizSession(result([mcqItem("mcq-1", 0)], "mcq"), {
      id: "quiz-change",
      now: "2026-10-31T00:00:00.000Z",
    });
    assert.ok(session);
    const changed = selectMcq(selectMcq(session, "mcq-1", 2), "mcq-1", 0);
    const view = visibleQuestion(changed);
    assert.equal(view?.kind, "mcq");
    if (view?.kind === "mcq") {
      assert.equal(view.selectedIndex, 0);
    }
    const submitted = confirmSubmit(changed, "2026-10-31T00:02:00.000Z");
    if (submitted.status === "submitted") {
      assert.equal(submitted.report.mcqCorrect, 1);
    }
  });
});

describe("short-answer self-assessment", () => {
  it("does not turn matching wording into a verified grade", () => {
    const reference = "Chlorophyll absorbs light.";
    const same = evaluateShortAnswer(reference, reference);
    const overlap = evaluateShortAnswer("chlorophyll light", reference);
    assert.equal(same.verifiedGrade, null);
    assert.equal(same.selfAssessment, "unrated");
    assert.equal(overlap.verifiedGrade, null);
  });

  it("stores the response and reference, then records only the student's own mark", () => {
    const session = createQuizSession(result([shortItem("short-answer-1")], "short_answer"), {
      id: "quiz-short",
      now: "2026-10-31T00:00:00.000Z",
    });
    assert.ok(session);
    const withText = setShortAnswer(session, "short-answer-1", "Chlorophyll absorbs light.");
    const submitted = confirmSubmit(withText, "2026-10-31T00:03:00.000Z");
    assert.equal(submitted.status, "submitted");
    if (submitted.status !== "submitted") {
      return;
    }
    const item = submitted.report.shortAnswers[0];
    assert.equal(item?.response, "Chlorophyll absorbs light.");
    assert.equal(item?.referenceAnswer, "Chlorophyll absorbs light.");
    assert.equal(item?.verifiedGrade, null);
    assert.equal(item?.selfAssessment, "unrated");
    const reviewed = setShortAnswerSelfAssessment(submitted.session, "short-answer-1", "needs_review");
    assert.equal(reviewed.report?.shortAnswers[0]?.selfAssessment, "needs_review");
    assert.equal(reviewed.report?.shortAnswers[0]?.verifiedGrade, null);
    assert.match(reviewed.report?.shortAnswerNote ?? "", /not a verified grade/);
  });
});

describe("flashcard review", () => {
  it("tracks known and needs revision without an accuracy score", () => {
    const session = createQuizSession(result([cardItem("flashcard-1"), cardItem("flashcard-2")], "flashcard"), {
      id: "quiz-cards",
      now: "2026-10-31T00:00:00.000Z",
    });
    assert.ok(session);
    const hidden = visibleQuestion(session);
    assert.equal(hidden?.kind, "flashcard");
    if (hidden?.kind === "flashcard") {
      assert.equal(hidden.back, null);
    }
    const revealed = revealFlashcard(session, "flashcard-1");
    const shown = visibleQuestion(revealed);
    if (shown?.kind === "flashcard") {
      assert.equal(shown.back, "A fact from the notes.");
    }
    const marked = markFlashcard(markFlashcard(revealed, "flashcard-1", "known"), "flashcard-2", "needs_revision");
    const submitted = confirmSubmit(marked, "2026-10-31T00:04:00.000Z");
    if (submitted.status !== "submitted") {
      assert.fail("expected a submitted flashcard quiz");
    }
    assert.equal(submitted.report.mcqAccuracyPercent, null);
    assert.equal(submitted.report.flashcards[0]?.mark, "known");
    assert.equal(submitted.report.flashcards[1]?.mark, "needs_revision");
  });
});

describe("quiz taking", () => {
  it("keeps the same items while moving between questions", () => {
    const session = createQuizSession(result([mcqItem("mcq-1", 0), mcqItem("mcq-2", 1)], "mcq"), {
      id: "quiz-nav",
      now: "2026-10-31T00:00:00.000Z",
    });
    assert.ok(session);
    const selected = selectMcq(session, "mcq-1", 3);
    const forward = nextQuestion(selected);
    const back = previousQuestion(forward);
    const jumped = goToQuestion(back, 1);
    assert.equal(forward.items, session.items);
    assert.equal(back.items, session.items);
    assert.equal(jumped.items, session.items);
    assert.equal(jumped.index, 1);
    assert.equal(nextQuestion(jumped), jumped);
    assert.equal(previousQuestion(session), session);
    const view = visibleQuestion(back);
    if (view?.kind === "mcq") {
      assert.equal(view.selectedIndex, 3);
      assert.equal("correctAnswerIndex" in view, false);
    }
  });

  it("lists unanswered questions and does not score until that list is confirmed", () => {
    const session = createQuizSession(result([mcqItem("mcq-1", 0), mcqItem("mcq-2", 1)], "mcq"), {
      id: "quiz-blank",
      now: "2026-10-31T00:00:00.000Z",
    });
    assert.ok(session);
    const partial = selectMcq(session, "mcq-1", 0);
    const pending = requestSubmit(partial, "2026-10-31T00:05:00.000Z");
    assert.equal(pending.status, "needs_confirmation");
    if (pending.status !== "needs_confirmation") {
      return;
    }
    assert.equal(pending.session.submitted, false);
    assert.deepEqual(
      listUnanswered(partial).map((item) => item.id),
      ["mcq-2"],
    );
    const submitted = confirmSubmit(pending.session, "2026-10-31T00:05:00.000Z");
    if (submitted.status !== "submitted") {
      assert.fail("expected confirmation to score the quiz");
    }
    assert.equal(submitted.report.mcqCorrect, 1);
    assert.equal(submitted.report.mcqUnanswered, 1);
    assert.equal(submitted.report.mcqAccuracyPercent, 50);
  });

  it("returns the first report when submit is repeated", () => {
    const session = createQuizSession(result([mcqItem("mcq-1", 0)], "mcq"), {
      id: "quiz-once",
      now: "2026-10-31T00:00:00.000Z",
    });
    assert.ok(session);
    const first = confirmSubmit(selectMcq(session, "mcq-1", 0), "2026-10-31T00:06:00.000Z");
    assert.equal(first.status, "submitted");
    if (first.status !== "submitted") {
      return;
    }
    const changed = selectMcq(first.session, "mcq-1", 2);
    assert.equal(changed, first.session);
    const second = requestSubmit(first.session, "2026-10-31T00:07:00.000Z");
    const third = confirmSubmit(first.session, "2026-10-31T00:08:00.000Z");
    assert.equal(second.status, "already_submitted");
    assert.equal(third.status, "already_submitted");
    if (second.status === "already_submitted" && third.status === "already_submitted") {
      assert.equal(second.report, first.report);
      assert.equal(third.report, first.report);
      assert.equal(second.report.submittedAt, "2026-10-31T00:06:00.000Z");
    }
  });

  it("does not open a quiz when generation produced no items", () => {
    const failed = result([], "mcq");
    failed.status = "insufficient_evidence";
    failed.items = [];
    assert.equal(createQuizSession(failed, { id: "none", now: "2026-10-31T00:00:00.000Z" }), undefined);
  });
});
