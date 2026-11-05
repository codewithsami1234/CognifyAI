import { useState } from 'react';
import { Text } from 'react-native';
import { buildLearningAnalytics, type LearningAnalytics } from '../../../src/ai/persistence/analyticsRepository';
import { BodyText, Card, EmptyNote, Meter, Notice, PrimaryButton, ScreenFrame, SectionLabel, StatGrid, TextField } from '../ui';
import { colors } from '../theme';
import { localDay } from '../offline/dayKey';
import { openStudyDatabase, studyDatabaseError } from '../offline/studyDatabase';

function hours(ms: number): string {
  return `${(ms / 3600000).toFixed(1)} h`;
}

export function AnalyticsScreen({ onBack }: { onBack: () => void }) {
  const [fromDay, setFromDay] = useState('');
  const [toDay, setToDay] = useState('');
  const [report, setReport] = useState<LearningAnalytics | undefined>(undefined);
  const [note, setNote] = useState<string | undefined>(undefined);

  async function load() {
    const db = await openStudyDatabase();
    if (!db) {
      setNote(studyDatabaseError() ?? 'Analytics need the local database.');
      setReport(undefined);
      return;
    }
    const range =
      fromDay.trim().length > 0 && toDay.trim().length > 0 ? { fromDay: fromDay.trim(), toDay: toDay.trim() } : undefined;
    setReport(await buildLearningAnalytics(db, localDay(), range));
    setNote(undefined);
  }

  const weekMax = Math.max(1, ...(report?.weekly.map(day => day.studyMs) ?? [1]));
  const quizMax = 100;

  return (
    <ScreenFrame title="Analytics" onBack={onBack}>
      <BodyText>Every number below is counted from rows in the local database. If you have not studied, the charts stay empty.</BodyText>
      <TextField value={fromDay} onChangeText={setFromDay} placeholder="From day YYYY-MM-DD" />
      <TextField value={toDay} onChangeText={setToDay} placeholder="To day YYYY-MM-DD" />
      <PrimaryButton title="Calculate" onPress={() => void load()} />
      {note ? <Notice>{note}</Notice> : null}
      {!report ? <EmptyNote>Calculate to read the stored study records.</EmptyNote> : null}
      {report?.empty ? <EmptyNote>No closed study session, question, quiz, review, or topic row is stored for this range.</EmptyNote> : null}
      {report && !report.empty ? (
        <>
          <StatGrid
            items={[
              { label: 'Sessions', value: String(report.studySessions) },
              { label: 'Study time', value: hours(report.studyMs) },
              { label: 'Documents', value: String(report.documentsStudied) },
              { label: 'Questions', value: String(report.questionsAsked) },
              { label: 'Quizzes', value: String(report.quizzesCompleted) },
              { label: 'Average score', value: report.averageQuizScore === null ? 'None' : `${report.averageQuizScore.toFixed(0)}%` },
              { label: 'Cards reviewed', value: String(report.flashcardsReviewed) },
              { label: 'Streak', value: String(report.streakDays) },
            ]}
          />
          <SectionLabel>Weekly study time</SectionLabel>
          {report.weekly.length === 0 ? <EmptyNote>No dated activity is stored.</EmptyNote> : null}
          <Card>
            {report.weekly.map(day => (
              <Meter key={day.day} label={`${day.day} · ${(day.studyMs / 60000).toFixed(0)} min`} value={day.studyMs} max={weekMax} />
            ))}
          </Card>
          <SectionLabel>Quiz scores</SectionLabel>
          {report.quizScores.length === 0 ? <EmptyNote>No quiz result is stored.</EmptyNote> : null}
          <Card>
            {report.quizScores.map(quiz => (
              <Meter key={`${quiz.at}-${quiz.topic}`} label={`${quiz.topic} · ${quiz.percent.toFixed(0)}%`} value={quiz.percent} max={quizMax} />
            ))}
          </Card>
          <SectionLabel>Topics</SectionLabel>
          {report.topicBars.length === 0 ? <EmptyNote>No topic score is stored.</EmptyNote> : null}
          {report.topicBars.map(topic => (
            <Card key={topic.topic}>
              <Meter label={`${topic.topic} · ${(topic.accuracy * 100).toFixed(0)}%`} value={topic.accuracy} max={1} />
              <Text style={{ color: colors.muted }}>{`Correct ${topic.correct}, incorrect ${topic.incorrect}.`}</Text>
            </Card>
          ))}
          <SectionLabel>Weak topics</SectionLabel>
          {report.weakTopics.length === 0 ? <EmptyNote>No topic is at or below 60% from stored answers.</EmptyNote> : null}
          {report.weakTopics.map(topic => (
            <Card key={topic.topic}>
              <Text style={{ color: colors.ink }}>{`${topic.topic} · ${(topic.accuracy * 100).toFixed(0)}% of ${topic.attempted}`}</Text>
            </Card>
          ))}
          <SectionLabel>Strong topics</SectionLabel>
          {report.strongTopics.length === 0 ? <EmptyNote>No topic is above 60% yet.</EmptyNote> : null}
          {report.strongTopics.map(topic => (
            <Card key={topic.topic}>
              <Text style={{ color: colors.ink }}>{`${topic.topic} · ${(topic.accuracy * 100).toFixed(0)}% of ${topic.attempted}`}</Text>
            </Card>
          ))}
        </>
      ) : null}
    </ScreenFrame>
  );
}
