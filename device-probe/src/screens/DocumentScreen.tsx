import { StyleSheet, Text } from 'react-native';
import type { LibraryDocument } from '../../../src/ai/documentLibrary';
import { provenanceLine } from '../../../src/ai/documentLibrary';
import { BodyText, Card, PrimaryButton, ScreenFrame, SecondaryButton, SectionLabel } from '../ui';
import { colors, formatWhen } from '../theme';
import { documentTypeLabel } from './LibraryScreen';

export function DocumentScreen({
  document,
  onBack,
  onStudy,
  onAssess,
  onChat,
  onPractice,
  onRemove,
}: {
  document: LibraryDocument;
  onBack: () => void;
  onStudy: () => void;
  onAssess: () => void;
  onChat: () => void;
  onPractice: () => void;
  onRemove: () => void;
}) {
  const preview = document.materials
    .map(material => material.text)
    .join('\n\n')
    .slice(0, 1200);

  return (
    <ScreenFrame title={document.title} onBack={onBack}>
      <BodyText>{`${documentTypeLabel(document.type)} · Import status ${document.status} · ${formatWhen(document.importedAt)}`}</BodyText>
      <PrimaryButton title="Study with tutor" onPress={onStudy} />
      <SecondaryButton title="Ask about this document" onPress={onChat} />
      <SecondaryButton title="Practice from this document" onPress={onPractice} />
      <SecondaryButton title="Generate assessment" onPress={onAssess} />
      <SecondaryButton title="Remove from library" onPress={onRemove} />
      <SectionLabel>Source and page</SectionLabel>
      {document.materials.map((material, index) => (
        <Card key={`${material.documentId}-${index}`}>
          <Text style={styles.name}>{material.documentName}</Text>
          <Text style={styles.place}>{provenanceLine(material)}</Text>
        </Card>
      ))}
      <SectionLabel>Text kept on this device</SectionLabel>
      <Card>
        <Text selectable style={styles.preview}>
          {preview.length > 0 ? preview : 'This document has no stored text.'}
        </Text>
      </Card>
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  name: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '700',
  },
  place: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
  },
  preview: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 20,
  },
});
