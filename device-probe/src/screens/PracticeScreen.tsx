import { useState } from 'react';
import { Text } from 'react-native';
import type { LibraryDocument } from '../../../src/ai/documentLibrary';
import { chunksFromStudyMaterials } from '../../../src/ai/assessmentGenerator';
import type { Difficulty } from '../../../src/ai/assessment/adaptiveDifficulty';
import { generateExtractiveQuiz, type ExtractiveQuestion } from '../../../src/ai/assessment/extractiveQuiz';
import { gradeExtractiveAnswer, recordQuizAttempt, suggestedDifficulty, weakTopics } from '../../../src/ai/persistence/quizRepository';
import { BodyText, Card, EmptyNote, Notice, PrimaryButton, ScreenFrame, SecondaryButton, SectionLabel, TextField } from '../ui';
import { colors, createLocalId } from '../theme';
import { localDay } from '../offline/dayKey';
import { openStudyDatabase, studyDatabaseError } from '../offline/studyDatabase';

export function PracticeScreen({ document, onBack }: { document: LibraryDocument | undefined; onBack: () => void }) {
  const [difficulty, setDifficulty] = useState<Difficulty>('beginner');
  const [count, setCount] = useState(3);
  const [topic, setTopic] = useState('');
  const [questions, setQuestions] = useState<ExtractiveQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [note, setNote] = useState<string | undefined>(undefined);
  const [result, setResult] = useState<string | undefined>(undefined);
  const [startedAt, setStartedAt] = useState<number | undefined>(undefined);

  async function prepare(level?: Difficulty) {
    if (!document) {
      setNote('Choose a document before building a quiz. No questions were invented.');
      return;
    }
    const db = await openStudyDatabase();
    const chosen = level ?? (db ? await suggestedDifficulty(db, topic.trim() || document.title) : difficulty);
    setDifficulty(chosen);
    let chunks;
    try {
      chunks = chunksFromStudyMaterials(document.materials);
    } catch (error) {
      setNote(error instanceof Error ? error.message : String(error));
      return;
    }
    const quiz = generateExtractiveQuiz(chunks, {
      count,
      difficulty: chosen,
      topic: topic.trim() || undefined,
      idFor: index => createLocalId(`q${index}`),
    });
    setQuestions(quiz.questions);
    setAnswers({});
    setResult(undefined);
    setStartedAt(Date.now());
    setNote(quiz.note ?? (quiz.questions.length === 0 ? 'The document did not contain a sentence this quiz can use.' : `Difficulty ${chosen} comes from stored results for this topic when they exist.`));
  }

  async function submit() {
    if (!document || questions.length === 0 || startedAt === undefined) {
      return;
    }
    const db = await openStudyDatabase();
    if (!db) {
      setNote(studyDatabaseError() ?? 'The score was not saved because the database is unavailable.');
      return;
    }
    const graded = questions.map(question => ({
      question,
      studentAnswer: answers[question.id] ?? '',
      correct: gradeExtractiveAnswer(question, answers[question.id] ?? ''),
    }));
    const topicName = topic.trim() || document.title;
    const attempt = await recordQuizAttempt(db, {
      id: createLocalId('attempt'),
      topic: topicName,
      difficulty,
      createdAt: new Date().toISOString(),
      dayKey: localDay(),
      timeMs: Date.now() - startedAt,
      answers: graded,
      questionIds: questions.map(question => question.id),
      documentId: document.id,
      documentName: document.title,
    });
    const weak = (await weakTopics(db)).filter(item => item.topic === topicName);
    const next = await suggestedDifficulty(db, topicName);
    setResult(
      `${attempt.questionCount} questions, ${attempt.correctCount} correct, ${attempt.incorrectCount} incorrect, ${attempt.scorePercent.toFixed(0)}%, ${(attempt.timeMs / 1000).toFixed(0)} seconds. Next difficulty for this topic: ${next}. ${
        weak.length > 0 ? 'This topic is currently a weak area from the stored answers.' : 'This topic is not in the weak-topic list.'
      }`,
    );
  }

  return (
    <ScreenFrame title="Adaptive practice" onBack={onBack}>
      <BodyText>
        Questions are sentences taken from the selected document. Two correct stored answers raise the next difficulty. Two incorrect answers lower it. The score is the share of answers that match the source sentence.
      </BodyText>
      {document ? <Notice>{document.title}</Notice> : <EmptyNote>No document is selected.</EmptyNote>}
      <TextField value={topic} onChangeText={setTopic} placeholder="Topic or chapter name" />
      <SecondaryButton title="Beginner" selected={difficulty === 'beginner'} onPress={() => void prepare('beginner')} />
      <SecondaryButton title="Intermediate" selected={difficulty === 'intermediate'} onPress={() => void prepare('intermediate')} />
      <SecondaryButton title="Advanced" selected={difficulty === 'advanced'} onPress={() => void prepare('advanced')} />
      <SecondaryButton title="3 questions" selected={count === 3} onPress={() => setCount(3)} />
      <SecondaryButton title="5 questions" selected={count === 5} onPress={() => setCount(5)} />
      <PrimaryButton title="Use stored difficulty" onPress={() => void prepare()} disabled={!document} />
      {note ? <Notice>{note}</Notice> : null}
      {questions.map((question, index) => (
        <Card key={question.id}>
          <Text style={{ color: colors.ink, fontWeight: '700' }}>{`${index + 1}. ${question.prompt}`}</Text>
          <Text style={{ color: colors.muted, marginVertical: 4 }}>
            {`${question.source.documentName}${question.source.pageNumber !== undefined ? `, page ${question.source.pageNumber}` : ''}`}
          </Text>
          {question.kind === 'true_false' ? (
            <>
              <SecondaryButton title="True" selected={answers[question.id] === 'true'} onPress={() => setAnswers(current => ({ ...current, [question.id]: 'true' }))} />
              <SecondaryButton title="False" selected={answers[question.id] === 'false'} onPress={() => setAnswers(current => ({ ...current, [question.id]: 'false' }))} />
            </>
          ) : question.options ? (
            question.options.map((option, optionIndex) => (
              <SecondaryButton
                key={option}
                title={option}
                selected={answers[question.id] === String(optionIndex)}
                onPress={() => setAnswers(current => ({ ...current, [question.id]: String(optionIndex) }))}
              />
            ))
          ) : (
            <TextField
              value={answers[question.id] ?? ''}
              onChangeText={value => setAnswers(current => ({ ...current, [question.id]: value }))}
              placeholder="Short answer"
            />
          )}
        </Card>
      ))}
      {questions.length > 0 ? <PrimaryButton title="Score and save" onPress={() => void submit()} /> : null}
      {result ? <Notice>{result}</Notice> : null}
    </ScreenFrame>
  );
}
