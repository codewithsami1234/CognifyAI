import { StyleSheet, Text } from 'react-native';
import type { DocumentLibrary, LibraryDocumentType } from '../../../src/ai/documentLibrary';
import { BodyText, Card, EmptyNote, PrimaryButton, ScreenFrame, SecondaryButton } from '../ui';
import { colors, formatWhen } from '../theme';

export function documentTypeLabel(type: LibraryDocumentType): string {
  if (type === 'pdf') {
    return 'PDF';
  }
  if (type === 'docx') {
    return 'DOCX';
  }
  if (type === 'pptx') {
    return 'PPTX';
  }
  if (type === 'image') {
    return 'Image';
  }
  if (type === 'pasted') {
    return 'Pasted notes';
  }
  return 'Text';
}

export function LibraryScreen({
  library,
  importStatus,
  importing,
  onBack,
  onImport,
  onOpenDocument,
}: {
  library: DocumentLibrary;
  importStatus: string;
  importing: boolean;
  onBack: () => void;
  onImport: () => void;
  onOpenDocument: (id: string) => void;
}) {
  return (
    <ScreenFrame title="Library" onBack={onBack}>
      <BodyText>
        Imported text stays on this phone. PDF, DOCX, PPTX, TXT, and images use the existing reader and on-device OCR. Nothing is uploaded.
      </BodyText>
      <PrimaryButton title={importing ? 'Reading document' : 'Import study document'} onPress={onImport} disabled={importing} />
      <Card>
        <Text style={styles.status}>{importStatus}</Text>
      </Card>
      {library.documents.length === 0 ? (
        <EmptyNote>No study materials yet. Import a file or save pasted notes from the tutor.</EmptyNote>
      ) : (
        library.documents.map(document => (
          <Card key={document.id}>
            <Text style={styles.title}>{document.title}</Text>
            <Text style={styles.meta}>
              {`${documentTypeLabel(document.type)} · ${document.status} · ${document.pageCount} section(s) · ${document.charCount} characters`}
            </Text>
            <Text style={styles.when}>{`Imported ${formatWhen(document.importedAt)}`}</Text>
            <SecondaryButton title="Open" onPress={() => onOpenDocument(document.id)} />
          </Card>
        ))
      )}
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  status: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 20,
  },
  title: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: '700',
  },
  meta: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
  },
  when: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 4,
    marginBottom: 8,
  },
});
