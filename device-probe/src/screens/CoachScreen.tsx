import { StyleSheet, Text, TextInput } from 'react-native';
import type { PassageRecommendation, PracticePlan } from '../../../src/ai/learningCoach';
import { COACH_METHOD_NOTE } from '../../../src/ai/learningCoach';
import type { RevisionRecommendation } from '../../../src/ai/aiTypes';
import type { ScoredFlashcard, ScoredMcq } from '../../../src/ai/quizScoring';
import { BodyText, Card, EmptyNote, PrimaryButton, ScreenFrame, SecondaryButton, SectionLabel } from '../ui';
import { colors } from '../theme';
import { ListenBar } from '../offline/ListenBar';

export function CoachScreen({
  recommendations,
  missed,
  revision,
  passages,
  practice,
  question,
  explanation,
  busy,
  documentCount,
  onBack,
  onChangeQuestion,
  onPassages,
  onExplain,
  onPractice,
  onOpenQuiz,
  onOpenPlan,
  explanationText,
}: {
  recommendations: RevisionRecommendation[];
  missed: ScoredMcq[];
  revision: ScoredFlashcard[];
  passages: PassageRecommendation | undefined;
  practice: PracticePlan | undefined;
  question: string;
  explanation: string;
  busy: boolean;
  documentCount: number;
  onBack: () => void;
  onChangeQuestion: (value: string) => void;
  onPassages: () => void;
  onExplain: () => void;
  onPractice: () => void;
  onOpenQuiz: () => void;
  onOpenPlan: () => void;
  explanationText: string;
}) {
  return (
    <ScreenFrame title="Learning Coach" onBack={onBack}>
      <BodyText>{COACH_METHOD_NOTE}</BodyText>
      <BodyText>{`Passage lookup uses ${documentCount} imported document(s). If retrieval finds nothing, the coach stops and does not fill in a fact.`}</BodyText>
      <SectionLabel>Weak topics</SectionLabel>
      {recommendations.length === 0 ? (
        <EmptyNote>No weak topics yet. Finish an MCQ quiz so the coach has recorded results to use.</EmptyNote>
      ) : (
        recommendations.map(item => (
          <Card key={item.topic}>
            <Text style={styles.ink}>{item.topic}</Text>
            <Text style={styles.muted}>{item.reason}</Text>
            <Text style={styles.muted}>{`Recorded accuracy ${(item.accuracy * 100).toFixed(1)}%.`}</Text>
          </Card>
        ))
      )}
      <SectionLabel>Incorrect MCQs</SectionLabel>
      {missed.length === 0 ? (
        <EmptyNote>No incorrectly answered MCQs are stored.</EmptyNote>
      ) : (
        missed.slice(0, 5).map(item => (
          <Card key={`${item.id}-${item.question}`}>
            <Text style={styles.ink}>{item.question}</Text>
            <Text style={styles.muted}>Compared with the model's marked option and recorded as incorrect.</Text>
          </Card>
        ))
      )}
      <SectionLabel>Flashcards marked for revision</SectionLabel>
      {revision.length === 0 ? (
        <EmptyNote>No flashcards are marked for revision.</EmptyNote>
      ) : (
        revision.slice(0, 5).map(card => (
          <Card key={`${card.id}-${card.front}`}>
            <Text style={styles.ink}>{card.front}</Text>
            <Text style={styles.muted}>{card.back}</Text>
          </Card>
        ))
      )}
      <PrimaryButton title={busy ? 'Working' : 'Recommend passages'} onPress={onPassages} disabled={busy} />
      {passages ? (
        <Card>
          <Text style={styles.ink}>{passages.status === 'passages' ? 'Retrieved passages' : 'Insufficient evidence'}</Text>
          <Text style={styles.muted}>{passages.message}</Text>
          {passages.passages.map(passage => (
            <Text key={passage.chunkId} style={styles.passage}>
              {`${passage.documentName}${passage.pageNumber ? `, page ${passage.pageNumber}` : ', page not recorded'}${passage.section ? `, ${passage.section}` : ''}\n${passage.text}`}
            </Text>
          ))}
        </Card>
      ) : null}
      <SectionLabel>Explain from the notes</SectionLabel>
      <TextInput value={question} onChangeText={onChangeQuestion} multiline style={styles.input} />
      <SecondaryButton title={busy ? 'Working' : 'Explain'} onPress={onExplain} disabled={busy} />
      {explanation.length > 0 ? (
        <Card>
          <Text selectable style={styles.muted}>
            {explanation}
          </Text>
        </Card>
      ) : null}
      <ListenBar text={explanationText} />
      <SecondaryButton title="Build a study plan from my activity" onPress={onOpenPlan} />
      <SectionLabel>Practice assessment</SectionLabel>
      <PrimaryButton title={busy ? 'Working' : 'Generate practice quiz'} onPress={onPractice} disabled={busy} />
      {practice?.status === 'insufficient_evidence' ? (
        <Card>
          <Text style={styles.ink}>Insufficient evidence</Text>
          <Text style={styles.muted}>{practice.message}</Text>
        </Card>
      ) : null}
      {practice?.status === 'ready' ? (
        <Card>
          <Text style={styles.ink}>{`Practice focus: ${practice.topic}`}</Text>
          <Text style={styles.muted}>{practice.methodNote}</Text>
          <SecondaryButton title="Open practice quiz" onPress={onOpenQuiz} disabled={busy} />
        </Card>
      ) : null}
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
  },
  passage: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
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
