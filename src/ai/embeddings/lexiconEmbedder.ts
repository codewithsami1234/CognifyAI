import { stemStudyToken, studyContentTerms } from "../keywordRetrieval";
import { EMBEDDER_SKIP, SEMANTIC_RELATION_GROUPS } from "./semanticLexicon";
import { l2Normalize } from "./vectorMath";

export const LEXICON_EMBEDDER_ID = "cognify-lexicon-embed-v1";
export const LEXICON_DIMENSIONS = 256;

/**
 * Local embedding model.
 *
 * Each content stem, and the related stems in its fixed group, is added into
 * a 256-dimensional vector with feature hashing. The vector is L2-normalized.
 * Cosine similarity can then match "computers learn" with "machine learning"
 * when those words share a group. There is no download and no network call.
 * This is not Llama 3.2 and it does not generate text.
 */
export interface TextEmbedder {
  readonly id: string;
  readonly dimensions: number;
  readonly kind: "lexicon" | "gguf";
  readonly label: string;
  embed(texts: readonly string[]): Promise<Float32Array[]>;
}

const relatedByStem = new Map<string, readonly string[]>();
for (const group of SEMANTIC_RELATION_GROUPS) {
  const stems = [...new Set(group.map((word) => stemStudyToken(word)))];
  for (const stem of stems) {
    const existing = relatedByStem.get(stem) ?? [];
    relatedByStem.set(stem, [...new Set([...existing, ...stems])]);
  }
}

function mix(vector: Float32Array, token: string, weight: number): void {
  let hash = 0x811c9dc5;
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  const unsigned = hash >>> 0;
  const bucket = unsigned % LEXICON_DIMENSIONS;
  const sign = (unsigned & 0x100) === 0 ? 1 : -1;
  vector[bucket] = (vector[bucket] ?? 0) + sign * weight;
}

export function embedLexiconText(text: string): Float32Array {
  const vector = new Float32Array(LEXICON_DIMENSIONS);
  const seen = new Set<string>();
  for (const term of studyContentTerms(text)) {
    if (EMBEDDER_SKIP.has(term)) {
      continue;
    }
    const stem = stemStudyToken(term);
    if (seen.has(stem)) {
      continue;
    }
    seen.add(stem);
    mix(vector, stem, 1);
    const related = relatedByStem.get(stem) ?? [];
    for (const neighbor of related) {
      const marker = `rel:${neighbor}`;
      if (neighbor === stem || seen.has(marker)) {
        continue;
      }
      seen.add(marker);
      mix(vector, neighbor, 0.72);
    }
  }
  return l2Normalize(vector);
}

export function createLexiconEmbedder(): TextEmbedder {
  return {
    id: LEXICON_EMBEDDER_ID,
    dimensions: LEXICON_DIMENSIONS,
    kind: "lexicon",
    label: "Cognify lexicon embedder v1",
    async embed(texts) {
      return texts.map((text) => embedLexiconText(text));
    },
  };
}
