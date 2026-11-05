import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { migrateCognifyDb } from "../sql/migrate";
import { openNodeSqlite } from "../sql/nodeSqlite";
import {
  addMessage,
  clearConversationHistory,
  createConversation,
  deleteConversation,
  listConversations,
  listMessages,
  listRecentDocuments,
  recordDocumentOpen,
  recordSearch,
  renameConversation,
  resumeTranscript,
  searchConversations,
  searchPastQueries,
} from "../persistence/historyRepository";
import { deleteBookmark, deleteNote, listTopics, saveBookmark, saveNote, searchSavedKnowledge, updateNote } from "../persistence/knowledgeRepository";

async function openFile(): Promise<{ file: string; db: ReturnType<typeof openNodeSqlite> }> {
  const file = path.join(os.tmpdir(), `cognify-history-${Date.now()}-${Math.floor(Math.random() * 1e6)}.db`);
  const db = openNodeSqlite(file);
  await migrateCognifyDb(db, "2026-11-04T12:00:00.000Z");
  return { file, db };
}

describe("learning history", () => {
  it("saves, renames, searches, resumes, and deletes a conversation", async () => {
    const { file, db } = await openFile();
    await createConversation(db, {
      id: "c1",
      title: "Chlorophyll",
      createdAt: "2026-11-04T12:00:00.000Z",
      documentId: "notes-cell",
      documentName: "Cell Energy Notes",
    });
    await addMessage(db, {
      id: "m1",
      conversationId: "c1",
      role: "user",
      content: "What does chlorophyll absorb?",
      createdAt: "2026-11-04T12:00:01.000Z",
    });
    await addMessage(db, {
      id: "m2",
      conversationId: "c1",
      role: "assistant",
      content: "The notes say chlorophyll can absorb light.",
      createdAt: "2026-11-04T12:00:02.000Z",
      grounded: true,
      sources: [{ documentId: "notes-cell", documentName: "Cell Energy Notes", chunkId: "photo", pageNumber: 2 }],
    });
    assert.equal(await renameConversation(db, "c1", "Light absorption", "2026-11-04T12:05:00.000Z"), true);
    assert.equal((await listConversations(db))[0]?.title, "Light absorption");
    assert.equal((await searchConversations(db, "absorb")).length, 1);
    assert.equal((await listMessages(db, "c1"))[1]?.sources[0]?.pageNumber, 2);
    assert.match(resumeTranscript(await listMessages(db, "c1")), /Student: What does chlorophyll absorb/);
    db.close();

    const reopened = openNodeSqlite(file);
    await migrateCognifyDb(reopened, "2026-11-04T13:00:00.000Z");
    assert.equal((await listConversations(reopened))[0]?.title, "Light absorption");
    assert.equal((await listMessages(reopened, "c1")).length, 2);
    assert.equal(await deleteConversation(reopened, "c1"), true);
    assert.equal((await listMessages(reopened, "c1")).length, 0);
    assert.equal(await deleteConversation(reopened, "c1"), false);
    reopened.close();
    fs.unlinkSync(file);
  });

  it("stores search queries and the last reading position", async () => {
    const { file, db } = await openFile();
    await recordSearch(db, {
      id: "s1",
      query: "How do computers learn?",
      mode: "hybrid",
      resultCount: 1,
      createdAt: "2026-11-04T12:00:00.000Z",
      dayKey: "2026-11-04",
    });
    await recordSearch(db, {
      id: "s-empty",
      query: "   ",
      mode: "hybrid",
      resultCount: 0,
      createdAt: "2026-11-04T12:00:01.000Z",
      dayKey: "2026-11-04",
    });
    assert.equal((await searchPastQueries(db, "computers")).length, 1);
    assert.equal((await searchPastQueries(db, "computers"))[0]?.query, "How do computers learn?");
    await recordDocumentOpen(db, {
      documentId: "ml",
      documentName: "Machine Learning Notes",
      openedAt: "2026-11-04T12:10:00.000Z",
      dayKey: "2026-11-04",
      pageNumber: 4,
      section: "Training",
    });
    assert.equal((await listRecentDocuments(db))[0]?.lastPage, 4);
    await clearConversationHistory(db);
    db.close();
    fs.unlinkSync(file);
  });
});

describe("saved knowledge", () => {
  it("saves a bookmark, edits a note, searches, and deletes", async () => {
    const { file, db } = await openFile();
    await saveBookmark(db, {
      id: "b1",
      kind: "answer",
      title: "Chlorophyll",
      body: "Chlorophyll can absorb light.",
      createdAt: "2026-11-04T12:00:00.000Z",
      topic: "Photosynthesis",
      documentName: "Cell Energy Notes",
      pageNumber: 2,
    });
    await saveNote(db, {
      id: "n1",
      title: "My definition",
      body: "Glucose is produced in the Calvin cycle.",
      createdAt: "2026-11-04T12:01:00.000Z",
      topic: "Photosynthesis",
      documentId: "notes-cell",
      documentName: "Cell Energy Notes",
    });
    assert.equal(await updateNote(db, "n1", { body: "Glucose is a sugar produced in the Calvin cycle.", updatedAt: "2026-11-04T12:02:00.000Z" }), true);
    const found = await searchSavedKnowledge(db, "sugar");
    assert.equal(found.notes.length, 1);
    assert.equal(found.notes[0]?.body.includes("sugar"), true);
    assert.deepEqual(await listTopics(db), ["Photosynthesis"]);
    assert.equal(await deleteNote(db, "n1"), true);
    assert.equal(await deleteBookmark(db, "b1"), true);
    assert.equal((await searchSavedKnowledge(db, "sugar")).notes.length, 0);
    db.close();
    fs.unlinkSync(file);
  });
});
