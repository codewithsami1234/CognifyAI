import { useState } from 'react';
import { Text } from 'react-native';
import { createLexiconEmbedder } from '../../../src/ai/embeddings/lexiconEmbedder';
import { searchStoredChunks } from '../../../src/ai/embeddings/indexChunks';
import { recordSearch } from '../../../src/ai/persistence/historyRepository';
import { BodyText, Card, EmptyNote, Notice, PrimaryButton, ScreenFrame, SecondaryButton, SectionLabel, TextField } from '../ui';
import { colors, createLocalId } from '../theme';
import { localDay } from '../offline/dayKey';
import { openStudyDatabase, studyDatabaseError } from '../offline/studyDatabase';

const embedder = createLexiconEmbedder();

export function SearchScreen({ onBack }: { onBack: () => void }) {
  const [query, setQuery] = useState('');
  const [topK, setTopK] = useState(5);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | undefined>(undefined);
  const [hits, setHits] = useState<
    Array<{ id: string; documentName: string; page?: number; text: string; channels: string; cosine?: number }>
  >([]);

  async function search() {
    setBusy(true);
    setMessage(undefined);
    setHits([]);
    try {
      const db = await openStudyDatabase();
      if (!db) {
        setMessage(studyDatabaseError() ?? 'Search cannot run because the local database is unavailable.');
        return;
      }
      const result = await searchStoredChunks(db, embedder, query, { topK });
      if (result.outcome === 'empty_query') {
        setMessage('Enter a question or some words. An empty search is not sent anywhere.');
        return;
      }
      if (result.semanticStatus === 'missing_embeddings' && result.hits.length === 0) {
        setMessage('No lexicon embeddings are stored yet. Open a document so it can be indexed, then search again.');
      } else if (result.outcome === 'no_matches') {
        setMessage('No stored passage cleared the keyword match or the similarity threshold.');
      } else if (result.semanticStatus === 'missing_embeddings') {
        setMessage('Keyword matches are shown. Semantic scores are missing because those passages have no embedding yet.');
      } else if (result.semanticStatus === 'below_threshold') {
        setMessage('Embeddings exist, but none were similar enough. Keyword matches are still listed when they exist.');
      }
      setHits(
        result.hits.map(hit => {
          const row: { id: string; documentName: string; page?: number; text: string; channels: string; cosine?: number } = {
            id: hit.chunk.chunkId,
            documentName: hit.chunk.documentName,
            text: hit.chunk.text,
            channels: hit.channels.join(' and '),
          };
          if (typeof hit.chunk.pageNumber === 'number') {
            row.page = hit.chunk.pageNumber;
          }
          if (typeof hit.cosine === 'number') {
            row.cosine = hit.cosine;
          }
          return row;
        }),
      );
      await recordSearch(db, {
        id: createLocalId('search'),
        query,
        mode: 'hybrid',
        resultCount: result.hits.length,
        createdAt: new Date().toISOString(),
        dayKey: localDay(),
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScreenFrame title="Search" onBack={onBack}>
      <BodyText>
        Search uses stored passages. Keyword matching and the on-device lexicon embedding stay separate until their ranks are combined. Nothing is sent off this phone.
      </BodyText>
      <TextField value={query} onChangeText={setQuery} placeholder="Ask in your own words" multiline />
      <SectionLabel>Results to keep</SectionLabel>
      <SecondaryButton title="3" selected={topK === 3} onPress={() => setTopK(3)} />
      <SecondaryButton title="5" selected={topK === 5} onPress={() => setTopK(5)} />
      <SecondaryButton title="8" selected={topK === 8} onPress={() => setTopK(8)} />
      <PrimaryButton title={busy ? 'Searching' : 'Search documents'} onPress={() => void search()} disabled={busy} />
      {message ? <Notice>{message}</Notice> : null}
      {hits.length === 0 && !message ? <EmptyNote>No search has been run in this visit.</EmptyNote> : null}
      {hits.map(hit => (
        <Card key={hit.id}>
          <Text style={{ color: colors.ink, fontWeight: '700', fontSize: 15 }}>{hit.documentName}</Text>
          <Text style={{ color: colors.muted, marginTop: 4 }}>
            {`${hit.page !== undefined ? `Page ${hit.page}` : 'No page number was stored'}. Matched by ${hit.channels}${
              hit.cosine !== undefined ? `. Cosine ${hit.cosine.toFixed(2)}` : ''
            }.`}
          </Text>
          <Text style={{ color: colors.ink, marginTop: 8, lineHeight: 20 }}>{hit.text}</Text>
        </Card>
      ))}
    </ScreenFrame>
  );
}
