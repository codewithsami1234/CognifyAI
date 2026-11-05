import { open, stat } from "node:fs/promises";
import type { FileStat } from "./aiTypes";

export async function nodeFileStat(path: string): Promise<FileStat> {
  try {
    const info = await stat(path);
    if (!info.isFile()) {
      return { exists: false, error: "Path exists but is not a file." };
    }
    return { exists: true, sizeBytes: info.size };
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    if (code === "ENOENT") {
      return { exists: false, error: "File does not exist." };
    }
    return {
      exists: false,
      error: error instanceof Error ? error.message : "Could not stat the path.",
    };
  }
}

export async function readFilePrefix(path: string, byteCount = 4): Promise<Uint8Array | null> {
  const handle = await open(path, "r");
  try {
    const buffer = Buffer.alloc(byteCount);
    const result = await handle.read(buffer, 0, byteCount, 0);
    return buffer.subarray(0, result.bytesRead);
  } finally {
    await handle.close();
  }
}
