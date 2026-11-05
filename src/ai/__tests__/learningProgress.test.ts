import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AssessmentResult, McqItem, SourceReference } from "../aiTypes";
import {
  confirmSubmit,
  createQuizSession,
  selectMcq,
  setShortAnswer,
  setShortAnswerSelfAssessment,
} from "../quizSession";
import {
  appendStudyActivity,
  clearLearningProgress,
  emptyProgressSummary,
  loadLearningProgress,
  progressFileBytes,
  recordQuiz,
  replaceQuizReport,
  saveLearningProgress,
  summarizeProgress,
  topicScoresFromProgress,
} from "../learningProgress";
import { LIBRARY_STORE_NAME, PROGRESS_STORE_NAME, createMemoryTextStore } from "../textStore";

const source: SourceReference = {
  documentId: "notes-cell",
  documentName: "Cell Energy Notes",
  chunkId: "notes-cell:photo",
  pageNumber: 2,
  section: "Photosynthesis",
};

function mcq(id: string, marked: 0 | 1 | 2 | 3): McqItem {
  return {
    id,
    question: `Question ${id}`,
    options: ["Light", "Sound", "Heat", "Gravity"],
    correctAnswerIndex: marked,
    sources: [source],
  };
}

function assessment(items: McqItem[]): AssessmentResult {
  return {
    status: "ok",
    kind: "mcq",
    items,
    rejectedCount: 0,
    requestedCount: items.length,
    sources: [source],
    message: "unverified",
    timings: { retrievalMs: 1, totalMs: 1 },
    contextCharCount: 20,
    usedChunkIds: [source.chunkId],
    truncatedContext: false,
  };
}

describe("learning progress", () => {
  it("starts empty without inventing a zero accuracy", () => {
    const summary = emptyProgressSummary();
    assert.equal(summary.quizzesAttempted, 0);
    assert.equal(summary.questionsAttempted, 0);
    assert.equal(summary.mcqAccuracyPercent, null);
    assert.equal(summary.activities.length, 0);
    assert.deepEqual(summary.completionTimestamps, []);
  });

  it("records one quiz, then ignores a second save of the same id", async () => {
    const session = createQuizSession(assessment([mcq("mcq-1", 0), mcq("mcq-2", 1)]), {
      id: "quiz-1",
      now: "2026-10-31T01:00:00.000Z",
    });
    assert.ok(session);
    const submitted = confirmSubmit(selectMcq(session, "mcq-1", 0), "2026-10-31T01:05:00.000Z");
    if (submitted.status !== "submitted") {
      assert.fail("expected a report");
    }
    const once = recordQuiz({ schemaVersion: 1, quizzes: [], activities: [] }, submitted.report);
    const twice = recordQuiz(once, submitted.report);
    assert.equal(twice, once);
    assert.equal(once.quizzes.length, 1);
    assert.equal(once.activities.length, 1);
    const summary = summarizeProgress(once);
    assert.equal(summary.quizzesAttempted, 1);
    assert.equal(summary.questionsAttempted, 2);
    assert.equal(summary.mcqCorrect, 1);
    assert.equal(summary.mcqIncorrect, 0);
    assert.equal(summary.mcqUnanswered, 1);
    assert.equal(summary.mcqAccuracyPercent, 50);
    assert.deepEqual(summary.completionTimestamps, ["2026-10-31T01:05:00.000Z"]);
    const scores = topicScoresFromProgress(once);
    assert.equal(scores[0]?.topic, "Cell Energy Notes — Photosynthesis");
    assert.equal(scores[0]?.correct, 1);
    assert.equal(scores[0]?.attempted, 2);
  });

  it("updates a short-answer self-assessment on the existing record", () => {
    const session = createQuizSession(
      {
        status: "ok",
        kind: "short_answer",
        items: [
          {
            id: "short-answer-1",
            question: "What does chlorophyll absorb?",
            referenceAnswer: "Light",
            sources: [source],
          },
        ],
        rejectedCount: 0,
        requestedCount: 1,
        sources: [source],
        message: "unverified",
        timings: { retrievalMs: 1, totalMs: 1 },
        contextCharCount: 20,
        usedChunkIds: [source.chunkId],
        truncatedContext: false,
      },
      { id: "quiz-short", now: "2026-10-31T02:00:00.000Z" },
    );
    assert.ok(session);
    const submitted = confirmSubmit(setShortAnswer(session, "short-answer-1", "Light"), "2026-10-31T02:01:00.000Z");
    if (submitted.status !== "submitted") {
      assert.fail("expected a report");
    }
    const saved = recordQuiz({ schemaVersion: 1, quizzes: [], activities: [] }, submitted.report);
    const reviewed = setShortAnswerSelfAssessment(submitted.session, "short-answer-1", "understood");
    assert.ok(reviewed.report);
    const replaced = replaceQuizReport(saved, reviewed.report);
    assert.equal(replaced.quizzes.length, 1);
    assert.equal(summarizeProgress(replaced).shortAnswerUnderstood, 1);
    assert.equal(summarizeProgress(replaced).shortAnswerUnrated, 0);
    assert.equal(replaced.quizzes[0]?.shortAnswers[0]?.verifiedGrade, null);
  });

  it("saves and restores progress in a new store instance", async () => {
    const session = createQuizSession(assessment([mcq("mcq-1", 0)]), {
      id: "quiz-restore",
      now: "2026-10-31T03:00:00.000Z",
    });
    assert.ok(session);
    const submitted = confirmSubmit(selectMcq(session, "mcq-1", 0), "2026-10-31T03:01:00.000Z");
    if (submitted.status !== "submitted") {
      assert.fail("expected a report");
    }
    const progress = appendStudyActivity(
      recordQuiz({ schemaVersion: 1, quizzes: [], activities: [] }, submitted.report),
      {
        id: "tutor-1",
        at: "2026-10-31T03:02:00.000Z",
        kind: "tutor_question",
        label: "Asked: What does chlorophyll absorb?",
      },
    );
    const store = createMemoryTextStore();
    await saveLearningProgress(store, progress);
    const restarted = createMemoryTextStore(store.snapshot());
    const loaded = await loadLearningProgress(restarted);
    assert.equal(loaded.status, "ok");
    assert.deepEqual(loaded.progress, progress);
    assert.equal(summarizeProgress(loaded.progress).mcqAccuracyPercent, 100);
    assert.equal((await progressFileBytes(restarted)) > 0, true);
  });

  it("treats a missing file as empty and does not overwrite an unreadable file by loading it", async () => {
    const store = createMemoryTextStore({
      [LIBRARY_STORE_NAME]: "{\"schemaVersion\":1,\"documents\":[]}",
    });
    const missing = await loadLearningProgress(store);
    assert.equal(missing.status, "empty");
    assert.equal(missing.progress.quizzes.length, 0);
    await store.write(PROGRESS_STORE_NAME, "{");
    const broken = await loadLearningProgress(store);
    assert.equal(broken.status, "unreadable");
    assert.equal(await store.read(PROGRESS_STORE_NAME), "{");
  });

  it("clears quiz history without removing the library file", async () => {
    const store = createMemoryTextStore({
      [PROGRESS_STORE_NAME]: "{\"schemaVersion\":1,\"quizzes\":[],\"activities\":[]}",
      [LIBRARY_STORE_NAME]: "{\"schemaVersion\":1,\"documents\":[{\"id\":\"notes\"}]}",
    });
    await clearLearningProgress(store);
    assert.equal(await store.read(PROGRESS_STORE_NAME), null);
    const libraryFile = await store.read(LIBRARY_STORE_NAME);
    assert.equal(libraryFile?.includes("notes"), true);
    const loaded = await loadLearningProgress(store);
    assert.equal(loaded.status, "empty");
  });
});
