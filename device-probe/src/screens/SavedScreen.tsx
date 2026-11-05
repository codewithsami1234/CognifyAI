import { useState } from 'react';
import { Alert, Text } from 'react-native';
import {
  clearSavedKnowledge,
  deleteBookmark,
  deleteNote,
  saveNote,
  searchSavedKnowledge,
  updateNote,
  type BookmarkItem,
  type SavedItem,
} from '../../../src/ai/persistence/knowledgeRepository';
import { BodyText, Card, EmptyNote, Notice, PrimaryButton, ScreenFrame, SecondaryButton, SectionLabel, TextField } from '../ui';
import { colors, createLocalId } from '../theme';
import { openStudyDatabase, studyDatabaseError } from '../offline/studyDatabase';

export function SavedScreen({ onBack }: { onBack: () => void }) {
  const [query, setQuery] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [topic, setTopic] = useState('');
  const [editId, setEditId] = useState<string | undefined>(undefined);
  const [editBody, setEditBody] = useState('');
  const [note, setNote] = useState<string | undefined>(undefined);
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([]);
  const [notes, setNotes] = useState<SavedItem[]>([]);

  async function load() {
    const db = await openStudyDatabase();
    if (!db) {
      setNote(studyDatabaseError() ?? 'Saved items need the local database.');
      return;
    }
    const found = await searchSavedKnowledge(db, query);
    setBookmarks(found.bookmarks);
    setNotes(found.notes);
  }

  async function addNote() {
    const db = await openStudyDatabase();
    if (!db) {
      setNote(studyDatabaseError() ?? 'The note was not saved.');
      return;
    }
    try {
      await saveNote(db, {
        id: createLocalId('note'),
        title,
        body,
        topic,
        createdAt: new Date().toISOString(),
      });
      setTitle('');
      setBody('');
      setNote('The note is stored on this device.');
      await load();
    } catch (error) {
      setNote(error instanceof Error ? error.message : String(error));
    }
  }

  async function saveEdit() {
    if (!editId) {
      return;
    }
    const db = await openStudyDatabase();
    if (!db) {
      return;
    }
    const saved = await updateNote(db, editId, { body: editBody, updatedAt: new Date().toISOString() });
    setNote(saved ? 'The note was updated.' : 'The note could not be updated.');
    setEditId(undefined);
    await load();
  }

  function remove(kind: 'note' | 'bookmark', id: string) {
    Alert.alert('Delete saved item', 'This removes the selected item from this phone.', [
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
            if (kind === 'note') {
              await deleteNote(db, id);
            } else {
              await deleteBookmark(db, id);
            }
            await load();
          })();
        },
      },
    ]);
  }

  return (
    <ScreenFrame title="Saved knowledge" onBack={onBack}>
      <BodyText>Bookmarks and notes stay in the local database. A blank search lists what is saved. A word limits the list to matching titles, text, and topics.</BodyText>
      <TextField value={query} onChangeText={setQuery} placeholder="Search saved knowledge" />
      <PrimaryButton title="Search saved items" onPress={() => void load()} />
      {note ? <Notice>{note}</Notice> : null}
      <SectionLabel>New note</SectionLabel>
      <TextField value={title} onChangeText={setTitle} placeholder="Title" />
      <TextField value={topic} onChangeText={setTopic} placeholder="Topic" />
      <TextField value={body} onChangeText={setBody} placeholder="Note" multiline />
      <SecondaryButton title="Save note" onPress={() => void addNote()} />
      <SectionLabel>Bookmarks</SectionLabel>
      {bookmarks.length === 0 ? <EmptyNote>No bookmarks match this search.</EmptyNote> : null}
      {bookmarks.map(item => (
        <Card key={item.id}>
          <Text style={{ color: colors.ink, fontWeight: '700' }}>{item.title}</Text>
          <Text style={{ color: colors.muted }}>{item.topic ?? 'No topic'}</Text>
          <Text style={{ color: colors.ink, marginTop: 6 }}>{item.body}</Text>
          <SecondaryButton title="Delete bookmark" onPress={() => remove('bookmark', item.id)} />
        </Card>
      ))}
      <SectionLabel>Notes</SectionLabel>
      {notes.length === 0 ? <EmptyNote>No notes match this search.</EmptyNote> : null}
      {notes.map(item => (
        <Card key={item.id}>
          <Text style={{ color: colors.ink, fontWeight: '700' }}>{item.title}</Text>
          <Text style={{ color: colors.muted }}>{item.topic ?? 'No topic'}</Text>
          <Text style={{ color: colors.ink, marginTop: 6 }}>{item.body}</Text>
          <SecondaryButton
            title="Edit"
            onPress={() => {
              setEditId(item.id);
              setEditBody(item.body);
            }}
          />
          <SecondaryButton title="Delete note" onPress={() => remove('note', item.id)} />
        </Card>
      ))}
      {editId ? (
        <Card>
          <TextField value={editBody} onChangeText={setEditBody} placeholder="Updated note" multiline />
          <PrimaryButton title="Save edit" onPress={() => void saveEdit()} />
        </Card>
      ) : null}
      <SecondaryButton
        title="Clear saved knowledge"
        onPress={() => {
          Alert.alert('Clear saved knowledge', 'This deletes bookmarks and notes. Documents and quiz results stay.', [
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
                  await clearSavedKnowledge(db);
                  await load();
                })();
              },
            },
          ]);
        }}
      />
    </ScreenFrame>
  );
}
