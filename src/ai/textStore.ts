/**
 * Small text files for progress and the document library.
 * Callers pass a store. Tests use memory. The Android app writes files
 * on the device. This module does not open the network.
 */

export interface TextStore {
  read(name: string): Promise<string | null>;
  write(name: string, contents: string): Promise<void>;
  remove(name: string): Promise<void>;
}

export const PROGRESS_STORE_NAME = "cognify-progress-v1.json";
export const LIBRARY_STORE_NAME = "cognify-library-v1.json";
export const QUIZ_DRAFT_STORE_NAME = "cognify-quiz-draft-v1.json";

const NAME_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;

export function isStoreName(name: string): boolean {
  return NAME_PATTERN.test(name);
}

export function createMemoryTextStore(initial?: Readonly<Record<string, string>>): TextStore & {
  snapshot(): Record<string, string>;
} {
  const files = new Map<string, string>();
  if (initial) {
    for (const [name, contents] of Object.entries(initial)) {
      files.set(name, contents);
    }
  }
  return {
    async read(name) {
      if (!isStoreName(name)) {
        throw new Error("The local store name is not allowed.");
      }
      return files.get(name) ?? null;
    },
    async write(name, contents) {
      if (!isStoreName(name)) {
        throw new Error("The local store name is not allowed.");
      }
      files.set(name, contents);
    },
    async remove(name) {
      if (!isStoreName(name)) {
        throw new Error("The local store name is not allowed.");
      }
      files.delete(name);
    },
    snapshot() {
      return Object.fromEntries(files.entries());
    },
  };
}

export function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x80) {
      bytes += 1;
    } else if (code < 0x800) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4;
      index += 1;
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

/**
 * Prefer a non-empty main file. If that file is missing or empty, use the
 * backup left by an interrupted replace. Callers must not log the text.
 * The Android store applies this same rule before the app sees the file.
 */
export function chooseStoredText(main: string | null, backup: string | null): string | null {
  if (main !== null && main.length > 0) {
    return main;
  }
  if (backup !== null && backup.length > 0) {
    return backup;
  }
  return null;
}
