import type { DocumentChunk } from "./aiTypes";

export interface ChunkTextOptions {
  documentId: string;
  documentName: string;
  pageNumber?: number;
  section?: string;
  /** Maximum characters per chunk. Default 800. */
  maxChars?: number;
  /**
   * Characters repeated from the previous chunk so a sentence cut by the
   * window still appears in the next chunk. Default 100. Must be smaller
   * than maxChars; larger values are clamped.
   */
  overlapChars?: number;
}

/**
 * Split one source string into chunks.
 *
 * Call this once per page or section when that metadata applies to the whole
 * string. This function does not detect page breaks inside the text, and it
 * does not invent page numbers.
 *
 * Offsets refer to the original `text` argument.
 */
export function chunkText(text: string, options: ChunkTextOptions): DocumentChunk[] {
  const maxChars = options.maxChars ?? 800;
  const requestedOverlap = options.overlapChars ?? 100;

  if (!Number.isInteger(maxChars) || maxChars < 1) {
    throw new Error("maxChars must be a positive integer");
  }
  if (!Number.isInteger(requestedOverlap) || requestedOverlap < 0) {
    throw new Error("overlapChars must be a non-negative integer");
  }
  if (text.trim().length === 0) {
    return [];
  }

  const overlap = Math.min(requestedOverlap, maxChars - 1);
  const chunks: DocumentChunk[] = [];
  const seenSpans = new Set<string>();

  for (let start = 0; start < text.length; ) {
    const hardEnd = Math.min(start + maxChars, text.length);
    const end = preferredChunkEnd(text, start, hardEnd);
    const slice = text.slice(start, end);
    const span = `${start}-${end}`;
    if (slice.trim().length > 0 && !seenSpans.has(span)) {
      seenSpans.add(span);
      const chunk: DocumentChunk = {
        documentId: options.documentId,
        documentName: options.documentName,
        chunkId: `${options.documentId}:${start}-${end}`,
        text: slice,
        startOffset: start,
        endOffset: end,
      };
      if (options.pageNumber !== undefined) {
        chunk.pageNumber = options.pageNumber;
      }
      if (options.section !== undefined) {
        chunk.section = options.section;
      }
      chunks.push(chunk);
    }
    if (end >= text.length) {
      break;
    }
    const next = end - overlap;
    start = next > start ? next : end;
  }

  return chunks;
}

/**
 * Prefer the last sentence end in the second half of the window.
 * Text with no sentence punctuation keeps the hard character window.
 */
function preferredChunkEnd(text: string, start: number, hardEnd: number): number {
  if (hardEnd >= text.length) {
    return text.length;
  }
  const window = text.slice(start, hardEnd);
  const minIndex = Math.floor(window.length * 0.5);
  for (let index = window.length - 1; index >= minIndex; index -= 1) {
    const char = window[index];
    const next = window[index + 1];
    const sentence = char === "." || char === "?" || char === "!";
    const boundary = char === "\n" || (sentence && (next === undefined || next === " " || next === "\n"));
    if (boundary) {
      return start + index + 1;
    }
  }
  return hardEnd;
}
