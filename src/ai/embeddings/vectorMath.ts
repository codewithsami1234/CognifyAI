/** Little-endian float32 vectors as base64. No Node Buffer, so Hermes can run this. */

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function encodeVector(vector: Float32Array): string {
  const bytes = new Uint8Array(vector.length * 4);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < vector.length; index += 1) {
    view.setFloat32(index * 4, vector[index] ?? 0, true);
  }
  return bytesToBase64(bytes);
}

export function decodeVector(encoded: string): Float32Array {
  const bytes = base64ToBytes(encoded);
  if (bytes.length % 4 !== 0) {
    throw new Error("The stored embedding is not a sequence of 32-bit floats.");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const vector = new Float32Array(bytes.length / 4);
  for (let index = 0; index < vector.length; index += 1) {
    vector[index] = view.getFloat32(index * 4, true);
  }
  return vector;
}

export function cosineSimilarity(left: Float32Array, right: Float32Array): number {
  if (left.length === 0 || left.length !== right.length) {
    return 0;
  }
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    dot += a * b;
    leftNorm += a * a;
    rightNorm += b * b;
  }
  if (leftNorm === 0 || rightNorm === 0) {
    return 0;
  }
  return dot / Math.sqrt(leftNorm * rightNorm);
}

export function l2Normalize(vector: Float32Array): Float32Array {
  let norm = 0;
  for (let index = 0; index < vector.length; index += 1) {
    const value = vector[index] ?? 0;
    norm += value * value;
  }
  if (norm === 0) {
    return vector;
  }
  const scale = 1 / Math.sqrt(norm);
  const next = new Float32Array(vector.length);
  for (let index = 0; index < vector.length; index += 1) {
    next[index] = (vector[index] ?? 0) * scale;
  }
  return next;
}

export function contentHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function bytesToBase64(bytes: Uint8Array): string {
  let out = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index] ?? 0;
    const b = index + 1 < bytes.length ? (bytes[index + 1] ?? 0) : 0;
    const c = index + 2 < bytes.length ? (bytes[index + 2] ?? 0) : 0;
    const triple = (a << 16) | (b << 8) | c;
    out += B64[(triple >> 18) & 63];
    out += B64[(triple >> 12) & 63];
    out += index + 1 < bytes.length ? B64[(triple >> 6) & 63] : "=";
    out += index + 2 < bytes.length ? B64[triple & 63] : "=";
  }
  return out;
}

function base64ToBytes(encoded: string): Uint8Array {
  const cleaned = encoded.replace(/\s/g, "");
  if (cleaned.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(cleaned)) {
    throw new Error("The stored embedding is not valid base64.");
  }
  const pad = cleaned.endsWith("==") ? 2 : cleaned.endsWith("=") ? 1 : 0;
  const length = (cleaned.length / 4) * 3 - pad;
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (let index = 0; index < cleaned.length; index += 4) {
    const a = B64.indexOf(cleaned[index] ?? "");
    const b = B64.indexOf(cleaned[index + 1] ?? "");
    const c = cleaned[index + 2] === "=" ? 0 : B64.indexOf(cleaned[index + 2] ?? "");
    const d = cleaned[index + 3] === "=" ? 0 : B64.indexOf(cleaned[index + 3] ?? "");
    if (a < 0 || b < 0 || c < 0 || d < 0) {
      throw new Error("The stored embedding is not valid base64.");
    }
    const triple = (a << 18) | (b << 12) | (c << 6) | d;
    bytes[offset] = (triple >> 16) & 255;
    offset += 1;
    if (cleaned[index + 2] !== "=" && offset <= length) {
      bytes[offset] = (triple >> 8) & 255;
      offset += 1;
    }
    if (cleaned[index + 3] !== "=" && offset <= length) {
      bytes[offset] = triple & 255;
      offset += 1;
    }
  }
  return bytes;
}
