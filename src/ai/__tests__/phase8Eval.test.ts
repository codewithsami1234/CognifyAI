import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { reviewMcqAgainstSource } from "../assessmentQuality";
import { PHOTOSYNTHESIS_TEXT, sampleStudyChunks } from "../fixtures/sampleStudyMaterial";
import { parseGgufMetadata } from "../ggufMetadata";
import { evaluateGroundingCase } from "../groundingEval";
import { identifyWeakTopics } from "../learningCoach";
import { emptyLearningProgress, learningRecordsFromProgress, topicScoresFromProgress } from "../learningProgress";
import { architectureMatchesChoice, identifyModelChoice } from "../modelCatalog";
import { evaluateRetrieval, type RetrievalEvalCase } from "../retrievalEval";

function u32(value: number): Buffer {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value);
  return buffer;
}

function u64(value: number): Buffer {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(BigInt(value));
  return buffer;
}

function ggufString(value: string): Buffer {
  return Buffer.concat([u64(Buffer.byteLength(value)), Buffer.from(value)]);
}

describe("GGUF metadata", () => {
  it("reads architecture and the Q4_K_M file type from a tiny header", () => {
    const bytes = Buffer.concat([
      Buffer.from("GGUF"),
      u32(3),
      u64(0),
      u64(2),
      ggufString("general.architecture"),
      u32(8),
      ggufString("llama"),
      ggufString("general.file_type"),
      u32(4),
      u32(15),
    ]);
    const parsed = parseGgufMetadata(bytes);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) {
      return;
    }
    assert.equal(parsed.metadata.architecture, "llama");
    assert.equal(parsed.metadata.fileType, 15);
    assert.equal(parsed.metadata.fileTypeName, "MOSTLY_Q4_K_M");
    assert.equal(parsed.metadata.truncated, false);
  });

  it("rejects a buffer that is not GGUF", () => {
    const parsed = parseGgufMetadata(Buffer.from("not-a-model"));
    assert.equal(parsed.ok, false);
  });
});

describe("model catalog", () => {
  it("identifies the primary file and does not treat a Qwen path as already loaded", () => {
    const llama = identifyModelChoice("C:/models/Llama-3.2-1B-Instruct-Q4_K_M.gguf");
    const qwen = identifyModelChoice("/storage/emulated/0/Android/data/com.cognify.deviceprobe/files/qwen2.5-0.5b-instruct-q4_k_m.gguf");
    assert.equal(llama?.id, "llama-3.2-1b-instruct");
    assert.equal(architectureMatchesChoice("llama", llama), true);
    assert.equal(architectureMatchesChoice("qwen2", llama), false);
    assert.equal(qwen?.expectedArchitecture, "qwen2");
    assert.match(qwen?.runtimeNote ?? "", /does not download/);
  });
});

describe("retrieval evaluation", () => {
  it("scores the 30 fixture questions and rejects a passage that is not in the chunk", () => {
    const file = path.join(__dirname, "../../../docs/evaluation/retrieval_evaluation_dataset.json");
    const dataset = JSON.parse(readFileSync(file, "utf8")) as { cases: RetrievalEvalCase[] };
    assert.equal(dataset.cases.length, 30);
    const report = evaluateRetrieval(dataset.cases, sampleStudyChunks);
    assert.equal(report.total, 30);
    assert.equal(report.hitAt1, 30);
    assert.equal(report.hitAt3, 30);
    assert.equal(report.hitAt5, 30);
    assert.deepEqual(report.missed, []);
    assert.equal(report.reciprocalRankSum, 30);
    assert.throws(() =>
      evaluateRetrieval(
        [
          {
            id: "bad",
            question: "What does chlorophyll absorb?",
            expectedDocumentId: "notes-cell",
            expectedChunkId: "notes-cell:photo",
            expectedPassage: "this sentence is not in the notes",
            topic: "Photosynthesis",
          },
        ],
        sampleStudyChunks,
      ),
    );
  });
});

describe("grounding checklist", () => {
  it("accepts a reference sentence copied from the retrieved chunk", () => {
    const result = evaluateGroundingCase(
      {
        id: "g1",
        question: "What does chlorophyll absorb?",
        expectedChunkId: "notes-cell:photo",
        referenceAnswer: "Chlorophyll in the chloroplast can absorb light.",
        answer: "Chlorophyll in the chloroplast can absorb light.",
      },
      sampleStudyChunks,
    );
    assert.equal(result.verdict, "supported");
    assert.equal(result.sourceMatches, true);
    assert.deepEqual(result.unsupportedTerms, []);
  });

  it("flags a planted term that is not in the passage", () => {
    const result = evaluateGroundingCase(
      {
        id: "g2",
        question: "What does chlorophyll absorb?",
        expectedChunkId: "notes-cell:photo",
        referenceAnswer: "Chlorophyll in the chloroplast can absorb light.",
        answer: "Chlorophyll absorbs moonlight on the moon.",
      },
      sampleStudyChunks,
    );
    assert.equal(result.verdict, "unsupported_terms");
    assert.ok(result.unsupportedTerms.includes("moonlight"));
  });
});

describe("assessment source review", () => {
  it("accepts a designated option copied from the notes and rejects one that is not", () => {
    const good = reviewMcqAgainstSource({
      question: "What can absorb light?",
      options: ["Chlorophyll", "The scheduler", "A thread", "Context switching"],
      correctAnswerIndex: 0,
      sourceText: PHOTOSYNTHESIS_TEXT,
    });
    assert.deepEqual(good, []);
    const bad = reviewMcqAgainstSource({
      question: "What can absorb light?",
      options: ["Sound", "The scheduler", "A thread", "Context switching"],
      correctAnswerIndex: 0,
      sourceText: PHOTOSYNTHESIS_TEXT,
    });
    assert.ok(bad.some((issue) => issue.includes("does not appear")));
  });
});

describe("learning record source", () => {
  it("reads quiz rows from the JSON progress object and not from a second store", () => {
    const progress = emptyLearningProgress();
    const records = learningRecordsFromProgress(progress);
    assert.equal(records.quizzes.length, 0);
    assert.deepEqual(topicScoresFromProgress(progress), []);
    assert.deepEqual(identifyWeakTopics([], 0.6), []);
  });
});
