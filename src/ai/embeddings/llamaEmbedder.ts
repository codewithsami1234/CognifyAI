import { l2Normalize } from "./vectorMath";
import type { TextEmbedder } from "./lexiconEmbedder";

export interface LlamaEmbeddingContext {
  embedding(
    text: string,
    params?: { embd_normalize?: number },
  ): Promise<{ requestId: number; promise: Promise<{ embedding: number[] }> }>;
  release?: () => Promise<void>;
}

export interface LlamaEmbeddingModule {
  initLlama(params: { model: string; embedding: boolean; n_ctx: number; n_gpu_layers?: number }): Promise<LlamaEmbeddingContext>;
}

/**
 * Embeds text with a dedicated GGUF embedding model through llama.rn.
 * The chat model is not used. The caller must not have the chat context loaded.
 */
export function createLlamaTextEmbedder(options: {
  id: string;
  label: string;
  context: LlamaEmbeddingContext;
}): TextEmbedder {
  let dimensions: number | undefined;
  return {
    id: options.id,
    get dimensions() {
      return dimensions ?? 0;
    },
    kind: "gguf",
    label: options.label,
    async embed(texts) {
      const vectors: Float32Array[] = [];
      for (const text of texts) {
        const queued = await options.context.embedding(text, { embd_normalize: 2 });
        const result = await queued.promise;
        if (!Array.isArray(result.embedding) || result.embedding.length === 0) {
          throw new Error("The embedding model returned an empty vector.");
        }
        if (dimensions === undefined) {
          dimensions = result.embedding.length;
        }
        if (result.embedding.length !== dimensions) {
          throw new Error("The embedding model changed vector width during this batch.");
        }
        vectors.push(l2Normalize(Float32Array.from(result.embedding)));
      }
      return vectors;
    },
  };
}
