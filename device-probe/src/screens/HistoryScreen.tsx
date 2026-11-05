import { useCallback, useState } from 'react';
import { Alert, Text } from 'react-native';
import {
  clearConversationHistory,
  clearDocumentHistory,
  clearSearchHistory,
  deleteConversation,
  listConversations,
  listMessages,
  listRecentDocuments,
  listSearches,
  renameConversation,
  searchConversations,
  type ConversationRecord,
  type MessageRecord,
} from '../../../src/ai/persistence/historyRepository';
import { BodyText, Card, EmptyNote, Notice, PrimaryButton, ScreenFrame, SecondaryButton, SectionLabel, TextField } from '../ui';
import { colors, formatWhen } from '../theme';
import { openStudyDatabase, studyDatabaseError } from '../offline/studyDatabase';

export function HistoryScreen({
  onBack,
  onResume,
  onOpenDocument,
}: {
  onBack: () => void;
  onResume: (conversationId: string, question: string) => void;
  onOpenDocument: (documentId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [rename, setRename] = useState('');
  const [note, setNote] = useState<string | undefined>(undefined);
  const [conversations, setConversations] = useState<ConversationRecord[]>([]);
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [selected, setSelected] = useState<string | undefined>(undefined);
  const [searches, setSearches] = useState<Array<{ id: string; query: string; createdAt: string; resultCount: number }>>([]);
  const [documents, setDocuments] = useState<Array<{ documentId: string; documentName: string; lastPage: number | null; openedAt: string }>>([]);

  const load = useCallback(async () => {
    const db = await openStudyDatabase();
    if (!db) {
      setNote(studyDatabaseError() ?? 'History is unavailable until the local database module is in this build.');
      return;
    }
    const found = query.trim().length > 0 ? await searchConversations(db, query) : await listConversations(db);
    setConversations(found);
    setSearches(await listSearches(db, 20));
    setDocuments(await listRecentDocuments(db, 20));
    if (selected) {
      setMessages(await listMessages(db, selected));
    }
  }, [query, selected]);

  async function openConversation(id: string) {
    setSelected(id);
    const db = await openStudyDatabase();
    if (!db) {
      return;
    }
    const rows = await listMessages(db, id);
    setMessages(rows);
    const title = conversations.find(item => item.id === id)?.title ?? '';
    setRename(title);
  }

  async function saveName() {
    if (!selected) {
      return;
    }
    const db = await openStudyDatabase();
    if (!db) {
      return;
    }
    const saved = await renameConversation(db, selected, rename, new Date().toISOString());
    setNote(saved ? 'The conversation name was saved on this device.' : 'That conversation could not be renamed.');
    await load();
  }

  function confirmDelete() {
    if (!selected) {
      return;
    }
    Alert.alert('Delete conversation', 'This removes the selected conversation and its messages from this phone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            const db = await openStudyDatabase();
            if (!db) {
              return;
            }
            await deleteConversation(db, selected);
            setSelected(undefined);
            setMessages([]);
            await load();
          })();
        },
      },
    ]);
  }

  function confirmClear(kind: 'conversations' | 'searches' | 'documents') {
    const label =
      kind === 'conversations' ? 'conversations' : kind === 'searches' ? 'search history' : 'recent-document history';
    Alert.alert('Clear history', `This deletes saved ${label}. Documents, notes, and model files stay on the phone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            const db = await openStudyDatabase();
            if (!db) {
              return;
            }
            if (kind === 'conversations') {
              await clearConversationHistory(db);
              setSelected(undefined);
              setMessages([]);
            } else if (kind === 'searches') {
              await clearSearchHistory(db);
            } else {
              await clearDocumentHistory(db);
            }
            await load();
          })();
        },
      },
    ]);
  }

  const lastQuestion = [...messages].reverse().find(message => message.role === 'user')?.content ?? '';

  return (
    <ScreenFrame title="History" onBack={onBack}>
      <BodyText>Conversations, searches, and opened documents are stored in the local database and remain after you leave this screen.</BodyText>
      <PrimaryButton title="Refresh" onPress={() => void load()} />
      {note ? <Notice>{note}</Notice> : null}
      <TextField value={query} onChangeText={setQuery} placeholder="Search conversation titles and messages" />
      <SecondaryButton title="Find conversations" onPress={() => void load()} />
      <SectionLabel>Conversations</SectionLabel>
      {conversations.length === 0 ? <EmptyNote>No conversations are stored yet. Ask the tutor after this database is available.</EmptyNote> : null}
      {conversations.map(item => (
        <Card key={item.id}>
          <Text style={{ color: colors.ink, fontWeight: '700' }}>{item.title}</Text>
          <Text style={{ color: colors.muted, marginTop: 4 }}>{formatWhen(item.updatedAt)}</Text>
          {item.documentName ? <Text style={{ color: colors.muted }}>{item.documentName}</Text> : null}
          <SecondaryButton title="Open" onPress={() => void openConversation(item.id)} />
        </Card>
      ))}
      {selected ? (
        <Card>
          <SectionLabel>Selected conversation</SectionLabel>
          {messages.map(message => (
            <Text key={message.id} style={{ color: colors.ink, marginBottom: 8 }}>
              {`${message.role === 'user' ? 'Student' : 'Tutor'}: ${message.content}`}
            </Text>
          ))}
          <TextField value={rename} onChangeText={setRename} placeholder="Conversation name" />
          <SecondaryButton title="Rename" onPress={() => void saveName()} />
          <SecondaryButton title="Delete this conversation" onPress={confirmDelete} />
          <PrimaryButton
            title="Continue in tutor"
            onPress={() => onResume(selected, lastQuestion)}
            disabled={lastQuestion.length === 0}
          />
        </Card>
      ) : null}
      <SecondaryButton title="Clear conversations" onPress={() => confirmClear('conversations')} />
      <SectionLabel>Searches</SectionLabel>
      {searches.length === 0 ? <EmptyNote>No searches have been saved.</EmptyNote> : null}
      {searches.map(item => (
        <Card key={item.id}>
          <Text style={{ color: colors.ink }}>{item.query}</Text>
          <Text style={{ color: colors.muted }}>{`${item.resultCount} result(s) · ${formatWhen(item.createdAt)}`}</Text>
        </Card>
      ))}
      <SecondaryButton title="Clear search history" onPress={() => confirmClear('searches')} />
      <SectionLabel>Recent documents</SectionLabel>
      {documents.length === 0 ? <EmptyNote>No document has been recorded as opened.</EmptyNote> : null}
      {documents.map(item => (
        <Card key={item.documentId}>
          <Text style={{ color: colors.ink, fontWeight: '700' }}>{item.documentName}</Text>
          <Text style={{ color: colors.muted }}>
            {`${item.lastPage !== null ? `Last page ${item.lastPage}` : 'No page was stored'} · ${formatWhen(item.openedAt)}`}
          </Text>
          <SecondaryButton title="Open document" onPress={() => onOpenDocument(item.documentId)} />
        </Card>
      ))}
      <SecondaryButton title="Clear document history" onPress={() => confirmClear('documents')} />
    </ScreenFrame>
  );
}
