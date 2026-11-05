import { NativeModules } from 'react-native';
import { createMemoryTextStore, isStoreName, type TextStore } from '../../src/ai/textStore';

export interface LocalFileInfo {
  exists: boolean;
  sizeBytes: number;
  readable: boolean;
  /** Present after a header check. Undefined when the file was not read. */
  ggufMagic?: boolean;
  note?: string;
}

interface LocalStoreNative {
  read: (name: string) => Promise<string | null>;
  write: (name: string, contents: string) => Promise<boolean>;
  remove: (name: string) => Promise<boolean>;
  fileInfo: (path: string) => Promise<LocalFileInfo>;
}

export function getLocalStoreModule(): LocalStoreNative | undefined {
  const native = NativeModules.LocalStore as LocalStoreNative | undefined;
  if (!native || typeof native.read !== 'function' || typeof native.write !== 'function') {
    return undefined;
  }
  return native;
}

/**
 * Android writes the JSON files. A build without the module keeps values in
 * memory and reports that they will not survive a restart.
 */
export function createAppTextStore(native: LocalStoreNative | undefined = getLocalStoreModule()): {
  store: TextStore;
  persistent: boolean;
  fileInfo?: (path: string) => Promise<LocalFileInfo>;
} {
  if (!native) {
    return { store: createMemoryTextStore(), persistent: false };
  }
  return {
    persistent: true,
    fileInfo: path => native.fileInfo(path),
    store: {
      async read(name) {
        if (!isStoreName(name)) {
          throw new Error('The local store name is not allowed.');
        }
        const value = await native.read(name);
        return value === null || value === undefined || value.length === 0 ? null : value;
      },
      async write(name, contents) {
        if (!isStoreName(name)) {
          throw new Error('The local store name is not allowed.');
        }
        await native.write(name, contents);
      },
      async remove(name) {
        if (!isStoreName(name)) {
          throw new Error('The local store name is not allowed.');
        }
        await native.remove(name);
      },
    },
  };
}
