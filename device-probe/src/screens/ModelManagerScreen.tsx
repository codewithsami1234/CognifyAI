import { useEffect, useState } from 'react';
import { Alert, Text } from 'react-native';
import { describeOfflineReadiness, type OfflineReadiness } from '../../../src/ai/persistence/offlineReadiness';
import { NEURAL_EMBEDDING_FILE } from '../../../src/ai/embeddings/embeddingCatalog';
import { BodyText, Card, Notice, PrimaryButton, ScreenFrame, SecondaryButton, SectionLabel } from '../ui';
import { colors, formatBytes } from '../theme';
import { getLocalStoreModule } from '../localTextStore';
import {
  cancelEmbeddingDownload,
  deleteOptionalEmbedding,
  deviceAvailableBytes,
  embeddingDownloadStatus,
  optionalEmbeddingPath,
  startEmbeddingDownload,
  type DownloadStatus,
} from '../offline/modelFiles';
import { openStudyDatabase, studyDatabaseBytes, studyDatabaseError } from '../offline/studyDatabase';

export function ModelManagerScreen({
  chatPath,
  chatLabel,
  chatInUse,
  onBack,
}: {
  chatPath: string;
  chatLabel: string;
  chatInUse: boolean;
  onBack: () => void;
}) {
  const [report, setReport] = useState<OfflineReadiness | undefined>(undefined);
  const [download, setDownload] = useState<DownloadStatus | undefined>(undefined);
  const [note, setNote] = useState<string | undefined>(undefined);

  async function refresh() {
    const db = await openStudyDatabase();
    if (!db) {
      setNote(studyDatabaseError() ?? 'Model status cannot include database counts until the SQLite module is in this build.');
      return;
    }
    const files = getLocalStoreModule();
    const chatInfo = files ? await files.fileInfo(chatPath) : undefined;
    const embeddingPath = await optionalEmbeddingPath();
    const embeddingInfo = files && embeddingPath ? await files.fileInfo(embeddingPath) : undefined;
    const readiness = await describeOfflineReadiness(db, {
      chatPath,
      chatAvailable: chatInfo?.exists === true && chatInfo.readable === true,
      chatSizeBytes: chatInfo?.exists ? chatInfo.sizeBytes : undefined,
      chatInUse,
      chatLabel,
      neuralAvailable: embeddingInfo?.exists === true && embeddingInfo.readable === true,
      neuralSizeBytes: embeddingInfo?.exists ? embeddingInfo.sizeBytes : undefined,
      neuralInUse: false,
      databaseBytes: await studyDatabaseBytes(),
      availableBytes: await deviceAvailableBytes(),
    });
    setReport(readiness);
    setDownload(await embeddingDownloadStatus());
    setNote(undefined);
  }

  useEffect(() => {
    void refresh();
  }, [chatPath, chatInUse, chatLabel]);

  useEffect(() => {
    if (download?.status !== 'running') {
      return undefined;
    }
    const timer = setInterval(() => {
      void embeddingDownloadStatus().then(setDownload);
    }, 1000);
    return () => clearInterval(timer);
  }, [download?.status]);

  function removeEmbedding() {
    if (chatInUse && chatPath.endsWith(NEURAL_EMBEDDING_FILE)) {
      setNote('The file in use is the chat model, so it was not deleted.');
      return;
    }
    Alert.alert(
      'Remove embedding model',
      'This deletes only the optional embedding file. Documents, history, and the chat model stay on the phone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            void deleteOptionalEmbedding()
              .then(refresh)
              .catch(error => setNote(error instanceof Error ? error.message : String(error)));
          },
        },
      ],
    );
  }

  const progress =
    download && download.total > 0 ? `${formatBytes(download.bytes)} of ${formatBytes(download.total)}` : download ? formatBytes(download.bytes) : 'Not started';

  return (
    <ScreenFrame title="Offline models" onBack={onBack}>
      <BodyText>
        The tutor needs the chat GGUF that you copy onto the phone. Search works with the built-in lexicon embedder without a download. The neural embedding file is optional, about 25 MB, and is downloaded only when you tap the button. It is not loaded while you are reading this screen.
      </BodyText>
      <PrimaryButton title="Refresh status" onPress={() => void refresh()} />
      {note ? <Notice>{note}</Notice> : null}
      {report ? (
        <Card>
          <SectionLabel>Installed models</SectionLabel>
          <Text style={{ color: colors.ink }}>{`${report.chatModel.label}: ${report.chatModel.available ? 'file present' : 'file not available'}${
            report.chatModel.sizeBytes !== undefined ? `, ${formatBytes(report.chatModel.sizeBytes)}` : ''
          }. In use: ${report.chatModel.inUse ? 'yes' : 'no'}.`}</Text>
          <Text style={{ color: colors.ink, marginTop: 8 }}>{`${report.lexiconEmbedder.id}, ${report.lexiconEmbedder.dimensions} dimensions, ready. ${report.lexiconEmbedder.note}`}</Text>
          <Text style={{ color: colors.ink, marginTop: 8 }}>{`${report.neuralEmbedder.fileName}: ${report.neuralEmbedder.available ? 'file present' : 'not downloaded'}, ${report.neuralEmbedder.quantization}, catalog width ${report.neuralEmbedder.dimensions}. ${
            report.neuralEmbedder.sizeBytes !== undefined ? formatBytes(report.neuralEmbedder.sizeBytes) : 'Size will appear after the file is present.'
          }`}</Text>
          <Text style={{ color: colors.muted, marginTop: 8 }}>{report.neuralEmbedder.note}</Text>
          <Text style={{ color: colors.ink, marginTop: 8 }}>{`Indexed documents ${report.indexedDocuments}, chunks ${report.indexedChunks}, lexicon embeddings ${report.embeddedChunks}.`}</Text>
          <Text style={{ color: colors.ink }}>{`Keyword FTS5: ${report.fts5 ? 'available' : 'not available in this SQLite build, so keyword search uses the overlap scorer'}.`}</Text>
          <Text style={{ color: colors.ink }}>{`Database ${report.databaseBytes !== undefined ? formatBytes(report.databaseBytes) : 'size unavailable'}. Free space ${
            report.availableBytes !== undefined ? formatBytes(report.availableBytes) : 'unavailable'
          }.`}</Text>
          <Text style={{ color: colors.ink }}>{`Offline ready: ${report.offlineReady ? 'yes' : 'no'}. Interrupted indexing jobs: ${report.interruptedJobs}.`}</Text>
          {report.blockers.map(blocker => (
            <Text key={blocker} style={{ color: colors.warn, marginTop: 6 }}>{blocker}</Text>
          ))}
          {report.failedJobs.map(job => (
            <Text key={job.id} style={{ color: colors.danger, marginTop: 6 }}>{`${job.documentId}: ${job.error}`}</Text>
          ))}
        </Card>
      ) : null}
      <SectionLabel>Optional embedding download</SectionLabel>
      <Text style={{ color: colors.muted, marginBottom: 8 }}>{`Status ${download?.status ?? 'unknown'}. ${progress}`}</Text>
      {download?.error ? <Notice>{download.error}</Notice> : null}
      <PrimaryButton
        title="Download embedding model"
        onPress={() => {
          void startEmbeddingDownload()
            .then(() => setDownload({ status: 'running', bytes: 0, total: -1, error: '' }))
            .catch(error => setNote(error instanceof Error ? error.message : String(error)));
        }}
      />
      <SecondaryButton title="Cancel download" onPress={() => void cancelEmbeddingDownload().then(() => void refresh())} />
      <SecondaryButton title="Remove optional embedding" onPress={removeEmbedding} />
    </ScreenFrame>
  );
}
