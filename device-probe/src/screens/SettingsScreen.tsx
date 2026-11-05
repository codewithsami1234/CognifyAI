import { StyleSheet, Text } from 'react-native';
import type { ModelStatus } from '../../../src/ai/aiTypes';
import type { LocalFileInfo } from '../localTextStore';
import { BodyText, Card, PrimaryButton, ScreenFrame, SecondaryButton, SectionLabel } from '../ui';
import { colors, formatBytes } from '../theme';

export function SettingsScreen({
  modelPath,
  locationNote,
  modelStatus,
  ggufInfo,
  persistent,
  progressBytes,
  libraryBytes,
  documentCount,
  busy,
  onBack,
  onInitialize,
  onRefreshFile,
  onSelectFallback,
  onClearHistory,
  onOpenProbe,
  onOpenModels,
}: {
  modelPath: string;
  locationNote: string | undefined;
  modelStatus: ModelStatus | undefined;
  ggufInfo: LocalFileInfo | undefined;
  persistent: boolean;
  progressBytes: number;
  libraryBytes: number;
  documentCount: number;
  busy: boolean;
  onBack: () => void;
  onInitialize: () => void;
  onRefreshFile: () => void;
  onSelectFallback: () => void;
  onClearHistory: () => void;
  onOpenProbe: () => void;
  onOpenModels: () => void;
}) {
  const state = modelStatus?.state ?? 'uninitialized';
  return (
    <ScreenFrame title="Settings" onBack={onBack}>
      <BodyText>
        Offline: questions, notes, and scores stay on this phone. The tutor uses a GGUF file already on the device. An optional embedding model can be downloaded from Offline models. No question or document is sent to a model service.
      </BodyText>
      <Card>
        <SectionLabel>Privacy</SectionLabel>
        <Text style={styles.body}>
          There is no account. The document library, quiz draft, and the original learning-progress file remain JSON files on this device. Conversations, search history, bookmarks, notes, adaptive quizzes, flashcards, and study plans are stored in a local SQLite database. Clearing learning history on this screen deletes the JSON quiz scores and activity list. It does not delete the SQLite study records, imported documents, or a GGUF file. Android backup of these files is turned off.
        </Text>
      </Card>
      <Card>
        <SectionLabel>Local model</SectionLabel>
        <Text style={styles.body}>{`Initialization status: ${state}`}</Text>
        {modelStatus?.error ? <Text style={styles.body}>{`${modelStatus.error.code}: ${modelStatus.error.message}`}</Text> : null}
        <Text style={styles.body}>{`GGUF path: ${modelPath}`}</Text>
        {locationNote ? <Text style={styles.body}>{locationNote}</Text> : null}
        {ggufInfo ? (
          <Text style={styles.body}>
            {ggufInfo.exists
              ? `GGUF file is present, ${formatBytes(ggufInfo.sizeBytes)}, readable ${ggufInfo.readable ? 'yes' : 'no'}${
                  ggufInfo.ggufMagic === true ? ', magic bytes match' : ''
                }${ggufInfo.ggufMagic === false ? ', magic bytes do not match' : ''}.`
              : `GGUF availability: not confirmed. ${ggufInfo.note ?? 'The file was not found at this path.'}`}
          </Text>
        ) : (
          <Text style={styles.body}>GGUF availability has not been checked in this visit to Settings.</Text>
        )}
        <Text style={styles.body}>
          Llama 3.2 1B is the primary file. Qwen2.5 0.5B is a manual path in the same folder. Choosing it does not download a model, and it is not loaded until you initialize.
        </Text>
        <PrimaryButton title={busy ? 'Working' : 'Initialize local model'} onPress={onInitialize} disabled={busy} />
        <SecondaryButton title="Check GGUF file" onPress={onRefreshFile} disabled={busy} />
        <SecondaryButton title="Select Qwen fallback path" onPress={onSelectFallback} disabled={busy} />
      </Card>
      <Card>
        <SectionLabel>Storage</SectionLabel>
        <Text style={styles.body}>{persistent ? 'History and the library are saved in app files on this device.' : 'This session has no Android file store, so history will not survive a restart.'}</Text>
        <Text style={styles.body}>{`Learning history file: ${formatBytes(progressBytes)}`}</Text>
        <Text style={styles.body}>{`Library file: ${formatBytes(libraryBytes)}`}</Text>
        <Text style={styles.body}>{`Imported documents: ${documentCount}`}</Text>
        <SecondaryButton title="Clear learning history" onPress={onClearHistory} />
        <SecondaryButton title="Offline models" onPress={onOpenModels} />
      </Card>
      <SecondaryButton title="Model probe" onPress={onOpenProbe} />
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  body: {
    color: colors.ink,
    fontSize: 15,
    lineHeight: 21,
    marginBottom: 8,
  },
});
