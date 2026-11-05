import type {
  FileStat,
  FileStatter,
  GenerationRequest,
  GenerationResult,
  ModelInitOptions,
  ModelStatus,
} from "./aiTypes";
import { ModelRuntimeError } from "./errors";
import { assertReady, type ModelRuntime } from "./modelRuntime";

/** Stop strings used by Llama 3.2 and Qwen 2.5 chat templates, plus llama.rn's common list. */
export const DEFAULT_STOP_WORDS = [
  "</s>",
  "<|end|>",
  "<|eot_id|>",
  "<|end_of_text|>",
  "<|im_end|>",
  "<|EOT|>",
  "<|END_OF_TURN_TOKEN|>",
  "<|end_of_turn|>",
  "<|endoftext|>",
];

export const DEFAULT_N_CTX = 2048;
/** CPU inference for the first device test. GPU offload is a later measurement. */
export const DEFAULT_N_GPU_LAYERS = 0;

interface LlamaCompletionParams {
  prompt: string;
  n_predict?: number;
  temperature?: number;
  stop?: string[];
}

interface LlamaCompletionResult {
  text?: string;
  timings?: {
    predicted_ms?: number;
    predicted_n?: number;
  };
}

interface LlamaContext {
  completion(
    params: LlamaCompletionParams,
    onToken?: (data: { token: string }) => void,
  ): Promise<LlamaCompletionResult>;
  release?: () => Promise<void>;
}

interface LlamaInitParams {
  model: string;
  use_mlock: boolean;
  n_ctx: number;
  n_gpu_layers: number;
}

export interface LlamaRnModule {
  initLlama(params: LlamaInitParams): Promise<LlamaContext>;
}

export interface LlamaRnRuntimeOptions {
  /**
   * Injected for tests. The default dynamically imports the optional `llama.rn`
   * package, which only loads inside a React Native app that installed it.
   */
  loadModule?: () => Promise<LlamaRnModule>;
  /** When provided, a missing file fails before the native loader is called. */
  fileStat?: FileStatter;
  nCtx?: number;
  nGpuLayers?: number;
}

/**
 * Convert an absolute path to a file URI. Values that already use file: or
 * content: are returned unchanged.
 */
export function toFileUri(path: string): string {
  if (path.startsWith("file://") || path.startsWith("content://")) {
    return path;
  }
  const normalized = path.replace(/\\/g, "/");
  if (normalized.startsWith("/")) {
    return `file://${normalized}`;
  }
  if (/^[A-Za-z]:\//.test(normalized)) {
    return `file:///${normalized}`;
  }
  return path;
}

async function defaultLoadModule(): Promise<LlamaRnModule> {
  try {
    const loaded = (await import("llama.rn")) as { initLlama?: LlamaRnModule["initLlama"] };
    if (typeof loaded.initLlama !== "function") {
      throw new Error("llama.rn did not export initLlama");
    }
    return { initLlama: loaded.initLlama };
  } catch (error) {
    const cause = error instanceof Error ? error.message : String(error);
    throw new ModelRuntimeError(
      "RUNTIME_UNAVAILABLE",
      "llama.rn is not installed in this JavaScript environment. It runs inside a React Native app (New Architecture, llama.rn 0.10 or newer) and is an optional dependency of this package.",
      cause,
    );
  }
}

/**
 * Adapter over llama.rn. Swapping in Qwen or another GGUF model is a different
 * modelPath, not a different pipeline. This adapter never downloads weights.
 */
export function createLlamaRnRuntime(options: LlamaRnRuntimeOptions = {}): ModelRuntime {
  const loadModule = options.loadModule ?? defaultLoadModule;
  const nCtx = options.nCtx ?? DEFAULT_N_CTX;
  const nGpuLayers = options.nGpuLayers ?? DEFAULT_N_GPU_LAYERS;

  let status: ModelStatus = {
    state: "uninitialized",
    runtimeId: "llama.rn",
  };
  let context: LlamaContext | undefined;

  const setStatus = (next: ModelStatus): ModelStatus => {
    status = next;
    return status;
  };

  return {
    id: "llama.rn",

    getStatus(): ModelStatus {
      return status;
    },

    async initialize(init: ModelInitOptions): Promise<ModelStatus> {
      const started = Date.now();
      setStatus({
        state: "loading",
        runtimeId: "llama.rn",
        modelPath: init.modelPath,
      });

      try {
        if (init.modelPath.trim().length === 0) {
          throw new ModelRuntimeError(
            "MODEL_FILE_MISSING",
            "No model path was provided. Choose a GGUF file that is already on disk.",
          );
        }

        if (options.fileStat) {
          const stat = await options.fileStat(init.modelPath);
          assertModelFilePresent(init.modelPath, stat);
        }

        if (context?.release) {
          await context.release();
          context = undefined;
        }

        const llama = await loadModule();
        const requestedCtx = init.nCtx ?? nCtx;
        try {
          context = await llama.initLlama({
            model: toFileUri(init.modelPath),
            use_mlock: false,
            n_ctx: requestedCtx,
            n_gpu_layers: init.nGpuLayers ?? nGpuLayers,
          });
        } catch (loadError) {
          const smaller = Math.max(256, Math.floor(requestedCtx / 2));
          if (!init.retrySmallerContext || smaller >= requestedCtx || !isMemoryLoadError(loadError)) {
            throw loadError;
          }
          context = await llama.initLlama({
            model: toFileUri(init.modelPath),
            use_mlock: false,
            n_ctx: smaller,
            n_gpu_layers: init.nGpuLayers ?? nGpuLayers,
          });
        }

        return setStatus({
          state: "ready",
          runtimeId: "llama.rn",
          modelPath: init.modelPath,
          initTimeMs: Date.now() - started,
        });
      } catch (error) {
        context = undefined;
        const mapped = error instanceof ModelRuntimeError
          ? error
          : new ModelRuntimeError(
              "MODEL_LOAD_FAILED",
              `Could not load the local model at ${init.modelPath}. The file was not downloaded again. Check that it is a GGUF file, that the phone has enough free memory, and that llama.rn supports this device ABI (arm64-v8a or x86_64).`,
              error,
            );
        return setStatus({
          state: "failed",
          runtimeId: "llama.rn",
          modelPath: init.modelPath,
          initTimeMs: Date.now() - started,
          error: {
            code: mapped.code,
            message: mapped.message,
            ...(mapped.causeMessage ? { cause: mapped.causeMessage } : {}),
          },
        });
      }
    },

    async generate(request: GenerationRequest): Promise<GenerationResult> {
      assertReady(status);
      if (!context) {
        throw new ModelRuntimeError("MODEL_NOT_LOADED", "The llama.rn context is missing.");
      }
      const started = Date.now();
      try {
        let firstTokenMs: number | undefined;
        const result = await context.completion(
          {
            prompt: request.prompt,
            n_predict: request.maxTokens ?? 256,
            temperature: request.temperature ?? 0.2,
            stop: request.stop ?? DEFAULT_STOP_WORDS,
          },
          () => {
            if (firstTokenMs === undefined) {
              firstTokenMs = Date.now() - started;
            }
          },
        );
        const generationTimeMs = Date.now() - started;
        status = {
          ...status,
          lastGenerationTimeMs: generationTimeMs,
        };
        const text = typeof result.text === "string" ? result.text : "";
        const generation: GenerationResult = { text, generationTimeMs };
        if (typeof result.timings?.predicted_n === "number") {
          generation.tokenCount = result.timings.predicted_n;
        }
        if (firstTokenMs !== undefined) {
          generation.firstTokenMs = firstTokenMs;
        }
        return generation;
      } catch (error) {
        throw new ModelRuntimeError(
          "INFERENCE_FAILED",
          "Local generation failed. The model stayed on device and no cloud API was called.",
          error,
        );
      }
    },

    async release(): Promise<void> {
      const current = context;
      context = undefined;
      if (current?.release) {
        try {
          await current.release();
        } catch (error) {
          const cause = error instanceof Error ? error.message : String(error);
          setStatus({
            state: "released",
            runtimeId: "llama.rn",
            modelPath: status.modelPath,
            error: {
              code: "INFERENCE_FAILED",
              message: "The model context was dropped, but llama.rn release reported an error.",
              cause,
            },
          });
          return;
        }
      }
      setStatus({
        state: "released",
        runtimeId: "llama.rn",
        modelPath: status.modelPath,
      });
    },
  };
}

function isMemoryLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /memory|allocat|out of memory/i.test(message);
}

function assertModelFilePresent(path: string, stat: FileStat): void {
  if (!stat.exists) {
    throw new ModelRuntimeError(
      "MODEL_FILE_MISSING",
      `Model file not found at ${path}. Copy the GGUF file onto the device first. The app will not download it.`,
      stat.error,
    );
  }
  if (stat.sizeBytes === 0) {
    throw new ModelRuntimeError(
      "MODEL_FILE_INVALID",
      `Model file at ${path} is empty.`,
    );
  }
}
