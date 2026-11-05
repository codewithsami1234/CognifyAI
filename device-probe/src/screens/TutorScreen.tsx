import { StyleSheet, Text, TextInput } from 'react-native';
import type { LibraryDocument } from '../../../src/ai/documentLibrary';
import { BodyText, Card, EmptyNote, PrimaryButton, ScreenFrame, SecondaryButton, SectionLabel } from '../ui';
import { colors } from '../theme';
import { ListenBar } from '../offline/ListenBar';

export function TutorScreen({
  document,
  question,
  onChangeQuestion,
  answerText,
  busy,
  onAsk,
  onBack,
  pasteTitle,
  pastePage,
  pasteText,
  onChangePasteTitle,
  onChangePastePage,
  onChangePasteText,
  onSavePaste,
  onBookmark,
  onMakeCards,
  spokenText,
}: {
  document: LibraryDocument | undefined;
  question: string;
  onChangeQuestion: (value: string) => void;
  answerText: string;
  busy: boolean;
  onAsk: () => void;
  onBack: () => void;
  pasteTitle: string;
  pastePage: string;
  pasteText: string;
  onChangePasteTitle: (value: string) => void;
  onChangePastePage: (value: string) => void;
  onChangePasteText: (value: string) => void;
  onSavePaste: () => void;
  onBookmark: () => void;
  onMakeCards: () => void;
  spokenText: string;
}) {
  return (
    <ScreenFrame title="Tutor" onBack={onBack}>
      <BodyText>
        The tutor answers from the selected notes. After the document is indexed, a question can match a passage that uses different words. If nothing is retrieved, the tutor says the evidence is insufficient and does not invent a source. An answer is not marked correct.
      </BodyText>
      {document ? (
        <Card>
          <Text style={styles.ink}>{document.title}</Text>
          <Text style={styles.muted}>{`${document.materials.length} section(s) will be used for this question.`}</Text>
        </Card>
      ) : (
        <EmptyNote>Choose a document in the library, or save pasted notes below.</EmptyNote>
      )}
      <SectionLabel>Question</SectionLabel>
      <TextInput value={question} onChangeText={onChangeQuestion} multiline style={styles.input} />
      <PrimaryButton title={busy ? 'Working' : 'Ask tutor'} onPress={onAsk} disabled={busy || !document} />
      <SectionLabel>Tutor result</SectionLabel>
      <Card>
        <Text selectable style={styles.result}>
          {answerText}
        </Text>
      </Card>
      <SecondaryButton title="Bookmark this answer" onPress={onBookmark} disabled={busy || spokenText.trim().length === 0} />
      <SecondaryButton title="Save flashcards from this answer" onPress={onMakeCards} disabled={busy || spokenText.trim().length === 0} />
      <ListenBar text={spokenText} />
      <SectionLabel>Paste notes into the library</SectionLabel>
      <TextInput value={pasteTitle} onChangeText={onChangePasteTitle} placeholder="Document name" style={styles.input} />
      <TextInput
        value={pastePage}
        onChangeText={onChangePastePage}
        placeholder="Page number, if known"
        keyboardType="number-pad"
        style={styles.input}
      />
      <TextInput
        value={pasteText}
        onChangeText={onChangePasteText}
        placeholder="Study text"
        multiline
        style={styles.study}
      />
      <SecondaryButton title="Save pasted notes" onPress={onSavePaste} disabled={busy} />
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  ink: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '700',
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
  study: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    color: colors.ink,
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
    minHeight: 120,
    textAlignVertical: 'top',
    fontSize: 15,
  },
  result: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 20,
  },
});
