import type { SqlDatabase } from "../sql/sqlDatabase";
import { initialSrsState, isDue, reviewCard, type SrsGrade, type SrsState } from "../srs/sm2";

export interface FlashcardRecord {
  id: string;
  front: string;
  back: string;
  topic: string | null;
  documentId: string | null;
  documentName: string | null;
  pageNumber: number | null;
  sourceKind: string;
  createdAt: string;
  schedule: SrsState;
}

function mapCard(row: { [column: string]: string | number | null }): FlashcardRecord {
  const schedule: SrsState = {
    easiness: Number(row.easiness),
    intervalDays: Number(row.interval_days),
    repetitions: Number(row.repetitions),
    lapses: Number(row.lapses),
    dueAt: String(row.due_at),
  };
  if (row.last_reviewed_at !== null) {
    schedule.lastReviewedAt = String(row.last_reviewed_at);
  }
  if (row.last_grade === "again" || row.last_grade === "hard" || row.last_grade === "good" || row.last_grade === "easy") {
    schedule.lastGrade = row.last_grade;
  }
  return {
    id: String(row.id),
    front: String(row.front),
    back: String(row.back),
    topic: row.topic === null ? null : String(row.topic),
    documentId: row.document_id === null ? null : String(row.document_id),
    documentName: row.document_name === null ? null : String(row.document_name),
    pageNumber: typeof row.page_number === "number" ? row.page_number : null,
    sourceKind: String(row.source_kind),
    createdAt: String(row.created_at),
    schedule,
  };
}

const CARD_SQL = `SELECT f.id, f.front, f.back, f.topic, f.document_id, f.document_name, f.page_number, f.source_kind, f.created_at,
  s.easiness, s.interval_days, s.repetitions, s.lapses, s.due_at, s.last_reviewed_at, s.last_grade
  FROM flashcards f JOIN srs_schedule s ON s.card_id = f.id`;

export async function createFlashcard(
  db: SqlDatabase,
  input: {
    id: string;
    front: string;
    back: string;
    createdAt: string;
    sourceKind: string;
    topic?: string;
    documentId?: string;
    documentName?: string;
    pageNumber?: number;
  },
): Promise<FlashcardRecord> {
  const front = input.front.trim();
  const back = input.back.trim();
  if (front.length === 0 || back.length === 0) {
    throw new Error("A flashcard needs a front and a back.");
  }
  if ((await db.query(`SELECT id FROM flashcards WHERE id = ?`, [input.id])).length > 0) {
    throw new Error("A flashcard with this id already exists.");
  }
  const schedule = initialSrsState(input.createdAt);
  await db.transaction(async () => {
    await db.exec(
      `INSERT INTO flashcards (id, front, back, topic, document_id, document_name, page_number, source_kind, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.id,
        front,
        back,
        input.topic?.trim() || null,
        input.documentId ?? null,
        input.documentName ?? null,
        input.pageNumber ?? null,
        input.sourceKind,
        input.createdAt,
      ],
    );
    await db.exec(
      `INSERT INTO srs_schedule (card_id, easiness, interval_days, repetitions, lapses, due_at, last_reviewed_at, last_grade)
       VALUES (?, ?, ?, ?, ?, ?, NULL, NULL)`,
      [input.id, schedule.easiness, schedule.intervalDays, schedule.repetitions, schedule.lapses, schedule.dueAt],
    );
  });
  return {
    id: input.id,
    front,
    back,
    topic: input.topic?.trim() || null,
    documentId: input.documentId ?? null,
    documentName: input.documentName ?? null,
    pageNumber: input.pageNumber ?? null,
    sourceKind: input.sourceKind,
    createdAt: input.createdAt,
    schedule,
  };
}

export async function listFlashcards(db: SqlDatabase, topic?: string): Promise<FlashcardRecord[]> {
  const rows = topic
    ? await db.query(`${CARD_SQL} WHERE lower(coalesce(f.topic, '')) = lower(?) ORDER BY s.due_at, f.id`, [topic.trim()])
    : await db.query(`${CARD_SQL} ORDER BY s.due_at, f.id`);
  return rows.map(mapCard);
}

export async function dueFlashcards(db: SqlDatabase, nowIso: string, topic?: string): Promise<FlashcardRecord[]> {
  return (await listFlashcards(db, topic)).filter((card) => isDue(card.schedule, nowIso));
}

export async function newFlashcards(db: SqlDatabase): Promise<FlashcardRecord[]> {
  return (await listFlashcards(db)).filter((card) => card.schedule.lastReviewedAt === undefined);
}

export async function reviewedFlashcards(db: SqlDatabase): Promise<FlashcardRecord[]> {
  return (await listFlashcards(db)).filter((card) => card.schedule.lastReviewedAt !== undefined);
}

export async function reviewFlashcard(db: SqlDatabase, cardId: string, grade: SrsGrade, reviewedAt: string): Promise<FlashcardRecord | undefined> {
  const rows = await db.query(`${CARD_SQL} WHERE f.id = ?`, [cardId]);
  const current = rows[0] ? mapCard(rows[0]) : undefined;
  if (!current) {
    return undefined;
  }
  const next = reviewCard(current.schedule, grade, reviewedAt);
  await db.exec(
    `UPDATE srs_schedule
     SET easiness = ?, interval_days = ?, repetitions = ?, lapses = ?, due_at = ?, last_reviewed_at = ?, last_grade = ?
     WHERE card_id = ?`,
    [next.easiness, next.intervalDays, next.repetitions, next.lapses, next.dueAt, next.lastReviewedAt ?? null, next.lastGrade ?? null, cardId],
  );
  return { ...current, schedule: next };
}

export async function deleteFlashcard(db: SqlDatabase, cardId: string): Promise<boolean> {
  if ((await db.query(`SELECT id FROM flashcards WHERE id = ?`, [cardId])).length === 0) {
    return false;
  }
  await db.exec(`DELETE FROM flashcards WHERE id = ?`, [cardId]);
  return true;
}

export function flashcardsFromPassage(input: {
  text: string;
  topic?: string;
  documentId?: string;
  documentName?: string;
  pageNumber?: number;
  sourceKind: string;
  createdAt: string;
  idFor: (index: number) => string;
}): Array<{ id: string; front: string; back: string; topic: string | null; documentId: string | null; documentName: string | null; pageNumber: number | null; sourceKind: string; createdAt: string }> {
  const sentences = input.text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 20)
    .slice(0, 3);
  return sentences.map((sentence, index) => ({
    id: input.idFor(index),
    front: `What do the notes say?`,
    back: sentence,
    topic: input.topic ?? null,
    documentId: input.documentId ?? null,
    documentName: input.documentName ?? null,
    pageNumber: input.pageNumber ?? null,
    sourceKind: input.sourceKind,
    createdAt: input.createdAt,
  }));
}
