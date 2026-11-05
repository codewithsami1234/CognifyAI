declare module "llama.rn" {
  export function initLlama(params: {
    model: string;
    use_mlock?: boolean;
    n_ctx?: number;
    n_gpu_layers?: number;
  }): Promise<{
    completion(
      params: {
        prompt?: string;
        n_predict?: number;
        temperature?: number;
        stop?: string[];
      },
      onToken?: (data: { token: string }) => void,
    ): Promise<{
      text?: string;
      timings?: {
        predicted_ms?: number;
        predicted_n?: number;
      };
    }>;
    release?: () => Promise<void>;
  }>;
}
