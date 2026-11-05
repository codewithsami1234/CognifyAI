import type { DocumentChunk, SourceReference } from "./aiTypes";

/** Copy source fields from a stored chunk. Nothing here is taken from model text. */
export function toSourceReference(chunk: DocumentChunk): SourceReference {
  const reference: SourceReference = {
    documentId: chunk.documentId,
    documentName: chunk.documentName,
    chunkId: chunk.chunkId,
  };
  if (chunk.pageNumber !== undefined) {
    reference.pageNumber = chunk.pageNumber;
  }
  if (chunk.section !== undefined) {
    reference.section = chunk.section;
  }
  if (chunk.startOffset !== undefined) {
    reference.startOffset = chunk.startOffset;
  }
  if (chunk.endOffset !== undefined) {
    reference.endOffset = chunk.endOffset;
  }
  return reference;
}
