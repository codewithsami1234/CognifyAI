/**
 * Read GGUF header metadata from bytes already in memory.
 * This does not load tensors and does not download a model.
 * A short buffer may stop before the vocabulary array. Keys read before that
 * stop are still returned, with truncated set.
 */

export interface GgufMetadata {
  version: number;
  tensorCount: number;
  architecture?: string;
  name?: string;
  fileType?: number;
  fileTypeName?: string;
  contextLength?: number;
  tokenizerModel?: string;
  keysRead: string[];
  truncated: boolean;
}

export type GgufMetadataRead =
  | { ok: true; metadata: GgufMetadata }
  | { ok: false; error: string };

/** Names from llama.rn's llama.h llama_ftype enum. Unknown numbers stay unnamed. */
const FILE_TYPE_NAMES: Readonly<Record<number, string>> = {
  0: "ALL_F32",
  1: "MOSTLY_F16",
  2: "MOSTLY_Q4_0",
  3: "MOSTLY_Q4_1",
  7: "MOSTLY_Q8_0",
  8: "MOSTLY_Q5_0",
  9: "MOSTLY_Q5_1",
  10: "MOSTLY_Q2_K",
  11: "MOSTLY_Q3_K_S",
  12: "MOSTLY_Q3_K_M",
  13: "MOSTLY_Q3_K_L",
  14: "MOSTLY_Q4_K_S",
  15: "MOSTLY_Q4_K_M",
  16: "MOSTLY_Q5_K_S",
  17: "MOSTLY_Q5_K_M",
  18: "MOSTLY_Q6_K",
};

const STRING_TYPE = 8;
const ARRAY_TYPE = 9;

export function fileTypeName(fileType: number): string | undefined {
  return FILE_TYPE_NAMES[fileType];
}

export function parseGgufMetadata(bytes: Uint8Array): GgufMetadataRead {
  if (bytes.length < 24) {
    return { ok: false, error: "The buffer is too small to contain a GGUF header." };
  }
  if (bytes[0] !== 0x47 || bytes[1] !== 0x47 || bytes[2] !== 0x55 || bytes[3] !== 0x46) {
    return { ok: false, error: "The buffer does not start with the GGUF magic bytes." };
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint32(4, true);
  if (version < 2 || version > 3) {
    return { ok: false, error: `GGUF version ${version} is not read by this parser.` };
  }
  const tensorCount = Number(view.getBigUint64(8, true));
  const kvCount = Number(view.getBigUint64(16, true));
  if (!Number.isSafeInteger(kvCount) || kvCount < 0 || kvCount > 100000) {
    return { ok: false, error: "The metadata count is not usable." };
  }

  const metadata: GgufMetadata = {
    version,
    tensorCount,
    keysRead: [],
    truncated: false,
  };
  let offset = 24;
  for (let index = 0; index < kvCount; index += 1) {
    const key = readString(view, offset);
    if (!key) {
      metadata.truncated = true;
      return { ok: true, metadata };
    }
    offset = key.next;
    metadata.keysRead.push(key.value);
    const value = readValue(view, offset);
    if (!value) {
      metadata.truncated = true;
      return { ok: true, metadata };
    }
    offset = value.next;
    assignKnownKey(metadata, key.value, value.stored);
  }
  return { ok: true, metadata };
}

function assignKnownKey(metadata: GgufMetadata, key: string, stored: string | number | undefined): void {
  if (stored === undefined) {
    return;
  }
  if (key === "general.architecture" && typeof stored === "string") {
    metadata.architecture = stored;
  } else if (key === "general.name" && typeof stored === "string") {
    metadata.name = stored;
  } else if (key === "general.file_type" && typeof stored === "number") {
    metadata.fileType = stored;
    const name = fileTypeName(stored);
    if (name) {
      metadata.fileTypeName = name;
    }
  } else if (key.endsWith(".context_length") && typeof stored === "number") {
    metadata.contextLength = stored;
  } else if (key === "tokenizer.ggml.model" && typeof stored === "string") {
    metadata.tokenizerModel = stored;
  }
}

interface StoredRead {
  next: number;
  stored?: string | number;
}

function readValue(view: DataView, offset: number): StoredRead | undefined {
  if (offset + 4 > view.byteLength) {
    return undefined;
  }
  const type = view.getUint32(offset, true);
  return readTyped(view, offset + 4, type, true);
}

function readTyped(view: DataView, offset: number, type: number, keep: boolean): StoredRead | undefined {
  if (type === STRING_TYPE) {
    const text = readString(view, offset);
    if (!text) {
      return undefined;
    }
    const stored: StoredRead = { next: text.next };
    if (keep) {
      stored.stored = text.value;
    }
    return stored;
  }
  if (type === ARRAY_TYPE) {
    if (offset + 12 > view.byteLength) {
      return undefined;
    }
    const elementType = view.getUint32(offset, true);
    const count = Number(view.getBigUint64(offset + 4, true));
    let cursor = offset + 12;
    if (!Number.isSafeInteger(count) || count < 0) {
      return undefined;
    }
    for (let index = 0; index < count; index += 1) {
      const element = readTyped(view, cursor, elementType, false);
      if (!element) {
        return undefined;
      }
      cursor = element.next;
    }
    return { next: cursor };
  }
  const width = scalarWidth(type);
  if (width === undefined || offset + width > view.byteLength) {
    return undefined;
  }
  const stored: StoredRead = { next: offset + width };
  if (keep && (type === 4 || type === 5 || type === 10 || type === 0)) {
    stored.stored = readUint(view, offset, type);
  }
  return stored;
}

function readUint(view: DataView, offset: number, type: number): number {
  if (type === 0) {
    return view.getUint8(offset);
  }
  if (type === 4) {
    return view.getUint32(offset, true);
  }
  if (type === 5) {
    return view.getInt32(offset, true);
  }
  return Number(view.getBigUint64(offset, true));
}

function scalarWidth(type: number): number | undefined {
  if (type === 0 || type === 1 || type === 7) {
    return 1;
  }
  if (type === 2 || type === 3) {
    return 2;
  }
  if (type === 4 || type === 5 || type === 6) {
    return 4;
  }
  if (type === 10 || type === 11 || type === 12) {
    return 8;
  }
  return undefined;
}

function readString(view: DataView, offset: number): { value: string; next: number } | undefined {
  if (offset + 8 > view.byteLength) {
    return undefined;
  }
  const length = Number(view.getBigUint64(offset, true));
  if (!Number.isSafeInteger(length) || length < 0 || length > 1_000_000) {
    return undefined;
  }
  const start = offset + 8;
  const end = start + length;
  if (end > view.byteLength) {
    return undefined;
  }
  let value = "";
  for (let index = start; index < end; index += 1) {
    value += String.fromCharCode(view.getUint8(index));
  }
  return { value, next: end };
}
