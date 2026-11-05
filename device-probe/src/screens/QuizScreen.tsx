import { StyleSheet, Text, TextInput } from 'react-native';
import type { QuizSession, UnansweredQuestion } from '../../../src/ai/quizSession';
import { quizPosition, visibleQuestion } from '../../../src/ai/quizSession';
import { BodyText, Card, PrimaryButton, ScreenFrame, SecondaryButton, SectionLabel } from '../ui';
import { colors } from '../theme';

const LETTERS = ['A', 'B', 'C', 'D'] as const;

export function QuizScreen({
  session,
  unanswered,
  busy,
  onBack,
  onPrevious,
  onNext,
  onSelect,
  onShortAnswer,
  onReveal,
  onMarkKnown,
  onMarkRevision,
  onSubmit,
  onConfirmSubmit,
  onReviewUnanswered,
}: {
  session: QuizSession;
  unanswered: UnansweredQuestion[] | null;
  busy: boolean;
  onBack: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onSelect: (index: 0 | 1 | 2 | 3) => void;
  onShortAnswer: (text: string) => void;
  onReveal: () => void;
  onMarkKnown: () => void;
  onMarkRevision: () => void;
  onSubmit: () => void;
  onConfirmSubmit: () => void;
  onReviewUnanswered: (index: number) => void;
}) {
  const position = quizPosition(session);
  const card = visibleQuestion(session);
  return (
    <ScreenFrame title="Quiz" onBack={onBack}>
      <BodyText>{`Question ${position.index + 1} of ${position.total}. Moving between questions does not generate new ones.`}</BodyText>
      {unanswered && unanswered.length > 0 ? (
        <Card>
          <SectionLabel>Unanswered before submission</SectionLabel>
          {unanswered.map(item => (
            <SecondaryButton
              key={item.id}
              title={`${item.index + 1}. ${item.label}`}
              onPress={() => onReviewUnanswered(item.index)}
            />
          ))}
          <PrimaryButton title="Submit anyway" onPress={onConfirmSubmit} disabled={busy || session.submitted} />
        </Card>
      ) : null}
      {card?.kind === 'mcq' ? (
        <Card>
          <Text style={styles.question}>{card.question}</Text>
          {card.options.map((option, index) => {
            const letter = LETTERS[index] ?? '?';
            const optionIndex = index as 0 | 1 | 2 | 3;
            return (
              <SecondaryButton
                key={option}
                title={`${letter}. ${option}`}
                selected={card.selectedIndex === optionIndex}
                onPress={() => onSelect(optionIndex)}
                disabled={session.submitted}
              />
            );
          })}
        </Card>
      ) : null}
      {card?.kind === 'short_answer' ? (
        <Card>
          <Text style={styles.question}>{card.question}</Text>
          <Text style={styles.note}>Your answer is saved as you type. The reference answer appears after you submit.</Text>
          <TextInput
            value={card.response}
            onChangeText={onShortAnswer}
            multiline
            editable={!session.submitted}
            style={styles.input}
          />
        </Card>
      ) : null}
      {card?.kind === 'flashcard' ? (
        <Card>
          <Text style={styles.question}>{card.front}</Text>
          {card.revealed ? <Text style={styles.back}>{card.back}</Text> : <Text style={styles.note}>The back is hidden.</Text>}
          {!card.revealed ? <SecondaryButton title="Show back" onPress={onReveal} /> : null}
          <SecondaryButton title="Known" selected={card.mark === 'known'} onPress={onMarkKnown} disabled={session.submitted} />
          <SecondaryButton
            title="Needs revision"
            selected={card.mark === 'needs_revision'}
            onPress={onMarkRevision}
            disabled={session.submitted}
          />
        </Card>
      ) : null}
      <SecondaryButton title="Previous" onPress={onPrevious} disabled={position.index === 0} />
      <SecondaryButton title="Next" onPress={onNext} disabled={position.index >= position.total - 1} />
      <PrimaryButton
        title={session.submitted ? 'Submitted' : 'Submit quiz'}
        onPress={onSubmit}
        disabled={busy || session.submitted}
      />
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  question: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 26,
    marginBottom: 10,
  },
  note: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },
  back: {
    color: colors.ink,
    fontSize: 16,
    lineHeight: 22,
    marginBottom: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.background,
    color: colors.ink,
    borderRadius: 10,
    padding: 10,
    minHeight: 100,
    textAlignVertical: 'top',
    fontSize: 15,
  },
});
