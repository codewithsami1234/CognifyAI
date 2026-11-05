import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TopicScore } from "../aiTypes";
import { PHOTOSYNTHESIS_TEXT, sampleStudyChunks } from "../fixtures/sampleStudyMaterial";
import {
  buildPracticeAssessment,
  COACH_METHOD_NOTE,
  explainWithEvidence,
  identifyWeakTopics,
  recommendPassages,
  recommendRevision,
} from "../learningCoach";
import { createScriptedRuntime } from "../scriptedRuntime";
import type { DocumentChunk } from "../aiTypes";

const photo = sampleStudyChunks[0];

function score(topic: string, correct: number, attempted: number): TopicScore {
  const entry: TopicScore = { topic, correct, attempted };
  if (photo) {
    entry.sources = [
      {
        documentId: photo.documentId,
        documentName: photo.documentName,
        chunkId: photo.chunkId,
        pageNumber: photo.pageNumber,
        section: photo.section,
      },
    ];
  }
  return entry;
}

describe("learning coach", () => {
  it("names weak topics from recorded accuracy and describes a rule", () => {
    const scores = [score("Cell Energy Notes — Photosynthesis", 1, 4), score("Cell Energy Notes — Respiration", 3, 4)];
    const weak = identifyWeakTopics(scores, 0.6);
    assert.deepEqual(
      weak.map((entry) => entry.topic),
      ["Cell Energy Notes — Photosynthesis"],
    );
    const recommendations = recommendRevision({ scores, weakAccuracyAtOrBelow: 0.6, maxRecommendations: 3 });
    assert.equal(recommendations.length, 1);
    assert.equal(recommendations[0]?.accuracy, 0.25);
    assert.match(recommendations[0]?.reason ?? "", /Rule:/);
    assert.match(recommendations[0]?.reason ?? "", /not a trained prediction/);
    assert.doesNotMatch(recommendations[0]?.reason ?? "", /AI predicts|the model predicts/i);
    assert.equal(recommendations[0]?.sources[0]?.pageNumber, 2);
    assert.match(COACH_METHOD_NOTE, /not trained predictions/);
  });

  it("returns no recommendations for an empty history or an invalid threshold", () => {
    assert.deepEqual(recommendRevision({ scores: [], weakAccuracyAtOrBelow: 0.6 }), []);
    assert.deepEqual(identifyWeakTopics([score("Photosynthesis", 0, 1)], 2), []);
    assert.equal(buildPracticeAssessment({ chunks: sampleStudyChunks, scores: [], weakAccuracyAtOrBelow: 4 }).status, "insufficient_evidence");
  });

  it("recommends a passage only when keyword retrieval hits, and says so when it does not", () => {
    const found = recommendPassages(sampleStudyChunks, "What does chlorophyll absorb?");
    assert.equal(found.status, "passages");
    assert.equal(found.passages[0]?.documentName, "Cell Energy Notes");
    assert.equal(found.passages[0]?.pageNumber, 2);
    assert.match(found.passages[0]?.text ?? "", /chlorophyll/i);
    const missing = recommendPassages(sampleStudyChunks, "Who wrote the textbook?");
    assert.equal(missing.status, "insufficient_evidence");
    assert.equal(missing.passages.length, 0);
    const empty = recommendPassages([], "chlorophyll");
    assert.equal(empty.status, "insufficient_evidence");
  });

  it("builds a small practice assessment from a weak topic and does not invent one without notes", () => {
    const ready = buildPracticeAssessment({
      chunks: sampleStudyChunks,
      scores: [score("Photosynthesis", 0, 2)],
      kind: "mcq",
    });
    assert.equal(ready.status, "ready");
    if (ready.status === "ready") {
      assert.equal(ready.request.count, 2);
      assert.equal(ready.request.kind, "mcq");
      assert.equal(ready.request.focus, "Photosynthesis");
      assert.equal(ready.request.chunks.length, sampleStudyChunks.length);
    }
    const unrelated: DocumentChunk = {
      documentId: "other",
      documentName: "Other",
      chunkId: "other:1",
      text: "The harbour tide table lists only departure times.",
    };
    const blocked = buildPracticeAssessment({
      chunks: [unrelated],
      scores: [score("Photosynthesis", 0, 2)],
    });
    assert.equal(blocked.status, "insufficient_evidence");
    if (blocked.status === "insufficient_evidence") {
      assert.equal(blocked.reason, "no_matches");
      assert.equal("request" in blocked, false);
    }
  });

  it("does not call the model when the notes have no matching evidence", async () => {
    const scripted = createScriptedRuntime({
      respond: () => ({ text: "This sentence was not in the notes.", generationTimeMs: 1 }),
    });
    await scripted.runtime.initialize({ modelPath: "local.gguf" });
    const missed = await explainWithEvidence(scripted.runtime, sampleStudyChunks, "Who wrote the textbook?");
    assert.equal(missed.status, "insufficient_evidence");
    assert.equal(scripted.generateCalls.length, 0);
    const emptyNotes = await explainWithEvidence(scripted.runtime, [], "What does chlorophyll absorb?");
    assert.equal(emptyNotes.status, "insufficient_evidence");
    assert.equal(scripted.generateCalls.length, 0);
  });

  it("explains from retrieved evidence when the question shares words with the notes", async () => {
    const scripted = createScriptedRuntime({
      respond: () => ({ text: "Chlorophyll absorbs light.", generationTimeMs: 4 }),
    });
    await scripted.runtime.initialize({ modelPath: "local.gguf" });
    const answered = await explainWithEvidence(
      scripted.runtime,
      sampleStudyChunks,
      "What does chlorophyll absorb?",
    );
    assert.equal(answered.status, "answered");
    assert.equal(scripted.generateCalls.length, 1);
    assert.match(scripted.generateCalls[0]?.prompt ?? "", /chlorophyll/i);
    assert.equal(answered.sources[0]?.pageNumber, 2);
    assert.match(PHOTOSYNTHESIS_TEXT, /chlorophyll/i);
  });
});
