import type { InferenceProbeReport, ResourceSnapshot } from "./aiTypes";
import { toAiError } from "./errors";
import { readNodeResourceSnapshot, type ModelRuntime } from "./modelRuntime";

export interface InferenceProbeOptions {
  modelPath: string;
  prompt: string;
  maxTokens?: number;
  readResources?: () => ResourceSnapshot;
}

/**
 * Load a model that is already on disk, generate once, and record timings.
 * Calling this does not download a model. Run it again only when you intend
 * to measure another load; the runtime itself does not reload on each prompt
 * unless initialize is called again.
 */
export async function runInferenceProbe(
  runtime: ModelRuntime,
  options: InferenceProbeOptions,
): Promise<InferenceProbeReport> {
  const readResources = options.readResources ?? readNodeResourceSnapshot;
  const resourcesBefore = readResources();
  const status = await runtime.initialize({ modelPath: options.modelPath, retrySmallerContext: true });

  if (status.state !== "ready") {
    return {
      runtimeId: runtime.id,
      modelPath: options.modelPath,
      loaded: false,
      generated: false,
      initTimeMs: status.initTimeMs,
      status,
      error: status.error,
      resourcesBefore,
      resourcesAfter: readResources(),
    };
  }

  try {
    const generated = await runtime.generate({
      prompt: options.prompt,
      maxTokens: options.maxTokens ?? 64,
      temperature: 0,
    });
    return {
      runtimeId: runtime.id,
      modelPath: options.modelPath,
      loaded: true,
      generated: generated.text.trim().length > 0,
      initTimeMs: status.initTimeMs,
      generationTimeMs: generated.generationTimeMs,
      ...(generated.firstTokenMs !== undefined ? { firstTokenMs: generated.firstTokenMs } : {}),
      ...(generated.tokenCount !== undefined ? { tokenCount: generated.tokenCount } : {}),
      outputText: generated.text,
      status: runtime.getStatus(),
      resourcesBefore,
      resourcesAfter: readResources(),
    };
  } catch (error) {
    return {
      runtimeId: runtime.id,
      modelPath: options.modelPath,
      loaded: true,
      generated: false,
      initTimeMs: status.initTimeMs,
      status: runtime.getStatus(),
      error: toAiError(error, "INFERENCE_FAILED", "The probe could not generate text."),
      resourcesBefore,
      resourcesAfter: readResources(),
    };
  }
}
