import type { SourceReference } from "../aiTypes";
import type { SqlDatabase } from "../sql/sqlDatabase";

export interface ConversationRecord {
  id: string;
  title: string;
  documentId: string | null;
  documentName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MessageRecord {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  sources: SourceReference[];
  grounded: boolean;
  createdAt: string;
}

function textOrNull(value: string | null | undefined): string | null {
  if (value === undefined || value === null || value.trim().length === 0) {
    return null;
  }
  return value;
}

export async function createConversation(
  db: SqlDatabase,
  input: { id: string; title: string; createdAt: string; documentId?: string; documentName?: string },
): Promise<ConversationRecord> {
  const title = input.title.trim();
  if (input.id.trim().length === 0 || title.length === 0) {
    throw new Error("A conversation needs an id and a title.");
  }
  const existing = await db.query(`SELECT id FROM conversations WHERE id = ?`, [input.id]);
  if (existing.length > 0) {
    throw new Error("A conversation with this id already exists.");
  }
  await db.exec(
    `INSERT INTO conversations (id, title, document_id, document_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [input.id, title, textOrNull(input.documentId), textOrNull(input.documentName), input.createdAt, input.createdAt],
  );
  return {
    id: input.id,
    title,
    documentId: textOrNull(input.documentId),
    documentName: textOrNull(input.documentName),
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  };
}

export async function renameConversation(db: SqlDatabase, id: string, title: string, updatedAt: string): Promise<boolean> {
  const next = title.trim();
  if (next.length === 0) {
    return false;
  }
  const rows = await db.query(`SELECT id FROM conversations WHERE id = ?`, [id]);
  if (rows.length === 0) {
    return false;
  }
  await db.exec(`UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?`, [next, updatedAt, id]);
  return true;
}

export async function deleteConversation(db: SqlDatabase, id: string): Promise<boolean> {
  const rows = await db.query(`SELECT id FROM conversations WHERE id = ?`, [id]);
  if (rows.length === 0) {
    return false;
  }
  await db.exec(`DELETE FROM conversations WHERE id = ?`, [id]);
  return true;
}

export async function listConversations(db: SqlDatabase): Promise<ConversationRecord[]> {
  return (await db.query(
      `SELECT id, title, document_id, document_name, created_at, updated_at FROM conversations ORDER BY updated_at DESC, id`,
    )).map((row) => ({
      id: String(row.id),
      title: String(row.title),
      documentId: row.document_id === null ? null : String(row.document_id),
      documentName: row.document_name === null ? null : String(row.document_name),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    }));
}

export async function searchConversations(db: SqlDatabase, query: string): Promise<ConversationRecord[]> {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) {
    return [];
  }
  const like = `%${needle.replace(/[\\%_]/g, "")}%`;
  const rows = await db.query(
    `SELECT DISTINCT c.id, c.title, c.document_id, c.document_name, c.created_at, c.updated_at
     FROM conversations c
     LEFT JOIN messages m ON m.conversation_id = c.id
     WHERE lower(c.title) LIKE ? OR lower(m.content) LIKE ?
     ORDER BY c.updated_at DESC, c.id`,
    [like, like],
  );
  return rows.map((row) => ({
    id: String(row.id),
    title: String(row.title),
    documentId: row.document_id === null ? null : String(row.document_id),
    documentName: row.document_name === null ? null : String(row.document_name),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }));
}

export async function addMessage(
  db: SqlDatabase,
  input: {
    id: string;
    conversationId: string;
    role: "user" | "assistant";
    content: string;
    createdAt: string;
    sources?: readonly SourceReference[];
    grounded?: boolean;
  },
): Promise<MessageRecord> {
  const content = input.content.trim();
  if (content.length === 0) {
    throw new Error("A message needs text.");
  }
  const conversation = await db.query(`SELECT id FROM conversations WHERE id = ?`, [input.conversationId]);
  if (conversation.length === 0) {
    throw new Error("That conversation does not exist.");
  }
  const duplicate = await db.query(`SELECT id FROM messages WHERE id = ?`, [input.id]);
  if (duplicate.length > 0) {
    throw new Error("A message with this id already exists.");
  }
  const sources = input.sources ?? [];
  await db.transaction(async () => {
    await db.exec(
      `INSERT INTO messages (id, conversation_id, role, content, sources_json, grounded, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        input.id,
        input.conversationId,
        input.role,
        content,
        JSON.stringify(sources),
        input.grounded ? 1 : 0,
        input.createdAt,
      ],
    );
    await db.exec(`UPDATE conversations SET updated_at = ? WHERE id = ?`, [input.createdAt, input.conversationId]);
  });
  return {
    id: input.id,
    conversationId: input.conversationId,
    role: input.role,
    content,
    sources: [...sources],
    grounded: input.grounded === true,
    createdAt: input.createdAt,
  };
}

export async function listMessages(db: SqlDatabase, conversationId: string): Promise<MessageRecord[]> {
  return (await db.query(
      `SELECT id, conversation_id, role, content, sources_json, grounded, created_at
       FROM messages WHERE conversation_id = ? ORDER BY created_at, id`,
      [conversationId],
    )).map((row) => {
      let sources: SourceReference[] = [];
      if (typeof row.sources_json === "string" && row.sources_json.length > 0) {
        try {
          const parsed = JSON.parse(row.sources_json) as SourceReference[];
          if (Array.isArray(parsed)) {
            sources = parsed;
          }
        } catch {
          sources = [];
        }
      }
      return {
        id: String(row.id),
        conversationId: String(row.conversation_id),
        role: row.role === "assistant" ? "assistant" : "user",
        content: String(row.content),
        sources,
        grounded: Number(row.grounded) === 1,
        createdAt: String(row.created_at),
      };
    });
}

export async function recordSearch(
  db: SqlDatabase,
  input: { id: string; query: string; mode: string; resultCount: number; createdAt: string; dayKey: string },
): Promise<void> {
  const query = input.query.trim();
  if (query.length === 0) {
    return;
  }
  await db.exec(
    `INSERT INTO search_history (id, query, mode, result_count, created_at, day_key) VALUES (?, ?, ?, ?, ?, ?)`,
    [input.id, query, input.mode, input.resultCount, input.createdAt, input.dayKey],
  );
}

export async function listSearches(db: SqlDatabase, limit = 50): Promise<Array<{ id: string; query: string; mode: string; resultCount: number; createdAt: string }>> {
  return (await db.query(
      `SELECT id, query, mode, result_count, created_at FROM search_history ORDER BY created_at DESC, id LIMIT ?`,
      [limit],
    )).map((row) => ({
      id: String(row.id),
      query: String(row.query),
      mode: String(row.mode),
      resultCount: Number(row.result_count),
      createdAt: String(row.created_at),
    }));
}

export async function searchPastQueries(db: SqlDatabase, query: string): Promise<Array<{ id: string; query: string; createdAt: string }>> {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) {
    return [];
  }
  const like = `%${needle.replace(/[\\%_]/g, "")}%`;
  return (await db.query(
      `SELECT id, query, created_at FROM search_history WHERE lower(query) LIKE ? ORDER BY created_at DESC, id`,
      [like],
    )).map((row) => ({ id: String(row.id), query: String(row.query), createdAt: String(row.created_at) }));
}

export async function recordDocumentOpen(
  db: SqlDatabase,
  input: {
    documentId: string;
    documentName: string;
    openedAt: string;
    dayKey: string;
    pageNumber?: number;
    section?: string;
    offset?: number;
  },
): Promise<void> {
  const existing = await db.query(`SELECT document_id FROM document_history WHERE document_id = ?`, [input.documentId]);
  const page = input.pageNumber ?? null;
  const section = input.section ?? null;
  const offset = input.offset ?? null;
  if (existing.length === 0) {
    await db.exec(
      `INSERT INTO document_history (document_id, document_name, last_page, last_section, last_offset, opened_at, day_key)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [input.documentId, input.documentName, page, section, offset, input.openedAt, input.dayKey],
    );
    return;
  }
  await db.exec(
    `UPDATE document_history
     SET document_name = ?, last_page = ?, last_section = ?, last_offset = ?, opened_at = ?, day_key = ?
     WHERE document_id = ?`,
    [input.documentName, page, section, offset, input.openedAt, input.dayKey, input.documentId],
  );
}

export async function listRecentDocuments(db: SqlDatabase, limit = 20): Promise<Array<{
  documentId: string;
  documentName: string;
  lastPage: number | null;
  lastSection: string | null;
  openedAt: string;
}>> {
  return (await db.query(
      `SELECT document_id, document_name, last_page, last_section, opened_at FROM document_history ORDER BY opened_at DESC LIMIT ?`,
      [limit],
    )).map((row) => ({
      documentId: String(row.document_id),
      documentName: String(row.document_name),
      lastPage: typeof row.last_page === "number" ? row.last_page : null,
      lastSection: row.last_section === null ? null : String(row.last_section),
      openedAt: String(row.opened_at),
    }));
}

export async function clearConversationHistory(db: SqlDatabase): Promise<void> {
  await db.transaction(async () => {
    await db.exec(`DELETE FROM messages`);
    await db.exec(`DELETE FROM conversations`);
  });
}

export async function clearSearchHistory(db: SqlDatabase): Promise<void> {
  await db.exec(`DELETE FROM search_history`);
}

export async function clearDocumentHistory(db: SqlDatabase): Promise<void> {
  await db.exec(`DELETE FROM document_history`);
}

export function resumeTranscript(messages: readonly MessageRecord[]): string {
  return messages
    .map((message) => `${message.role === "user" ? "Student" : "Tutor"}: ${message.content}`)
    .join("\n");
}
