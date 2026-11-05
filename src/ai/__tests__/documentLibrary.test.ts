import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addImportedDocument,
  addPastedDocument,
  documentTypeFromFileName,
  emptyDocumentLibrary,
  loadDocumentLibrary,
  provenanceLine,
  removeDocument,
  saveDocumentLibrary,
} from "../documentLibrary";
import { createMemoryTextStore } from "../textStore";
import type { ImportedStudyDocument } from "../studyImport";

function imported(fileName: string): ImportedStudyDocument {
  return {
    fileName,
    pageCount: 1,
    charCount: 42,
    materials: [
      {
        documentId: "notes",
        documentName: fileName,
        text: "Chlorophyll in the chloroplast can absorb light.",
        pageNumber: 2,
        section: "Photosynthesis",
      },
    ],
  };
}

describe("document library", () => {
  it("lists an empty library without inventing documents", async () => {
    const loaded = await loadDocumentLibrary(createMemoryTextStore());
    assert.equal(loaded.status, "empty");
    assert.deepEqual(loaded.library, emptyDocumentLibrary());
  });

  it("stores title, type, and provenance, and replaces a second import of the same file", () => {
    assert.equal(documentTypeFromFileName("notes.pdf"), "pdf");
    assert.equal(documentTypeFromFileName("notes.docx"), "docx");
    assert.equal(documentTypeFromFileName("board.jpg"), "image");
    assert.equal(documentTypeFromFileName("lecture.pptx"), "pptx");
    const first = addImportedDocument(emptyDocumentLibrary(), imported("notes.pdf"), {
      id: "doc-1",
      type: "pdf",
      importedAt: "2026-10-31T04:00:00.000Z",
    });
    const second = addImportedDocument(first.library, imported("notes.pdf"), {
      id: "doc-2",
      type: "pdf",
      importedAt: "2026-10-31T04:05:00.000Z",
    });
    assert.equal(second.replaced, true);
    assert.equal(second.library.documents.length, 1);
    assert.equal(second.document.id, "doc-1");
    assert.equal(second.document.status, "ready");
    assert.equal(provenanceLine(second.document.materials[0] ?? { documentId: "", documentName: "", text: "" }), "page 2, section Photosynthesis");
    const slide = provenanceLine({
      documentId: "slides",
      documentName: "lecture.pptx",
      text: "Chlorophyll absorbs light.",
      pageNumber: 3,
      section: "Slide 3",
    });
    assert.equal(slide, "Slide 3");
    const plain = provenanceLine({
      documentId: "txt",
      documentName: "chlorophyll.txt",
      text: "Chlorophyll absorbs light.",
    });
    assert.equal(plain, "page not recorded");
  });

  it("removes a document only after it is present, and restores the library after a restart", async () => {
    const added = addImportedDocument(emptyDocumentLibrary(), imported("notes.txt"), {
      id: "doc-txt",
      type: "text",
      importedAt: "2026-10-31T04:10:00.000Z",
    });
    const pasted = addPastedDocument(added.library, {
      title: "Cell Energy Notes",
      text: "Chlorophyll absorbs light.",
      importedAt: "2026-10-31T04:11:00.000Z",
    });
    assert.ok(!("error" in pasted));
    if ("error" in pasted) {
      return;
    }
    assert.equal(pasted.library.documents.length, 2);
    const missing = removeDocument(pasted.library, "absent");
    assert.equal(missing.removed, undefined);
    assert.equal(missing.library, pasted.library);
    const removed = removeDocument(pasted.library, "doc-txt");
    assert.equal(removed.removed?.title, "notes.txt");
    assert.equal(removed.library.documents.length, 1);
    const store = createMemoryTextStore();
    await saveDocumentLibrary(store, removed.library);
    const restored = await loadDocumentLibrary(createMemoryTextStore(store.snapshot()));
    assert.equal(restored.status, "ok");
    assert.equal(restored.library.documents[0]?.type, "pasted");
    assert.equal(restored.library.documents[0]?.materials[0]?.section, "Pasted text");
  });

  it("rejects a pasted note with no name or no text", () => {
    const blank = addPastedDocument(emptyDocumentLibrary(), {
      title: "  ",
      text: "Chlorophyll absorbs light.",
      importedAt: "2026-10-31T04:12:00.000Z",
    });
    assert.ok("error" in blank);
    const empty = addPastedDocument(emptyDocumentLibrary(), {
      title: "Notes",
      text: "   ",
      importedAt: "2026-10-31T04:12:00.000Z",
    });
    assert.ok("error" in empty);
  });
});
