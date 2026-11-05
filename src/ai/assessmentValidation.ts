import type { AssessmentKind, CorrectAnswerIndex } from "./aiTypes";
import { isModelDecline } from "./contextPreparation";

/** A question, option, or answer longer than this is rejected rather than shown. */
export const MAX_ASSESSMENT_FIELD_CHARS = 600;

/** Safety cap so a huge completion cannot be treated as a long assessment. */
const MAX_ITEMS_READ = 8;

export interface McqDraft {
  question: string;
  options: [string, string, string, string];
  correctAnswerIndex: CorrectAnswerIndex;
  explanation?: string;
}

export interface ShortAnswerDraft {
  question: string;
  referenceAnswer: string;
}

export interface FlashcardDraft {
  front: string;
  back: string;
}

export type DraftParse<T> =
  | { status: "declined" }
  | { status: "malformed" }
  | { status: "items"; drafts: T[]; rejectedCount: number };

const CORRECT_INDEXES: ReadonlySet<number> = new Set([0, 1, 2, 3]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRequiredText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_ASSESSMENT_FIELD_CHARS) {
    return undefined;
  }
  return trimmed;
}

function readOptions(value: unknown): [string, string, string, string] | undefined {
  if (!Array.isArray(value) || value.length !== 4) {
    return undefined;
  }
  const options: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    const text = readRequiredText(entry);
    if (text === undefined) {
      return undefined;
    }
    const key = text.toLowerCase();
    if (seen.has(key)) {
      return undefined;
    }
    seen.add(key);
    options.push(text);
  }
  return [options[0], options[1], options[2], options[3]] as [string, string, string, string];
}

/**
 * Accept `correctAnswerIndex`, or `correctIndex` when the primary field is absent.
 * Differing values, strings, and out-of-range numbers are rejected.
 */
function readCorrectAnswerIndex(record: Record<string, unknown>): CorrectAnswerIndex | undefined {
  const primary = record.correctAnswerIndex;
  const alias = record.correctIndex;
  const hasPrimary = primary !== undefined && primary !== null;
  const hasAlias = alias !== undefined && alias !== null;
  if (!hasPrimary && !hasAlias) {
    return undefined;
  }
  if (hasPrimary && hasAlias && primary !== alias) {
    return undefined;
  }
  const raw = hasPrimary ? primary : alias;
  if (typeof raw !== "number" || !Number.isInteger(raw) || !CORRECT_INDEXES.has(raw)) {
    return undefined;
  }
  return raw as CorrectAnswerIndex;
}

function readExplanation(record: Record<string, unknown>): { ok: true; explanation?: string } | { ok: false } {
  if (!Object.prototype.hasOwnProperty.call(record, "explanation")) {
    return { ok: true };
  }
  const value = record.explanation;
  if (value === undefined || value === null) {
    return { ok: true };
  }
  if (typeof value !== "string") {
    return { ok: false };
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return { ok: true };
  }
  if (trimmed.length > MAX_ASSESSMENT_FIELD_CHARS) {
    return { ok: false };
  }
  return { ok: true, explanation: trimmed };
}

/** Structurally valid MCQ draft. Sources and ids are not taken from this object. */
export function validateMcqDraft(value: unknown): McqDraft | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const question = readRequiredText(value.question);
  const options = readOptions(value.options);
  const correctAnswerIndex = readCorrectAnswerIndex(value);
  const explanation = readExplanation(value);
  if (question === undefined || options === undefined || correctAnswerIndex === undefined || !explanation.ok) {
    return undefined;
  }
  const draft: McqDraft = {
    question,
    options,
    correctAnswerIndex,
  };
  if (explanation.explanation !== undefined) {
    draft.explanation = explanation.explanation;
  }
  return draft;
}

export function validateShortAnswerDraft(value: unknown): ShortAnswerDraft | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const question = readRequiredText(value.question);
  const referenceAnswer = readRequiredText(value.referenceAnswer);
  if (question === undefined || referenceAnswer === undefined) {
    return undefined;
  }
  return { question, referenceAnswer };
}

export function validateFlashcardDraft(value: unknown): FlashcardDraft | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const front = readRequiredText(value.front);
  const back = readRequiredText(value.back);
  if (front === undefined || back === undefined) {
    return undefined;
  }
  return { front, back };
}

function unwrapFence(text: string): string {
  const match = /^```(?:json)?[ \t]*\r?\n?([\s\S]*?)\r?\n?```[ \t]*$/i.exec(text.trim());
  if (match?.[1]) {
    return match[1].trim();
  }
  return text.trim();
}

function tryParse(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

/** First `{` or `[`, through the last matching closer. Deterministic, not evaluated. */
function sliceJson(text: string): string | undefined {
  const objectAt = text.indexOf("{");
  const arrayAt = text.indexOf("[");
  if (objectAt < 0 && arrayAt < 0) {
    return undefined;
  }
  const useArray = arrayAt >= 0 && (objectAt < 0 || arrayAt < objectAt);
  const start = useArray ? arrayAt : objectAt;
  const end = text.lastIndexOf(useArray ? "]" : "}");
  if (end <= start) {
    return undefined;
  }
  return text.slice(start, end + 1);
}

function readJson(text: string): { ok: true; value: unknown } | { ok: false } {
  const direct = tryParse(text);
  if (direct.ok) {
    return direct;
  }
  const sliced = sliceJson(text);
  if (sliced === undefined || sliced === text) {
    return { ok: false };
  }
  return tryParse(sliced);
}

function readItemList(value: unknown): unknown[] | undefined {
  if (Array.isArray(value)) {
    return value;
  }
  if (!isRecord(value) || !Object.prototype.hasOwnProperty.call(value, "items")) {
    return undefined;
  }
  return Array.isArray(value.items) ? value.items : undefined;
}

function validateForKind(kind: AssessmentKind, value: unknown): McqDraft | ShortAnswerDraft | FlashcardDraft | undefined {
  if (kind === "mcq") {
    return validateMcqDraft(value);
  }
  if (kind === "short_answer") {
    return validateShortAnswerDraft(value);
  }
  return validateFlashcardDraft(value);
}

/**
 * Read model text into drafts of one assessment kind.
 * A markdown fence or a single leading comment is accepted.
 * Page numbers, file names, and sources in the JSON are ignored by callers.
 */
export function parseAssessmentDrafts(text: string, kind: "mcq"): DraftParse<McqDraft>;
export function parseAssessmentDrafts(text: string, kind: "short_answer"): DraftParse<ShortAnswerDraft>;
export function parseAssessmentDrafts(text: string, kind: "flashcard"): DraftParse<FlashcardDraft>;
export function parseAssessmentDrafts(
  text: string,
  kind: AssessmentKind,
): DraftParse<McqDraft | ShortAnswerDraft | FlashcardDraft> {
  if (typeof text !== "string") {
    return { status: "malformed" };
  }
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { status: "malformed" };
  }
  const unwrapped = unwrapFence(trimmed);
  if (isModelDecline(trimmed) || isModelDecline(unwrapped)) {
    return { status: "declined" };
  }
  const parsed = readJson(unwrapped);
  if (!parsed.ok) {
    return { status: "malformed" };
  }
  const list = readItemList(parsed.value);
  if (list === undefined) {
    return { status: "malformed" };
  }
  const drafts: Array<McqDraft | ShortAnswerDraft | FlashcardDraft> = [];
  let rejectedCount = 0;
  for (const entry of list.slice(0, MAX_ITEMS_READ)) {
    const draft = validateForKind(kind, entry);
    if (draft === undefined) {
      rejectedCount += 1;
    } else {
      drafts.push(draft);
    }
  }
  return { status: "items", drafts, rejectedCount };
}
