import { useState } from 'react';
import { Text } from 'react-native';
import { createFlashcard, dueFlashcards, flashcardsFromPassage, newFlashcards, reviewFlashcard, reviewedFlashcards, type FlashcardRecord } from '../../../src/ai/persistence/flashcardRepository';
import type { SrsGrade } from '../../../src/ai/srs/sm2';
import { BodyText, Card, EmptyNote, Notice, PrimaryButton, ScreenFrame, SecondaryButton, SectionLabel, StatGrid, TextField } from '../ui';
import { colors, createLocalId, formatWhen } from '../theme';
import { openStudyDatabase, studyDatabaseError } from '../offline/studyDatabase';

export function FlashcardsScreen({ onBack }: { onBack: () => void }) {
  const [topic, setTopic] = useState('');
  const [passage, setPassage] = useState('');
  const [note, setNote] = useState<string | undefined>(undefined);
  const [due, setDue] = useState<FlashcardRecord[]>([]);
  const [fresh, setFresh] = useState<FlashcardRecord[]>([]);
  const [done, setDone] = useState<FlashcardRecord[]>([]);
  const [current, setCurrent] = useState<FlashcardRecord | undefined>(undefined);
  const [showBack, setShowBack] = useState(false);

  async function load() {
    const db = await openStudyDatabase();
    if (!db) {
      setNote(studyDatabaseError() ?? 'Flashcards need the local database.');
      return;
    }
    const filter = topic.trim().length > 0 ? topic.trim() : undefined;
    const now = new Date().toISOString();
    const dueRows = await dueFlashcards(db, now, filter);
    const newRows = (await newFlashcards(db)).filter(card => !filter || (card.topic ?? '').toLowerCase() === filter.toLowerCase());
    const reviewed = (await reviewedFlashcards(db)).filter(card => !filter || (card.topic ?? '').toLowerCase() === filter.toLowerCase());
    setDue(dueRows);
    setFresh(newRows);
    setDone(reviewed);
    setCurrent(previous => previous ?? dueRows[0] ?? newRows[0]);
  }

  async function createFromPassage() {
    const db = await openStudyDatabase();
    if (!db) {
      setNote(studyDatabaseError() ?? 'The cards were not saved.');
      return;
    }
    const drafts = flashcardsFromPassage({
      text: passage,
      topic: topic.trim() || undefined,
      sourceKind: 'passage',
      createdAt: new Date().toISOString(),
      idFor: index => createLocalId(`card${index}`),
    });
    if (drafts.length === 0) {
      setNote('No sentence was long enough to become a card. The passage was not turned into a placeholder card.');
      return;
    }
    for (const draft of drafts) {
      await createFlashcard(db, {
        id: draft.id,
        front: draft.front,
        back: draft.back,
        createdAt: draft.createdAt,
        sourceKind: draft.sourceKind,
        topic: draft.topic ?? undefined,
      });
    }
    setPassage('');
    setNote(`${drafts.length} card(s) were saved from the passage.`);
    await load();
  }

  async function grade(value: SrsGrade) {
    if (!current) {
      return;
    }
    const db = await openStudyDatabase();
    if (!db) {
      return;
    }
    const updated = await reviewFlashcard(db, current.id, value, new Date().toISOString());
    setNote(updated ? `Next review ${formatWhen(updated.schedule.dueAt)}.` : 'That card could not be updated.');
    setShowBack(false);
    setCurrent(undefined);
    await load();
  }

  return (
    <ScreenFrame title="Flashcards" onBack={onBack}>
      <BodyText>
        Review dates use SM-2. Again resets the repetition count. Hard, Good, and Easy schedule a later date from the card's ease and interval. Dates are stored on this phone.
      </BodyText>
      <TextField value={topic} onChangeText={setTopic} placeholder="Topic filter, exact topic name" />
      <PrimaryButton title="Load cards" onPress={() => void load()} />
      {note ? <Notice>{note}</Notice> : null}
      <StatGrid
        items={[
          { label: 'Due', value: String(due.length) },
          { label: 'New', value: String(fresh.length) },
          { label: 'Reviewed', value: String(done.length) },
        ]}
      />
      <SectionLabel>Review</SectionLabel>
      {current ? (
        <Card>
          <Text style={{ color: colors.ink, fontWeight: '700' }}>{current.front}</Text>
          <Text style={{ color: colors.muted, marginTop: 4 }}>{current.topic ?? 'No topic'}</Text>
          {showBack ? <Text style={{ color: colors.ink, marginTop: 8 }}>{current.back}</Text> : null}
          <SecondaryButton title="Show answer" onPress={() => setShowBack(true)} />
          <SecondaryButton title="Again" onPress={() => void grade('again')} />
          <SecondaryButton title="Hard" onPress={() => void grade('hard')} />
          <SecondaryButton title="Good" onPress={() => void grade('good')} />
          <SecondaryButton title="Easy" onPress={() => void grade('easy')} />
        </Card>
      ) : (
        <EmptyNote>Load cards to start a review. If nothing is due, there is no card to grade.</EmptyNote>
      )}
      <SectionLabel>Create from a passage</SectionLabel>
      <TextField value={passage} onChangeText={setPassage} placeholder="Paste a sentence from your notes" multiline />
      <SecondaryButton title="Save cards from this passage" onPress={() => void createFromPassage()} />
    </ScreenFrame>
  );
}
