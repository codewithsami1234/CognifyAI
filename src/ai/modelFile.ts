import type { FileStatter, ModelFileInfo } from "./aiTypes";

const GGUF_MAGIC = [0x47, 0x47, 0x55, 0x46];

export type PrefixReader = (path: string) => Promise<Uint8Array | null>;

/**
 * Report whether a model path exists and, when a prefix reader is supplied,
 * whether the file starts with the GGUF magic bytes. This does not load the model.
 */
export async function inspectModelFile(
  path: string,
  stat: FileStatter,
  readPrefix?: PrefixReader,
): Promise<ModelFileInfo> {
  const fileStat = await stat(path);
  if (!fileStat.exists) {
    return {
      path,
      exists: false,
      readable: false,
      error: fileStat.error ?? "File does not exist.",
    };
  }

  const info: ModelFileInfo = {
    path,
    exists: true,
    readable: true,
  };
  if (fileStat.sizeBytes !== undefined) {
    info.sizeBytes = fileStat.sizeBytes;
  }
  if (fileStat.sizeBytes === 0) {
    info.readable = false;
    info.ggufMagic = false;
    info.error = "File is empty.";
    return info;
  }

  if (!readPrefix) {
    return info;
  }

  try {
    const prefix = await readPrefix(path);
    if (!prefix || prefix.length < 4) {
      info.readable = false;
      info.ggufMagic = false;
      info.error = "Could not read the first four bytes.";
      return info;
    }
    const isGguf = GGUF_MAGIC.every((byte, index) => prefix[index] === byte);
    info.ggufMagic = isGguf;
    if (!isGguf) {
      info.error = "File does not start with the GGUF magic bytes.";
    }
    return info;
  } catch (error) {
    info.readable = false;
    info.error = error instanceof Error ? error.message : "Could not read the file.";
    return info;
  }
}
