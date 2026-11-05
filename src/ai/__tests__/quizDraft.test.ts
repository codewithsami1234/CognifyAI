import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AssessmentResult, FlashcardItem, McqItem, ShortAnswerItem, SourceReference } from "../aiTypes";
import {
  clearLearningProgress,
  emptyLearningProgress,
  recordQuiz,
  saveLearningProgress,
} from "../learningProgress";
import { clearQuizDraft, loadQuizDraft, saveQuizDraft } from "../quizDraft";
import { confirmSubmit, createQuizSession, goToQuestion, markFlashcard, revealFlashcard, selectMcq, setShortAnswer } from "../quizSession";
import {
  chooseStoredText,
  createMemoryTextStore,
  LIBRARY_STORE_NAME,
  PROGRESS_STORE_NAME,
  QUIZ_DRAFT_STORE_NAME,
} from "../textStore";

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

describe("quiz draft autosave", () => {
  it("restores the question index and selected answers in a new store", async () => {
    const first = createMemoryTextStore();
    const created = createQuizSession(result([mcqItem("q1", 0), mcqItem("q2", 1)], "mcq"), {
      id: "quiz-1",
      now: "2026-10-31T12:00:00.000Z",
    });
    assert.ok(created);
    const moved = goToQuestion(selectMcq(created, "q1", 2), 1);
    assert.equal(await saveQuizDraft(first, moved, "2026-10-31T12:01:00.000Z"), true);

    const second = createMemoryTextStore(first.snapshot());
    const loaded = await loadQuizDraft(second, emptyLearningProgress());
    assert.equal(loaded.status, "ready");
    if (loaded.status !== "ready") {
      return;
    }
    assert.equal(loaded.session.id, "quiz-1");
    assert.equal(loaded.session.index, 1);
    assert.equal(loaded.session.answers.mcq.q1, 2);
    assert.equal(loaded.session.submitted, false);
    assert.equal(loaded.session.report, undefined);
  });

  it("restores a short answer and a revealed flashcard mark", async () => {
    const store = createMemoryTextStore();
    const short = createQuizSession(result([shortItem("s1")], "short_answer"), {
      id: "quiz-short",
      now: "2026-10-31T12:00:00.000Z",
    });
    assert.ok(short);
    await saveQuizDraft(store, setShortAnswer(short, "s1", "It absorbs light."), "2026-10-31T12:02:00.000Z");
    const loadedShort = await loadQuizDraft(store, emptyLearningProgress());
    assert.equal(loadedShort.status, "ready");
    if (loadedShort.status === "ready") {
      assert.equal(loadedShort.session.answers.shortAnswer.s1?.text, "It absorbs light.");
    }

    const card = createQuizSession(result([cardItem("c1")], "flashcard"), {
      id: "quiz-card",
      now: "2026-10-31T12:00:00.000Z",
    });
    assert.ok(card);
    await saveQuizDraft(store, markFlashcard(revealFlashcard(card, "c1"), "c1", "needs_revision"), "2026-10-31T12:03:00.000Z");
    const loadedCard = await loadQuizDraft(store, emptyLearningProgress());
    assert.equal(loadedCard.status, "ready");
    if (loadedCard.status === "ready") {
      assert.equal(loadedCard.session.revealed.c1, true);
      assert.equal(loadedCard.session.answers.flashcard.c1, "needs_revision");
    }
  });

  it("does not write a submitted session", async () => {
    const store = createMemoryTextStore();
    const created = createQuizSession(result([mcqItem("q1", 0)], "mcq"), {
      id: "quiz-done",
      now: "2026-10-31T12:00:00.000Z",
    });
    assert.ok(created);
    const submitted = confirmSubmit(selectMcq(created, "q1", 0), "2026-10-31T12:04:00.000Z");
    assert.equal(submitted.session.submitted, true);
    assert.equal(await saveQuizDraft(store, submitted.session, "2026-10-31T12:04:00.000Z"), false);
    assert.equal(await store.read(QUIZ_DRAFT_STORE_NAME), null);
  });

  it("treats a draft as stale when progress already contains that session", async () => {
    const store = createMemoryTextStore();
    const created = createQuizSession(result([mcqItem("q1", 0)], "mcq"), {
      id: "quiz-stale",
      now: "2026-10-31T12:00:00.000Z",
    });
    assert.ok(created);
    const answered = selectMcq(created, "q1", 0);
    await saveQuizDraft(store, answered, "2026-10-31T12:05:00.000Z");
    const submitted = confirmSubmit(answered, "2026-10-31T12:06:00.000Z");
    assert.equal(submitted.status, "submitted");
    if (submitted.status !== "submitted") {
      return;
    }
    const progress = recordQuiz(emptyLearningProgress(), submitted.report);
    await saveLearningProgress(store, progress);

    const loaded = await loadQuizDraft(store, progress);
    assert.deepEqual(loaded, { status: "already_recorded", sessionId: "quiz-stale" });
    assert.equal(recordQuiz(progress, submitted.report), progress);

    await clearQuizDraft(store);
    const after = await loadQuizDraft(store, progress);
    assert.equal(after.status, "empty");
    const saved = await loadStoredProgress(store);
    assert.equal(saved?.quizzes.length, 1);
  });

  it("leaves a corrupt draft in place and discards only that file", async () => {
    const store = createMemoryTextStore({
      [QUIZ_DRAFT_STORE_NAME]: "{not json",
      [LIBRARY_STORE_NAME]: '{"schemaVersion":1,"documents":[]}',
      [PROGRESS_STORE_NAME]: '{"schemaVersion":1,"quizzes":[],"activities":[]}',
    });
    const loaded = await loadQuizDraft(store, emptyLearningProgress());
    assert.equal(loaded.status, "unreadable");
    assert.equal(await store.read(QUIZ_DRAFT_STORE_NAME), "{not json");

    await clearQuizDraft(store);
    assert.equal(await store.read(QUIZ_DRAFT_STORE_NAME), null);
    assert.equal(await store.read(LIBRARY_STORE_NAME), '{"schemaVersion":1,"documents":[]}');
    assert.ok(await store.read(PROGRESS_STORE_NAME));
  });

  it("keeps the draft and library when learning history is cleared", async () => {
    const store = createMemoryTextStore({
      [LIBRARY_STORE_NAME]: '{"kept":true}',
      [PROGRESS_STORE_NAME]: '{"schemaVersion":1,"quizzes":[],"activities":[]}',
    });
    const created = createQuizSession(result([mcqItem("q1", 1)], "mcq"), {
      id: "quiz-keep",
      now: "2026-10-31T12:00:00.000Z",
    });
    assert.ok(created);
    await saveQuizDraft(store, created, "2026-10-31T12:07:00.000Z");
    await clearLearningProgress(store);
    assert.equal(await store.read(PROGRESS_STORE_NAME), null);
    assert.equal(await store.read(LIBRARY_STORE_NAME), '{"kept":true}');
    const loaded = await loadQuizDraft(store, emptyLearningProgress());
    assert.equal(loaded.status, "ready");
  });
});

describe("interrupted local writes", () => {
  it("uses a non-empty backup when the main file is missing or empty", () => {
    assert.equal(chooseStoredText('{"ok":1}', '{"old":1}'), '{"ok":1}');
    assert.equal(chooseStoredText(null, '{"old":1}'), '{"old":1}');
    assert.equal(chooseStoredText("", '{"old":1}'), '{"old":1}');
    assert.equal(chooseStoredText(null, null), null);
    assert.equal(chooseStoredText("", ""), null);
  });
});

async function loadStoredProgress(store: ReturnType<typeof createMemoryTextStore>) {
  const raw = await store.read(PROGRESS_STORE_NAME);
  assert.ok(raw);
  return JSON.parse(raw) as { quizzes: unknown[] };
}
