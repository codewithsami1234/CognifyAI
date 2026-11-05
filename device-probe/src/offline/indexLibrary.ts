import type { LibraryDocument } from '../../../src/ai/documentLibrary';
import { chunksFromStudyMaterials } from '../../../src/ai/assessmentGenerator';
import { createLexiconEmbedder } from '../../../src/ai/embeddings/lexiconEmbedder';
import { indexDocumentChunks } from '../../../src/ai/embeddings/indexChunks';
import type { SqlDatabase } from '../../../src/ai/sql/sqlDatabase';

const embedder = createLexiconEmbedder();

/**
 * Indexes one document at a time with the built-in lexicon embedder.
 * The chat model is not loaded here.
 */
export async function indexLibrary(
  db: SqlDatabase,
  documents: readonly LibraryDocument[],
  shouldCancel: () => boolean,
): Promise<void> {
  for (const document of documents) {
    if (shouldCancel()) {
      return;
    }
    let chunks;
    try {
      chunks = chunksFromStudyMaterials(document.materials);
    } catch {
      continue;
    }
    if (chunks.length === 0) {
      continue;
    }
    await indexDocumentChunks(db, embedder, chunks, { shouldCancel });
  }
}
