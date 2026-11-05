import type { SqlDatabase } from "../sql/sqlDatabase";
import { applyOutcome, emptyTopic, isDifficulty, type Difficulty, type TopicPerformance } from "../assessment/adaptiveDifficulty";
import { gradeShortAnswer, type ExtractiveQuestion } from "../assessment/extractiveQuiz";

export interface QuizAttemptRecord {
  id: string;
  topic: string;
  difficulty: Difficulty;
  questionCount: number;
  correctCount: number;
  incorrectCount: number;
  scorePercent: number;
  timeMs: number;
  createdAt: string;
  documentId: string | null;
  documentName: string | null;
}

export interface GradedAnswer {
  question: ExtractiveQuestion;
  correct: boolean;
  studentAnswer: string;
}

export function gradeExtractiveAnswer(question: ExtractiveQuestion, studentAnswer: string): boolean {
  if (question.kind === "mcq") {
    const index = Number(studentAnswer);
    return Number.isInteger(index) && index === question.correctIndex;
  }
  if (question.kind === "true_false") {
    const normalized = studentAnswer.trim().toLowerCase();
    const value = normalized === "true" ? true : normalized === "false" ? false : undefined;
    return value !== undefined && value === question.correctBoolean;
  }
  return gradeShortAnswer(studentAnswer, question.referenceAnswer ?? "");
}

export async function topicPerformance(db: SqlDatabase, topic: string): Promise<TopicPerformance | undefined> {
  const rows = await db.query(
    `SELECT topic, correct_count, incorrect_count, streak_correct, streak_incorrect, difficulty, updated_at
     FROM topic_performance WHERE topic = ?`,
    [topic],
  );
  const row = rows[0];
  if (!row || !isDifficulty(String(row.difficulty))) {
    return undefined;
  }
  return {
    topic: String(row.topic),
    correct: Number(row.correct_count),
    incorrect: Number(row.incorrect_count),
    streakCorrect: Number(row.streak_correct),
    streakIncorrect: Number(row.streak_incorrect),
    difficulty: String(row.difficulty) as Difficulty,
    updatedAt: String(row.updated_at),
  };
}

export async function listTopicPerformance(db: SqlDatabase): Promise<TopicPerformance[]> {
  return (await db.query(
      `SELECT topic, correct_count, incorrect_count, streak_correct, streak_incorrect, difficulty, updated_at
       FROM topic_performance ORDER BY topic`,
    )).flatMap((row) => {
      if (!isDifficulty(String(row.difficulty))) {
        return [];
      }
      return [
        {
          topic: String(row.topic),
          correct: Number(row.correct_count),
          incorrect: Number(row.incorrect_count),
          streakCorrect: Number(row.streak_correct),
          streakIncorrect: Number(row.streak_incorrect),
          difficulty: String(row.difficulty) as Difficulty,
          updatedAt: String(row.updated_at),
        },
      ];
    });
}

export async function suggestedDifficulty(db: SqlDatabase, topic: string): Promise<Difficulty> {
  return (await topicPerformance(db, topic))?.difficulty ?? "beginner";
}

export async function recordQuizAttempt(
  db: SqlDatabase,
  input: {
    id: string;
    topic: string;
    difficulty: Difficulty;
    createdAt: string;
    dayKey: string;
    timeMs: number;
    answers: readonly GradedAnswer[];
    documentId?: string;
    documentName?: string;
    questionIds: readonly string[];
  },
): Promise<QuizAttemptRecord> {
  if (input.answers.length === 0) {
    throw new Error("A quiz attempt needs at least one graded answer.");
  }
  if (input.timeMs < 0 || !Number.isFinite(input.timeMs)) {
    throw new Error("Quiz time must be a non-negative number of milliseconds.");
  }
  const correctCount = input.answers.filter((answer) => answer.correct).length;
  const incorrectCount = input.answers.length - correctCount;
  const scorePercent = (correctCount / input.answers.length) * 100;
  await db.transaction(async () => {
    await db.exec(
      `INSERT INTO quiz_attempts
        (id, document_id, document_name, topic, difficulty, question_count, correct_count, incorrect_count, score_percent, time_ms, created_at, day_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.id,
        input.documentId ?? null,
        input.documentName ?? null,
        input.topic,
        input.difficulty,
        input.answers.length,
        correctCount,
        incorrectCount,
        scorePercent,
        Math.round(input.timeMs),
        input.createdAt,
        input.dayKey,
      ],
    );
    for (let index = 0; index < input.answers.length; index += 1) {
      const answer = input.answers[index];
      if (!answer) {
        continue;
      }
      await db.exec(
        `INSERT INTO quiz_questions (id, attempt_id, kind, topic, difficulty, prompt, correct, student_answer, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          input.questionIds[index] ?? `${input.id}:${index}`,
          input.id,
          answer.question.kind,
          answer.question.topic,
          answer.question.difficulty,
          answer.question.prompt,
          answer.correct ? 1 : 0,
          answer.studentAnswer,
          input.createdAt,
        ],
      );
      const current = (await topicPerformance(db, answer.question.topic)) ?? emptyTopic(answer.question.topic, input.createdAt);
      const next = applyOutcome(current, answer.correct);
      if (((await db.query(`SELECT topic FROM topic_performance WHERE topic = ?`, [answer.question.topic]))).length === 0) {
        await db.exec(
          `INSERT INTO topic_performance
            (topic, correct_count, incorrect_count, streak_correct, streak_incorrect, difficulty, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [answer.question.topic, next.correct, next.incorrect, next.streakCorrect, next.streakIncorrect, next.difficulty, input.createdAt],
        );
      } else {
        await db.exec(
          `UPDATE topic_performance
           SET correct_count = ?, incorrect_count = ?, streak_correct = ?, streak_incorrect = ?, difficulty = ?, updated_at = ?
           WHERE topic = ?`,
          [next.correct, next.incorrect, next.streakCorrect, next.streakIncorrect, next.difficulty, input.createdAt, answer.question.topic],
        );
      }
    }
  });
  return {
    id: input.id,
    topic: input.topic,
    difficulty: input.difficulty,
    questionCount: input.answers.length,
    correctCount,
    incorrectCount,
    scorePercent,
    timeMs: Math.round(input.timeMs),
    createdAt: input.createdAt,
    documentId: input.documentId ?? null,
    documentName: input.documentName ?? null,
  };
}

export async function listQuizAttempts(db: SqlDatabase): Promise<QuizAttemptRecord[]> {
  return (await db.query(
      `SELECT id, document_id, document_name, topic, difficulty, question_count, correct_count, incorrect_count, score_percent, time_ms, created_at
       FROM quiz_attempts ORDER BY created_at DESC, id`,
    )).flatMap((row) => {
      if (!isDifficulty(String(row.difficulty))) {
        return [];
      }
      return [
        {
          id: String(row.id),
          topic: String(row.topic),
          difficulty: String(row.difficulty) as Difficulty,
          questionCount: Number(row.question_count),
          correctCount: Number(row.correct_count),
          incorrectCount: Number(row.incorrect_count),
          scorePercent: Number(row.score_percent),
          timeMs: Number(row.time_ms),
          createdAt: String(row.created_at),
          documentId: row.document_id === null ? null : String(row.document_id),
          documentName: row.document_name === null ? null : String(row.document_name),
        },
      ];
    });
}

export async function weakTopics(db: SqlDatabase, maxAccuracy = 0.6): Promise<TopicPerformance[]> {
  return (await listTopicPerformance(db)).filter((topic) => {
    const attempted = topic.correct + topic.incorrect;
    if (attempted < 1) {
      return false;
    }
    return topic.correct / attempted <= maxAccuracy;
  });
}
