import { useState } from 'react';
import { Text } from 'react-native';
import type { LibraryDocument } from '../../../src/ai/documentLibrary';
import type { ModelRuntime } from '../../../src/ai/modelRuntime';
import type { ModelStatus } from '../../../src/ai/aiTypes';
import { chunksFromStudyMaterials } from '../../../src/ai/assessmentGenerator';
import { answerFromDocuments, sourceLines, summarizeDocuments } from '../../../src/ai/documentChat';
import { createLexiconEmbedder } from '../../../src/ai/embeddings/lexiconEmbedder';
import { createFlashcard, flashcardsFromPassage } from '../../../src/ai/persistence/flashcardRepository';
import { saveBookmark } from '../../../src/ai/persistence/knowledgeRepository';
import { BodyText, Card, EmptyNote, Notice, PrimaryButton, ScreenFrame, SecondaryButton, SectionLabel, TextField } from '../ui';
import { colors, createLocalId } from '../theme';
import { ListenBar } from '../offline/ListenBar';
import { openStudyDatabase, studyDatabaseError } from '../offline/studyDatabase';

const embedder = createLexiconEmbedder();

export function DocumentChatScreen({
  document,
  runtime,
  ensureReady,
  onBack,
}: {
  document: LibraryDocument;
  runtime: ModelRuntime;
  ensureReady: () => Promise<ModelStatus>;
  onBack: () => void;
}) {
  const [question, setQuestion] = useState('');
  const [page, setPage] = useState('');
  const [passage, setPassage] = useState('');
  const [answer, setAnswer] = useState('');
  const [sources, setSources] = useState<string[]>([]);
  const [note, setNote] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  function pageNumber(): number | undefined {
    if (page.trim().length === 0) {
      return undefined;
    }
    const value = Number(page);
    if (!Number.isInteger(value) || value < 1) {
      return undefined;
    }
    return value;
  }

  async function ask(text = question) {
    setBusy(true);
    setAnswer('');
    setSources([]);
    try {
      const knownPage = page.trim().length === 0 ? undefined : pageNumber();
      if (page.trim().length > 0 && knownPage === undefined) {
        setNote('The page box is not a whole page number, so no page filter was applied and no page was guessed.');
      }
      const status = await ensureReady();
      if (status.state !== 'ready') {
        setNote(status.error?.message ?? 'The local model is not ready, so no answer was generated.');
        return;
      }
      const chunks = chunksFromStudyMaterials(document.materials);
      const scope = {
        documentId: document.id,
        ...(knownPage !== undefined ? { pageNumber: knownPage } : {}),
        ...(passage.trim().length > 0
          ? {
              passage: passage.trim(),
              passageDocumentName: document.title,
              ...(knownPage !== undefined ? { passagePageNumber: knownPage } : {}),
            }
          : {}),
      };
      const result = await answerFromDocuments(runtime, embedder, text, chunks, scope);
      setAnswer(result.answer.answer);
      setSources(sourceLines(result.answer.sources));
      setNote(
        result.grounded
          ? `This answer used retrieved text from ${document.title}. Retrieval: ${result.answer.retrievalMethod ?? result.retrieval.outcome}.`
          : 'The answer is not document-grounded. Retrieval did not return a supporting passage, or the model did not answer from it.',
      );
    } catch (error) {
      setNote(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function summarize() {
    setBusy(true);
    try {
      const status = await ensureReady();
      if (status.state !== 'ready') {
        setNote(status.error?.message ?? 'The local model is not ready, so no summary was generated.');
        return;
      }
      const chunks = chunksFromStudyMaterials(document.materials);
      const knownPage = pageNumber();
      const selected = knownPage === undefined ? chunks : chunks.filter(chunk => chunk.pageNumber === knownPage);
      if (selected.length === 0) {
        setNote('No stored section matches that page, so no summary was generated and no page was invented.');
        setAnswer('');
        setSources([]);
        return;
      }
      const result = await summarizeDocuments(runtime, selected);
      setAnswer(result.answer);
      setSources(sourceLines(result.sources));
      setNote(result.sources.length > 0 ? 'The summary was requested from the selected sections.' : 'No source was attached, so this summary is not marked as document-grounded.');
    } catch (error) {
      setNote(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function saveCards() {
    const text = passage.trim();
    if (text.length === 0) {
      setNote('Select a passage before creating cards. The model answer was not turned into a card by itself.');
      return;
    }
    const db = await openStudyDatabase();
    if (!db) {
      setNote(studyDatabaseError() ?? 'The cards were not saved.');
      return;
    }
    const knownPage = pageNumber();
    const drafts = flashcardsFromPassage({
      text,
      topic: document.title,
      documentId: document.id,
      documentName: document.title,
      pageNumber: knownPage,
      sourceKind: 'document',
      createdAt: new Date().toISOString(),
      idFor: index => createLocalId(`doccard${index}`),
    });
    for (const draft of drafts) {
      await createFlashcard(db, {
        id: draft.id,
        front: draft.front,
        back: draft.back,
        createdAt: draft.createdAt,
        sourceKind: draft.sourceKind,
        topic: draft.topic ?? undefined,
        documentId: draft.documentId ?? undefined,
        documentName: draft.documentName ?? undefined,
        pageNumber: draft.pageNumber ?? undefined,
      });
    }
    setNote(drafts.length === 0 ? 'No sentence in the passage was long enough to save.' : `${drafts.length} card(s) were saved.`);
  }

  async function bookmark() {
    if (answer.trim().length === 0 || sources.length === 0) {
      setNote('A bookmark is saved only after an answer has at least one retrieved source.');
      return;
    }
    const db = await openStudyDatabase();
    if (!db) {
      setNote(studyDatabaseError() ?? 'The bookmark was not saved.');
      return;
    }
    await saveBookmark(db, {
      id: createLocalId('bookmark'),
      kind: 'answer',
      title: question.trim().slice(0, 80) || document.title,
      body: answer,
      createdAt: new Date().toISOString(),
      topic: document.title,
      documentId: document.id,
      documentName: document.title,
      pageNumber: pageNumber(),
    });
    setNote('The answer was bookmarked on this device.');
  }

  return (
    <ScreenFrame title="Document chat" onBack={onBack}>
      <BodyText>{`Questions use the same grounded answer path as the tutor, limited to ${document.title}. A page number is used only when you enter one that this document stored.`}</BodyText>
      <TextField value={question} onChangeText={setQuestion} placeholder="Question about this document" multiline />
      <TextField value={page} onChangeText={setPage} placeholder="Page number, if you know it" />
      <TextField value={passage} onChangeText={setPassage} placeholder="Selected passage, optional" multiline />
      <PrimaryButton title={busy ? 'Working' : 'Ask about this document'} onPress={() => void ask()} disabled={busy} />
      <SecondaryButton title="Summarize the selection" onPress={() => void summarize()} disabled={busy} />
      <SecondaryButton
        title="Explain the passage"
        onPress={() => {
          const text = 'Explain the selected passage in simpler words.';
          setQuestion(text);
          void ask(text);
        }}
        disabled={busy || passage.trim().length === 0}
      />
      <SecondaryButton title="Save flashcards from the passage" onPress={() => void saveCards()} />
      <SecondaryButton title="Bookmark this answer" onPress={() => void bookmark()} />
      {note ? <Notice>{note}</Notice> : null}
      <SectionLabel>Answer</SectionLabel>
      {answer.length === 0 ? <EmptyNote>No answer has been generated for this visit.</EmptyNote> : null}
      {answer.length > 0 ? (
        <Card>
          <Text selectable style={{ color: colors.ink, lineHeight: 21 }}>{answer}</Text>
        </Card>
      ) : null}
      <SectionLabel>Sources</SectionLabel>
      {sources.length === 0 ? <EmptyNote>No source was returned.</EmptyNote> : null}
      {sources.map(line => (
        <Card key={line}>
          <Text style={{ color: colors.ink }}>{line}</Text>
        </Card>
      ))}
      <ListenBar text={answer} />
    </ScreenFrame>
  );
}
