/**
 * Optional neural embedding file. It is not bundled and it is not the chat model.
 * sentence-transformers/all-MiniLM-L6-v2 is Apache-2.0. The Q8_0 GGUF is about 25 MB
 * and llama.rn 0.12.4 includes a BERT loader. The vector width is read from the
 * model output, not assumed from this catalog when a vector is stored.
 */

export const NEURAL_EMBEDDING_ID = "all-minilm-l6-v2-q8_0";
export const NEURAL_EMBEDDING_FILE = "all-MiniLM-L6-v2-Q8_0.gguf";
export const NEURAL_EMBEDDING_QUANTIZATION = "Q8_0";
export const NEURAL_EMBEDDING_DIMENSIONS = 384;
export const NEURAL_EMBEDDING_BYTES = 25 * 1024 * 1024;
export const NEURAL_EMBEDDING_URL =
  "https://huggingface.co/second-state/All-MiniLM-L6-v2-Embedding-GGUF/resolve/main/all-MiniLM-L6-v2-Q8_0.gguf";

export const NEURAL_EMBEDDING_NOTE =
  "Optional neural embedding model, about 25 MB, Q8_0, Apache-2.0. Download it only when the phone has a network connection. Do not load it while the chat model is loaded. If this file is missing, search uses the built-in lexicon embedder.";
