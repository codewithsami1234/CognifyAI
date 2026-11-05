import { StyleSheet, Text } from 'react-native';
import type { QuizSession } from '../../../src/ai/quizSession';
import type { RevisionRecommendation } from '../../../src/ai/aiTypes';
import type { DocumentLibrary } from '../../../src/ai/documentLibrary';
import { COACH_METHOD_NOTE, recommendRevision } from '../../../src/ai/learningCoach';
import {
  revisionCards,
  summarizeProgress,
  topicScoresFromProgress,
  type LearningProgress,
  type ProgressSummary,
} from '../../../src/ai/learningProgress';
import { BodyText, Card, EmptyNote, PrimaryButton, ScreenFrame, SecondaryButton, SectionLabel, StatGrid } from '../ui';
import { colors, formatWhen } from '../theme';

function percentLabel(value: number | null): string {
  if (value === null) {
    return 'Not yet';
  }
  return `${value}%`;
}

export function DashboardScreen({
  library,
  progress,
  onOpenLibrary,
  onOpenTutor,
  onOpenAssessment,
  onOpenCoach,
  onOpenSettings,
  onOpenSearch,
  onOpenTools,
  savedDraft,
  draftUnreadable,
  onResumeDraft,
  onDiscardDraft,
}: {
  library: DocumentLibrary;
  progress: LearningProgress;
  onOpenLibrary: () => void;
  onOpenTutor: () => void;
  onOpenAssessment: () => void;
  onOpenCoach: () => void;
  onOpenSettings: () => void;
  onOpenSearch: () => void;
  onOpenTools: () => void;
  savedDraft: QuizSession | null;
  draftUnreadable: boolean;
  onResumeDraft: () => void;
  onDiscardDraft: () => void;
}) {
  const summary: ProgressSummary = summarizeProgress(progress);
  const recommendations: RevisionRecommendation[] = recommendRevision({
    scores: topicScoresFromProgress(progress),
    weakAccuracyAtOrBelow: 0.6,
    maxRecommendations: 3,
  });
  const cards = revisionCards(progress).slice(0, 3);
  const recent = summary.activities.slice(-5).reverse();

  return (
    <ScreenFrame title="Dashboard">
      <BodyText>
        Study on this device. Questions, notes, and scores stay on this phone. There is no account and no cloud model.
      </BodyText>
      <StatGrid
        items={[
          { label: 'Study materials', value: String(library.documents.length) },
          { label: 'Quizzes attempted', value: String(summary.quizzesAttempted) },
          { label: 'Questions attempted', value: String(summary.questionsAttempted) },
          { label: 'MCQ accuracy', value: percentLabel(summary.mcqAccuracyPercent) },
        ]}
      />
      <Card>
        <SectionLabel>Learning progress</SectionLabel>
        <Text style={styles.progressBody}>
          {`MCQ correct ${summary.mcqCorrect}, incorrect ${summary.mcqIncorrect}, unanswered ${summary.mcqUnanswered}.`}
        </Text>
        <Text style={styles.progressMuted}>
          {`Short-answer self-assessments: understood ${summary.shortAnswerUnderstood}, needs review ${summary.shortAnswerNeedsReview}, not marked ${summary.shortAnswerUnrated}.`}
        </Text>
        <Text style={styles.progressMuted}>
          {`Flashcards reviewed ${summary.flashcardsReviewed}: known ${summary.flashcardsKnown}, needs revision ${summary.flashcardsNeedsRevision}.`}
        </Text>
        {summary.mcqAccuracyPercent === null ? (
          <Text style={styles.progressNote}>
            MCQ accuracy appears after a submitted MCQ quiz. It is compared with the model's marked option, not an external grade.
          </Text>
        ) : null}
      </Card>
      <SectionLabel>Recent learning activity</SectionLabel>
      {recent.length === 0 ? (
        <EmptyNote>No study activity yet. Import notes or finish a quiz to start a history.</EmptyNote>
      ) : (
        recent.map(activity => (
          <Card key={activity.id}>
            <Text style={styles.activityTitle}>{activity.label}</Text>
            <Text style={styles.activityTime}>{formatWhen(activity.at)}</Text>
          </Card>
        ))
      )}
      <SectionLabel>Weak topics</SectionLabel>
      <BodyText>{COACH_METHOD_NOTE}</BodyText>
      {recommendations.length === 0 ? (
        <EmptyNote>No weak topics yet. They are calculated from recorded MCQ results.</EmptyNote>
      ) : (
        recommendations.map(item => (
          <Card key={item.topic}>
            <Text style={styles.topicTitle}>{item.topic}</Text>
            <Text style={styles.topicReason}>{item.reason}</Text>
          </Card>
        ))
      )}
      <SectionLabel>Revision recommendations</SectionLabel>
      {cards.length === 0 ? (
        <EmptyNote>No flashcards are marked for revision.</EmptyNote>
      ) : (
        cards.map(card => (
          <Card key={`${card.id}-${card.front}`}>
            <Text style={styles.cardTitle}>{card.front}</Text>
            <Text style={styles.cardMeta}>Marked needs revision</Text>
          </Card>
        ))
      )}
      {savedDraft || draftUnreadable ? (
        <Card>
          <SectionLabel>Unfinished quiz</SectionLabel>
          {savedDraft ? (
            <Text style={styles.progressBody}>
              {`A ${savedDraft.kind.replace('_', ' ')} quiz is saved on this device at question ${savedDraft.index + 1} of ${savedDraft.items.length}.`}
            </Text>
          ) : (
            <Text style={styles.progressBody}>
              An unfinished quiz file is on this device, but it could not be read. Discard removes that file only.
            </Text>
          )}
          {savedDraft ? <PrimaryButton title="Resume quiz" onPress={onResumeDraft} /> : null}
          <SecondaryButton title="Discard unfinished quiz" onPress={onDiscardDraft} />
        </Card>
      ) : null}
      <SectionLabel>Continue</SectionLabel>
      <PrimaryButton title="Tutor" onPress={onOpenTutor} />
      <SecondaryButton title="Library" onPress={onOpenLibrary} />
      <SecondaryButton title="Assessment" onPress={onOpenAssessment} />
      <SecondaryButton title="Learning Coach" onPress={onOpenCoach} />
      <SecondaryButton title="Search documents" onPress={onOpenSearch} />
      <SecondaryButton title="Study tools" onPress={onOpenTools} />
      <SecondaryButton title="Settings" onPress={onOpenSettings} />
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  progressBody: {
    color: colors.ink,
    fontSize: 15,
    lineHeight: 22,
  },
  progressMuted: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 6,
  },
  progressNote: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
  },
  activityTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '700',
  },
  activityTime: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 4,
  },
  topicTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '700',
  },
  topicReason: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
  },
  cardTitle: {
    color: colors.ink,
    fontSize: 15,
  },
  cardMeta: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 4,
  },
});
