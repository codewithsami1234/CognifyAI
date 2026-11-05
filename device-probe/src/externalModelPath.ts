/**
 * The verified GGUF lives in app-specific external storage.
 * llama.rn opens that absolute path directly. It does not read the APK
 * assets and it does not need a copy in the private files directory.
 * `/sdcard` is the same directory as `/storage/emulated/0` on this phone;
 * the emulated path is what native code should open.
 */
export const EXTERNAL_MODEL_PATH =
  '/storage/emulated/0/Android/data/com.cognify.deviceprobe/files/Llama-3.2-1B-Instruct-Q4_K_M.gguf';

/** Manual fallback file name. The app does not download this file. */
export const FALLBACK_MODEL_FILE_NAME = 'qwen2.5-0.5b-instruct-q4_k_m.gguf';

export function modelPathForFileName(currentPath: string, fileName: string): string {
  const normalized = normalizeExternalModelPath(currentPath);
  const slash = normalized.lastIndexOf('/');
  const directory = slash >= 0 ? normalized.slice(0, slash) : '';
  return `${directory}/${fileName}`;
}

const EXTERNAL_PREFIX = '/storage/emulated/0/Android/data/';
const SDCARD_PREFIX = '/sdcard/Android/data/';
const SELF_PRIMARY_PREFIX = '/storage/self/primary/Android/data/';

export function normalizeExternalModelPath(input: string): string {
  let path = input.trim().replace(/\\/g, '/');
  if (path.startsWith('file://')) {
    path = path.slice('file://'.length);
  }
  if (path.startsWith(SDCARD_PREFIX)) {
    path = EXTERNAL_PREFIX + path.slice(SDCARD_PREFIX.length);
  } else if (path.startsWith(SELF_PRIMARY_PREFIX)) {
    path = EXTERNAL_PREFIX + path.slice(SELF_PRIMARY_PREFIX.length);
  }
  return path;
}

/** True for `/data/data` or `/data/user/N` app files. Those are not the verified model location. */
export function isPrivateAppFilesPath(input: string): boolean {
  const path = normalizeExternalModelPath(input);
  return /^\/data\/(?:data|user\/\d+)\/com\.cognify\.deviceprobe\/files(?:\/|$)/.test(path);
}

export function modelLocationNote(input: string): string | undefined {
  if (isPrivateAppFilesPath(input)) {
    return 'This is the private files directory. The verified model is not copied there. Load the app-specific external file instead.';
  }
  return undefined;
}
