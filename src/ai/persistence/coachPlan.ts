import type { DocumentChunk } from "../aiTypes";
import type { Difficulty } from "../assessment/adaptiveDifficulty";
import type { SqlDatabase } from "../sql/sqlDatabase";
import { listRecentDocuments, listSearches } from "./historyRepository";
import { dueFlashcards } from "./flashcardRepository";
import { weakTopics } from "./quizRepository";

export interface PlanItem {
  id: string;
  kind: "review_topic" | "open_section" | "flashcards" | "quiz" | "reassess";
  title: string;
  detail: string;
  topic?: string;
  documentId?: string;
  documentName?: string;
  pageNumber?: number;
  chunkId?: string;
  difficulty?: Difficulty;
}

export interface StudyPlan {
  id: string;
  horizon: "daily" | "weekly";
  title: string;
  basedOn: string;
  createdAt: string;
  items: PlanItem[];
  emptyReason?: string;
}

function easier(difficulty: Difficulty): Difficulty {
  if (difficulty === "advanced") {
    return "intermediate";
  }
  if (difficulty === "intermediate") {
    return "beginner";
  }
  return "beginner";
}

/**
 * Builds a plan from recorded weak topics, due flashcards, saved document
 * positions, and past searches. If none of those exist, the plan is empty.
 * It does not invent a topic the student has not studied.
 */
export async function buildStudyPlan(
  db: SqlDatabase,
  input: {
    id: string;
    horizon: "daily" | "weekly";
    createdAt: string;
    chunks: readonly DocumentChunk[];
    nowIso: string;
  },
): Promise<StudyPlan> {
  const weak = await weakTopics(db);
  const due = await dueFlashcards(db, input.nowIso);
  const recent = await listRecentDocuments(db, 5);
  const searches = await listSearches(db, 5);
  const items: PlanItem[] = [];
  const limit = input.horizon === "daily" ? 4 : 8;
  for (const topic of weak) {
    if (items.length >= limit) {
      break;
    }
    const attempted = topic.correct + topic.incorrect;
    const accuracy = attempted === 0 ? 0 : topic.correct / attempted;
    const chunk = input.chunks.find((candidate) => {
      const haystack = `${candidate.section ?? ""} ${candidate.text}`.toLowerCase();
      return haystack.includes(topic.topic.toLowerCase());
    });
    items.push({
      id: `${input.id}:review:${topic.topic}`,
      kind: "review_topic",
      title: `Review ${topic.topic}`,
      detail: `Recorded accuracy is ${Math.round(accuracy * 100)}% from ${attempted} answer(s).`,
      topic: topic.topic,
      difficulty: easier(topic.difficulty),
    });
    if (chunk && items.length < limit) {
      const item: PlanItem = {
        id: `${input.id}:section:${chunk.chunkId}`,
        kind: "open_section",
        title: `Open ${chunk.documentName}`,
        detail: chunk.section ? `Section ${chunk.section}` : "A stored passage matches this topic.",
        topic: topic.topic,
        documentId: chunk.documentId,
        documentName: chunk.documentName,
        chunkId: chunk.chunkId,
      };
      if (chunk.pageNumber !== undefined) {
        item.pageNumber = chunk.pageNumber;
        item.detail = `Page ${chunk.pageNumber}${chunk.section ? `, section ${chunk.section}` : ""}`;
      }
      items.push(item);
    }
    const cards = due.filter((card) => card.topic?.toLowerCase() === topic.topic.toLowerCase());
    if (cards.length > 0 && items.length < limit) {
      items.push({
        id: `${input.id}:cards:${topic.topic}`,
        kind: "flashcards",
        title: `Study ${cards.length} due flashcard(s)`,
        detail: `These cards are scheduled on or before ${input.nowIso}.`,
        topic: topic.topic,
      });
    }
    if (items.length < limit) {
      items.push({
        id: `${input.id}:quiz:${topic.topic}`,
        kind: "quiz",
        title: `Attempt a ${easier(topic.difficulty)} quiz`,
        detail: "The level is one step below the current stored level after repeated misses, or beginner when that is already the stored level.",
        topic: topic.topic,
        difficulty: easier(topic.difficulty),
      });
    }
  }
  if (items.length === 0 && due.length > 0 && items.length < limit) {
    items.push({
      id: `${input.id}:due`,
      kind: "flashcards",
      title: `Review ${due.length} due flashcard(s)`,
      detail: "The schedule comes from saved SM-2 review dates.",
    });
  }
  if (items.length === 0 && searches.length > 0 && items.length < limit) {
    items.push({
      id: `${input.id}:search`,
      kind: "review_topic",
      title: `Return to “${searches[0]?.query ?? "a recent search"}”`,
      detail: "This is a recent saved search, not a new recommendation from outside your history.",
    });
  }
  if (items.length < limit && recent[0] && weak.length > 0) {
    items.push({
      id: `${input.id}:reassess`,
      kind: "reassess",
      title: "Reassess after review",
      detail: "Take another quiz on the weak topic after the review items above. The next level uses the updated scores.",
      topic: weak[0]?.topic,
    });
  }
  const basedOn = `Weak topics ${weak.length}, due flashcards ${due.length}, recent documents ${recent.length}, recent searches ${searches.length}.`;
  const plan: StudyPlan = {
    id: input.id,
    horizon: input.horizon,
    title: input.horizon === "daily" ? "Daily study plan" : "Weekly study plan",
    basedOn,
    createdAt: input.createdAt,
    items: items.slice(0, limit),
  };
  if (plan.items.length === 0) {
    plan.emptyReason = "No weak topic, due flashcard, or saved search was found, so no plan items were created.";
  }
  return plan;
}

export async function saveStudyPlan(db: SqlDatabase, plan: StudyPlan): Promise<void> {
  const existing = await db.query(`SELECT id FROM learning_plans WHERE id = ?`, [plan.id]);
  if (existing.length > 0) {
    throw new Error("A study plan with this id already exists.");
  }
  await db.exec(
    `INSERT INTO learning_plans (id, horizon, title, based_on, items_json, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [plan.id, plan.horizon, plan.title, plan.basedOn, JSON.stringify(plan.items), plan.createdAt],
  );
}

export async function completePlanItem(db: SqlDatabase, planId: string, itemId: string, completedAt: string): Promise<boolean> {
  const plan = await db.query(`SELECT items_json FROM learning_plans WHERE id = ?`, [planId]);
  if (plan.length === 0) {
    return false;
  }
  let items: PlanItem[] = [];
  try {
    const parsed = JSON.parse(String(plan[0]?.items_json)) as PlanItem[];
    items = Array.isArray(parsed) ? parsed : [];
  } catch {
    return false;
  }
  if (!items.some((item) => item.id === itemId)) {
    return false;
  }
  const done = await db.query(`SELECT item_id FROM plan_completions WHERE plan_id = ? AND item_id = ?`, [planId, itemId]);
  if (done.length > 0) {
    return true;
  }
  await db.exec(`INSERT INTO plan_completions (plan_id, item_id, completed_at) VALUES (?, ?, ?)`, [planId, itemId, completedAt]);
  return true;
}

export async function planCompletionIds(db: SqlDatabase, planId: string): Promise<string[]> {
  const rows = await db.query(`SELECT item_id FROM plan_completions WHERE plan_id = ? ORDER BY item_id`, [planId]);
  return rows.map((row) => String(row.item_id));
}

export async function loadStudyPlan(db: SqlDatabase, planId: string): Promise<StudyPlan | undefined> {
  const rows = await db.query(`SELECT id, horizon, title, based_on, items_json, created_at FROM learning_plans WHERE id = ?`, [planId]);
  const row = rows[0];
  if (!row) {
    return undefined;
  }
  let items: PlanItem[] = [];
  try {
    const parsed = JSON.parse(String(row.items_json)) as PlanItem[];
    items = Array.isArray(parsed) ? parsed : [];
  } catch {
    items = [];
  }
  const plan: StudyPlan = {
    id: String(row.id),
    horizon: row.horizon === "weekly" ? "weekly" : "daily",
    title: String(row.title),
    basedOn: String(row.based_on),
    createdAt: String(row.created_at),
    items,
  };
  if (items.length === 0) {
    plan.emptyReason = "This saved plan has no items.";
  }
  return plan;
}
