import { NativeModules } from 'react-native';
import {
  interpretStudyExtraction,
  type StudyExtraction,
  type StudyImportResult,
} from '../../src/ai/studyImport';

export interface StudyDocumentNative {
  openAndExtract: () => Promise<StudyExtraction>;
}

export function getStudyDocumentModule(): StudyDocumentNative | undefined {
  const native = NativeModules.StudyDocument as StudyDocumentNative | undefined;
  if (!native || typeof native.openAndExtract !== 'function') {
    return undefined;
  }
  return native;
}

/** Opens the Android picker through the local module. Tests pass a fake module. */
export async function openStudyDocument(
  native: StudyDocumentNative | undefined = getStudyDocumentModule(),
): Promise<StudyImportResult> {
  if (!native) {
    return {
      status: 'error',
      code: 'EXTRACT_FAILED',
      message: 'Document import is not available in this build.',
    };
  }
  try {
    const extraction = await native.openAndExtract();
    return interpretStudyExtraction(extraction);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: 'error',
      code: 'EXTRACT_FAILED',
      message: message.length > 0 ? message : 'The document could not be read on this device.',
    };
  }
}
