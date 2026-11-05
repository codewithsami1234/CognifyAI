import {
  NEURAL_EMBEDDING_BYTES,
  NEURAL_EMBEDDING_DIMENSIONS,
  NEURAL_EMBEDDING_FILE,
  NEURAL_EMBEDDING_ID,
  NEURAL_EMBEDDING_NOTE,
  NEURAL_EMBEDDING_QUANTIZATION,
} from "../embeddings/embeddingCatalog";
import { LEXICON_DIMENSIONS, LEXICON_EMBEDDER_ID } from "../embeddings/lexiconEmbedder";
import { fts5Enabled } from "../sql/migrate";
import type { SqlDatabase } from "../sql/sqlDatabase";

export interface OfflineReadiness {
  chatModel: {
    path?: string;
    available: boolean;
    sizeBytes?: number;
    inUse: boolean;
    label: string;
  };
  lexiconEmbedder: {
    id: string;
    dimensions: number;
    ready: true;
    note: string;
  };
  neuralEmbedder: {
    id: string;
    fileName: string;
    available: boolean;
    sizeBytes?: number;
    inUse: boolean;
    dimensions: number;
    quantization: string;
    approximateBytes: number;
    note: string;
  };
  indexedDocuments: number;
  indexedChunks: number;
  embeddedChunks: number;
  failedJobs: Array<{ id: string; documentId: string; error: string }>;
  interruptedJobs: number;
  databaseBytes?: number;
  availableBytes?: number;
  fts5: boolean;
  offlineReady: boolean;
  blockers: string[];
}

export async function describeOfflineReadiness(
  db: SqlDatabase,
  snapshot: {
    chatPath?: string;
    chatAvailable: boolean;
    chatSizeBytes?: number;
    chatInUse: boolean;
    chatLabel: string;
    neuralAvailable: boolean;
    neuralSizeBytes?: number;
    neuralInUse: boolean;
    databaseBytes?: number;
    availableBytes?: number;
  },
): Promise<OfflineReadiness> {
  const indexedChunks = Number((await db.query(`SELECT COUNT(*) AS n FROM document_chunks`))[0]?.n ?? 0);
  const indexedDocuments = Number((await db.query(`SELECT COUNT(DISTINCT document_id) AS n FROM document_chunks`))[0]?.n ?? 0);
  const embeddedChunks = Number(
    (await db.query(`SELECT COUNT(*) AS n FROM embeddings WHERE model_id = ?`, [LEXICON_EMBEDDER_ID]))[0]?.n ?? 0,
  );
  const failedJobs = (await db.query(`SELECT id, document_id, error FROM indexing_jobs WHERE status = 'failed' ORDER BY updated_at`))
    .map((row) => ({
      id: String(row.id),
      documentId: String(row.document_id),
      error: row.error === null ? "The indexing job failed without an error message." : String(row.error),
    }));
  const interruptedJobs = Number((await db.query(`SELECT COUNT(*) AS n FROM indexing_jobs WHERE status = 'interrupted'`))[0]?.n ?? 0);
  const blockers: string[] = [];
  if (!snapshot.chatAvailable) {
    blockers.push("The chat GGUF file is not available, so the tutor cannot generate text until that file is on the device.");
  }
  if (indexedChunks > embeddedChunks) {
    blockers.push("Some document chunks do not have a lexicon embedding yet. Indexing can be resumed.");
  }
  if (failedJobs.length > 0) {
    blockers.push("At least one indexing job failed. The stored error is listed with that job.");
  }
  const chatModel: OfflineReadiness["chatModel"] = {
    available: snapshot.chatAvailable,
    inUse: snapshot.chatInUse,
    label: snapshot.chatLabel,
  };
  if (snapshot.chatPath) {
    chatModel.path = snapshot.chatPath;
  }
  if (snapshot.chatSizeBytes !== undefined) {
    chatModel.sizeBytes = snapshot.chatSizeBytes;
  }
  const neural: OfflineReadiness["neuralEmbedder"] = {
    id: NEURAL_EMBEDDING_ID,
    fileName: NEURAL_EMBEDDING_FILE,
    available: snapshot.neuralAvailable,
    inUse: snapshot.neuralInUse,
    dimensions: NEURAL_EMBEDDING_DIMENSIONS,
    quantization: NEURAL_EMBEDDING_QUANTIZATION,
    approximateBytes: NEURAL_EMBEDDING_BYTES,
    note: NEURAL_EMBEDDING_NOTE,
  };
  if (snapshot.neuralSizeBytes !== undefined) {
    neural.sizeBytes = snapshot.neuralSizeBytes;
  }
  const report: OfflineReadiness = {
    chatModel,
    lexiconEmbedder: {
      id: LEXICON_EMBEDDER_ID,
      dimensions: LEXICON_DIMENSIONS,
      ready: true,
      note: "Built in. 256 dimensions. Related study terms share a vector so a question can match notes that use different wording. It does not call the network.",
    },
    neuralEmbedder: neural,
    indexedDocuments,
    indexedChunks,
    embeddedChunks,
    failedJobs,
    interruptedJobs,
    fts5: await fts5Enabled(db),
    offlineReady: snapshot.chatAvailable && failedJobs.length === 0,
    blockers,
  };
  if (snapshot.databaseBytes !== undefined) {
    report.databaseBytes = snapshot.databaseBytes;
  }
  if (snapshot.availableBytes !== undefined) {
    report.availableBytes = snapshot.availableBytes;
  }
  return report;
}
