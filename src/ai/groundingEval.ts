import type { DocumentChunk } from "./aiTypes";
import { retrieveKeywords, stemStudyToken, studyContentTerms } from "./keywordRetrieval";

export interface GroundingCase {
  id: string;
  question: string;
  expectedChunkId: string;
  /** Sentence copied from the source chunk. It is the human reference, not a model grade. */
  referenceAnswer: string;
  /** Answer being judged. Tests pass the reference or a planted unsupported sentence. */
  answer: string;
}

export type GroundingVerdict = "supported" | "unsupported_terms" | "wrong_source" | "not_retrieved";

export interface GroundingCaseResult {
  id: string;
  verdict: GroundingVerdict;
  retrievedChunkId?: string;
  sourceMatches: boolean;
  unsupportedTerms: string[];
}

/**
 * Compare an answer with the retrieved chunk.
 * A term counts as unsupported when it is a content word of 5 or more
 * characters and neither the chunk nor the question contains that stem.
 * This is a checklist. It is not proof that every claim is true.
 */
export function evaluateGroundingCase(
  item: GroundingCase,
  chunks: readonly DocumentChunk[],
): GroundingCaseResult {
  const retrieval = retrieveKeywords(item.question, chunks, { topK: 3 });
  const top = retrieval.hits[0];
  if (!top || retrieval.evidenceStrength !== "sufficient") {
    return {
      id: item.id,
      verdict: "not_retrieved",
      sourceMatches: false,
      unsupportedTerms: [],
    };
  }
  const sourceMatches = top.chunk.chunkId === item.expectedChunkId;
  const unsupportedTerms = unsupportedContentTerms(item.answer, `${top.chunk.text}\n${item.question}`);
  let verdict: GroundingVerdict = "supported";
  if (!sourceMatches) {
    verdict = "wrong_source";
  } else if (unsupportedTerms.length > 0) {
    verdict = "unsupported_terms";
  }
  return {
    id: item.id,
    verdict,
    retrievedChunkId: top.chunk.chunkId,
    sourceMatches,
    unsupportedTerms,
  };
}

export function unsupportedContentTerms(answer: string, evidence: string): string[] {
  const allowed = new Set(studyContentTerms(evidence).map((term) => stemStudyToken(term)));
  const unsupported: string[] = [];
  for (const term of studyContentTerms(answer)) {
    if (term.length < 5 || allowed.has(stemStudyToken(term))) {
      continue;
    }
    unsupported.push(term);
  }
  return unsupported;
}
