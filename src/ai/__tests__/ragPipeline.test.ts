import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { prepareGroundedPrompt } from "../contextPreparation";
import { sampleStudyChunks } from "../fixtures/sampleStudyMaterial";
import { ModelRuntimeError } from "../errors";
import { retrieveKeywords } from "../keywordRetrieval";
import { answerQuestion } from "../ragPipeline";
import { createScriptedRuntime } from "../scriptedRuntime";

describe("prepareGroundedPrompt", () => {
  it("drops lower-ranked passages once the character budget is full", () => {
    const retrieval = retrieveKeywords("energy", sampleStudyChunks);
    const prepared = prepareGroundedPrompt("Where is energy discussed?", retrieval.hits, 80);
    assert.equal(prepared.usedChunkIds.length, 1);
    assert.ok(prepared.droppedChunkIds.length >= 1);
    assert.ok(prepared.contextCharCount <= 80);
    assert.equal(prepared.prompt.includes("Cell Energy Notes"), false);
    assert.equal(prepared.prompt.includes("page 2"), false);
  });

  it("truncates a single passage that exceeds the budget and records the source from the chunk", () => {
    const retrieval = retrieveKeywords("chlorophyll", sampleStudyChunks);
    const prepared = prepareGroundedPrompt("chlorophyll", retrieval.hits, 40);
    assert.equal(prepared.truncated, true);
    assert.equal(prepared.sources[0]?.pageNumber, 2);
    assert.equal(prepared.sources[0]?.documentName, "Cell Energy Notes");
    assert.ok(prepared.contextCharCount <= 40);
  });
});

describe("answerQuestion", () => {
  it("returns the scripted answer and the chunk's own page, ignoring a page invented in the completion", async () => {
    const scripted = createScriptedRuntime({
      respond: () => ({
        text: "Chlorophyll can absorb light. See Cell Energy Notes page 99.",
        generationTimeMs: 12,
      }),
    });
    await scripted.runtime.initialize({ modelPath: "C:\\models\\ignored.gguf" });
    const result = await answerQuestion(scripted.runtime, {
      question: "What does chlorophyll absorb?",
      chunks: sampleStudyChunks,
    });

    assert.equal(result.status, "answered");
    assert.match(result.answer, /absorb light/i);
    assert.equal(result.sources.length, 1);
    assert.equal(result.sources[0]?.documentName, "Cell Energy Notes");
    assert.equal(result.sources[0]?.pageNumber, 2);
    assert.equal(result.sources[0]?.section, "Photosynthesis");
    assert.equal(result.sources[0]?.chunkId, "notes-cell:photo");
    assert.equal(result.sources.some((source) => source.pageNumber === 99), false);
    assert.equal(scripted.generateCalls.length, 1);
    assert.match(scripted.generateCalls[0]?.prompt ?? "", /Chlorophyll/);
    assert.equal((scripted.generateCalls[0]?.prompt ?? "").includes("page 2"), false);
  });

  it("retrieves with the widened text and still asks the student's question", async () => {
    const scripted = createScriptedRuntime({
      respond: () => ({ text: "It is in the chloroplast.", generationTimeMs: 4 }),
    });
    await scripted.runtime.initialize({ modelPath: "local.gguf" });
    const result = await answerQuestion(scripted.runtime, {
      question: "Where is it found?",
      retrievalText: "Where is it found? chlorophyll absorb",
      priorQuestion: "What does chlorophyll absorb?",
      chunks: sampleStudyChunks,
    });
    assert.equal(result.status, "answered");
    assert.equal(result.sources[0]?.pageNumber, 2);
    assert.equal(result.sources[0]?.section, "Photosynthesis");
    const prompt = scripted.generateCalls[0]?.prompt ?? "";
    assert.match(prompt, /Question:\nWhere is it found\?/);
    assert.match(prompt, /What does chlorophyll absorb\?/);
    assert.equal(prompt.includes("page 2"), false);
  });

  it("does not call the model when nothing matches", async () => {
    const scripted = createScriptedRuntime({
      respond: () => ({ text: "should not run", generationTimeMs: 1 }),
    });
    await scripted.runtime.initialize({ modelPath: "local.gguf" });
    const result = await answerQuestion(scripted.runtime, {
      question: "What is the capital of France?",
      chunks: sampleStudyChunks,
    });
    assert.equal(result.status, "insufficient_evidence");
    assert.equal(result.insufficientReason, "no_matches");
    assert.deepEqual(result.sources, []);
    assert.equal(scripted.generateCalls.length, 0);
  });

  it("reports an empty question and empty documents without generation", async () => {
    const scripted = createScriptedRuntime({
      respond: () => ({ text: "no", generationTimeMs: 1 }),
    });
    await scripted.runtime.initialize({ modelPath: "local.gguf" });

    const emptyQuestion = await answerQuestion(scripted.runtime, {
      question: "  ",
      chunks: sampleStudyChunks,
    });
    assert.equal(emptyQuestion.status, "error");
    assert.equal(emptyQuestion.error?.code, "EMPTY_QUESTION");

    const emptyDocs = await answerQuestion(scripted.runtime, {
      question: "What does chlorophyll absorb?",
      chunks: [],
    });
    assert.equal(emptyDocs.status, "insufficient_evidence");
    assert.equal(emptyDocs.insufficientReason, "empty_documents");
    assert.equal(scripted.generateCalls.length, 0);
  });

  it("treats an empty completion as malformed and still returns retrieved sources", async () => {
    const scripted = createScriptedRuntime({
      respond: () => ({ text: "   ", generationTimeMs: 4 }),
    });
    await scripted.runtime.initialize({ modelPath: "local.gguf" });
    const result = await answerQuestion(scripted.runtime, {
      question: "What does chlorophyll absorb?",
      chunks: sampleStudyChunks,
    });
    assert.equal(result.status, "error");
    assert.equal(result.error?.code, "MALFORMED_OUTPUT");
    assert.equal(result.sources[0]?.pageNumber, 2);
  });

  it("maps a generation exception to an inference error", async () => {
    const scripted = createScriptedRuntime({
      respond: () => {
        throw new ModelRuntimeError("INFERENCE_FAILED", "context reset");
      },
    });
    await scripted.runtime.initialize({ modelPath: "local.gguf" });
    const result = await answerQuestion(scripted.runtime, {
      question: "What does chlorophyll absorb?",
      chunks: sampleStudyChunks,
    });
    assert.equal(result.status, "error");
    assert.equal(result.error?.code, "INFERENCE_FAILED");
    assert.equal(result.sources[0]?.documentId, "notes-cell");
  });

  it("refuses to generate when the runtime was never initialized", async () => {
    const scripted = createScriptedRuntime({
      respond: () => ({ text: "no", generationTimeMs: 1 }),
    });
    const result = await answerQuestion(scripted.runtime, {
      question: "What does chlorophyll absorb?",
      chunks: sampleStudyChunks,
    });
    assert.equal(result.error?.code, "MODEL_NOT_LOADED");
    assert.equal(scripted.generateCalls.length, 0);
    assert.equal(result.sources[0]?.chunkId, "notes-cell:photo");
  });

  it("records a model decline without treating the sentinel as a factual answer", async () => {
    const scripted = createScriptedRuntime({
      respond: () => ({ text: "INSUFFICIENT_EVIDENCE\n", generationTimeMs: 3 }),
    });
    await scripted.runtime.initialize({ modelPath: "local.gguf" });
    const result = await answerQuestion(scripted.runtime, {
      question: "What does chlorophyll absorb?",
      chunks: sampleStudyChunks,
    });
    assert.equal(result.status, "insufficient_evidence");
    assert.equal(result.insufficientReason, "model_declined");
    assert.equal(result.sources[0]?.pageNumber, 2);
    assert.equal(result.answer.includes("INSUFFICIENT_EVIDENCE"), false);
  });

  it("rejects an oversized question before generation", async () => {
    const scripted = createScriptedRuntime({
      respond: () => ({ text: "no", generationTimeMs: 1 }),
    });
    await scripted.runtime.initialize({ modelPath: "local.gguf" });
    const result = await answerQuestion(scripted.runtime, {
      question: `chlorophyll ${"pad ".repeat(40)}`,
      chunks: sampleStudyChunks,
      maxQuestionChars: 30,
    });
    assert.equal(result.error?.code, "CONTEXT_TOO_LONG");
    assert.equal(scripted.generateCalls.length, 0);
  });

  it("does not generate when the only overlap is a short incidental word", async () => {
    const scripted = createScriptedRuntime({
      respond: () => ({ text: "should not run", generationTimeMs: 1 }),
    });
    await scripted.runtime.initialize({ modelPath: "local.gguf" });
    const result = await answerQuestion(scripted.runtime, {
      question: "cat policy framework regulation",
      chunks: [
        {
          documentId: "x",
          documentName: "X",
          chunkId: "cat",
          text: "A cat sat on the mat.",
        },
      ],
    });
    assert.equal(result.status, "insufficient_evidence");
    assert.equal(result.insufficientReason, "below_minimum");
    assert.equal(scripted.generateCalls.length, 0);
  });
});
