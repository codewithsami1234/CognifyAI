import type { DocumentChunk } from "./aiTypes";
import { retrieveKeywords } from "./keywordRetrieval";

export interface RetrievalEvalCase {
  id: string;
  question: string;
  expectedDocumentId: string;
  expectedChunkId: string;
  expectedPassage: string;
  pageNumber?: number;
  section?: string;
  topic: string;
}

export interface RetrievalEvalMiss {
  id: string;
  question: string;
  topic: string;
}

export interface RetrievalEvalReport {
  total: number;
  hitAt1: number;
  hitAt3: number;
  hitAt5: number;
  /** Sum of 1/rank for hits. Divide by total for the mean. */
  reciprocalRankSum: number;
  missed: RetrievalEvalMiss[];
}

/**
 * Score retrieval against passages that already exist in the supplied chunks.
 * A case whose expected passage is not in that chunk is rejected instead of counted.
 */
export function evaluateRetrieval(cases: readonly RetrievalEvalCase[], chunks: readonly DocumentChunk[]): RetrievalEvalReport {
  const byId = new Map(chunks.map((chunk) => [chunk.chunkId, chunk]));
  for (const item of cases) {
    const chunk = byId.get(item.expectedChunkId);
    if (!chunk || chunk.documentId !== item.expectedDocumentId || !chunk.text.includes(item.expectedPassage)) {
      throw new Error(`Expected passage for ${item.id} is not in chunk ${item.expectedChunkId}.`);
    }
  }

  const report: RetrievalEvalReport = {
    total: cases.length,
    hitAt1: 0,
    hitAt3: 0,
    hitAt5: 0,
    reciprocalRankSum: 0,
    missed: [],
  };
  for (const item of cases) {
    const retrieval = retrieveKeywords(item.question, chunks, { topK: 5 });
    const rank = retrieval.hits.findIndex((hit) => hit.chunk.chunkId === item.expectedChunkId);
    if (rank < 0) {
      report.missed.push({ id: item.id, question: item.question, topic: item.topic });
      continue;
    }
    const position = rank + 1;
    report.reciprocalRankSum += 1 / position;
    if (position <= 1) {
      report.hitAt1 += 1;
    }
    if (position <= 3) {
      report.hitAt3 += 1;
    }
    if (position <= 5) {
      report.hitAt5 += 1;
    }
  }
  return report;
}
