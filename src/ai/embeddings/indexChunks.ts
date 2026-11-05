import type { DocumentChunk, RetrievalHit } from "../aiTypes";
import { retrieveKeywords, studyContentTerms } from "../keywordRetrieval";
import { fts5Enabled } from "../sql/migrate";
import type { SqlDatabase, SqlValue } from "../sql/sqlDatabase";
import { DEFAULT_MIN_COSINE, hybridSearch, type HybridSearchOptions, type HybridSearchResult } from "./hybridSearch";
import type { TextEmbedder } from "./lexiconEmbedder";
import { contentHash, cosineSimilarity, decodeVector, encodeVector } from "./vectorMath";

export interface IndexProgress {
  embedded: number;
  skipped: number;
  total: number;
  cancelled: boolean;
  status: "completed" | "interrupted" | "failed";
  error?: string;
}

export interface IndexOptions {
  batchSize?: number;
  nowIso?: string;
  shouldCancel?: () => boolean;
}

function nullableNumber(value: number | undefined): SqlValue {
  return value === undefined ? null : value;
}

function jobId(documentId: string): string {
  return `job:${documentId}`;
}

async function writeIndexJob(db: SqlDatabase, documentId: string, total: number, nowIso: string): Promise<void> {
  const id = jobId(documentId);
  const existing = await db.query(`SELECT id FROM indexing_jobs WHERE id = ?`, [id]);
  if (existing.length === 0) {
    await db.exec(
      `INSERT INTO indexing_jobs (id, document_id, status, total_chunks, embedded_chunks, error, updated_at)
       VALUES (?, ?, 'running', ?, 0, NULL, ?)`,
      [id, documentId, total, nowIso],
    );
    return;
  }
  await db.exec(
    `UPDATE indexing_jobs SET status = 'running', total_chunks = ?, error = NULL, updated_at = ? WHERE id = ?`,
    [total, nowIso, id],
  );
}

async function upsertChunk(db: SqlDatabase, chunk: DocumentChunk, hash: string, nowIso: string): Promise<void> {
  const existing = await db.query(`SELECT content_hash FROM document_chunks WHERE id = ?`, [chunk.chunkId]);
  const previous = existing[0]?.content_hash;
  if (previous === hash) {
    return;
  }
  const params: SqlValue[] = [
    chunk.chunkId,
    chunk.documentId,
    chunk.documentName,
    nullableNumber(chunk.pageNumber),
    chunk.section ?? null,
    chunk.text,
    nullableNumber(chunk.startOffset),
    nullableNumber(chunk.endOffset),
    hash,
    nowIso,
  ];
  if (previous === undefined) {
    await db.exec(
      `INSERT INTO document_chunks
        (id, document_id, document_name, page_number, section, text, start_offset, end_offset, content_hash, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params,
    );
  } else {
    await db.exec(
      `UPDATE document_chunks
       SET document_id = ?, document_name = ?, page_number = ?, section = ?, text = ?, start_offset = ?, end_offset = ?, content_hash = ?, updated_at = ?
       WHERE id = ?`,
      [...params.slice(1), chunk.chunkId],
    );
    await db.exec(`DELETE FROM embeddings WHERE chunk_id = ?`, [chunk.chunkId]);
  }
  if ((await fts5Enabled(db))) {
    await db.exec(`DELETE FROM chunks_fts WHERE chunk_id = ?`, [chunk.chunkId]);
    await db.exec(`INSERT INTO chunks_fts (chunk_id, body) VALUES (?, ?)`, [chunk.chunkId, chunk.text]);
  }
}

/**
 * Stores chunks and embeddings for one document.
 * Unchanged chunk text keeps its vector. Cancellation leaves the job interrupted
 * so a later call embeds only the chunks that are still missing.
 */
export async function indexDocumentChunks(
  db: SqlDatabase,
  embedder: TextEmbedder,
  chunks: readonly DocumentChunk[],
  options: IndexOptions = {},
): Promise<IndexProgress> {
  const nowIso = options.nowIso ?? new Date().toISOString();
  const batchSize = Math.max(1, options.batchSize ?? 8);
  const documentId = chunks[0]?.documentId ?? "";
  if (documentId.length === 0) {
    return { embedded: 0, skipped: 0, total: 0, cancelled: false, status: "completed" };
  }
  const keptIds = new Set(chunks.map((chunk) => chunk.chunkId));
  await db.transaction(async () => {
    const existing = await db.query(`SELECT id FROM document_chunks WHERE document_id = ?`, [documentId]);
    for (const row of existing) {
      const id = String(row.id);
      if (!keptIds.has(id)) {
        if ((await fts5Enabled(db))) {
          await db.exec(`DELETE FROM chunks_fts WHERE chunk_id = ?`, [id]);
        }
        await db.exec(`DELETE FROM document_chunks WHERE id = ?`, [id]);
      }
    }
    for (const chunk of chunks) {
      if (chunk.documentId !== documentId) {
        throw new Error("indexDocumentChunks received chunks from more than one document.");
      }
      await upsertChunk(db, chunk, contentHash(chunk.text), nowIso);
    }
    await writeIndexJob(db, documentId, chunks.length, nowIso);
  });

  let embedded = 0;
  let skipped = 0;
  for (let offset = 0; offset < chunks.length; offset += batchSize) {
    if (options.shouldCancel?.()) {
      await db.exec(`UPDATE indexing_jobs SET status = 'interrupted', embedded_chunks = ?, updated_at = ? WHERE id = ?`, [
        embedded,
        nowIso,
        jobId(documentId),
      ]);
      return { embedded, skipped, total: chunks.length, cancelled: true, status: "interrupted" };
    }
    const batch = chunks.slice(offset, offset + batchSize);
    const pending: DocumentChunk[] = [];
    for (const chunk of batch) {
      const hash = contentHash(chunk.text);
      const row = await db.query(`SELECT content_hash FROM embeddings WHERE chunk_id = ? AND model_id = ?`, [
        chunk.chunkId,
        embedder.id,
      ]);
      if (row[0]?.content_hash === hash) {
        skipped += 1;
      } else {
        pending.push(chunk);
      }
    }
    if (pending.length === 0) {
      continue;
    }
    try {
      const vectors = await embedder.embed(pending.map((chunk) => chunk.text));
      await db.transaction(async () => {
        for (let index = 0; index < pending.length; index += 1) {
          const chunk = pending[index];
          const vector = vectors[index];
          if (!chunk || !vector || vector.length !== embedder.dimensions) {
            throw new Error("The embedder returned a vector with an unexpected width.");
          }
          await db.exec(`DELETE FROM embeddings WHERE chunk_id = ? AND model_id = ?`, [chunk.chunkId, embedder.id]);
          await db.exec(
            `INSERT INTO embeddings (chunk_id, model_id, dimensions, vector, content_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
            [chunk.chunkId, embedder.id, vector.length, encodeVector(vector), contentHash(chunk.text), nowIso],
          );
        }
      });
      embedded += pending.length;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await db.exec(
        `UPDATE indexing_jobs SET status = 'failed', embedded_chunks = ?, error = ?, updated_at = ? WHERE id = ?`,
        [embedded, message, nowIso, jobId(documentId)],
      );
      return { embedded, skipped, total: chunks.length, cancelled: false, status: "failed", error: message };
    }
  }
  await db.exec(
    `UPDATE indexing_jobs SET status = 'completed', embedded_chunks = ?, error = NULL, updated_at = ? WHERE id = ?`,
    [embedded + skipped, nowIso, jobId(documentId)],
  );
  return { embedded, skipped, total: chunks.length, cancelled: false, status: "completed" };
}

export async function deleteDocumentIndex(db: SqlDatabase, documentId: string): Promise<void> {
  const rows = await db.query(`SELECT id FROM document_chunks WHERE document_id = ?`, [documentId]);
  await db.transaction(async () => {
    for (const row of rows) {
      if ((await fts5Enabled(db))) {
        await db.exec(`DELETE FROM chunks_fts WHERE chunk_id = ?`, [String(row.id)]);
      }
    }
    await db.exec(`DELETE FROM document_chunks WHERE document_id = ?`, [documentId]);
    await db.exec(`DELETE FROM indexing_jobs WHERE document_id = ?`, [documentId]);
  });
}

function ftsMatchQuery(query: string): string | null {
  const terms = studyContentTerms(query);
  if (terms.length === 0) {
    return null;
  }
  return terms.map((term) => `"${term.replace(/"/g, "")}"`).join(" OR ");
}

export function rowToChunk(row: { [column: string]: SqlValue }): DocumentChunk {
  const chunk: DocumentChunk = {
    chunkId: String(row.id),
    documentId: String(row.document_id),
    documentName: String(row.document_name),
    text: String(row.text),
  };
  if (typeof row.page_number === "number") {
    chunk.pageNumber = row.page_number;
  }
  if (typeof row.section === "string" && row.section.length > 0) {
    chunk.section = row.section;
  }
  if (typeof row.start_offset === "number") {
    chunk.startOffset = row.start_offset;
  }
  if (typeof row.end_offset === "number") {
    chunk.endOffset = row.end_offset;
  }
  return chunk;
}

const CHUNK_COLUMNS = `id, document_id, document_name, page_number, section, text, start_offset, end_offset`;

async function loadChunk(db: SqlDatabase, id: string): Promise<DocumentChunk | undefined> {
  const rows = await db.query(`SELECT ${CHUNK_COLUMNS} FROM document_chunks WHERE id = ?`, [id]);
  const row = rows[0];
  return row ? rowToChunk(row) : undefined;
}

/**
 * Keyword channel. FTS5 is used when this SQLite build has the FTS table.
 * Otherwise chunk text is read one page at a time and scored with the existing
 * keyword overlap function. This function does not compute embeddings.
 */
export async function keywordSearchStored(db: SqlDatabase, query: string, limit: number): Promise<RetrievalHit[]> {
  const match = ftsMatchQuery(query);
  if (match && (await fts5Enabled(db))) {
    try {
      const rows = await db.query(
        `SELECT chunk_id, bm25(chunks_fts) AS rank FROM chunks_fts WHERE chunks_fts MATCH ? ORDER BY rank LIMIT ?`,
        [match, limit],
      );
      const hits: RetrievalHit[] = [];
      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        if (!row) {
          continue;
        }
        const chunk = await loadChunk(db, String(row.chunk_id));
        if (!chunk) {
          continue;
        }
        hits.push({
          chunk,
          score: typeof row.rank === "number" ? -row.rank : limit - index,
          matchedTerms: studyContentTerms(query),
        });
      }
      if (hits.length > 0 || rows.length > 0) {
        return hits;
      }
    } catch {
      // Fall through when the FTS query cannot be parsed.
    }
  }

  const scored: RetrievalHit[] = [];
  const pageSize = 40;
  let offset = 0;
  for (;;) {
    const rows = await db.query(`SELECT ${CHUNK_COLUMNS} FROM document_chunks ORDER BY id LIMIT ? OFFSET ?`, [pageSize, offset]);
    if (rows.length === 0) {
      break;
    }
    const pageHits = retrieveKeywords(
      query,
      rows.map((row) => rowToChunk(row)),
      { topK: limit },
    );
    scored.push(...pageHits.hits);
    if (rows.length < pageSize) {
      break;
    }
    offset += pageSize;
  }
  const best = new Map<string, RetrievalHit>();
  for (const hit of scored) {
    const previous = best.get(hit.chunk.chunkId);
    if (!previous || hit.score > previous.score) {
      best.set(hit.chunk.chunkId, hit);
    }
  }
  return [...best.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}

/**
 * Hybrid search over stored chunks.
 * Embedding vectors are read in pages so a large library is not decoded all at once.
 */
export async function searchStoredChunks(
  db: SqlDatabase,
  embedder: TextEmbedder | null,
  query: string,
  options: HybridSearchOptions = {},
): Promise<HybridSearchResult> {
  const topK = options.topK ?? 5;
  const minCosine = options.minCosine ?? DEFAULT_MIN_COSINE;
  const embeddingCount = embedder
    ? await db.query(`SELECT COUNT(*) AS n FROM embeddings WHERE model_id = ?`, [embedder.id])
    : [];
  const embeddingsPresent = Number(embeddingCount[0]?.n ?? 0) > 0;
  const keywordHits = await keywordSearchStored(db, query, Math.max(topK * 4, 12));
  const rows = new Map<string, { chunk: DocumentChunk; vector?: Float32Array }>();
  for (const hit of keywordHits) {
    rows.set(hit.chunk.chunkId, { chunk: hit.chunk });
  }

  if (embedder && studyContentTerms(query).length > 0) {
    const [queryVector] = await embedder.embed([query.trim()]);
    if (queryVector && queryVector.length === embedder.dimensions) {
      const pool: Array<{ id: string; cosine: number }> = [];
      const pageSize = 50;
      let offset = 0;
      for (;;) {
        const batch = await db.query(
          `SELECT chunk_id, vector, dimensions FROM embeddings WHERE model_id = ? ORDER BY chunk_id LIMIT ? OFFSET ?`,
          [embedder.id, pageSize, offset],
        );
        if (batch.length === 0) {
          break;
        }
        for (const row of batch) {
          if (typeof row.vector !== "string") {
            continue;
          }
          try {
            const vector = decodeVector(row.vector);
            if (vector.length !== Number(row.dimensions) || vector.length !== queryVector.length) {
              continue;
            }
            const cosine = cosineSimilarity(queryVector, vector);
            if (cosine >= minCosine) {
              pool.push({ id: String(row.chunk_id), cosine });
            }
          } catch {
            // A corrupt vector is skipped. Keyword search can still return the chunk.
          }
        }
        if (batch.length < pageSize) {
          break;
        }
        offset += pageSize;
      }
      pool.sort((a, b) => b.cosine - a.cosine || a.id.localeCompare(b.id));
      for (const candidate of pool.slice(0, Math.max(topK * 4, 12))) {
        const chunk = rows.get(candidate.id)?.chunk ?? (await loadChunk(db, candidate.id));
        if (!chunk) {
          continue;
        }
        const encoded = await db.query(`SELECT vector FROM embeddings WHERE chunk_id = ? AND model_id = ?`, [
          candidate.id,
          embedder.id,
        ]);
        const vectorText = encoded[0]?.vector;
        if (typeof vectorText !== "string") {
          rows.set(candidate.id, { chunk });
          continue;
        }
        try {
          rows.set(candidate.id, { chunk, vector: decodeVector(vectorText) });
        } catch {
          rows.set(candidate.id, { chunk });
        }
      }
    }
  }

  return hybridSearch(query, [...rows.values()], embedder, { ...options, keywordHits, embeddingsPresent });
}
