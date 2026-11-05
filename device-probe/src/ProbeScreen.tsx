import { Button, StyleSheet, Text, TextInput, View } from 'react-native';
import type { AssessmentKind } from '../../src/ai/aiTypes';
import { colors } from './theme';

function assessmentKindLabel(kind: AssessmentKind): string {
  if (kind === 'mcq') {
    return 'MCQ';
  }
  if (kind === 'short_answer') {
    return 'Short answer';
  }
  return 'Flashcards';
}

export function ProbeScreen({
  onBack,
  modelPath,
  onChangeModelPath,
  locationNote,
  prompt,
  onChangePrompt,
  busy,
  onProbe,
  onGenerateAgain,
  onRelease,
  reportText,
  documentName,
  onChangeDocumentName,
  pageText,
  onChangePageText,
  studyText,
  onChangeStudyText,
  importing,
  onImport,
  importStatus,
  question,
  onChangeQuestion,
  onAsk,
  tutorText,
  assessmentKind,
  onChangeAssessmentKind,
  assessmentCount,
  onChangeAssessmentCount,
  assessmentFocus,
  onChangeAssessmentFocus,
  onGenerateAssessment,
  assessmentText,
}: {
  onBack: () => void;
  modelPath: string;
  onChangeModelPath: (value: string) => void;
  locationNote: string | undefined;
  prompt: string;
  onChangePrompt: (value: string) => void;
  busy: boolean;
  onProbe: () => void;
  onGenerateAgain: () => void;
  onRelease: () => void;
  reportText: string;
  documentName: string;
  onChangeDocumentName: (value: string) => void;
  pageText: string;
  onChangePageText: (value: string) => void;
  studyText: string;
  onChangeStudyText: (value: string) => void;
  importing: boolean;
  onImport: () => void;
  importStatus: string;
  question: string;
  onChangeQuestion: (value: string) => void;
  onAsk: () => void;
  tutorText: string;
  assessmentKind: AssessmentKind;
  onChangeAssessmentKind: (kind: AssessmentKind) => void;
  assessmentCount: 1 | 2 | 3;
  onChangeAssessmentCount: (count: 1 | 2 | 3) => void;
  assessmentFocus: string;
  onChangeAssessmentFocus: (value: string) => void;
  onGenerateAssessment: () => void;
  assessmentText: string;
}) {
  return (
    <View style={styles.content}>
      <Button title="Back to settings" onPress={onBack} />
      <Text style={styles.title}>Cognify local probe</Text>
      <Text style={styles.note}>
        CPU inference. Copy a GGUF file onto the phone first. This screen does not download weights or call a cloud model. Student quizzes are on the dashboard.
      </Text>
      <Text style={styles.label}>Model path</Text>
      <TextInput
        value={modelPath}
        onChangeText={onChangeModelPath}
        autoCapitalize="none"
        autoCorrect={false}
        multiline
        style={styles.input}
      />
      <Text style={styles.note}>
        {locationNote ??
          'Loads the GGUF already in app-specific external storage. It is not copied into the private files directory and it is not inside the APK.'}
      </Text>
      <Text style={styles.label}>Prompt</Text>
      <TextInput value={prompt} onChangeText={onChangePrompt} multiline style={styles.input} />
      <View style={styles.button}>
        <Button title={busy ? 'Working' : 'Load and generate'} onPress={onProbe} disabled={busy} />
      </View>
      <View style={styles.button}>
        <Button title="Generate again" onPress={onGenerateAgain} disabled={busy} />
      </View>
      <View style={styles.button}>
        <Button title="Release model" onPress={onRelease} disabled={busy} />
      </View>
      <Text style={styles.label}>Result</Text>
      <Text selectable style={styles.result}>
        {reportText}
      </Text>
      <Text style={styles.sectionTitle}>Study tutor</Text>
      <Text style={styles.note}>
        Keyword retrieval, then the local model. Word endings such as absorb and absorbs can match. A short follow-up that says it, that, or they reuses terms from the previous answered question. Synonyms can still miss. Overlap is not proof the passage answers the question. Paste text or import a local file. Text is read on this phone. Nothing is uploaded. An answer is not marked correct.
      </Text>
      <Text style={styles.label}>Document name</Text>
      <TextInput value={documentName} onChangeText={onChangeDocumentName} style={styles.input} />
      <Text style={styles.label}>Page number, if known</Text>
      <TextInput value={pageText} onChangeText={onChangePageText} keyboardType="number-pad" style={styles.input} />
      <Text style={styles.label}>Study text</Text>
      <TextInput value={studyText} onChangeText={onChangeStudyText} multiline style={styles.studyInput} />
      <View style={styles.button}>
        <Button
          title={importing ? 'Reading document' : 'Import study document'}
          onPress={onImport}
          disabled={busy || importing}
        />
      </View>
      <Text selectable style={styles.result}>
        {importStatus}
      </Text>
      <Text style={styles.label}>Question</Text>
      <TextInput value={question} onChangeText={onChangeQuestion} multiline style={styles.input} />
      <View style={styles.button}>
        <Button title={busy ? 'Working' : 'Ask tutor'} onPress={onAsk} disabled={busy || importing} />
      </View>
      <Text style={styles.label}>Tutor result</Text>
      <Text selectable style={styles.result}>
        {tutorText}
      </Text>
      <Text style={styles.sectionTitle}>Assessment</Text>
      <Text style={styles.note}>
        MCQs, short answers, and flashcards from the study text above. A blank focus uses that text in order. A focus uses keyword retrieval, and the model is not called when nothing matches. A correct option is the model selection. It is not a verified score. Nothing is uploaded.
      </Text>
      <Text style={styles.label}>Assessment type: {assessmentKindLabel(assessmentKind)}</Text>
      <View style={styles.button}>
        <Button
          title={assessmentKind === 'mcq' ? 'MCQ (selected)' : 'MCQ'}
          onPress={() => onChangeAssessmentKind('mcq')}
          disabled={busy || importing}
        />
      </View>
      <View style={styles.button}>
        <Button
          title={assessmentKind === 'short_answer' ? 'Short answer (selected)' : 'Short answer'}
          onPress={() => onChangeAssessmentKind('short_answer')}
          disabled={busy || importing}
        />
      </View>
      <View style={styles.button}>
        <Button
          title={assessmentKind === 'flashcard' ? 'Flashcards (selected)' : 'Flashcards'}
          onPress={() => onChangeAssessmentKind('flashcard')}
          disabled={busy || importing}
        />
      </View>
      <Text style={styles.label}>Item count: {assessmentCount}</Text>
      <View style={styles.button}>
        <Button
          title={assessmentCount === 1 ? '1 (selected)' : '1'}
          onPress={() => onChangeAssessmentCount(1)}
          disabled={busy || importing}
        />
      </View>
      <View style={styles.button}>
        <Button
          title={assessmentCount === 2 ? '2 (selected)' : '2'}
          onPress={() => onChangeAssessmentCount(2)}
          disabled={busy || importing}
        />
      </View>
      <View style={styles.button}>
        <Button
          title={assessmentCount === 3 ? '3 (selected)' : '3'}
          onPress={() => onChangeAssessmentCount(3)}
          disabled={busy || importing}
        />
      </View>
      <Text style={styles.label}>Focus, optional</Text>
      <TextInput value={assessmentFocus} onChangeText={onChangeAssessmentFocus} multiline style={styles.input} />
      <View style={styles.button}>
        <Button
          title={busy ? 'Working' : 'Generate assessment'}
          onPress={onGenerateAssessment}
          disabled={busy || importing}
        />
      </View>
      <Text style={styles.label}>Assessment result</Text>
      <Text selectable style={styles.result}>
        {assessmentText}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.ink,
    marginTop: 12,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.ink,
    marginTop: 20,
    marginBottom: 8,
  },
  note: {
    fontSize: 15,
    lineHeight: 21,
    color: colors.muted,
    marginBottom: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.ink,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    color: colors.ink,
    padding: 8,
    marginBottom: 12,
    fontSize: 14,
  },
  studyInput: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    color: colors.ink,
    padding: 8,
    marginBottom: 12,
    fontSize: 14,
    minHeight: 120,
    textAlignVertical: 'top',
  },
  button: {
    marginBottom: 8,
  },
  result: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.ink,
    backgroundColor: colors.card,
    padding: 8,
  },
});
