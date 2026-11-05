import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PROCESS_TEXT, sampleStudyChunks } from "../fixtures/sampleStudyMaterial";
import { retrieveKeywords, stemStudyToken } from "../keywordRetrieval";
import type { DocumentChunk } from "../aiTypes";

describe("retrieveKeywords", () => {
  it("ranks the passage that shares more content terms first", () => {
    const result = retrieveKeywords("What does chlorophyll absorb?", sampleStudyChunks);
    assert.equal(result.outcome, "ranked");
    assert.deepEqual(result.queryTerms, ["chlorophyll", "absorb"]);
    assert.ok(result.ignoredTerms.includes("what"));
    assert.ok(result.ignoredTerms.includes("does"));
    assert.equal(result.hits[0]?.chunk.chunkId, "notes-cell:photo");
    assert.equal(result.hits[0]?.chunk.pageNumber, 2);
    assert.equal(result.hits[0]?.chunk.section, "Photosynthesis");
    assert.ok((result.hits[0]?.score ?? 0) > (result.hits[1]?.score ?? 0));
  });

  it("retrieves the operating-systems passage for a scheduler question", () => {
    const result = retrieveKeywords("How does the scheduler choose the next thread?", sampleStudyChunks);
    assert.equal(result.hits[0]?.chunk.documentName, "Operating Systems Notes");
    assert.equal(result.hits[0]?.chunk.pageNumber, 5);
    assert.equal(result.hits[0]?.chunk.section, "Processes");
  });

  it("caps repeated-term credit at three extra points", () => {
    const chunks: DocumentChunk[] = [
      {
        documentId: "a",
        documentName: "A",
        chunkId: "many",
        text: "mitosis mitosis mitosis mitosis mitosis",
      },
      {
        documentId: "a",
        documentName: "A",
        chunkId: "once",
        text: "mitosis occurs once in this sentence",
      },
    ];
    const result = retrieveKeywords("mitosis", chunks);
    assert.equal(result.hits[0]?.chunk.chunkId, "many");
    assert.equal(result.hits[0]?.score, 13);
    assert.equal(result.hits[1]?.score, 11);
  });

  it("keeps earlier chunks ahead when scores tie", () => {
    const chunks: DocumentChunk[] = [
      { documentId: "a", documentName: "A", chunkId: "first", text: "osmosis across a membrane" },
      { documentId: "a", documentName: "A", chunkId: "second", text: "osmosis in a cell" },
    ];
    const result = retrieveKeywords("osmosis", chunks);
    assert.equal(result.hits[0]?.chunk.chunkId, "first");
    assert.equal(result.hits[1]?.chunk.chunkId, "second");
  });

  it("handles an empty question, empty documents, and no shared terms", () => {
    assert.equal(retrieveKeywords("   ", sampleStudyChunks).outcome, "empty_query");
    assert.equal(retrieveKeywords("the and of", sampleStudyChunks).outcome, "empty_query");
    assert.equal(retrieveKeywords("chlorophyll", []).outcome, "empty_documents");
    assert.equal(
      retrieveKeywords("chlorophyll", [
        { documentId: "a", documentName: "A", chunkId: "blank", text: "   " },
      ]).outcome,
      "empty_documents",
    );
    const none = retrieveKeywords("What is the capital of France?", sampleStudyChunks);
    assert.equal(none.outcome, "no_matches");
    assert.deepEqual(none.hits, []);
  });

  it("matches ordinary word endings and listed synonyms", () => {
    assert.equal(stemStudyToken("absorbs"), stemStudyToken("absorb"));
    assert.equal(stemStudyToken("absorbed"), stemStudyToken("absorbing"));
    assert.equal(stemStudyToken("processes"), stemStudyToken("process"));
    assert.notEqual(stemStudyToken("glucose"), stemStudyToken("sugar"));

    const absorbed = retrieveKeywords("What is absorbed by chlorophyll?", [
      {
        documentId: "a",
        documentName: "A",
        chunkId: "photo",
        text: "Chlorophyll absorbs light in the chloroplast.",
        pageNumber: 2,
      },
      {
        documentId: "b",
        documentName: "B",
        chunkId: "other",
        text: "The scheduler chooses a thread.",
        pageNumber: 5,
      },
    ]);
    assert.equal(absorbed.outcome, "ranked");
    assert.equal(absorbed.hits[0]?.chunk.chunkId, "photo");
    assert.equal(absorbed.hits[0]?.chunk.pageNumber, 2);
    assert.ok(absorbed.hits[0]?.matchedTerms.includes("absorbed"));
    assert.ok(absorbed.hits[0]?.matchedTerms.includes("chlorophyll"));

    const processes = retrieveKeywords("What are processes?", [
      {
        documentId: "os",
        documentName: "Operating Systems Notes",
        chunkId: "p",
        text: PROCESS_TEXT,
        pageNumber: 5,
        section: "Processes",
      },
    ]);
    assert.equal(processes.hits[0]?.chunk.pageNumber, 5);
    assert.equal(processes.hits[0]?.chunk.section, "Processes");

    const sugar = retrieveKeywords("Where is sugar produced?", sampleStudyChunks);
    assert.equal(sugar.evidenceStrength, "sufficient");
    assert.equal(sugar.hits[0]?.chunk.chunkId, "notes-cell:photo");
    assert.ok(sugar.expandedTerms.includes(stemStudyToken("glucose")));

    const paraphrase = retrieveKeywords("How do leaves manufacture food?", sampleStudyChunks);
    assert.equal(paraphrase.outcome, "ranked");
    assert.equal(paraphrase.hits[0]?.chunk.chunkId, "notes-cell:photo");

    const weak = retrieveKeywords("cat policy framework regulation", [
      {
        documentId: "x",
        documentName: "X",
        chunkId: "cat",
        text: "A cat sat on the mat.",
      },
    ]);
    assert.equal(weak.outcome, "ranked");
    assert.equal(weak.evidenceStrength, "weak");
  });

  it("limits the number of hits and copies chunk metadata", () => {
    const result = retrieveKeywords("energy", sampleStudyChunks, { topK: 1 });
    assert.equal(result.hits.length, 1);
    const hit = result.hits[0];
    assert.ok(hit);
    const original = sampleStudyChunks.find((chunk) => chunk.chunkId === hit.chunk.chunkId);
    hit.chunk.text = "mutated";
    assert.notEqual(original?.text, "mutated");
    assert.equal(hit.chunk.documentId, original?.documentId);
  });
});
