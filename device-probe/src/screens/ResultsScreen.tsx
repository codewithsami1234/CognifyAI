import { StyleSheet, Text } from 'react-native';
import type { QuizReport } from '../../../src/ai/quizScoring';
import { provenanceLine } from '../../../src/ai/documentLibrary';
import { Card, PrimaryButton, ScreenFrame, SecondaryButton, SectionLabel } from '../ui';
import { colors } from '../theme';

const LETTERS = ['A', 'B', 'C', 'D'] as const;

function sourceText(reportSource: { documentName: string; documentId: string; pageNumber?: number; section?: string; chunkId: string }): string {
  const place = provenanceLine({
    documentId: reportSource.documentId,
    documentName: reportSource.documentName,
    text: '',
    pageNumber: reportSource.pageNumber,
    section: reportSource.section,
  });
  return `${reportSource.documentName}, ${place}, chunk ${reportSource.chunkId}`;
}

export function ResultsScreen({
  report,
  onBack,
  onHome,
  onSelfAssess,
}: {
  report: QuizReport;
  onBack: () => void;
  onHome: () => void;
  onSelfAssess: (itemId: string, value: 'understood' | 'needs_review') => void;
}) {
  return (
    <ScreenFrame title="Results" onBack={onBack}>
      {report.kind === 'mcq' ? (
        <Card>
          <Text style={styles.score}>
            {report.mcqAccuracyPercent === null ? 'No MCQ score' : `${report.mcqAccuracyPercent}%`}
          </Text>
          <Text style={styles.line}>{`Correct ${report.mcqCorrect}, incorrect ${report.mcqIncorrect}, unanswered ${report.mcqUnanswered}.`}</Text>
          <Text style={styles.note}>{report.mcqBasisNote}</Text>
        </Card>
      ) : null}
      {report.kind === 'short_answer' ? (
        <Card>
          <Text style={styles.line}>{`${report.shortAnswers.length} short answer(s).`}</Text>
          <Text style={styles.note}>{report.shortAnswerNote}</Text>
        </Card>
      ) : null}
      {report.kind === 'flashcard' ? (
        <Card>
          <Text style={styles.line}>
            {`Known ${report.flashcards.filter(card => card.mark === 'known').length}, needs revision ${report.flashcards.filter(card => card.mark === 'needs_revision').length}, unreviewed ${report.flashcards.filter(card => card.mark === 'unreviewed').length}.`}
          </Text>
          <Text style={styles.note}>These marks are your review results. They are not an accuracy grade.</Text>
        </Card>
      ) : null}
      <SectionLabel>Questions</SectionLabel>
      {report.mcqItems.map(item => (
        <Card key={item.id}>
          <Text style={styles.question}>{item.question}</Text>
          <Text style={styles.line}>{`Result: ${item.outcome}`}</Text>
          <Text style={styles.line}>
            {item.selectedIndex === null
              ? 'Your choice: none'
              : `Your choice: ${LETTERS[item.selectedIndex]}. ${item.options[item.selectedIndex]}`}
          </Text>
          <Text style={styles.line}>
            {`Marked option: ${LETTERS[item.markedIndex]}. ${item.options[item.markedIndex]}`}
          </Text>
          {item.sources.map(source => (
            <Text key={source.chunkId} style={styles.note}>
              {sourceText(source)}
            </Text>
          ))}
        </Card>
      ))}
      {report.shortAnswers.map(item => (
        <Card key={item.id}>
          <Text style={styles.question}>{item.question}</Text>
          <Text style={styles.line}>{item.response.length > 0 ? `Your answer: ${item.response}` : 'Your answer: none'}</Text>
          <Text style={styles.line}>{`Reference answer: ${item.referenceAnswer}`}</Text>
          <Text style={styles.note}>Self-assessment: {item.selfAssessment.replace('_', ' ')}. Verified grade: none.</Text>
          {item.response.length > 0 ? (
            <>
              <SecondaryButton
                title="I understood this"
                selected={item.selfAssessment === 'understood'}
                onPress={() => onSelfAssess(item.id, 'understood')}
              />
              <SecondaryButton
                title="I need to review this"
                selected={item.selfAssessment === 'needs_review'}
                onPress={() => onSelfAssess(item.id, 'needs_review')}
              />
            </>
          ) : null}
          {item.sources.map(source => (
            <Text key={source.chunkId} style={styles.note}>
              {sourceText(source)}
            </Text>
          ))}
        </Card>
      ))}
      {report.flashcards.map(item => (
        <Card key={item.id}>
          <Text style={styles.question}>{item.front}</Text>
          <Text style={styles.line}>{item.back}</Text>
          <Text style={styles.note}>{`Review: ${item.mark.replace('_', ' ')}`}</Text>
          {item.sources.map(source => (
            <Text key={source.chunkId} style={styles.note}>
              {sourceText(source)}
            </Text>
          ))}
        </Card>
      ))}
      <PrimaryButton title="Back to dashboard" onPress={onHome} />
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  score: {
    color: colors.ink,
    fontSize: 32,
    fontWeight: '700',
  },
  question: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
    marginBottom: 6,
  },
  line: {
    color: colors.ink,
    fontSize: 15,
    lineHeight: 21,
    marginBottom: 4,
  },
  note: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
});
