import type { RetrievalHit, SourceReference } from "./aiTypes";
import { toSourceReference } from "./sourceReferences";

/** Character budget for evidence text. This is not a token count. */
export const DEFAULT_MAX_CONTEXT_CHARS = 3500;

/** Questions longer than this are rejected instead of being silently cut. */
export const DEFAULT_MAX_QUESTION_CHARS = 1000;

/**
 * The model is told to emit this exact line when the passages are not enough.
 * The pipeline treats that line as a decline. It still does not prove the
 * passages are irrelevant.
 */
export const INSUFFICIENT_EVIDENCE_SENTINEL = "INSUFFICIENT_EVIDENCE";

export const INSUFFICIENT_EVIDENCE_MESSAGE =
  "The supplied study material does not contain enough matching text to answer this question.";

export interface PreparedPrompt {
  prompt: string;
  sources: SourceReference[];
  usedChunkIds: string[];
  /** Characters of passage text included, after any truncation of a single passage. */
  contextCharCount: number;
  truncated: boolean;
  droppedChunkIds: string[];
}

/**
 * Build a prompt whose evidence is only the retrieved chunk text.
 * Passage labels are [1], [2], ... Document names and page numbers are left
 * out of the prompt so a completion cannot become the source of those fields.
 */
export function prepareGroundedPrompt(
  question: string,
  hits: readonly RetrievalHit[],
  maxContextChars: number = DEFAULT_MAX_CONTEXT_CHARS,
  priorQuestion?: string,
): PreparedPrompt {
  if (!Number.isInteger(maxContextChars) || maxContextChars < 1) {
    throw new Error("maxContextChars must be a positive integer");
  }

  const sources: SourceReference[] = [];
  const usedChunkIds: string[] = [];
  const droppedChunkIds: string[] = [];
  const blocks: string[] = [];
  let contextCharCount = 0;
  let truncated = false;
  let passageNumber = 1;

  for (let index = 0; index < hits.length; index += 1) {
    const hit = hits[index];
    if (!hit) {
      continue;
    }
    const remaining = maxContextChars - contextCharCount;
    if (remaining <= 0) {
      droppedChunkIds.push(hit.chunk.chunkId);
      continue;
    }

    let passage = hit.chunk.text.trim();
    if (passage.length === 0) {
      droppedChunkIds.push(hit.chunk.chunkId);
      continue;
    }
    if (passage.length > remaining) {
      passage = passage.slice(0, remaining).trimEnd();
      truncated = true;
    }
    if (passage.length === 0) {
      droppedChunkIds.push(hit.chunk.chunkId);
      continue;
    }

    blocks.push(`[${passageNumber}]\n${passage}`);
    sources.push(toSourceReference(hit.chunk));
    usedChunkIds.push(hit.chunk.chunkId);
    contextCharCount += passage.length;
    passageNumber += 1;

    if (truncated) {
      for (const later of hits.slice(index + 1)) {
        droppedChunkIds.push(later.chunk.chunkId);
      }
      break;
    }
  }

  const lines = [
    "You answer a study question using only the evidence passages.",
    "If the passages do not contain enough information, reply with exactly this line and nothing else:",
    INSUFFICIENT_EVIDENCE_SENTINEL,
    "Do not name documents, pages, or slides. Do not add facts from outside the passages.",
  ];
  const earlier = priorQuestion?.trim();
  if (earlier) {
    lines.push(
      "The student asked this earlier question. Use it only to understand words such as it, that, and they:",
    );
    lines.push(earlier);
  }
  lines.push("", "Evidence:", blocks.join("\n\n"), "", "Question:", question.trim(), "", "Answer:");
  const prompt = lines.join("\n");

  return {
    prompt,
    sources,
    usedChunkIds,
    contextCharCount,
    truncated,
    droppedChunkIds,
  };
}

export function isModelDecline(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return false;
  }
  const firstLine = trimmed.split(/\r?\n/, 1)[0]?.trim() ?? "";
  return firstLine === INSUFFICIENT_EVIDENCE_SENTINEL;
}
