import type { DocumentChunk, RagAnswer, SourceReference } from "./aiTypes";
import { answerQuestion } from "./ragPipeline";
import type { ModelRuntime } from "./modelRuntime";
import { hybridSearch, type HybridSearchResult } from "./embeddings/hybridSearch";
import type { TextEmbedder } from "./embeddings/lexiconEmbedder";
import { toSourceReference } from "./sourceReferences";

export interface ChatScope {
  documentId?: string;
  pageNumber?: number;
  section?: string;
  /** Text the student selected. Used only as written. */
  passage?: string;
  /**
   * Page of the selected passage. Omit it when the page is unknown.
   * This function does not invent one.
   */
  passagePageNumber?: number;
  passageDocumentName?: string;
  passageSection?: string;
}

export interface DocumentChatResult {
  answer: RagAnswer;
  retrieval: HybridSearchResult;
  /** True only when hybrid retrieval returned at least one stored chunk. */
  grounded: boolean;
}

function filterScope(chunks: readonly DocumentChunk[], scope: ChatScope): DocumentChunk[] {
  return chunks.filter((chunk) => {
    if (scope.documentId && chunk.documentId !== scope.documentId) {
      return false;
    }
    if (scope.pageNumber !== undefined && chunk.pageNumber !== scope.pageNumber) {
      return false;
    }
    if (scope.section && chunk.section !== scope.section) {
      return false;
    }
    return true;
  });
}

function withPassage(chunks: readonly DocumentChunk[], scope: ChatScope): DocumentChunk[] {
  const passage = scope.passage?.trim();
  if (!passage) {
    return [...chunks];
  }
  const host = chunks[0];
  const selected: DocumentChunk = {
    documentId: scope.documentId ?? host?.documentId ?? "selection",
    documentName: scope.passageDocumentName ?? host?.documentName ?? "Selected passage",
    chunkId: "selection:passage",
    text: passage,
  };
  if (scope.passagePageNumber !== undefined) {
    selected.pageNumber = scope.passagePageNumber;
  }
  if (scope.passageSection) {
    selected.section = scope.passageSection;
  }
  return [selected, ...chunks];
}

/**
 * Answers from the existing RAG pipeline using chunks chosen by hybrid search.
 * When retrieval finds nothing, the model is not called and the answer says so.
 */
export async function answerFromDocuments(
  runtime: ModelRuntime,
  embedder: TextEmbedder | null,
  question: string,
  chunks: readonly DocumentChunk[],
  scope: ChatScope = {},
  topK = 4,
): Promise<DocumentChatResult> {
  const scoped = withPassage(filterScope(chunks, scope), scope);
  const rows = embedder ? await attachVectors(embedder, scoped) : scoped.map((chunk) => ({ chunk }));
  const chosen = await hybridSearch(question, rows, embedder, { topK });
  if (chosen.hits.length === 0 || question.trim().length === 0) {
    const answer = await answerQuestion(runtime, {
      question,
      chunks: [],
      topK,
    });
    return { answer, retrieval: chosen, grounded: false };
  }
  const evidenceChunks = chosen.hits.map((hit) => hit.chunk);
  const scores: Record<string, number> = {};
  for (const hit of chosen.hits) {
    scores[hit.chunk.chunkId] = hit.score;
  }
  const method = chosen.hits.some((hit) => hit.channels.includes("semantic") && hit.channels.includes("keyword"))
    ? "hybrid"
    : chosen.hits.some((hit) => hit.channels.includes("semantic"))
      ? "semantic"
      : "keyword";
  const answer = await answerQuestion(runtime, {
    question,
    chunks: evidenceChunks,
    topK,
    evidence: { chunks: evidenceChunks, scores, method },
  });
  return {
    answer,
    retrieval: chosen,
    grounded: answer.status === "answered" && answer.sources.length > 0,
  };
}

async function attachVectors(embedder: TextEmbedder, chunks: readonly DocumentChunk[]) {
  const vectors = await embedder.embed(chunks.map((chunk) => chunk.text));
  return chunks.map((chunk, index) => {
    const vector = vectors[index];
    return vector ? { chunk, vector } : { chunk };
  });
}

export async function summarizeDocuments(
  runtime: ModelRuntime,
  chunks: readonly DocumentChunk[],
): Promise<RagAnswer> {
  if (chunks.length === 0) {
    return answerQuestion(runtime, { question: "Summarize the selected notes.", chunks: [] });
  }
  const scores: Record<string, number> = {};
  chunks.forEach((chunk, index) => {
    scores[chunk.chunkId] = chunks.length - index;
  });
  return answerQuestion(runtime, {
    question: "Summarize the selected notes in a few sentences.",
    chunks: [...chunks],
    evidence: { chunks: [...chunks], scores, method: "selection" },
  });
}

export function sourceLines(sources: readonly SourceReference[]): string[] {
  return sources.map((source) => {
    const page = source.pageNumber !== undefined ? `, page ${source.pageNumber}` : "";
    const section = source.section ? `, section ${source.section}` : "";
    return `${source.documentName}${page}${section}`;
  });
}

export function passageExcerpt(chunk: DocumentChunk, max = 280): string {
  const text = chunk.text.trim();
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max - 1)}…`;
}

export { toSourceReference };
