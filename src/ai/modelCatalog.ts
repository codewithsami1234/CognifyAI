/**
 * Manual model choice. Nothing here downloads a file.
 * llama.rn 0.12.4 registers the architecture name "qwen2" in llama-arch.cpp.
 * That is source compatibility, not a successful load of a Qwen GGUF file.
 */

export const PRIMARY_MODEL_ID = "llama-3.2-1b-instruct";
export const FALLBACK_MODEL_ID = "qwen2.5-0.5b-instruct";

export interface ModelChoice {
  id: string;
  label: string;
  fileName: string;
  /** Architecture string llama.rn looks up. Confirmed from the bundled source, not from a load. */
  expectedArchitecture: string;
  runtimeNote: string;
}

export const MODEL_CHOICES: readonly ModelChoice[] = [
  {
    id: PRIMARY_MODEL_ID,
    label: "Llama 3.2 1B Instruct",
    fileName: "Llama-3.2-1B-Instruct-Q4_K_M.gguf",
    expectedArchitecture: "llama",
    runtimeNote: "Primary file. Load it only when the GGUF is already on the phone.",
  },
  {
    id: FALLBACK_MODEL_ID,
    label: "Qwen2.5 0.5B Instruct",
    fileName: "qwen2.5-0.5b-instruct-q4_k_m.gguf",
    expectedArchitecture: "qwen2",
    runtimeNote:
      "Manual fallback path. llama.rn 0.12.4 includes a qwen2 loader. This app does not download the file, and a missing file is not loaded.",
  },
];

export function identifyModelChoice(path: string): ModelChoice | undefined {
  const normalized = path.replace(/\\/g, "/").toLowerCase();
  return MODEL_CHOICES.find((choice) => normalized.endsWith(choice.fileName.toLowerCase()));
}

export function architectureMatchesChoice(architecture: string | undefined, choice: ModelChoice | undefined): boolean {
  if (!architecture || !choice) {
    return false;
  }
  return architecture.toLowerCase() === choice.expectedArchitecture;
}
