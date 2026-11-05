import { useState } from 'react';
import { Text } from 'react-native';
import type { LibraryDocument } from '../../../src/ai/documentLibrary';
import { chunksFromStudyMaterials } from '../../../src/ai/assessmentGenerator';
import {
  buildStudyPlan,
  completePlanItem,
  loadStudyPlan,
  planCompletionIds,
  saveStudyPlan,
  type StudyPlan,
} from '../../../src/ai/persistence/coachPlan';
import { BodyText, Card, EmptyNote, Notice, PrimaryButton, ScreenFrame, SecondaryButton, SectionLabel } from '../ui';
import { colors, createLocalId } from '../theme';
import { ListenBar } from '../offline/ListenBar';
import { openStudyDatabase, studyDatabaseError } from '../offline/studyDatabase';

export function StudyPlanScreen({ documents, onBack }: { documents: readonly LibraryDocument[]; onBack: () => void }) {
  const [plan, setPlan] = useState<StudyPlan | undefined>(undefined);
  const [done, setDone] = useState<string[]>([]);
  const [note, setNote] = useState<string | undefined>(undefined);
  const [horizon, setHorizon] = useState<'daily' | 'weekly'>('daily');

  async function build() {
    const db = await openStudyDatabase();
    if (!db) {
      setNote(studyDatabaseError() ?? 'A plan was not created because the database is unavailable.');
      return;
    }
    const chunks = documents.flatMap(document => {
      try {
        return chunksFromStudyMaterials(document.materials);
      } catch {
        return [];
      }
    });
    const now = new Date().toISOString();
    const next = await buildStudyPlan(db, {
      id: createLocalId('plan'),
      horizon,
      createdAt: now,
      nowIso: now,
      chunks,
    });
    if (!next.emptyReason) {
      await saveStudyPlan(db, next);
    }
    setPlan(next);
    setDone(next.emptyReason ? [] : await planCompletionIds(db, next.id));
    setNote(next.emptyReason ?? 'The plan uses stored weak topics, due cards, recent documents, and recent searches.');
  }

  async function reload() {
    const db = await openStudyDatabase();
    if (!db || !plan) {
      return;
    }
    const stored = await loadStudyPlan(db, plan.id);
    if (!stored) {
      setNote('That plan is not in the database.');
      return;
    }
    setPlan(stored);
    setDone(await planCompletionIds(db, stored.id));
  }

  async function complete(itemId: string) {
    const db = await openStudyDatabase();
    if (!db || !plan) {
      return;
    }
    const saved = await completePlanItem(db, plan.id, itemId, new Date().toISOString());
    setNote(saved ? 'Completion was saved on this device.' : 'That item is not part of the stored plan.');
    setDone(await planCompletionIds(db, plan.id));
  }

  const spoken = plan && !plan.emptyReason ? plan.items.map(item => item.title).join('. ') : '';

  return (
    <ScreenFrame title="Study plan" onBack={onBack}>
      <BodyText>A plan is created only from activity stored on this phone. If there is no weak topic, due card, recent document, or recent search, the screen says so and does not invent a task.</BodyText>
      <SecondaryButton title="Daily" selected={horizon === 'daily'} onPress={() => setHorizon('daily')} />
      <SecondaryButton title="Weekly" selected={horizon === 'weekly'} onPress={() => setHorizon('weekly')} />
      <PrimaryButton title="Build plan from my activity" onPress={() => void build()} />
      <SecondaryButton title="Reload this plan" onPress={() => void reload()} disabled={!plan || Boolean(plan.emptyReason)} />
      {note ? <Notice>{note}</Notice> : null}
      {!plan ? <EmptyNote>No plan has been built in this visit.</EmptyNote> : null}
      {plan?.emptyReason ? <EmptyNote>{plan.emptyReason}</EmptyNote> : null}
      {plan && !plan.emptyReason
        ? plan.items.map(item => (
            <Card key={item.id}>
              <SectionLabel>{item.kind.replace('_', ' ')}</SectionLabel>
              <Text style={{ color: colors.ink, fontWeight: '700' }}>{item.title}</Text>
              <Text style={{ color: colors.muted, marginTop: 4 }}>{item.detail}</Text>
              {item.pageNumber !== undefined ? <Text style={{ color: colors.muted }}>{`Page ${item.pageNumber}`}</Text> : null}
              <Text style={{ color: colors.muted }}>{done.includes(item.id) ? 'Completed' : 'Not completed'}</Text>
              <SecondaryButton title="Mark complete" onPress={() => void complete(item.id)} disabled={done.includes(item.id)} />
            </Card>
          ))
        : null}
      <ListenBar text={spoken} />
    </ScreenFrame>
  );
}
