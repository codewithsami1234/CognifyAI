import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  chunksFromStudyMaterials,
  DEFAULT_ASSESSMENT_MAX_CONTEXT_CHARS,
  DEFAULT_ASSESSMENT_MAX_TOKENS,
  DEFAULT_ASSESSMENT_TEMPERATURE,
  generateAssessment,
  MAX_ASSESSMENT_COUNT,
} from "../assessmentGenerator";
import type { DocumentChunk } from "../aiTypes";
import { PHOTOSYNTHESIS_TEXT } from "../fixtures/sampleStudyMaterial";
import { ModelRuntimeError } from "../errors";
import { createScriptedRuntime } from "../scriptedRuntime";

const photo: DocumentChunk = {
  documentId: "notes-cell",
  documentName: "Cell Energy Notes",
  chunkId: "notes-cell:photo",
  text: PHOTOSYNTHESIS_TEXT,
  pageNumber: 2,
  section: "Photosynthesis",
};

const slide: DocumentChunk = {
  documentId: "slides",
  documentName: "lecture.pptx",
  chunkId: "slides:3",
  text: "Chlorophyll in the chloroplast can absorb light during photosynthesis.",
  pageNumber: 3,
  section: "Slide 3",
};

function mcqJson(extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    items: [
      {
        id: "from-model",
        question: "What does chlorophyll absorb?",
        options: ["Light", "Sound", "Heat", "Gravity"],
        correctAnswerIndex: 0,
        explanation: "Chlorophyll can absorb light.",
        documentName: "Fake Book.pdf",
        pageNumber: 99,
        sources: [{ documentName: "Fake Book.pdf", pageNumber: 99, chunkId: "invented" }],
        ...extra,
      },
    ],
  });
}

describe("generateAssessment", () => {
  it("keeps the local batch inside a small token and evidence budget", () => {
    assert.ok(MAX_ASSESSMENT_COUNT <= 3);
    assert.ok(DEFAULT_ASSESSMENT_MAX_TOKENS <= 384);
    assert.ok(DEFAULT_ASSESSMENT_MAX_CONTEXT_CHARS <= 800);
    assert.equal(DEFAULT_ASSESSMENT_TEMPERATURE, 0);
  });

  it("attaches the retrieved chunk source and ignores page numbers and file names from the model", async () => {
    const scripted = createScriptedRuntime({
      respond: () => ({ text: `Here is the JSON:\n${mcqJson()}`, generationTimeMs: 9 }),
    });
    await scripted.runtime.initialize({ modelPath: "local.gguf" });
    const result = await generateAssessment(scripted.runtime, {
      chunks: [photo, slide],
      kind: "mcq",
      count: 1,
      focus: "chlorophyll",
      topK: 1,
    });

    assert.equal(result.status, "ok");
    assert.equal(result.items.length, 1);
    assert.equal(result.rejectedCount, 0);
    const item = result.items[0];
    assert.ok(item && "options" in item);
    assert.equal(item.id, "mcq-1");
    assert.equal(item.correctAnswerIndex, 0);
    assert.equal(item.sources[0]?.documentName, "Cell Energy Notes");
    assert.equal(item.sources[0]?.pageNumber, 2);
    assert.equal(item.sources[0]?.section, "Photosynthesis");
    assert.equal(item.sources[0]?.chunkId, "notes-cell:photo");
    assert.equal(result.sources[0]?.documentName, "Cell Energy Notes");
    assert.equal(result.sources.some((source) => source.pageNumber === 99), false);
    assert.equal(result.sources.some((source) => source.documentName === "Fake Book.pdf"), false);
    assert.equal(item.sources.some((source) => source.chunkId === "invented"), false);
    assert.match(result.message, /not verified/i);
    const prompt = scripted.generateCalls[0]?.prompt ?? "";
    assert.equal(prompt.includes("Cell Energy Notes"), false);
    assert.equal(prompt.includes("page 2"), false);
    assert.equal(prompt.includes("Fake Book.pdf"), false);
    assert.match(prompt, /JSON only/);
    assert.match(prompt, /INSUFFICIENT_EVIDENCE/);
    assert.equal(scripted.generateCalls[0]?.maxTokens, DEFAULT_ASSESSMENT_MAX_TOKENS);
    assert.equal(scripted.generateCalls[0]?.temperature, DEFAULT_ASSESSMENT_TEMPERATURE);
  });

  it("keeps a slide label from the chunk and does not adopt a model file name", async () => {
    const scripted = createScriptedRuntime({
      respond: () => ({
        text: JSON.stringify({
          items: [
            {
              front: "Chlorophyll",
              back: "It can absorb light.",
              documentName: "notes.txt",
              pageNumber: 8,
            },
          ],
        }),
        generationTimeMs: 4,
      }),
    });
    await scripted.runtime.initialize({ modelPath: "local.gguf" });
    const result = await generateAssessment(scripted.runtime, {
      chunks: [slide],
      kind: "flashcard",
      count: 1,
      focus: "chlorophyll",
    });
    assert.equal(result.status, "ok");
    const item = result.items[0];
    assert.ok(item && "front" in item);
    assert.equal(item.id, "flashcard-1");
    assert.equal(item.front, "Chlorophyll");
    assert.equal(item.back, "It can absorb light.");
    assert.equal(item.sources[0]?.documentName, "lecture.pptx");
    assert.equal(item.sources[0]?.section, "Slide 3");
    assert.equal(item.sources[0]?.pageNumber, 3);
    assert.equal(result.sources.some((source) => source.documentName === "notes.txt"), false);
    assert.equal(result.sources.some((source) => source.pageNumber === 8), false);
  });

  it("does not invent a page number for a text chunk", async () => {
    const scripted = createScriptedRuntime({
      respond: () => ({
        text: JSON.stringify({
          items: [
            {
              question: "What does chlorophyll absorb?",
              referenceAnswer: "Light",
              pageNumber: 4,
              documentName: "Made Up.docx",
            },
          ],
        }),
        generationTimeMs: 3,
      }),
    });
    await scripted.runtime.initialize({ modelPath: "local.gguf" });
    const result = await generateAssessment(scripted.runtime, {
      chunks: [
        {
          documentId: "pasted",
          documentName: "Cell Energy Notes",
          chunkId: "pasted:0-20",
          text: "Chlorophyll in the chloroplast can absorb light.",
        },
      ],
      kind: "short_answer",
      count: 1,
    });
    assert.equal(result.status, "ok");
    const item = result.items[0];
    assert.ok(item && "referenceAnswer" in item);
    assert.equal(item.id, "short-answer-1");
    assert.equal(item.referenceAnswer, "Light");
    assert.equal(item.sources[0]?.documentName, "Cell Energy Notes");
    assert.equal(item.sources[0]?.pageNumber, undefined);
    assert.equal(result.sources.some((source) => source.pageNumber === 4), false);
    assert.equal(result.sources.some((source) => source.documentName === "Made Up.docx"), false);
  });

  it("does not call the model when the focus matches nothing", async () => {
    const scripted = createScriptedRuntime({
      respond: () => ({ text: mcqJson(), generationTimeMs: 1 }),
    });
    await scripted.runtime.initialize({ modelPath: "local.gguf" });
    const result = await generateAssessment(scripted.runtime, {
      chunks: [photo],
      kind: "mcq",
      count: 2,
      focus: "scheduler",
    });
    assert.equal(result.status, "insufficient_evidence");
    assert.equal(result.insufficientReason, "no_matches");
    assert.deepEqual(result.items, []);
    assert.deepEqual(result.sources, []);
    assert.equal(scripted.generateCalls.length, 0);
  });

  it("does not call the model for empty notes or text that is too short", async () => {
    const scripted = createScriptedRuntime({
      respond: () => ({ text: mcqJson(), generationTimeMs: 1 }),
    });
    await scripted.runtime.initialize({ modelPath: "local.gguf" });
    const empty = await generateAssessment(scripted.runtime, {
      chunks: [],
      kind: "short_answer",
      count: 1,
    });
    assert.equal(empty.status, "insufficient_evidence");
    assert.equal(empty.insufficientReason, "empty_documents");

    const blank = await generateAssessment(scripted.runtime, {
      chunks: [{ ...photo, text: "   " }],
      kind: "flashcard",
      count: 1,
    });
    assert.equal(blank.insufficientReason, "empty_documents");

    const short = await generateAssessment(scripted.runtime, {
      chunks: [{ ...photo, text: "chlorophyll" }],
      kind: "mcq",
      count: 1,
      focus: "chlorophyll",
    });
    assert.equal(short.status, "insufficient_evidence");
    assert.equal(short.insufficientReason, "below_minimum");
    assert.equal(short.items.length, 0);
    assert.equal(scripted.generateCalls.length, 0);
  });

  it("does not call the model when the count is outside the small batch", async () => {
    const scripted = createScriptedRuntime({
      respond: () => ({ text: mcqJson(), generationTimeMs: 1 }),
    });
    await scripted.runtime.initialize({ modelPath: "local.gguf" });
    const result = await generateAssessment(scripted.runtime, {
      chunks: [photo],
      kind: "mcq",
      count: MAX_ASSESSMENT_COUNT + 1,
    });
    assert.equal(result.status, "error");
    assert.equal(result.error?.code, "INVALID_REQUEST");
    assert.deepEqual(result.items, []);
    assert.equal(scripted.generateCalls.length, 0);
  });

  it("records a model decline without showing the sentinel as an item", async () => {
    const scripted = createScriptedRuntime({
      respond: () => ({ text: "INSUFFICIENT_EVIDENCE", generationTimeMs: 2 }),
    });
    await scripted.runtime.initialize({ modelPath: "local.gguf" });
    const result = await generateAssessment(scripted.runtime, {
      chunks: [photo],
      kind: "mcq",
      count: 2,
    });
    assert.equal(result.status, "insufficient_evidence");
    assert.equal(result.insufficientReason, "model_declined");
    assert.deepEqual(result.items, []);
    assert.equal(result.sources[0]?.pageNumber, 2);
    assert.equal(result.message.includes("INSUFFICIENT_EVIDENCE"), false);
    assert.equal(scripted.generateCalls.length, 1);
  });

  it("rejects malformed output and a batch whose items all fail validation", async () => {
    let calls = 0;
    const scripted = createScriptedRuntime({
      respond: () => {
        calls += 1;
        if (calls === 1) {
          return { text: "not json", generationTimeMs: 2 };
        }
        return {
          text: JSON.stringify({
            items: [{ question: "What absorbs light?", options: ["Light", "Sound"], correctAnswerIndex: 0 }],
          }),
          generationTimeMs: 2,
        };
      },
    });
    await scripted.runtime.initialize({ modelPath: "local.gguf" });
    const malformed = await generateAssessment(scripted.runtime, {
      chunks: [photo],
      kind: "mcq",
      count: 1,
      focus: "chlorophyll",
    });
    assert.equal(malformed.status, "error");
    assert.equal(malformed.error?.code, "MALFORMED_OUTPUT");
    assert.deepEqual(malformed.items, []);
    assert.equal(malformed.sources[0]?.pageNumber, 2);
    assert.equal(malformed.rawModelText, "not json");

    const invalid = await generateAssessment(scripted.runtime, {
      chunks: [photo],
      kind: "mcq",
      count: 1,
      focus: "chlorophyll",
    });
    assert.equal(invalid.status, "error");
    assert.equal(invalid.error?.code, "MALFORMED_OUTPUT");
    assert.equal(invalid.rejectedCount, 1);
    assert.deepEqual(invalid.items, []);
  });

  it("returns only the valid items and does not pad the batch", async () => {
    const scripted = createScriptedRuntime({
      respond: () => ({
        text: JSON.stringify({
          items: [
            {
              question: "What does chlorophyll absorb?",
              options: ["Light", "Sound", "Heat", "Gravity"],
              correctAnswerIndex: 0,
            },
            {
              question: "Broken",
              options: ["Only", "Two"],
              correctAnswerIndex: 0,
            },
            {
              question: "Where is chlorophyll?",
              options: ["Chloroplast", "Mitochondrion", "Nucleus", "Ribosome"],
              correctAnswerIndex: 0,
            },
          ],
        }),
        generationTimeMs: 5,
      }),
    });
    await scripted.runtime.initialize({ modelPath: "local.gguf" });
    const result = await generateAssessment(scripted.runtime, {
      chunks: [photo],
      kind: "mcq",
      count: 2,
    });
    assert.equal(result.status, "ok");
    assert.equal(result.requestedCount, 2);
    assert.equal(result.items.length, 2);
    assert.equal(result.rejectedCount, 1);
    assert.equal(result.items[0] && "id" in result.items[0] ? result.items[0].id : "", "mcq-1");
    assert.equal(result.items[1] && "question" in result.items[1] ? result.items[1].question : "", "Where is chlorophyll?");
  });

  it("does not generate when the runtime is not ready, and maps a generation failure", async () => {
    const idle = createScriptedRuntime({
      respond: () => ({ text: mcqJson(), generationTimeMs: 1 }),
    });
    const notReady = await generateAssessment(idle.runtime, {
      chunks: [photo],
      kind: "mcq",
      count: 1,
    });
    assert.equal(notReady.status, "error");
    assert.equal(notReady.error?.code, "MODEL_NOT_LOADED");
    assert.equal(notReady.sources[0]?.pageNumber, 2);
    assert.deepEqual(notReady.items, []);
    assert.equal(idle.generateCalls.length, 0);

    const failing = createScriptedRuntime({
      respond: () => {
        throw new ModelRuntimeError("INFERENCE_FAILED", "context reset");
      },
    });
    await failing.runtime.initialize({ modelPath: "local.gguf" });
    const failed = await generateAssessment(failing.runtime, {
      chunks: [photo],
      kind: "short_answer",
      count: 1,
      focus: "chlorophyll",
    });
    assert.equal(failed.status, "error");
    assert.equal(failed.error?.code, "INFERENCE_FAILED");
    assert.deepEqual(failed.items, []);
    assert.equal(failed.sources[0]?.documentName, "Cell Energy Notes");
  });
});

describe("chunksFromStudyMaterials", () => {
  it("copies a known page and does not add one when the material has none", () => {
    const chunks = chunksFromStudyMaterials([
      {
        documentId: "notes",
        documentName: "Cell Energy Notes",
        text: PHOTOSYNTHESIS_TEXT,
        pageNumber: 2,
        section: "Photosynthesis",
      },
      {
        documentId: "plain",
        documentName: "Pasted notes",
        text: "Chlorophyll can absorb light in the chloroplast.",
      },
    ]);
    assert.equal(chunks[0]?.pageNumber, 2);
    assert.equal(chunks[0]?.section, "Photosynthesis");
    assert.equal(chunks[1]?.documentName, "Pasted notes");
    assert.equal(chunks[1]?.pageNumber, undefined);
  });

  it("rejects an invented page before chunking", () => {
    assert.throws(
      () =>
        chunksFromStudyMaterials([
          {
            documentId: "notes",
            documentName: "Notes",
            text: PHOTOSYNTHESIS_TEXT,
            pageNumber: 0,
          },
        ]),
      /pageNumber/,
    );
  });
});
