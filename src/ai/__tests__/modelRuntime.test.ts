import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import type { FileStatter } from "../aiTypes";
import { runInferenceProbe } from "../inferenceProbe";
import { createLlamaRnRuntime, toFileUri, type LlamaRnModule } from "../llamaRnRuntime";
import { withGenerationQueue } from "../modelRuntime";
import { inspectModelFile } from "../modelFile";
import { nodeFileStat, readFilePrefix } from "../nodeFileStatter";
import { ModelRuntimeError } from "../errors";
import { createScriptedRuntime } from "../scriptedRuntime";

describe("toFileUri", () => {
  it("builds file URIs and leaves existing URIs unchanged", () => {
    assert.equal(toFileUri("C:\\Models\\llama.gguf"), "file:///C:/Models/llama.gguf");
    assert.equal(toFileUri("/data/user/0/app/llama.gguf"), "file:///data/user/0/app/llama.gguf");
    assert.equal(toFileUri("file:///already.gguf"), "file:///already.gguf");
    assert.equal(toFileUri("content://media/1"), "content://media/1");
  });
});

describe("createLlamaRnRuntime", () => {
  function fakeModule(behavior: {
    text?: string;
    initError?: Error;
    onInit?: (params: { model: string; n_ctx: number; n_gpu_layers: number; use_mlock: boolean }) => void;
  }): { module: LlamaRnModule; released: { count: number } } {
    const released = { count: 0 };
    const module: LlamaRnModule = {
      async initLlama(params) {
        behavior.onInit?.(params);
        if (behavior.initError) {
          throw behavior.initError;
        }
        return {
          async completion() {
            return { text: behavior.text ?? "ok", timings: { predicted_n: 2, predicted_ms: 5 } };
          },
          async release() {
            released.count += 1;
          },
        };
      },
    };
    return { module, released };
  }

  it("does not call the native loader when the model file is missing", async () => {
    let inits = 0;
    const stat: FileStatter = async () => ({ exists: false, error: "File does not exist." });
    const runtime = createLlamaRnRuntime({
      fileStat: stat,
      loadModule: async () => {
        inits += 1;
        return fakeModule({}).module;
      },
    });
    const status = await runtime.initialize({ modelPath: "/sdcard/missing.gguf" });
    assert.equal(status.state, "failed");
    assert.equal(status.error?.code, "MODEL_FILE_MISSING");
    assert.equal(inits, 0);
  });

  it("initializes on CPU with a file URI and returns the completion", async () => {
    let seen: { model: string; n_gpu_layers: number; use_mlock: boolean } | undefined;
    const runtime = createLlamaRnRuntime({
      fileStat: async () => ({ exists: true, sizeBytes: 12 }),
      loadModule: async () =>
        fakeModule({
          text: "local answer",
          onInit: (params) => {
            seen = params;
          },
        }).module,
    });
    const status = await runtime.initialize({ modelPath: "/sdcard/Llama.gguf" });
    assert.equal(status.state, "ready");
    assert.ok((status.initTimeMs ?? -1) >= 0);
    assert.equal(seen?.model, "file:///sdcard/Llama.gguf");
    assert.equal(seen?.n_gpu_layers, 0);
    assert.equal(seen?.use_mlock, false);
    const generated = await runtime.generate({ prompt: "Hello" });
    assert.equal(generated.text, "local answer");
    assert.equal(generated.tokenCount, 2);
    await runtime.release();
    assert.equal(runtime.getStatus().state, "released");
  });

  it("reports a native load failure without hiding the cause", async () => {
    const runtime = createLlamaRnRuntime({
      loadModule: async () => fakeModule({ initError: new Error("unknown architecture") }).module,
    });
    const status = await runtime.initialize({ modelPath: "/sdcard/model.gguf" });
    assert.equal(status.state, "failed");
    assert.equal(status.error?.code, "MODEL_LOAD_FAILED");
    assert.match(status.error?.cause ?? "", /unknown architecture/);
    await assert.rejects(() => runtime.generate({ prompt: "Hi" }), (error: unknown) => {
      assert.ok(error instanceof ModelRuntimeError);
      assert.equal(error.code, "MODEL_LOAD_FAILED");
      return true;
    });
  });
});

describe("withGenerationQueue", () => {
  it("runs generations one at a time", async () => {
    let active = 0;
    let maxActive = 0;
    const scripted = createScriptedRuntime({
      respond: async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 30));
        active -= 1;
        return { text: "ok", generationTimeMs: 30 };
      },
    });
    await scripted.runtime.initialize({ modelPath: "local.gguf" });
    const queued = withGenerationQueue(scripted.runtime);
    await Promise.all([
      queued.generate({ prompt: "one" }),
      queued.generate({ prompt: "two" }),
    ]);
    assert.equal(maxActive, 1);
    assert.equal(scripted.generateCalls.length, 2);
  });
});

describe("runInferenceProbe", () => {
  it("records initialization and generation times from the scripted runtime", async () => {
    const scripted = createScriptedRuntime({
      respond: () => ({ text: "pong", generationTimeMs: 15 }),
    });
    const report = await runInferenceProbe(scripted.runtime, {
      modelPath: "D:\\models\\probe.gguf",
      prompt: "ping",
      readResources: () => ({ source: "unavailable", note: "test" }),
    });
    assert.equal(report.loaded, true);
    assert.equal(report.generated, true);
    assert.equal(report.outputText, "pong");
    assert.equal(report.generationTimeMs, 15);
    assert.equal(typeof report.initTimeMs, "number");
    assert.equal(scripted.initializeCalls[0]?.modelPath, "D:\\models\\probe.gguf");
  });

  it("stops after a failed load and does not generate", async () => {
    const scripted = createScriptedRuntime({
      respond: () => ({ text: "should not run", generationTimeMs: 1 }),
      failInitializeWith: new ModelRuntimeError("MODEL_LOAD_FAILED", "out of memory"),
    });
    const report = await runInferenceProbe(scripted.runtime, {
      modelPath: "missing.gguf",
      prompt: "ping",
    });
    assert.equal(report.loaded, false);
    assert.equal(report.generated, false);
    assert.equal(report.error?.code, "MODEL_LOAD_FAILED");
    assert.equal(scripted.generateCalls.length, 0);
    assert.equal(report.resourcesBefore.source, "node-process");
  });

  it("retries a memory allocation failure once with a smaller context", async () => {
    const seen: number[] = [];
    let calls = 0;
    const runtime = createLlamaRnRuntime({
      fileStat: async () => ({ exists: true, sizeBytes: 12 }),
      loadModule: async () => ({
        async initLlama(params) {
          seen.push(params.n_ctx);
          calls += 1;
          if (calls === 1) {
            throw new Error("failed to allocate memory");
          }
          return {
            async completion() {
              return { text: "ok", timings: { predicted_n: 1, predicted_ms: 1 } };
            },
          };
        },
      }),
    });
    const status = await runtime.initialize({
      modelPath: "/sdcard/Llama.gguf",
      nCtx: 512,
      retrySmallerContext: true,
    });
    assert.equal(status.state, "ready");
    assert.deepEqual(seen, [512, 256]);
  });
});

describe("inspectModelFile", () => {
  it("accepts a small GGUF-headed file and rejects other bytes", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "cognify-model-"));
    try {
      const ggufPath = path.join(directory, "toy.gguf");
      const otherPath = path.join(directory, "notes.txt");
      await writeFile(ggufPath, Buffer.from([0x47, 0x47, 0x55, 0x46, 0x01]));
      await writeFile(otherPath, Buffer.from("hello"));

      const gguf = await inspectModelFile(ggufPath, nodeFileStat, (file) => readFilePrefix(file, 4));
      assert.equal(gguf.exists, true);
      assert.equal(gguf.ggufMagic, true);
      assert.equal(gguf.sizeBytes, 5);

      const other = await inspectModelFile(otherPath, nodeFileStat, (file) => readFilePrefix(file, 4));
      assert.equal(other.ggufMagic, false);

      const missing = await inspectModelFile(path.join(directory, "nope.gguf"), nodeFileStat);
      assert.equal(missing.exists, false);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
