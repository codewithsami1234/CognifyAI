import type { StudyMaterialInput } from "./aiTutor";

/** Reject larger files before they are decoded. Eight mebibytes. */
export const MAX_STUDY_DOCUMENT_BYTES = 8 * 1024 * 1024;

export interface ExtractedPage {
  text: string;
  /** Set only when the extractor knows the page. Never invented here. */
  pageNumber?: number;
}

/**
 * Result from a local extractor. Unit tests pass these objects directly.
 * The Android module is not involved.
 */
export interface StudyExtraction {
  kind:
    | "text"
    | "pdf"
    | "docx"
    | "pptx"
    | "image"
    | "unsupported"
    | "empty"
    | "too_large"
    | "scanned"
    | "ocr_failed"
    | "error"
    | "cancelled";
  fileName?: string;
  sizeBytes?: number;
  pages?: ExtractedPage[];
  message?: string;
}

export interface ImportedStudyDocument {
  fileName: string;
  materials: StudyMaterialInput[];
  pageCount: number;
  charCount: number;
}

export type StudyImportResult =
  | { status: "cancelled" }
  | {
      status: "error";
      code: "UNSUPPORTED" | "EMPTY" | "TOO_LARGE" | "SCANNED" | "EXTRACT_FAILED";
      message: string;
      fileName?: string;
    }
  | { status: "ready"; document: ImportedStudyDocument };

const UNSUPPORTED_MESSAGE =
  "Only .txt, .pdf, .docx, .pptx, .png, .jpg, and .jpeg files can be imported. The file was not added.";

const SCANNED_MESSAGE =
  "No text could be read from this file. On-device OCR did not find any words, so it was not imported.";

const OCR_FAILED_MESSAGE =
  "On-device OCR failed. The file was not imported, and the previous study text was kept.";

const EMPTY_MESSAGE = "The document has no text to study. It was not imported.";

const TOO_LARGE_MESSAGE = `The document is larger than ${MAX_STUDY_DOCUMENT_BYTES} bytes. It was not imported.`;

function documentSlug(fileName: string): string {
  const slug = fileName
    .trim()
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return slug.length > 0 ? slug : "document";
}

function errorResult(
  code: "UNSUPPORTED" | "EMPTY" | "TOO_LARGE" | "SCANNED" | "EXTRACT_FAILED",
  message: string,
  fileName?: string,
): StudyImportResult {
  const result: {
    status: "error";
    code: "UNSUPPORTED" | "EMPTY" | "TOO_LARGE" | "SCANNED" | "EXTRACT_FAILED";
    message: string;
    fileName?: string;
  } = { status: "error", code, message };
  if (fileName !== undefined && fileName.trim().length > 0) {
    result.fileName = fileName.trim();
  }
  return result;
}

/**
 * Turn a local extraction payload into tutor materials.
 * Page numbers are copied only when the extractor supplied a positive integer.
 * A scanned or empty PDF is an error, not an imported document.
 */
export function interpretStudyExtraction(extraction: StudyExtraction): StudyImportResult {
  const fileName = extraction.fileName?.trim();

  if (extraction.kind === "cancelled") {
    return { status: "cancelled" };
  }
  if (extraction.kind === "unsupported") {
    return errorResult("UNSUPPORTED", extraction.message?.trim() || UNSUPPORTED_MESSAGE, fileName);
  }
  if (extraction.kind === "too_large") {
    return errorResult("TOO_LARGE", extraction.message?.trim() || TOO_LARGE_MESSAGE, fileName);
  }
  if (extraction.kind === "scanned") {
    return errorResult("SCANNED", extraction.message?.trim() || SCANNED_MESSAGE, fileName);
  }
  if (extraction.kind === "empty") {
    return errorResult("EMPTY", extraction.message?.trim() || EMPTY_MESSAGE, fileName);
  }
  if (extraction.kind === "ocr_failed") {
    return errorResult("EXTRACT_FAILED", extraction.message?.trim() || OCR_FAILED_MESSAGE, fileName);
  }
  if (extraction.kind === "error") {
    return errorResult(
      "EXTRACT_FAILED",
      extraction.message?.trim() || "The document could not be read on this device. It was not imported.",
      fileName,
    );
  }
  if (
    typeof extraction.sizeBytes === "number" &&
    extraction.sizeBytes > MAX_STUDY_DOCUMENT_BYTES
  ) {
    return errorResult("TOO_LARGE", TOO_LARGE_MESSAGE, fileName);
  }

  const pages = extraction.pages ?? [];
  const materials: StudyMaterialInput[] = [];
  let charCount = 0;
  const name = fileName && fileName.length > 0 ? fileName : "Imported document";
  const slug = documentSlug(name);

  for (const page of pages) {
    const text = page.text.trim();
    if (text.length === 0) {
      continue;
    }
    const material: StudyMaterialInput = {
      documentId: slug,
      documentName: name,
      text,
    };
    const pageNumber = page.pageNumber;
    if (
      (extraction.kind === "pdf" || extraction.kind === "pptx") &&
      Number.isInteger(pageNumber) &&
      (pageNumber ?? 0) > 0
    ) {
      material.pageNumber = pageNumber;
      if (extraction.kind === "pptx") {
        material.section = `Slide ${pageNumber}`;
      }
    }
    materials.push(material);
    charCount += text.length;
  }

  if (materials.length === 0) {
    if (extraction.kind === "pdf" || extraction.kind === "image") {
      return errorResult("SCANNED", SCANNED_MESSAGE, fileName);
    }
    return errorResult("EMPTY", EMPTY_MESSAGE, fileName);
  }

  return {
    status: "ready",
    document: {
      fileName: name,
      materials,
      pageCount: materials.length,
      charCount,
    },
  };
}
