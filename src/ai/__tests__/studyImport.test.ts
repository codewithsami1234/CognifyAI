import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { interpretStudyExtraction, MAX_STUDY_DOCUMENT_BYTES } from "../studyImport";
import { createAiTutor } from "../aiTutor";
import { createScriptedRuntime } from "../scriptedRuntime";

describe("interpretStudyExtraction", () => {
  it("turns a text file into tutor material without inventing a page", () => {
    const result = interpretStudyExtraction({
      kind: "text",
      fileName: "Cell Energy.txt",
      sizeBytes: 120,
      pages: [{ text: "  Chlorophyll in the chloroplast can absorb light.  " }],
    });
    assert.equal(result.status, "ready");
    if (result.status !== "ready") {
      return;
    }
    assert.equal(result.document.fileName, "Cell Energy.txt");
    assert.equal(result.document.pageCount, 1);
    assert.equal(result.document.materials[0]?.pageNumber, undefined);
    assert.match(result.document.materials[0]?.text ?? "", /absorb light/);
  });

  it("keeps PDF page numbers supplied by the extractor and drops blank pages", () => {
    const result = interpretStudyExtraction({
      kind: "pdf",
      fileName: "notes.pdf",
      pages: [
        { pageNumber: 1, text: "   " },
        { pageNumber: 2, text: "Chlorophyll absorbs light." },
        { pageNumber: 4, text: "The Calvin cycle uses carbon dioxide." },
      ],
    });
    assert.equal(result.status, "ready");
    if (result.status !== "ready") {
      return;
    }
    assert.deepEqual(
      result.document.materials.map((material) => material.pageNumber),
      [2, 4],
    );
    assert.equal(result.document.materials[0]?.documentName, "notes.pdf");
  });

  it("does not invent a page when a PDF extractor omits it", () => {
    const result = interpretStudyExtraction({
      kind: "pdf",
      fileName: "notes.pdf",
      pages: [{ text: "Chlorophyll absorbs light." }],
    });
    assert.equal(result.status, "ready");
    if (result.status !== "ready") {
      return;
    }
    assert.equal(result.document.materials[0]?.pageNumber, undefined);
  });

  it("rejects an empty text file", () => {
    const result = interpretStudyExtraction({
      kind: "text",
      fileName: "empty.txt",
      pages: [{ text: " \n\t " }],
    });
    assert.equal(result.status, "error");
    if (result.status !== "error") {
      return;
    }
    assert.equal(result.code, "EMPTY");
    assert.match(result.message, /no text/i);
  });

  it("rejects an unsupported file without importing it", () => {
    const result = interpretStudyExtraction({
      kind: "unsupported",
      fileName: "slides.pptx",
    });
    assert.equal(result.status, "error");
    if (result.status !== "error") {
      return;
    }
    assert.equal(result.code, "UNSUPPORTED");
    assert.match(result.message, /\.txt/);
  });

  it("does not import a scanned PDF when OCR returns no words", () => {
    const result = interpretStudyExtraction({
      kind: "pdf",
      fileName: "scan.pdf",
      pages: [
        { pageNumber: 1, text: "" },
        { pageNumber: 2, text: "  " },
      ],
    });
    assert.equal(result.status, "error");
    if (result.status !== "error") {
      return;
    }
    assert.equal(result.code, "SCANNED");
    assert.match(result.message, /not imported/);
    assert.match(result.message, /OCR/);
    assert.equal("document" in result, false);
  });

  it("rejects an oversized document before treating it as notes", () => {
    const result = interpretStudyExtraction({
      kind: "text",
      fileName: "huge.txt",
      sizeBytes: MAX_STUDY_DOCUMENT_BYTES + 1,
      pages: [{ text: "Chlorophyll absorbs light." }],
    });
    assert.equal(result.status, "error");
    if (result.status !== "error") {
      return;
    }
    assert.equal(result.code, "TOO_LARGE");
  });

  it("reports an extraction failure from the extractor message", () => {
    const result = interpretStudyExtraction({
      kind: "error",
      fileName: "locked.pdf",
      message: "This PDF is password protected.",
    });
    assert.equal(result.status, "error");
    if (result.status !== "error") {
      return;
    }
    assert.equal(result.code, "EXTRACT_FAILED");
    assert.equal(result.message, "This PDF is password protected.");
  });

  it("leaves the current notes in place when the picker is cancelled", () => {
    const result = interpretStudyExtraction({ kind: "cancelled" });
    assert.equal(result.status, "cancelled");
  });

  it("imports docx paragraphs without a page number", () => {
    const result = interpretStudyExtraction({
      kind: "docx",
      fileName: "notes.docx",
      pages: [{ text: "Chlorophyll absorbs light.", pageNumber: 3 }],
    });
    assert.equal(result.status, "ready");
    if (result.status !== "ready") {
      return;
    }
    assert.equal(result.document.materials[0]?.pageNumber, undefined);
    assert.equal(result.document.materials[0]?.section, undefined);
  });

  it("keeps pptx slide numbers and labels them as slides", () => {
    const result = interpretStudyExtraction({
      kind: "pptx",
      fileName: "lecture.pptx",
      pages: [
        { pageNumber: 1, text: "Title only" },
        { pageNumber: 3, text: "Chlorophyll absorbs light." },
      ],
    });
    assert.equal(result.status, "ready");
    if (result.status !== "ready") {
      return;
    }
    assert.equal(result.document.materials[1]?.pageNumber, 3);
    assert.equal(result.document.materials[1]?.section, "Slide 3");
  });

  it("imports image OCR text without inventing a page", () => {
    const result = interpretStudyExtraction({
      kind: "image",
      fileName: "board.jpg",
      pages: [{ text: "Chlorophyll absorbs light.", pageNumber: 1 }],
    });
    assert.equal(result.status, "ready");
    if (result.status !== "ready") {
      return;
    }
    assert.equal(result.document.materials[0]?.pageNumber, undefined);
    assert.equal(result.document.fileName, "board.jpg");
  });

  it("does not import an image when OCR finds no words", () => {
    const result = interpretStudyExtraction({
      kind: "image",
      fileName: "blank.png",
      pages: [{ text: "  " }],
    });
    assert.equal(result.status, "error");
    if (result.status !== "error") {
      return;
    }
    assert.equal(result.code, "SCANNED");
  });

  it("does not import a file when on-device OCR fails", () => {
    const result = interpretStudyExtraction({
      kind: "ocr_failed",
      fileName: "scan.pdf",
      message: "On-device OCR failed. The file was not imported.",
    });
    assert.equal(result.status, "error");
    if (result.status !== "error") {
      return;
    }
    assert.equal(result.code, "EXTRACT_FAILED");
    assert.match(result.message, /not imported/);
  });

  it("reports a corrupt file as an extraction failure", () => {
    const result = interpretStudyExtraction({
      kind: "error",
      fileName: "broken.docx",
      message: "This DOCX could not be opened.",
    });
    assert.equal(result.status, "error");
    if (result.status !== "error") {
      return;
    }
    assert.equal(result.code, "EXTRACT_FAILED");
    assert.equal(result.message, "This DOCX could not be opened.");
  });

  it("passes imported pages to the tutor and keeps the PDF page on the source", async () => {
    const imported = interpretStudyExtraction({
      kind: "pdf",
      fileName: "Cell Energy.pdf",
      pages: [{ pageNumber: 2, text: "Chlorophyll in the chloroplast can absorb light." }],
    });
    assert.equal(imported.status, "ready");
    if (imported.status !== "ready") {
      return;
    }
    const scripted = createScriptedRuntime({
      respond: () => ({
        text: "It absorbs light. See page 9.",
        generationTimeMs: 5,
      }),
    });
    const tutor = createAiTutor({ runtime: scripted.runtime, modelPath: "local.gguf" });
    await tutor.initialize();
    tutor.prepareStudyMaterial(imported.document.materials);
    const answer = await tutor.askQuestion("What does chlorophyll absorb?");
    assert.equal(answer.status, "answered");
    assert.equal(answer.sources[0]?.documentName, "Cell Energy.pdf");
    assert.equal(answer.sources[0]?.pageNumber, 2);
    assert.equal(answer.sources.some((source) => source.pageNumber === 9), false);
  });

  it("passes a slide reference to the tutor without treating the model text as the source", async () => {
    const imported = interpretStudyExtraction({
      kind: "pptx",
      fileName: "lecture.pptx",
      pages: [{ pageNumber: 3, text: "Chlorophyll in the chloroplast can absorb light." }],
    });
    assert.equal(imported.status, "ready");
    if (imported.status !== "ready") {
      return;
    }
    const scripted = createScriptedRuntime({
      respond: () => ({ text: "Light. See slide 9.", generationTimeMs: 4 }),
    });
    const tutor = createAiTutor({ runtime: scripted.runtime, modelPath: "local.gguf" });
    await tutor.initialize();
    tutor.prepareStudyMaterial(imported.document.materials);
    const answer = await tutor.askQuestion("What does chlorophyll absorb?");
    assert.equal(answer.status, "answered");
    assert.equal(answer.sources[0]?.pageNumber, 3);
    assert.equal(answer.sources[0]?.section, "Slide 3");
    assert.equal(answer.sources.some((source) => source.section === "Slide 9"), false);
  });
});
