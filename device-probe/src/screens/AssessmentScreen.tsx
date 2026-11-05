import { StyleSheet, Text, TextInput } from 'react-native';
import type { AssessmentKind, AssessmentResult } from '../../../src/ai/aiTypes';
import { ASSESSMENT_DISCLAIMER } from '../formatAssessment';
import type { LibraryDocument } from '../../../src/ai/documentLibrary';
import { BodyText, Card, EmptyNote, PrimaryButton, ScreenFrame, SecondaryButton, SectionLabel } from '../ui';
import { colors } from '../theme';

const KINDS: Array<{ id: AssessmentKind; label: string }> = [
  { id: 'mcq', label: 'MCQ' },
  { id: 'short_answer', label: 'Short answer' },
  { id: 'flashcard', label: 'Flashcards' },
];

export function AssessmentScreen({
  document,
  kind,
  count,
  focus,
  busy,
  result,
  onBack,
  onChangeKind,
  onChangeCount,
  onChangeFocus,
  onGenerate,
  onStart,
  canResume,
  onResume,
}: {
  document: LibraryDocument | undefined;
  kind: AssessmentKind;
  count: 1 | 2 | 3;
  focus: string;
  busy: boolean;
  result: AssessmentResult | undefined;
  onBack: () => void;
  onChangeKind: (kind: AssessmentKind) => void;
  onChangeCount: (count: 1 | 2 | 3) => void;
  onChangeFocus: (value: string) => void;
  onGenerate: () => void;
  onStart: () => void;
  canResume: boolean;
  onResume: () => void;
}) {
  const ready = result?.status === 'ok' && result.items.length > 0 && result.kind === kind;
  return (
    <ScreenFrame title="Assessment" onBack={onBack}>
      <BodyText>
        {ASSESSMENT_DISCLAIMER} A blank focus uses the selected document in order. A focus uses keyword retrieval, and the model is not called when nothing matches. Answers stay hidden until you submit the quiz.
      </BodyText>
      {document ? (
        <Card>
          <Text style={styles.ink}>{document.title}</Text>
          <Text style={styles.muted}>Questions are generated from this document only.</Text>
        </Card>
      ) : (
        <EmptyNote>Select a document in the library before generating questions.</EmptyNote>
      )}
      <SectionLabel>Type</SectionLabel>
      {KINDS.map(option => (
        <SecondaryButton
          key={option.id}
          title={option.id === kind ? `${option.label} (selected)` : option.label}
          selected={option.id === kind}
          onPress={() => onChangeKind(option.id)}
          disabled={busy}
        />
      ))}
      <SectionLabel>{`Item count: ${count}`}</SectionLabel>
      {([1, 2, 3] as const).map(value => (
        <SecondaryButton
          key={value}
          title={value === count ? `${value} (selected)` : String(value)}
          selected={value === count}
          onPress={() => onChangeCount(value)}
          disabled={busy}
        />
      ))}
      <SectionLabel>Focus, optional</SectionLabel>
      <TextInput value={focus} onChangeText={onChangeFocus} multiline style={styles.input} />
      <PrimaryButton
        title={busy ? 'Working' : 'Generate assessment'}
        onPress={onGenerate}
        disabled={busy || !document}
      />
      {result ? (
        <Card>
          <Text style={styles.ink}>{`Status: ${result.status}`}</Text>
          <Text style={styles.muted}>{result.message}</Text>
          {result.status === 'ok' ? (
            <Text style={styles.muted}>{`${result.items.length} item(s) are ready. The marked answers are not shown yet.`}</Text>
          ) : (
            <Text style={styles.muted}>No quiz was created from this result.</Text>
          )}
        </Card>
      ) : (
        <EmptyNote>No assessment has been generated in this session.</EmptyNote>
      )}
      {ready ? <PrimaryButton title="Start quiz" onPress={onStart} disabled={busy} /> : null}
      {canResume ? <SecondaryButton title="Resume current quiz" onPress={onResume} disabled={busy} /> : null}
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  ink: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  muted: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    color: colors.ink,
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
    fontSize: 15,
  },
});
