import { NativeModules } from 'react-native';
import { NEURAL_EMBEDDING_FILE, NEURAL_EMBEDDING_URL } from '../../../src/ai/embeddings/embeddingCatalog';

export interface DownloadStatus {
  status: string;
  bytes: number;
  total: number;
  error: string;
}

interface ModelFilesNative {
  embeddingPath: () => Promise<string>;
  availableBytes: () => Promise<number>;
  downloadStatus: () => Promise<DownloadStatus>;
  startDownload: (url: string, fileName: string) => Promise<boolean>;
  cancelDownload: () => Promise<boolean>;
  deleteEmbedding: (fileName: string) => Promise<boolean>;
}

export function getModelFilesModule(): ModelFilesNative | undefined {
  const native = NativeModules.ModelFiles as ModelFilesNative | undefined;
  if (!native || typeof native.startDownload !== 'function') {
    return undefined;
  }
  return native;
}

export async function optionalEmbeddingPath(): Promise<string | undefined> {
  const native = getModelFilesModule();
  if (!native) {
    return undefined;
  }
  return native.embeddingPath();
}

export async function deviceAvailableBytes(): Promise<number | undefined> {
  const native = getModelFilesModule();
  if (!native) {
    return undefined;
  }
  const bytes = await native.availableBytes();
  return typeof bytes === 'number' ? bytes : undefined;
}

export async function embeddingDownloadStatus(): Promise<DownloadStatus | undefined> {
  const native = getModelFilesModule();
  if (!native) {
    return undefined;
  }
  return native.downloadStatus();
}

export async function startEmbeddingDownload(): Promise<void> {
  const native = getModelFilesModule();
  if (!native) {
    throw new Error('This build cannot download a model file. Rebuild the app with the model-file module.');
  }
  await native.startDownload(NEURAL_EMBEDDING_URL, NEURAL_EMBEDDING_FILE);
}

export async function cancelEmbeddingDownload(): Promise<void> {
  const native = getModelFilesModule();
  if (native) {
    await native.cancelDownload();
  }
}

export async function deleteOptionalEmbedding(): Promise<void> {
  const native = getModelFilesModule();
  if (!native) {
    throw new Error('This build cannot remove the embedding file.');
  }
  await native.deleteEmbedding(NEURAL_EMBEDDING_FILE);
}
