import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyOutcome, type Difficulty } from "../assessment/adaptiveDifficulty";
import { generateExtractiveQuiz, gradeShortAnswer } from "../assessment/extractiveQuiz";
import { reviewCard, initialSrsState } from "../srs/sm2";
import { migrateCognifyDb } from "../sql/migrate";
import { openNodeSqlite } from "../sql/nodeSqlite";
import { createFlashcard, dueFlashcards, newFlashcards, reviewFlashcard, reviewedFlashcards } from "../persistence/flashcardRepository";
import { gradeExtractiveAnswer, recordQuizAttempt, suggestedDifficulty, weakTopics } from "../persistence/quizRepository";
import { buildLearningAnalytics, endLearningSession, learningStreak, startLearningSession } from "../persistence/analyticsRepository";
import { buildStudyPlan, completePlanItem, saveStudyPlan, planCompletionIds } from "../persistence/coachPlan";
import { describeOfflineReadiness } from "../persistence/offlineReadiness";
import type { DocumentChunk } from "../aiTypes";
import { answerFromDocuments } from "../documentChat";
import { createScriptedRuntime } from "../scriptedRuntime";
import { createLexiconEmbedder } from "../embeddings/lexiconEmbedder";
import { startSpeech, pauseSpeech, resumeSpeech, stopSpeech } from "../speechController";

const ML: DocumentChunk = {
  documentId: "ml",
  documentName: "Machine Learning Notes",
  chunkId: "ml:1",
  pageNumber: 4,
  section: "Training",
  text: "Machine learning algorithms learn patterns from training datasets.",
};

const OTHER: DocumentChunk = {
  documentId: "photo",
  documentName: "Cell Energy Notes",
  chunkId: "photo:1",
  pageNumber: 2,
  section: "Photosynthesis",
  text: "Chlorophyll in the chloroplast can absorb light. The Calvin cycle uses carbon dioxide to produce glucose.",
};

describe("adaptive questions and spaced repetition", () => {
  it("raises difficulty after two correct answers and lowers it after two misses", () => {
    let state: {
      difficulty: Difficulty;
      streakCorrect: number;
      streakIncorrect: number;
      correct: number;
      incorrect: number;
    } = { difficulty: "beginner", streakCorrect: 0, streakIncorrect: 0, correct: 0, incorrect: 0 };
    state = { ...state, ...applyOutcome(state, true) };
    assert.equal(state.difficulty, "beginner");
    state = { ...state, ...applyOutcome(state, true) };
    assert.equal(state.difficulty, "intermediate");
    state = { ...state, ...applyOutcome(state, false) };
    state = { ...state, ...applyOutcome(state, false) };
    assert.equal(state.difficulty, "beginner");
  });

  it("builds questions from the supplied sentences and scores them", () => {
    const beginner = generateExtractiveQuiz([ML, OTHER], {
      count: 1,
      difficulty: "beginner",
      idFor: (index) => `q${index}`,
      topic: "Training",
    });
    assert.equal(beginner.questions[0]?.kind, "true_false");
    assert.equal(beginner.questions[0]?.source.pageNumber, 4);
    assert.equal(gradeExtractiveAnswer(beginner.questions[0]!, beginner.questions[0]?.correctBoolean ? "true" : "false"), true);

    const advanced = generateExtractiveQuiz([ML], {
      count: 1,
      difficulty: "advanced",
      idFor: (index) => `a${index}`,
    });
    const reference = advanced.questions[0]?.referenceAnswer ?? "";
    assert.equal(gradeShortAnswer("algorithms learn patterns from training datasets", reference), true);
    assert.equal(gradeShortAnswer("photosynthesis", reference), false);
  });

  it("schedules the next review with SM-2 and keeps it after a new connection", async () => {
    const first = reviewCard(initialSrsState("2026-11-04T00:00:00.000Z"), "good", "2026-11-04T00:00:00.000Z");
    assert.equal(first.intervalDays, 1);
    assert.equal(first.repetitions, 1);
    assert.equal(first.dueAt, "2026-11-05T00:00:00.000Z");
    const again = reviewCard(first, "again", "2026-11-05T00:00:00.000Z");
    assert.equal(again.repetitions, 0);
    assert.equal(again.intervalDays, 1);
    assert.equal(again.lapses, 1);

    const db = openNodeSqlite(":memory:");
    await migrateCognifyDb(db, "2026-11-04T00:00:00.000Z");
    await createFlashcard(db, {
      id: "card-1",
      front: "What do the notes say about training?",
      back: ML.text,
      createdAt: "2026-11-04T00:00:00.000Z",
      sourceKind: "document",
      topic: "Training",
      documentId: "ml",
      documentName: "Machine Learning Notes",
      pageNumber: 4,
    });
    assert.equal((await newFlashcards(db)).length, 1);
    assert.equal((await dueFlashcards(db, "2026-11-04T00:00:00.000Z")).length, 1);
    const reviewed = await reviewFlashcard(db, "card-1", "good", "2026-11-04T00:00:00.000Z");
    assert.equal(reviewed?.schedule.dueAt, "2026-11-05T00:00:00.000Z");
    assert.equal((await dueFlashcards(db, "2026-11-04T12:00:00.000Z")).length, 0);
    assert.equal((await reviewedFlashcards(db)).length, 1);
    db.close();
  });

  it("records a real score and the next difficulty", async () => {
    const db = openNodeSqlite(":memory:");
    await migrateCognifyDb(db, "2026-11-04T00:00:00.000Z");
    const quiz = generateExtractiveQuiz([ML, OTHER], {
      count: 2,
      difficulty: "beginner",
      idFor: (index) => `q${index}`,
    });
    const answers = quiz.questions.map((question) => ({
      question,
      studentAnswer: question.kind === "true_false" ? (question.correctBoolean ? "true" : "false") : "0",
      correct: true,
    }));
    const attempt = await recordQuizAttempt(db, {
      id: "attempt-1",
      topic: "Training",
      difficulty: "beginner",
      createdAt: "2026-11-04T00:00:00.000Z",
      dayKey: "2026-11-04",
      timeMs: 12000,
      answers,
      questionIds: ["qq0", "qq1"],
      documentId: "ml",
      documentName: "Machine Learning Notes",
    });
    assert.equal(attempt.correctCount, answers.length);
    assert.equal(attempt.scorePercent, 100);
    assert.equal(attempt.timeMs, 12000);
    const second = await recordQuizAttempt(db, {
      id: "attempt-2",
      topic: "Training",
      difficulty: "beginner",
      createdAt: "2026-11-04T00:05:00.000Z",
      dayKey: "2026-11-04",
      timeMs: 1000,
      answers: answers.slice(0, 1),
      questionIds: ["qq2"],
    });
    assert.equal(second.correctCount, 1);
    assert.equal(await suggestedDifficulty(db, answers[0]?.question.topic ?? "Training"), "intermediate");
    db.close();
  });
});

describe("analytics, coach, document chat, and speech", () => {
  it("calculates analytics from stored rows and stays empty when there are none", async () => {
    const db = openNodeSqlite(":memory:");
    await migrateCognifyDb(db, "2026-11-04T00:00:00.000Z");
    const empty = await buildLearningAnalytics(db, "2026-11-04");
    assert.equal(empty.empty, true);
    assert.equal(empty.averageQuizScore, null);
    assert.equal(empty.quizzesCompleted, 0);
    assert.deepEqual(empty.weekly, []);

    await startLearningSession(db, { id: "sess", moduleName: "tutor", startedAt: "2026-11-04T00:00:00.000Z", dayKey: "2026-11-04" });
    assert.equal(await endLearningSession(db, "sess", "2026-11-04T00:10:00.000Z", 600000), true);
    const quiz = generateExtractiveQuiz([ML], { count: 1, difficulty: "advanced", idFor: () => "one" });
    await recordQuizAttempt(db, {
      id: "attempt",
      topic: "Training",
      difficulty: "advanced",
      createdAt: "2026-11-03T00:00:00.000Z",
      dayKey: "2026-11-03",
      timeMs: 5000,
      answers: [{ question: quiz.questions[0]!, studentAnswer: "no", correct: false }],
      questionIds: ["row"],
    });
    const report = await buildLearningAnalytics(db, "2026-11-04");
    assert.equal(report.studySessions, 1);
    assert.equal(report.studyMs, 600000);
    assert.equal(report.quizzesCompleted, 1);
    assert.equal(report.averageQuizScore, 0);
    assert.equal(report.weakTopics[0]?.topic, "Training");
    assert.equal(report.streakDays >= 1, true);
    const filtered = await buildLearningAnalytics(db, "2026-11-04", { fromDay: "2026-11-04", toDay: "2026-11-04" });
    assert.equal(filtered.quizzesCompleted, 0);
    assert.equal(filtered.studySessions, 1);
    assert.equal(learningStreak(["2026-11-02", "2026-11-03"], "2026-11-04"), 2);
    assert.equal(learningStreak(["2026-11-01"], "2026-11-04"), 0);
    db.close();
  });

  it("recommends revision only from recorded weakness", async () => {
    const db = openNodeSqlite(":memory:");
    await migrateCognifyDb(db, "2026-11-04T00:00:00.000Z");
    const emptyPlan = await buildStudyPlan(db, {
      id: "plan-empty",
      horizon: "daily",
      createdAt: "2026-11-04T00:00:00.000Z",
      nowIso: "2026-11-04T00:00:00.000Z",
      chunks: [ML],
    });
    assert.ok(emptyPlan.emptyReason);
    const quiz = generateExtractiveQuiz([ML], { count: 1, difficulty: "beginner", idFor: () => "q" });
    await recordQuizAttempt(db, {
      id: "bad",
      topic: "Training",
      difficulty: "beginner",
      createdAt: "2026-11-04T00:00:00.000Z",
      dayKey: "2026-11-04",
      timeMs: 1000,
      answers: [{ question: quiz.questions[0]!, studentAnswer: "false", correct: false }],
      questionIds: ["bad-q"],
    });
    assert.equal((await weakTopics(db))[0]?.topic, "Training");
    const plan = await buildStudyPlan(db, {
      id: "plan-1",
      horizon: "daily",
      createdAt: "2026-11-04T01:00:00.000Z",
      nowIso: "2026-11-04T01:00:00.000Z",
      chunks: [ML],
    });
    assert.equal(plan.items[0]?.topic, "Training");
    assert.equal(plan.items.some((item) => item.pageNumber === 4), true);
    await saveStudyPlan(db, plan);
    assert.equal(await completePlanItem(db, plan.id, plan.items[0]?.id ?? "", "2026-11-04T02:00:00.000Z"), true);
    assert.deepEqual(await planCompletionIds(db, plan.id), [plan.items[0]?.id]);
    const readiness = await describeOfflineReadiness(db, {
      chatAvailable: false,
      chatInUse: false,
      chatLabel: "Llama 3.2 1B Instruct",
      neuralAvailable: false,
      neuralInUse: false,
    });
    assert.equal(readiness.lexiconEmbedder.ready, true);
    assert.equal(readiness.neuralEmbedder.available, false);
    assert.equal(readiness.offlineReady, false);
    assert.ok(readiness.blockers.length > 0);
    db.close();
  });

  it("grounds a paraphrase in the retrieved page and does not call the model when nothing matches", async () => {
    const embedder = createLexiconEmbedder();
    const scripted = createScriptedRuntime({
      respond: () => ({ text: "Algorithms learn patterns from training datasets. See page 99.", generationTimeMs: 5 }),
    });
    await scripted.runtime.initialize({ modelPath: "C:\\models\\ignored.gguf" });
    const answered = await answerFromDocuments(
      scripted.runtime,
      embedder,
      "How do computers learn?",
      [ML, OTHER],
    );
    assert.equal(answered.grounded, true);
    assert.equal(answered.answer.sources[0]?.pageNumber, 4);
    assert.equal(answered.answer.sources[0]?.documentName, "Machine Learning Notes");
    assert.ok(
      answered.answer.retrievalMethod === "semantic" ||
        answered.answer.retrievalMethod === "hybrid" ||
        answered.answer.retrievalMethod === "keyword",
    );
    assert.equal(scripted.generateCalls.length, 1);
    assert.match(scripted.generateCalls[0]?.prompt ?? "", /training datasets/);

    const missed = await answerFromDocuments(scripted.runtime, embedder, "zygote meiosis allele", [ML, OTHER]);
    assert.equal(missed.grounded, false);
    assert.equal(missed.answer.status, "insufficient_evidence");
    assert.equal(scripted.generateCalls.length, 1);
  });

  it("does not use the network for search, history, quizzes, cards, analytics, or speech state", async () => {
    const original = globalThis.fetch;
    let called = false;
    globalThis.fetch = (() => {
      called = true;
      throw new Error("network");
    }) as typeof fetch;
    try {
      const embedder = createLexiconEmbedder();
      await embedder.embed(["How do computers learn?", ML.text]);
      const db = openNodeSqlite(":memory:");
      await migrateCognifyDb(db, "2026-11-04T00:00:00.000Z");
      await buildLearningAnalytics(db, "2026-11-04");
      const speech = startSpeech("Review recursion fundamentals.", true);
      assert.equal(pauseSpeech(speech, 7).phase, "paused");
      assert.equal(resumeSpeech(pauseSpeech(speech, 7), true).phase, "playing");
      assert.equal(stopSpeech().phase, "idle");
      assert.equal(startSpeech("Hello", false).phase, "unavailable");
      db.close();
      assert.equal(called, false);
    } finally {
      globalThis.fetch = original;
    }
  });
});
