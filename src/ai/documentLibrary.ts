import type { StudyMaterialInput } from "./aiTutor";
import type { ImportedStudyDocument } from "./studyImport";
import { LIBRARY_STORE_NAME, type TextStore, utf8ByteLength } from "./textStore";

export type LibraryDocumentType = "text" | "pdf" | "docx" | "pptx" | "image" | "pasted";

export interface LibraryDocument {
  id: string;
  title: string;
  type: LibraryDocumentType;
  status: "ready";
  importedAt: string;
  materials: StudyMaterialInput[];
  pageCount: number;
  charCount: number;
}

export interface DocumentLibrary {
  schemaVersion: 1;
  documents: LibraryDocument[];
}

export type LibraryLoad =
  | { status: "empty"; library: DocumentLibrary }
  | { status: "ok"; library: DocumentLibrary }
  | { status: "unreadable"; library: DocumentLibrary };

const TYPES: ReadonlySet<string> = new Set(["text", "pdf", "docx", "pptx", "image", "pasted"]);

export function emptyDocumentLibrary(): DocumentLibrary {
  return { schemaVersion: 1, documents: [] };
}

export function documentTypeFromFileName(fileName: string): LibraryDocumentType {
  const lower = fileName.trim().toLowerCase();
  if (lower.endsWith(".pdf")) {
    return "pdf";
  }
  if (lower.endsWith(".docx")) {
    return "docx";
  }
  if (lower.endsWith(".pptx")) {
    return "pptx";
  }
  if (lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
    return "image";
  }
  return "text";
}

export function provenanceLine(material: StudyMaterialInput): string {
  const slide = material.section?.startsWith("Slide ") === true;
  if (slide) {
    return material.section ?? "Slide";
  }
  const place =
    material.pageNumber !== undefined && Number.isInteger(material.pageNumber) && material.pageNumber >= 1
      ? `page ${material.pageNumber}`
      : "page not recorded";
  const section = material.section?.trim();
  if (section && section.length > 0) {
    return `${place}, section ${section}`;
  }
  return place;
}

/**
 * Add an imported document.
 * The same title and type replaces the earlier copy so a second import does not create a duplicate row.
 */
export function addImportedDocument(
  library: DocumentLibrary,
  imported: ImportedStudyDocument,
  options: { id: string; type: LibraryDocumentType; importedAt: string },
): { library: DocumentLibrary; document: LibraryDocument; replaced: boolean } {
  const document: LibraryDocument = {
    id: options.id,
    title: imported.fileName,
    type: options.type,
    status: "ready",
    importedAt: options.importedAt,
    materials: imported.materials.map((material) => ({ ...material })),
    pageCount: imported.pageCount,
    charCount: imported.charCount,
  };
  const existing = library.documents.findIndex(
    (entry) => entry.title === document.title && entry.type === document.type,
  );
  if (existing >= 0) {
    const kept = library.documents[existing];
    const replacement: LibraryDocument = kept ? { ...document, id: kept.id } : document;
    const documents = library.documents.slice();
    documents[existing] = replacement;
    return { library: { schemaVersion: 1, documents }, document: replacement, replaced: true };
  }
  return {
    library: { schemaVersion: 1, documents: library.documents.concat(document) },
    document,
    replaced: false,
  };
}

export function addPastedDocument(
  library: DocumentLibrary,
  input: { title: string; text: string; pageNumber?: number; importedAt: string },
): { library: DocumentLibrary; document: LibraryDocument } | { error: string } {
  const title = input.title.trim();
  const text = input.text.trim();
  if (title.length === 0) {
    return { error: "Enter a document name." };
  }
  if (text.length === 0) {
    return { error: "Enter study text before saving it to the library." };
  }
  const material: StudyMaterialInput = {
    documentId: "pasted-notes",
    documentName: title,
    text,
    section: "Pasted text",
  };
  if (input.pageNumber !== undefined) {
    if (!Number.isInteger(input.pageNumber) || input.pageNumber < 1) {
      return { error: "Page must be a positive whole number, or left blank." };
    }
    material.pageNumber = input.pageNumber;
  }
  const document: LibraryDocument = {
    id: "pasted-notes",
    title,
    type: "pasted",
    status: "ready",
    importedAt: input.importedAt,
    materials: [material],
    pageCount: 1,
    charCount: text.length,
  };
  const existing = library.documents.findIndex((entry) => entry.id === "pasted-notes");
  const documents = library.documents.slice();
  if (existing >= 0) {
    documents[existing] = document;
  } else {
    documents.push(document);
  }
  return { library: { schemaVersion: 1, documents }, document };
}

export function removeDocument(
  library: DocumentLibrary,
  id: string,
): { library: DocumentLibrary; removed: LibraryDocument | undefined } {
  const removed = library.documents.find((document) => document.id === id);
  if (!removed) {
    return { library, removed: undefined };
  }
  return {
    library: {
      schemaVersion: 1,
      documents: library.documents.filter((document) => document.id !== id),
    },
    removed,
  };
}

export function getDocument(library: DocumentLibrary, id: string): LibraryDocument | undefined {
  return library.documents.find((document) => document.id === id);
}

export async function saveDocumentLibrary(store: TextStore, library: DocumentLibrary): Promise<void> {
  await store.write(LIBRARY_STORE_NAME, JSON.stringify(library));
}

export async function loadDocumentLibrary(store: TextStore): Promise<LibraryLoad> {
  const raw = await store.read(LIBRARY_STORE_NAME);
  if (raw === null || raw.trim().length === 0) {
    return { status: "empty", library: emptyDocumentLibrary() };
  }
  const library = parseLibrary(raw);
  if (!library) {
    return { status: "unreadable", library: emptyDocumentLibrary() };
  }
  return { status: "ok", library };
}

export async function libraryFileBytes(store: TextStore): Promise<number> {
  const raw = await store.read(LIBRARY_STORE_NAME);
  if (raw === null) {
    return 0;
  }
  return utf8ByteLength(raw);
}

function parseLibrary(raw: string): DocumentLibrary | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return undefined;
  }
  const record = parsed as { schemaVersion?: unknown; documents?: unknown };
  if (record.schemaVersion !== 1 || !Array.isArray(record.documents) || !record.documents.every(isDocument)) {
    return undefined;
  }
  return { schemaVersion: 1, documents: record.documents };
}

function isDocument(value: unknown): value is LibraryDocument {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const document = value as LibraryDocument;
  return (
    typeof document.id === "string" &&
    document.id.length > 0 &&
    typeof document.title === "string" &&
    document.title.trim().length > 0 &&
    TYPES.has(document.type) &&
    document.status === "ready" &&
    typeof document.importedAt === "string" &&
    Number.isInteger(document.pageCount) &&
    Number.isInteger(document.charCount) &&
    Array.isArray(document.materials)
  );
}
