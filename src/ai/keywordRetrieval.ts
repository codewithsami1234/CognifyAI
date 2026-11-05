import type {
  DocumentChunk,
  KeywordRetrievalResult,
  RetrievalHit,
} from "./aiTypes";

/**
 * Keyword scoring (coverage with capped term frequency).
 *
 * 1. Lowercase the text.
 * 2. Remove apostrophes (`don't` -> `dont`). Replace every other
 *    non-letter/non-digit run with a space.
 * 3. Drop common English words. Drop remaining tokens shorter than 2
 *    characters, except tokens made only of digits.
 * 4. For each remaining query term, count its occurrences in the chunk.
 *    If it occurs at least once, add `10 + min(count, 3)` to the score
 *    and record the term.
 * 5. Keep chunks with a score above 0. Sort by score descending. Equal
 *    scores keep the original chunk order.
 *
 * Matching uses a short suffix stem so ordinary endings can meet:
 * "absorb", "absorbs", "absorbed", and "absorbing" share a stem. The stem
 * is only a lookup key. Query terms shown to the caller stay as typed.
 * A small fixed synonym list can also match. "sugar" can meet "glucose".
 * The list is not an embedding model and it does not learn.
 *
 * A positive score means the question and the chunk share words, endings,
 * or one of those listed synonyms. It is not evidence that the passage
 * answers the question.
 */

/** Closed groups. A query term may match any other word in its group. */
export const STUDY_SYNONYM_GROUPS: readonly (readonly string[])[] = [
  ["glucose", "sugar", "food"],
  ["light", "sunlight"],
  ["chlorophyll", "pigment"],
  ["oxygen", "o2"],
  ["mitochondria", "mitochondrion"],
  ["respiration", "breathing"],
  ["plant", "plants", "leaf", "leaves"],
];

const synonymLookup = new Map<string, readonly string[]>();
for (const group of STUDY_SYNONYM_GROUPS) {
  const stems = group.map((word) => stemStudyToken(word));
  for (const stem of stems) {
    synonymLookup.set(stem, stems);
  }
}

export function synonymStemsFor(token: string): readonly string[] {
  const stem = stemStudyToken(token);
  return synonymLookup.get(stem) ?? [stem];
}

export const STOPWORDS: ReadonlySet<string> = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "but",
  "if",
  "then",
  "than",
  "so",
  "such",
  "of",
  "to",
  "in",
  "on",
  "for",
  "with",
  "from",
  "by",
  "as",
  "at",
  "into",
  "over",
  "after",
  "before",
  "between",
  "about",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "am",
  "do",
  "does",
  "did",
  "doing",
  "have",
  "has",
  "had",
  "having",
  "what",
  "which",
  "who",
  "whom",
  "whose",
  "why",
  "how",
  "when",
  "where",
  "that",
  "this",
  "these",
  "those",
  "it",
  "its",
  "their",
  "there",
  "they",
  "them",
  "he",
  "she",
  "we",
  "you",
  "your",
  "i",
  "me",
  "my",
  "can",
  "could",
  "should",
  "would",
  "will",
  "just",
  "not",
  "no",
  "nor",
  "only",
  "other",
  "also",
  "very",
  "using",
  "use",
  "used",
  "during",
  "within",
  "without",
  "per",
]);

interface ScoredHit {
  hit: RetrievalHit;
  order: number;
}

export function normalizeStudyText(value: string): string {
  return value
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function tokenizeStudyText(value: string): string[] {
  const normalized = normalizeStudyText(value);
  if (normalized.length === 0) {
    return [];
  }
  return normalized.split(" ").filter((token) => token.length > 0);
}

export function isContentToken(token: string): boolean {
  if (STOPWORDS.has(token)) {
    return false;
  }
  if (/^\d+$/.test(token)) {
    return true;
  }
  return token.length >= 2;
}

/**
 * Content words from a question, in first-seen order, with no stemming.
 * Stopwords are omitted.
 */
export function studyContentTerms(value: string): string[] {
  const terms: string[] = [];
  const seen = new Set<string>();
  for (const token of tokenizeStudyText(value)) {
    if (!isContentToken(token) || seen.has(token)) {
      continue;
    }
    seen.add(token);
    terms.push(token);
  }
  return terms;
}

function suffixStem(token: string): string | undefined {
  if (token.length >= 6 && token.endsWith("ies")) {
    const next = `${token.slice(0, -3)}y`;
    if (next.length >= 3) {
      return next;
    }
  }
  if (token.length >= 6 && token.endsWith("ied")) {
    const next = `${token.slice(0, -3)}y`;
    if (next.length >= 3) {
      return next;
    }
  }
  if (token.length >= 5 && /(?:sses|ches|shes|xes|zes|ses)$/.test(token)) {
    const next = token.slice(0, -2);
    if (next.length >= 3) {
      return next;
    }
  }
  if (token.length >= 7 && token.endsWith("ing")) {
    let next = token.slice(0, -3);
    if (next.length >= 2) {
      const last = next[next.length - 1];
      const prev = next[next.length - 2];
      if (last && last === prev && !/[aeiou]/.test(last)) {
        next = next.slice(0, -1);
      }
    }
    if (next.length >= 3) {
      return next;
    }
  }
  if (token.length >= 6 && token.endsWith("ed")) {
    let next = token.slice(0, -2);
    if (next.length >= 2) {
      const last = next[next.length - 1];
      const prev = next[next.length - 2];
      if (last && last === prev && !/[aeiou]/.test(last)) {
        next = next.slice(0, -1);
      }
    }
    if (next.length >= 3) {
      return next;
    }
  }
  if (token.length >= 6 && token.endsWith("er")) {
    const next = token.slice(0, -2);
    if (next.length >= 4) {
      return next;
    }
  }
  if (token.length >= 5 && token.endsWith("s") && !token.endsWith("ss") && !token.endsWith("us")) {
    const next = token.slice(0, -1);
    if (next.length >= 3) {
      return next;
    }
  }
  if (token.length >= 5 && token.endsWith("e")) {
    const next = token.slice(0, -1);
    if (next.length >= 3) {
      return next;
    }
  }
  return undefined;
}

/**
 * Fold one content token to a stem used only for overlap.
 * Digits and tokens shorter than 4 characters are unchanged.
 */
export function stemStudyToken(token: string): string {
  if (/^\d+$/.test(token) || token.length < 4) {
    return token;
  }
  let current = token;
  for (let step = 0; step < 3; step += 1) {
    const next = suffixStem(current);
    if (next === undefined || next === current) {
      break;
    }
    current = next;
  }
  return current;
}

export interface KeywordRetrievalOptions {
  /** Maximum hits to return. Default 3. */
  topK?: number;
}

export function retrieveKeywords(
  question: string,
  chunks: readonly DocumentChunk[],
  options: KeywordRetrievalOptions = {},
): KeywordRetrievalResult {
  const topK = options.topK ?? 3;
  if (!Number.isInteger(topK) || topK < 1) {
    throw new Error("topK must be a positive integer");
  }

  const tokens = tokenizeStudyText(question);
  const ignoredTerms: string[] = [];
  const queryTerms: string[] = [];
  const expandedTerms: string[] = [];
  const seenQuery = new Set<string>();
  const seenExpanded = new Set<string>();
  for (const token of tokens) {
    if (!isContentToken(token)) {
      ignoredTerms.push(token);
      continue;
    }
    if (!seenQuery.has(token)) {
      seenQuery.add(token);
      queryTerms.push(token);
      for (const synonym of synonymStemsFor(token)) {
        if (synonym !== stemStudyToken(token) && !seenExpanded.has(synonym)) {
          seenExpanded.add(synonym);
          expandedTerms.push(synonym);
        }
      }
    }
  }

  if (queryTerms.length === 0) {
    return {
      hits: [],
      queryTerms,
      ignoredTerms,
      expandedTerms,
      evidenceStrength: "none",
      outcome: "empty_query",
    };
  }

  const usable = chunks
    .map((chunk, order) => ({ chunk, order }))
    .filter((entry) => entry.chunk.text.trim().length > 0);

  if (usable.length === 0) {
    return {
      hits: [],
      queryTerms,
      ignoredTerms,
      expandedTerms,
      evidenceStrength: "none",
      outcome: "empty_documents",
    };
  }

  const scored: ScoredHit[] = [];
  for (const entry of usable) {
    const frequencies = new Map<string, number>();
    for (const token of tokenizeStudyText(entry.chunk.text)) {
      if (!isContentToken(token)) {
        continue;
      }
      const key = stemStudyToken(token);
      frequencies.set(key, (frequencies.get(key) ?? 0) + 1);
    }

    let score = 0;
    const matchedTerms: string[] = [];
    for (const term of queryTerms) {
      let count = 0;
      for (const key of synonymStemsFor(term)) {
        count = Math.max(count, frequencies.get(key) ?? 0);
      }
      if (count > 0) {
        score += 10 + Math.min(count, 3);
        matchedTerms.push(term);
      }
    }
    if (score > 0) {
      scored.push({
        order: entry.order,
        hit: {
          chunk: { ...entry.chunk },
          score,
          matchedTerms,
        },
      });
    }
  }

  scored.sort((left, right) => {
    if (right.hit.score !== left.hit.score) {
      return right.hit.score - left.hit.score;
    }
    return left.order - right.order;
  });

  const hits = scored.slice(0, topK).map((entry) => entry.hit);
  return {
    hits,
    queryTerms,
    ignoredTerms,
    expandedTerms,
    evidenceStrength: evidenceStrengthFor(queryTerms, hits),
    outcome: hits.length > 0 ? "ranked" : "no_matches",
  };
}

function evidenceStrengthFor(queryTerms: readonly string[], hits: readonly RetrievalHit[]): "sufficient" | "weak" | "none" {
  const top = hits[0];
  if (!top || top.matchedTerms.length === 0) {
    return "none";
  }
  const specific = top.matchedTerms.some((term) => term.length >= 4);
  const coverage = top.matchedTerms.length / queryTerms.length;
  if (specific || coverage >= 0.5) {
    return "sufficient";
  }
  return "weak";
}
