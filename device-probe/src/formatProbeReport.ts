export { EXTERNAL_MODEL_PATH as DEFAULT_MODEL_PATH } from './externalModelPath';

export const DEFAULT_PROMPT = 'Reply with the single word: pong';

/** Small context for the first phone trial. The library default stays 2048. */
export const PROBE_N_CTX = 512;

/** CPU only. This phone's GPU is MediaTek, and llama.rn OpenCL targets Adreno. */
export const PROBE_N_GPU_LAYERS = 0;

export const PROBE_MAX_TOKENS = 32;

export interface ProbeErrorView {
  code: string;
  message: string;
  cause?: string;
}

export interface ProbeReportView {
  loaded: boolean;
  generated: boolean;
  statusState: string;
  initTimeMs?: number;
  generationTimeMs?: number;
  firstTokenMs?: number;
  tokenCount?: number;
  outputText?: string;
  error?: ProbeErrorView;
}

export function formatProbeReport(report: ProbeReportView): string {
  const lines = [
    `Loaded: ${report.loaded ? 'yes' : 'no'}`,
    `Generated: ${report.generated ? 'yes' : 'no'}`,
    `Runtime state: ${report.statusState}`,
    `Init ms: ${report.initTimeMs ?? 'n/a'}`,
    `Generate ms: ${report.generationTimeMs ?? 'n/a'}`,
    `First token ms: ${report.firstTokenMs ?? 'n/a'}`,
    `Tokens: ${report.tokenCount ?? 'n/a'}`,
  ];
  if (report.error) {
    lines.push(`Error ${report.error.code}: ${report.error.message}`);
    if (report.error.cause) {
      lines.push(`Cause: ${report.error.cause}`);
    }
  }
  lines.push('Output:');
  lines.push(report.outputText ?? '');
  return lines.join('\n');
}
