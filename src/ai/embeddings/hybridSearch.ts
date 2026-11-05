import type { DocumentChunk, RetrievalHit } from "../aiTypes";
import { retrieveKeywords, studyContentTerms } from "../keywordRetrieval";
import type { TextEmbedder } from "./lexiconEmbedder";
import { cosineSimilarity } from "./vectorMath";

export const DEFAULT_TOP_K = 5;
export const DEFAULT_MIN_COSINE = 0.34;
export const DEFAULT_RRF_K = 60;

export interface EmbeddedChunk {
  chunk: DocumentChunk;
  /** Absent when this chunk has not been embedded with the active model. */
  vector?: Float32Array;
}

export interface HybridHit {
  chunk: DocumentChunk;
  /** Reciprocal-rank fusion score. Higher is more relevant. */
  score: number;
  cosine?: number;
  keywordRank?: number;
  semanticRank?: number;
  channels: Array<"semantic" | "keyword">;
}

export type HybridOutcome = "ranked" | "empty_query" | "no_matches";

export interface HybridSearchResult {
  hits: HybridHit[];
  outcome: HybridOutcome;
  semanticStatus: "used" | "missing_embeddings" | "below_threshold" | "no_query_terms";
  keywordStatus: "used" | "no_matches" | "empty_query";
  duplicateChunkIdsRemoved: number;
}

export interface HybridSearchOptions {
  topK?: number;
  minCosine?: number;
  rrfK?: number;
  /** When omitted, keyword retrieval uses the existing overlap scorer. */
  keywordHits?: readonly RetrievalHit[];
  /** True when vectors for this model exist, even if none cleared the threshold. */
  embeddingsPresent?: boolean;
}

function rankMap(ids: readonly string[]): Map<string, number> {
  const ranks = new Map<string, number>();
  ids.forEach((id, index) => {
    if (!ranks.has(id)) {
      ranks.set(id, index + 1);
    }
  });
  return ranks;
}

/**
 * Combines a semantic ranking and a keyword ranking with reciprocal rank fusion.
 * The two lists stay separate until this step. FTS5 is not treated as semantic search.
 */
export async function hybridSearch(
  query: string,
  rows: readonly EmbeddedChunk[],
  embedder: TextEmbedder | null,
  options: HybridSearchOptions = {},
): Promise<HybridSearchResult> {
  const topK = options.topK ?? DEFAULT_TOP_K;
  const minCosine = options.minCosine ?? DEFAULT_MIN_COSINE;
  const rrfK = options.rrfK ?? DEFAULT_RRF_K;
  const trimmed = query.trim();
  if (trimmed.length === 0 || studyContentTerms(trimmed).length === 0) {
    return {
      hits: [],
      outcome: "empty_query",
      semanticStatus: "no_query_terms",
      keywordStatus: "empty_query",
      duplicateChunkIdsRemoved: 0,
    };
  }

  const unique: EmbeddedChunk[] = [];
  const seen = new Set<string>();
  let duplicateChunkIdsRemoved = 0;
  for (const row of rows) {
    if (seen.has(row.chunk.chunkId)) {
      duplicateChunkIdsRemoved += 1;
      continue;
    }
    seen.add(row.chunk.chunkId);
    unique.push(row);
  }

  const keyword =
    options.keywordHits ??
    retrieveKeywords(
      trimmed,
      unique.map((row) => row.chunk),
      { topK: Math.max(topK, unique.length) },
    ).hits;
  const keywordIds = keyword.map((hit) => hit.chunk.chunkId);
  const keywordRanks = rankMap(keywordIds);

  const embedded = unique.filter((row) => row.vector && row.vector.length > 0);
  let semanticStatus: HybridSearchResult["semanticStatus"] = embedded.length === 0 ? "missing_embeddings" : "below_threshold";
  const semanticIds: string[] = [];
  const cosines = new Map<string, number>();
  if (embedder && embedded.length > 0) {
    const [queryVector] = await embedder.embed([trimmed]);
    if (queryVector && queryVector.length === embedder.dimensions) {
      const scored = embedded
        .map((row) => ({
          id: row.chunk.chunkId,
          cosine: cosineSimilarity(queryVector, row.vector as Float32Array),
        }))
        .filter((row) => row.cosine >= minCosine)
        .sort((a, b) => b.cosine - a.cosine || a.id.localeCompare(b.id));
      for (const row of scored) {
        semanticIds.push(row.id);
        cosines.set(row.id, row.cosine);
      }
      semanticStatus = semanticIds.length > 0 ? "used" : "below_threshold";
    }
  } else if (!embedder) {
    semanticStatus = "missing_embeddings";
  } else if (options.embeddingsPresent) {
    semanticStatus = "below_threshold";
  }

  const semanticRanks = rankMap(semanticIds);
  const byId = new Map(unique.map((row) => [row.chunk.chunkId, row.chunk]));
  const ids = new Set<string>([...keywordIds, ...semanticIds]);
  const fused: HybridHit[] = [];
  for (const id of ids) {
    const chunk = byId.get(id);
    if (!chunk) {
      continue;
    }
    const keywordRank = keywordRanks.get(id);
    const semanticRank = semanticRanks.get(id);
    let score = 0;
    const channels: Array<"semantic" | "keyword"> = [];
    if (keywordRank !== undefined) {
      score += 1 / (rrfK + keywordRank);
      channels.push("keyword");
    }
    if (semanticRank !== undefined) {
      score += 1 / (rrfK + semanticRank);
      channels.push("semantic");
    }
    if (channels.length === 0) {
      continue;
    }
    const hit: HybridHit = { chunk, score, channels };
    if (keywordRank !== undefined) {
      hit.keywordRank = keywordRank;
    }
    if (semanticRank !== undefined) {
      hit.semanticRank = semanticRank;
    }
    const cosine = cosines.get(id);
    if (cosine !== undefined) {
      hit.cosine = cosine;
    }
    fused.push(hit);
  }
  fused.sort((a, b) => b.score - a.score || a.chunk.chunkId.localeCompare(b.chunk.chunkId));
  return {
    hits: fused.slice(0, topK),
    outcome: fused.length > 0 ? "ranked" : "no_matches",
    semanticStatus,
    keywordStatus: keywordIds.length > 0 ? "used" : "no_matches",
    duplicateChunkIdsRemoved,
  };
}
