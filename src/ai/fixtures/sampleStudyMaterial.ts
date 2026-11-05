import type { DocumentChunk } from "../aiTypes";

/**
 * Synthetic study notes written for tests.
 * These are not imported student documents and not an excerpt from a textbook.
 */
export const PHOTOSYNTHESIS_TEXT =
  "Photosynthesis in green plants converts light energy into chemical energy. Chlorophyll in the chloroplast can absorb light. The light-dependent reactions split water and release oxygen. The Calvin cycle uses carbon dioxide to produce glucose.";

export const RESPIRATION_TEXT =
  "Mitochondria release energy from glucose during cellular respiration. The Krebs cycle and the electron transport chain occur in the mitochondrion.";

export const PROCESS_TEXT =
  "A process is a program in execution. A thread is a unit of CPU scheduling inside a process. Context switching saves the state of one thread and restores another. The scheduler chooses which ready thread runs next.";

export const sampleStudyChunks: DocumentChunk[] = [
  {
    documentId: "notes-cell",
    documentName: "Cell Energy Notes",
    chunkId: "notes-cell:photo",
    text: PHOTOSYNTHESIS_TEXT,
    pageNumber: 2,
    section: "Photosynthesis",
    startOffset: 0,
    endOffset: PHOTOSYNTHESIS_TEXT.length,
  },
  {
    documentId: "notes-cell",
    documentName: "Cell Energy Notes",
    chunkId: "notes-cell:mito",
    text: RESPIRATION_TEXT,
    pageNumber: 3,
    section: "Respiration",
    startOffset: 0,
    endOffset: RESPIRATION_TEXT.length,
  },
  {
    documentId: "notes-os",
    documentName: "Operating Systems Notes",
    chunkId: "notes-os:process",
    text: PROCESS_TEXT,
    pageNumber: 5,
    section: "Processes",
    startOffset: 0,
    endOffset: PROCESS_TEXT.length,
  },
];
