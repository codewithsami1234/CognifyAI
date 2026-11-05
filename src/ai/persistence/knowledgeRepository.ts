import type { SqlDatabase } from "../sql/sqlDatabase";

export interface SavedItem {
  id: string;
  title: string;
  body: string;
  topic: string | null;
  documentId: string | null;
  documentName: string | null;
  pageNumber: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface BookmarkItem extends SavedItem {
  kind: string;
  chunkId: string | null;
}

function cleanTopic(topic: string | undefined): string | null {
  const value = topic?.trim();
  return value && value.length > 0 ? value : null;
}

export async function saveBookmark(
  db: SqlDatabase,
  input: {
    id: string;
    kind: string;
    title: string;
    body: string;
    createdAt: string;
    topic?: string;
    documentId?: string;
    documentName?: string;
    pageNumber?: number;
    chunkId?: string;
  },
): Promise<BookmarkItem> {
  if (input.title.trim().length === 0 || input.body.trim().length === 0) {
    throw new Error("A bookmark needs a title and text.");
  }
  const duplicate = await db.query(`SELECT id FROM bookmarks WHERE id = ?`, [input.id]);
  if (duplicate.length > 0) {
    throw new Error("A bookmark with this id already exists.");
  }
  await db.exec(
    `INSERT INTO bookmarks
      (id, kind, title, body, topic, document_id, document_name, page_number, chunk_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.id,
      input.kind,
      input.title.trim(),
      input.body.trim(),
      cleanTopic(input.topic),
      input.documentId ?? null,
      input.documentName ?? null,
      input.pageNumber ?? null,
      input.chunkId ?? null,
      input.createdAt,
      input.createdAt,
    ],
  );
  return {
    id: input.id,
    kind: input.kind,
    title: input.title.trim(),
    body: input.body.trim(),
    topic: cleanTopic(input.topic),
    documentId: input.documentId ?? null,
    documentName: input.documentName ?? null,
    pageNumber: input.pageNumber ?? null,
    chunkId: input.chunkId ?? null,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  };
}

export async function listBookmarks(db: SqlDatabase, topic?: string): Promise<BookmarkItem[]> {
  const rows = topic
    ? await db.query(
        `SELECT id, kind, title, body, topic, document_id, document_name, page_number, chunk_id, created_at, updated_at
         FROM bookmarks WHERE lower(topic) = lower(?) ORDER BY updated_at DESC, id`,
        [topic.trim()],
      )
    : await db.query(
        `SELECT id, kind, title, body, topic, document_id, document_name, page_number, chunk_id, created_at, updated_at
         FROM bookmarks ORDER BY updated_at DESC, id`,
      );
  return rows.map(mapBookmark);
}

export async function deleteBookmark(db: SqlDatabase, id: string): Promise<boolean> {
  const rows = await db.query(`SELECT id FROM bookmarks WHERE id = ?`, [id]);
  if (rows.length === 0) {
    return false;
  }
  await db.exec(`DELETE FROM bookmarks WHERE id = ?`, [id]);
  return true;
}

export async function saveNote(
  db: SqlDatabase,
  input: {
    id: string;
    title: string;
    body: string;
    createdAt: string;
    topic?: string;
    documentId?: string;
    documentName?: string;
    pageNumber?: number;
  },
): Promise<SavedItem> {
  if (input.title.trim().length === 0 || input.body.trim().length === 0) {
    throw new Error("A note needs a title and text.");
  }
  if ((await db.query(`SELECT id FROM notes WHERE id = ?`, [input.id])).length > 0) {
    throw new Error("A note with this id already exists.");
  }
  await db.exec(
    `INSERT INTO notes (id, title, body, topic, document_id, document_name, page_number, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.id,
      input.title.trim(),
      input.body.trim(),
      cleanTopic(input.topic),
      input.documentId ?? null,
      input.documentName ?? null,
      input.pageNumber ?? null,
      input.createdAt,
      input.createdAt,
    ],
  );
  return {
    id: input.id,
    title: input.title.trim(),
    body: input.body.trim(),
    topic: cleanTopic(input.topic),
    documentId: input.documentId ?? null,
    documentName: input.documentName ?? null,
    pageNumber: input.pageNumber ?? null,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  };
}

export async function updateNote(
  db: SqlDatabase,
  id: string,
  patch: { title?: string; body?: string; topic?: string; updatedAt: string },
): Promise<boolean> {
  const rows = await db.query(`SELECT title, body, topic FROM notes WHERE id = ?`, [id]);
  const current = rows[0];
  if (!current) {
    return false;
  }
  const title = patch.title !== undefined ? patch.title.trim() : String(current.title);
  const body = patch.body !== undefined ? patch.body.trim() : String(current.body);
  if (title.length === 0 || body.length === 0) {
    return false;
  }
  const topic = patch.topic !== undefined ? cleanTopic(patch.topic) : current.topic === null ? null : String(current.topic);
  await db.exec(`UPDATE notes SET title = ?, body = ?, topic = ?, updated_at = ? WHERE id = ?`, [
    title,
    body,
    topic,
    patch.updatedAt,
    id,
  ]);
  return true;
}

export async function deleteNote(db: SqlDatabase, id: string): Promise<boolean> {
  if ((await db.query(`SELECT id FROM notes WHERE id = ?`, [id])).length === 0) {
    return false;
  }
  await db.exec(`DELETE FROM notes WHERE id = ?`, [id]);
  return true;
}

export async function listNotes(db: SqlDatabase, topic?: string): Promise<SavedItem[]> {
  const rows = topic
    ? await db.query(
        `SELECT id, title, body, topic, document_id, document_name, page_number, created_at, updated_at
         FROM notes WHERE lower(topic) = lower(?) ORDER BY updated_at DESC, id`,
        [topic.trim()],
      )
    : await db.query(
        `SELECT id, title, body, topic, document_id, document_name, page_number, created_at, updated_at
         FROM notes ORDER BY updated_at DESC, id`,
      );
  return rows.map(mapSaved);
}

export async function searchSavedKnowledge(db: SqlDatabase, query: string): Promise<{ bookmarks: BookmarkItem[]; notes: SavedItem[] }> {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) {
    return { bookmarks: [], notes: [] };
  }
  const like = `%${needle.replace(/[\\%_]/g, "")}%`;
  const bookmarks = (await db.query(
      `SELECT id, kind, title, body, topic, document_id, document_name, page_number, chunk_id, created_at, updated_at
       FROM bookmarks
       WHERE lower(title) LIKE ? OR lower(body) LIKE ? OR lower(coalesce(topic, '')) LIKE ?
       ORDER BY updated_at DESC, id`,
      [like, like, like],
    )).map(mapBookmark);
  const notes = (await db.query(
      `SELECT id, title, body, topic, document_id, document_name, page_number, created_at, updated_at
       FROM notes
       WHERE lower(title) LIKE ? OR lower(body) LIKE ? OR lower(coalesce(topic, '')) LIKE ?
       ORDER BY updated_at DESC, id`,
      [like, like, like],
    )).map(mapSaved);
  return { bookmarks, notes };
}

export async function listTopics(db: SqlDatabase): Promise<string[]> {
  const rows = await db.query(
    `SELECT topic FROM bookmarks WHERE topic IS NOT NULL
     UNION
     SELECT topic FROM notes WHERE topic IS NOT NULL
     ORDER BY topic`,
  );
  return rows.map((row) => String(row.topic));
}

export async function clearSavedKnowledge(db: SqlDatabase): Promise<void> {
  await db.transaction(async () => {
    await db.exec(`DELETE FROM bookmarks`);
    await db.exec(`DELETE FROM notes`);
  });
}

function mapSaved(row: { [column: string]: string | number | null }): SavedItem {
  return {
    id: String(row.id),
    title: String(row.title),
    body: String(row.body),
    topic: row.topic === null ? null : String(row.topic),
    documentId: row.document_id === null ? null : String(row.document_id),
    documentName: row.document_name === null ? null : String(row.document_name),
    pageNumber: typeof row.page_number === "number" ? row.page_number : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapBookmark(row: { [column: string]: string | number | null }): BookmarkItem {
  return {
    ...mapSaved(row),
    kind: String(row.kind),
    chunkId: row.chunk_id === null ? null : String(row.chunk_id),
  };
}
