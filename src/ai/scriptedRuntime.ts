import type {
  GenerationRequest,
  GenerationResult,
  ModelInitOptions,
  ModelStatus,
} from "./aiTypes";
import { ModelRuntimeError } from "./errors";
import { assertReady, type ModelRuntime } from "./modelRuntime";

export interface ScriptedRuntimeOptions {
  /** Return the completion for a prompt. Used by unit tests in place of a GGUF model. */
  respond: (request: GenerationRequest) => GenerationResult | Promise<GenerationResult>;
  /** When set, initialize records this failure and does not become ready. */
  failInitializeWith?: ModelRuntimeError;
}

export interface ScriptedRuntimeHandle {
  runtime: ModelRuntime;
  generateCalls: GenerationRequest[];
  initializeCalls: ModelInitOptions[];
}

/** In-memory runtime for tests. It does not load a model file and does not use the network. */
export function createScriptedRuntime(options: ScriptedRuntimeOptions): ScriptedRuntimeHandle {
  const generateCalls: GenerationRequest[] = [];
  const initializeCalls: ModelInitOptions[] = [];
  let status: ModelStatus = {
    state: "uninitialized",
    runtimeId: "scripted",
  };

  const runtime: ModelRuntime = {
    id: "scripted",
    getStatus: () => status,
    async initialize(init) {
      initializeCalls.push(init);
      const started = Date.now();
      if (options.failInitializeWith) {
        status = {
          state: "failed",
          runtimeId: "scripted",
          modelPath: init.modelPath,
          initTimeMs: Date.now() - started,
          error: {
            code: options.failInitializeWith.code,
            message: options.failInitializeWith.message,
          },
        };
        return status;
      }
      status = {
        state: "ready",
        runtimeId: "scripted",
        modelPath: init.modelPath,
        initTimeMs: Date.now() - started,
      };
      return status;
    },
    async generate(request) {
      assertReady(status);
      generateCalls.push(request);
      const started = Date.now();
      const result = await options.respond(request);
      const generationTimeMs =
        typeof result.generationTimeMs === "number"
          ? result.generationTimeMs
          : Date.now() - started;
      status = { ...status, lastGenerationTimeMs: generationTimeMs };
      return { ...result, generationTimeMs };
    },
    async release() {
      status = {
        state: "released",
        runtimeId: "scripted",
        modelPath: status.modelPath,
      };
    },
  };

  return { runtime, generateCalls, initializeCalls };
}
