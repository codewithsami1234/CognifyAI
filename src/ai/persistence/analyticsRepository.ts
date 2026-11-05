import type { SqlDatabase } from "../sql/sqlDatabase";
import { listTopicPerformance, listQuizAttempts, type QuizAttemptRecord } from "./quizRepository";
import type { TopicPerformance } from "../assessment/adaptiveDifficulty";

export interface DayActivity {
  day: string;
  sessions: number;
  studyMs: number;
  reviews: number;
  quizzes: number;
}

export interface LearningAnalytics {
  studySessions: number;
  studyMs: number;
  documentsStudied: number;
  questionsAsked: number;
  quizzesCompleted: number;
  averageQuizScore: number | null;
  flashcardsReviewed: number;
  streakDays: number;
  topicsStudied: string[];
  frequentTopics: Array<{ topic: string; attempts: number }>;
  weakTopics: Array<{ topic: string; accuracy: number; attempted: number }>;
  strongTopics: Array<{ topic: string; accuracy: number; attempted: number }>;
  weekly: DayActivity[];
  quizScores: Array<{ at: string; percent: number; topic: string }>;
  topicBars: Array<{ topic: string; correct: number; incorrect: number; accuracy: number }>;
  empty: boolean;
}

export function learningStreak(dayKeys: readonly string[], today: string): number {
  const days = new Set(dayKeys);
  const cursor = new Date(`${today}T00:00:00Z`);
  if (Number.isNaN(cursor.getTime())) {
    return 0;
  }
  const todayKey = today;
  const yesterday = new Date(cursor.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  let start = todayKey;
  if (!days.has(todayKey)) {
    if (!days.has(yesterday)) {
      return 0;
    }
    start = yesterday;
  }
  let streak = 0;
  const point = new Date(`${start}T00:00:00Z`);
  while (days.has(point.toISOString().slice(0, 10))) {
    streak += 1;
    point.setUTCDate(point.getUTCDate() - 1);
  }
  return streak;
}

function inRange(day: string, fromDay?: string, toDay?: string): boolean {
  if (fromDay && day < fromDay) {
    return false;
  }
  if (toDay && day > toDay) {
    return false;
  }
  return true;
}

function accuracyOf(topic: TopicPerformance): number {
  const attempted = topic.correct + topic.incorrect;
  if (attempted < 1) {
    return 0;
  }
  return topic.correct / attempted;
}

/**
 * Every number is counted from stored rows. An empty database returns zeros
 * and empty lists, not sample progress.
 */
export async function buildLearningAnalytics(
  db: SqlDatabase,
  today: string,
  range?: { fromDay?: string; toDay?: string },
): Promise<LearningAnalytics> {
  const sessions = (await db.query(`SELECT day_key, duration_ms, ended_at FROM learning_sessions`))
    .filter((row) => inRange(String(row.day_key), range?.fromDay, range?.toDay));
  const closedSessions = sessions.filter((row) => row.ended_at !== null);
  const studyMs = closedSessions.reduce((sum, row) => sum + Number(row.duration_ms), 0);
  const documents = (await db.query(`SELECT document_id, day_key FROM document_history`))
    .filter((row) => inRange(String(row.day_key), range?.fromDay, range?.toDay));
  const questions = (await db.query(`SELECT created_at FROM messages WHERE role = 'user'`))
    .filter((row) => inRange(String(row.created_at).slice(0, 10), range?.fromDay, range?.toDay));
  const quizzes = (await listQuizAttempts(db)).filter((quiz) => inRange(quiz.createdAt.slice(0, 10), range?.fromDay, range?.toDay));
  const reviews = (await db.query(`SELECT last_reviewed_at FROM srs_schedule WHERE last_reviewed_at IS NOT NULL`))
    .filter((row) => inRange(String(row.last_reviewed_at).slice(0, 10), range?.fromDay, range?.toDay));
  const topics = await listTopicPerformance(db);
  const searches = (await db.query(`SELECT query, day_key FROM search_history`))
    .filter((row) => inRange(String(row.day_key), range?.fromDay, range?.toDay));

  const frequent = new Map<string, number>();
  for (const topic of topics) {
    frequent.set(topic.topic, topic.correct + topic.incorrect);
  }
  for (const search of searches) {
    const key = String(search.query).trim();
    if (key.length === 0) {
      continue;
    }
    frequent.set(key, (frequent.get(key) ?? 0) + 1);
  }
  const frequentTopics = [...frequent.entries()]
    .filter((entry) => entry[1] > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8)
    .map(([topic, attempts]) => ({ topic, attempts }));

  const weak = topics
    .filter((topic) => topic.correct + topic.incorrect > 0 && accuracyOf(topic) <= 0.6)
    .map((topic) => ({ topic: topic.topic, accuracy: accuracyOf(topic), attempted: topic.correct + topic.incorrect }));
  const strong = topics
    .filter((topic) => topic.correct + topic.incorrect >= 2 && accuracyOf(topic) >= 0.8)
    .map((topic) => ({ topic: topic.topic, accuracy: accuracyOf(topic), attempted: topic.correct + topic.incorrect }));

  const days = new Map<string, DayActivity>();
  function day(key: string): DayActivity {
    const existing = days.get(key);
    if (existing) {
      return existing;
    }
    const created: DayActivity = { day: key, sessions: 0, studyMs: 0, reviews: 0, quizzes: 0 };
    days.set(key, created);
    return created;
  }
  for (const session of closedSessions) {
    const bucket = day(String(session.day_key));
    bucket.sessions += 1;
    bucket.studyMs += Number(session.duration_ms);
  }
  for (const review of reviews) {
    day(String(review.last_reviewed_at).slice(0, 10)).reviews += 1;
  }
  for (const quiz of quizzes) {
    day(quiz.createdAt.slice(0, 10)).quizzes += 1;
  }
  const weekly = [...days.values()].sort((a, b) => a.day.localeCompare(b.day)).slice(-7);
  const activityDays = [
    ...sessions.map((row) => String(row.day_key)),
    ...reviews.map((row) => String(row.last_reviewed_at).slice(0, 10)),
    ...quizzes.map((quiz) => quiz.createdAt.slice(0, 10)),
    ...questions.map((row) => String(row.created_at).slice(0, 10)),
  ];
  const averageQuizScore =
    quizzes.length === 0 ? null : quizzes.reduce((sum, quiz) => sum + quiz.scorePercent, 0) / quizzes.length;
  const empty =
    closedSessions.length === 0 &&
    documents.length === 0 &&
    questions.length === 0 &&
    quizzes.length === 0 &&
    reviews.length === 0 &&
    topics.length === 0;

  return {
    studySessions: closedSessions.length,
    studyMs,
    documentsStudied: new Set(documents.map((row) => String(row.document_id))).size,
    questionsAsked: questions.length,
    quizzesCompleted: quizzes.length,
    averageQuizScore,
    flashcardsReviewed: reviews.length,
    streakDays: learningStreak(activityDays, today),
    topicsStudied: topics.map((topic) => topic.topic),
    frequentTopics,
    weakTopics: weak,
    strongTopics: strong,
    weekly,
    quizScores: quizzes.map((quiz: QuizAttemptRecord) => ({
      at: quiz.createdAt,
      percent: quiz.scorePercent,
      topic: quiz.topic,
    })),
    topicBars: topics.map((topic) => ({
      topic: topic.topic,
      correct: topic.correct,
      incorrect: topic.incorrect,
      accuracy: accuracyOf(topic),
    })),
    empty,
  };
}

export async function startLearningSession(
  db: SqlDatabase,
  input: { id: string; moduleName: string; startedAt: string; dayKey: string },
): Promise<void> {
  await db.exec(
    `INSERT INTO learning_sessions (id, module_name, started_at, ended_at, duration_ms, day_key) VALUES (?, ?, ?, NULL, 0, ?)`,
    [input.id, input.moduleName, input.startedAt, input.dayKey],
  );
}

export async function endLearningSession(db: SqlDatabase, id: string, endedAt: string, durationMs: number): Promise<boolean> {
  const rows = await db.query(`SELECT id FROM learning_sessions WHERE id = ? AND ended_at IS NULL`, [id]);
  if (rows.length === 0) {
    return false;
  }
  if (durationMs < 0 || !Number.isFinite(durationMs)) {
    throw new Error("Session duration must be a non-negative number of milliseconds.");
  }
  await db.exec(`UPDATE learning_sessions SET ended_at = ?, duration_ms = ? WHERE id = ?`, [endedAt, Math.round(durationMs), id]);
  return true;
}
