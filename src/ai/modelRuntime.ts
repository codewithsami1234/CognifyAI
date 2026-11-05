import type {
  GenerationRequest,
  GenerationResult,
  ModelInitOptions,
  ModelStatus,
  ResourceSnapshot,
} from "./aiTypes";
import { ModelRuntimeError } from "./errors";

/**
 * Local generation only. Implementations must not call a cloud model API
 * and must not download a GGUF file.
 */
export interface ModelRuntime {
  readonly id: string;
  initialize(options: ModelInitOptions): Promise<ModelStatus>;
  generate(request: GenerationRequest): Promise<GenerationResult>;
  getStatus(): ModelStatus;
  release(): Promise<void>;
}

export function assertReady(status: ModelStatus): void {
  if (status.state !== "ready") {
    throw new ModelRuntimeError(
      status.error?.code ?? "MODEL_NOT_LOADED",
      status.error?.message ?? `Model runtime "${status.runtimeId}" is ${status.state}. Load a local GGUF file before generating.`,
    );
  }
}

/**
 * Run initialize, generate, and release one at a time.
 * The proposal uses one shared model; overlapping native calls are avoided.
 */
export function withGenerationQueue(runtime: ModelRuntime): ModelRuntime {
  let chain: Promise<unknown> = Promise.resolve();

  const enqueue = <T>(operation: () => Promise<T>): Promise<T> => {
    const run = chain.then(operation, operation);
    chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };

  return {
    id: runtime.id,
    initialize: (options) => enqueue(() => runtime.initialize(options)),
    generate: (request) => enqueue(() => runtime.generate(request)),
    getStatus: () => runtime.getStatus(),
    release: () => enqueue(() => runtime.release()),
  };
}

export function readNodeResourceSnapshot(): ResourceSnapshot {
  if (typeof process === "undefined" || typeof process.memoryUsage !== "function") {
    return {
      source: "unavailable",
      note: "This JavaScript environment does not expose process.memoryUsage. On Android, measure the app with adb shell dumpsys meminfo during the manual test.",
    };
  }
  const usage = process.memoryUsage();
  return {
    source: "node-process",
    heapUsedBytes: usage.heapUsed,
    rssBytes: usage.rss,
    note: "Node process memory on the development computer. This is not the Android app's memory use.",
  };
}
