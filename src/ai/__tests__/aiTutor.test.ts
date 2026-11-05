import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PHOTOSYNTHESIS_TEXT, PROCESS_TEXT } from "../fixtures/sampleStudyMaterial";
import { ModelRuntimeError } from "../errors";
import { createAiTutor } from "../aiTutor";
import type { ModelRuntime } from "../modelRuntime";
import { createScriptedRuntime } from "../scriptedRuntime";
import type { GenerationRequest, GenerationResult, ModelStatus } from "../aiTypes";

describe("createAiTutor", () => {
  it("chunks the pasted notes, asks the local runtime, and keeps the chunk page", async () => {
    const scripted = createScriptedRuntime({
      respond: () => ({
        text: "Chlorophyll absorbs light. See page 9.",
        generationTimeMs: 15,
      }),
    });
    const tutor = createAiTutor({
      runtime: scripted.runtime,
      modelPath: "local.gguf",
      maxTokens: 32,
    });
    const prepared = tutor.prepareStudyMaterial([
      {
        documentId: "notes-cell",
        documentName: "Cell Energy Notes",
        text: PHOTOSYNTHESIS_TEXT,
        pageNumber: 2,
        section: "Photosynthesis",
      },
    ]);
    assert.equal(prepared.chunkCount, 1);
    assert.deepEqual(prepared.documentNames, ["Cell Energy Notes"]);

    const status = await tutor.initialize();
    assert.equal(status.state, "ready");
    assert.equal(tutor.isReady(), true);

    const answer = await tutor.askQuestion("What does chlorophyll absorb?");
    assert.equal(answer.status, "answered");
    assert.match(answer.answer, /absorbs light/i);
    assert.equal(answer.sources[0]?.documentName, "Cell Energy Notes");
    assert.equal(answer.sources[0]?.pageNumber, 2);
    assert.equal(answer.sources[0]?.chunkId, prepared.chunkIds[0]);
    assert.equal(answer.sources.some((source) => source.pageNumber === 9), false);
    assert.equal(scripted.generateCalls.length, 1);
    assert.match(scripted.generateCalls[0]?.prompt ?? "", /chlorophyll/i);
    assert.equal((scripted.generateCalls[0]?.prompt ?? "").includes("page 2"), false);
    assert.equal(scripted.initializeCalls.length, 1);
    assert.equal(scripted.initializeCalls[0]?.nCtx, 2048);
    assert.equal(scripted.initializeCalls[0]?.nGpuLayers, 0);
  });

  it("does not initialize a second time for the same path and context", async () => {
    const scripted = createScriptedRuntime({
      respond: () => ({ text: "ok", generationTimeMs: 1 }),
    });
    const tutor = createAiTutor({ runtime: scripted.runtime, modelPath: "local.gguf" });
    await Promise.all([tutor.initialize(), tutor.initialize()]);
    await tutor.initialize();
    assert.equal(scripted.initializeCalls.length, 1);
    assert.equal(tutor.isReady(), true);
  });

  it("loads again after the previous initialization is forgotten", async () => {
    const scripted = createScriptedRuntime({
      respond: () => ({ text: "ok", generationTimeMs: 1 }),
    });
    const tutor = createAiTutor({ runtime: scripted.runtime, modelPath: "local.gguf", nCtx: 1024 });
    await tutor.initialize();
    await tutor.forgetInitialization();
    assert.equal(tutor.isReady(), false);
    await tutor.initialize();
    assert.equal(scripted.initializeCalls.length, 2);
    assert.equal(scripted.initializeCalls[1]?.nCtx, 1024);
  });

  it("reports a failed initialization and does not generate", async () => {
    const scripted = createScriptedRuntime({
      respond: () => ({ text: "should not run", generationTimeMs: 1 }),
      failInitializeWith: new ModelRuntimeError("MODEL_FILE_MISSING", "Model file not found."),
    });
    const tutor = createAiTutor({ runtime: scripted.runtime, modelPath: "missing.gguf" });
    tutor.prepareStudyMaterial([
      {
        documentId: "notes",
        documentName: "Notes",
        text: PHOTOSYNTHESIS_TEXT,
        pageNumber: 2,
      },
    ]);
    const status = await tutor.initialize();
    assert.equal(status.state, "failed");
    assert.equal(status.error?.code, "MODEL_FILE_MISSING");
    assert.equal(tutor.isReady(), false);
    const answer = await tutor.askQuestion("What does chlorophyll absorb?");
    assert.equal(answer.status, "error");
    assert.equal(answer.error?.code, "MODEL_FILE_MISSING");
    assert.equal(answer.sources.length, 0);
    assert.equal(scripted.generateCalls.length, 0);
  });

  it("returns model-not-ready before any generation when initialize was not called", async () => {
    const scripted = createScriptedRuntime({
      respond: () => ({ text: "should not run", generationTimeMs: 1 }),
    });
    const tutor = createAiTutor({ runtime: scripted.runtime, modelPath: "local.gguf" });
    tutor.prepareStudyMaterial([
      {
        documentId: "notes",
        documentName: "Notes",
        text: PHOTOSYNTHESIS_TEXT,
      },
    ]);
    const answer = await tutor.askQuestion("What does chlorophyll absorb?");
    assert.equal(answer.error?.code, "MODEL_NOT_LOADED");
    assert.equal(scripted.generateCalls.length, 0);
    assert.equal(scripted.initializeCalls.length, 0);
  });

  it("rejects an empty question and empty notes without generation", async () => {
    const scripted = createScriptedRuntime({
      respond: () => ({ text: "no", generationTimeMs: 1 }),
    });
    const tutor = createAiTutor({ runtime: scripted.runtime, modelPath: "local.gguf" });
    await tutor.initialize();
    const emptyQuestion = await tutor.askQuestion("   ");
    assert.equal(emptyQuestion.error?.code, "EMPTY_QUESTION");

    const prepared = tutor.prepareStudyMaterial([
      { documentId: "blank", documentName: "Blank", text: "   " },
    ]);
    assert.equal(prepared.chunkCount, 0);
    const emptyNotes = await tutor.askQuestion("What does chlorophyll absorb?");
    assert.equal(emptyNotes.status, "insufficient_evidence");
    assert.equal(emptyNotes.insufficientReason, "empty_documents");
    assert.equal(scripted.generateCalls.length, 0);
  });

  it("does not call the model when the notes do not share question terms", async () => {
    const scripted = createScriptedRuntime({
      respond: () => ({ text: "should not run", generationTimeMs: 1 }),
    });
    const tutor = createAiTutor({ runtime: scripted.runtime, modelPath: "local.gguf" });
    await tutor.initialize();
    tutor.prepareStudyMaterial([
      {
        documentId: "notes",
        documentName: "Cell Energy Notes",
        text: PHOTOSYNTHESIS_TEXT,
        pageNumber: 2,
      },
    ]);
    const answer = await tutor.askQuestion("What is the capital of France?");
    assert.equal(answer.status, "insufficient_evidence");
    assert.equal(answer.insufficientReason, "no_matches");
    assert.deepEqual(answer.sources, []);
    assert.equal(scripted.generateCalls.length, 0);
  });

  it("limits the evidence placed in the prompt and still copies the real page", async () => {
    const scripted = createScriptedRuntime({
      respond: () => ({ text: "Light energy.", generationTimeMs: 4 }),
    });
    const tutor = createAiTutor({
      runtime: scripted.runtime,
      modelPath: "local.gguf",
      maxContextChars: 40,
      topK: 1,
    });
    await tutor.initialize();
    tutor.prepareStudyMaterial([
      {
        documentId: "notes",
        documentName: "Cell Energy Notes",
        text: PHOTOSYNTHESIS_TEXT,
        pageNumber: 2,
        section: "Photosynthesis",
      },
    ]);
    const answer = await tutor.askQuestion("What does chlorophyll absorb?");
    assert.equal(answer.status, "answered");
    assert.equal(answer.truncatedContext, true);
    assert.ok(answer.contextCharCount <= 40);
    assert.equal(answer.sources[0]?.pageNumber, 2);
    assert.equal(answer.sources[0]?.section, "Photosynthesis");
    assert.ok((scripted.generateCalls[0]?.prompt.length ?? 0) > 0);
  });

  it("maps a generation failure and releases the runtime on dispose", async () => {
    const scripted = createScriptedRuntime({
      respond: () => {
        throw new Error("native completion failed");
      },
    });
    const tutor = createAiTutor({ runtime: scripted.runtime, modelPath: "local.gguf" });
    await tutor.initialize();
    tutor.prepareStudyMaterial([
      {
        documentId: "notes",
        documentName: "Notes",
        text: PHOTOSYNTHESIS_TEXT,
      },
    ]);
    const failed = await tutor.askQuestion("What does chlorophyll absorb?");
    assert.equal(failed.status, "error");
    assert.equal(failed.error?.code, "INFERENCE_FAILED");
    assert.match(failed.error?.cause ?? "", /native completion failed/);
    assert.equal(failed.sources[0]?.documentName, "Notes");

    await tutor.dispose();
    assert.equal(tutor.getStatus().state, "released");
    assert.equal(tutor.isReady(), false);
    const after = await tutor.askQuestion("What does chlorophyll absorb?");
    assert.equal(after.error?.code, "MODEL_NOT_LOADED");
    assert.equal(after.sources.length, 0);
  });

  it("rejects a missing document name and an invented page before chunking", () => {
    const scripted = createScriptedRuntime({
      respond: () => ({ text: "no", generationTimeMs: 1 }),
    });
    const tutor = createAiTutor({ runtime: scripted.runtime, modelPath: "local.gguf" });
    assert.throws(
      () => tutor.prepareStudyMaterial([{ documentId: " ", documentName: "Notes", text: "Chlorophyll." }]),
      /documentId/,
    );
    assert.throws(
      () =>
        tutor.prepareStudyMaterial([
          { documentId: "notes", documentName: "Notes", text: "Chlorophyll.", pageNumber: 0 },
        ]),
      /pageNumber/,
    );
  });

  it("reuses the previous question for a short follow-up and keeps the real page", async () => {
    const scripted = createScriptedRuntime({
      respond: () => ({ text: "Chlorophyll absorbs light.", generationTimeMs: 5 }),
    });
    const tutor = createAiTutor({ runtime: scripted.runtime, modelPath: "local.gguf" });
    await tutor.initialize();
    tutor.prepareStudyMaterial([
      {
        documentId: "notes-cell",
        documentName: "Cell Energy Notes",
        text: PHOTOSYNTHESIS_TEXT,
        pageNumber: 2,
        section: "Photosynthesis",
      },
      {
        documentId: "notes-os",
        documentName: "Operating Systems Notes",
        text: PROCESS_TEXT,
        pageNumber: 5,
        section: "Processes",
      },
    ]);

    const first = await tutor.askQuestion("What does chlorophyll absorb?");
    assert.equal(first.status, "answered");
    assert.equal(first.followUp, undefined);
    assert.equal(first.sources[0]?.pageNumber, 2);

    const follow = await tutor.askQuestion("Where is it found?");
    assert.equal(follow.status, "answered");
    assert.equal(follow.followUp?.priorQuestion, "What does chlorophyll absorb?");
    assert.deepEqual(follow.followUp?.addedTerms, ["chlorophyll", "absorb"]);
    assert.equal(follow.sources[0]?.documentName, "Cell Energy Notes");
    assert.equal(follow.sources[0]?.pageNumber, 2);
    assert.equal(follow.sources[0]?.section, "Photosynthesis");
    const followPrompt = scripted.generateCalls[1]?.prompt ?? "";
    assert.match(followPrompt, /Where is it found\?/);
    assert.match(followPrompt, /What does chlorophyll absorb\?/);
    assert.equal(followPrompt.includes("page 2"), false);

    const detailed = await tutor.askQuestion("What is the Calvin cycle that produces glucose?");
    assert.equal(detailed.followUp, undefined);
    assert.equal(detailed.sources[0]?.pageNumber, 2);

    const callsBeforeReplace = scripted.generateCalls.length;
    tutor.prepareStudyMaterial([
      {
        documentId: "notes-os",
        documentName: "Operating Systems Notes",
        text: PROCESS_TEXT,
        pageNumber: 5,
        section: "Processes",
      },
    ]);
    const afterReplace = await tutor.askQuestion("Where is it found?");
    assert.equal(afterReplace.followUp, undefined);
    assert.equal(afterReplace.status, "insufficient_evidence");
    assert.equal(afterReplace.insufficientReason, "no_matches");
    assert.equal(scripted.generateCalls.length, callsBeforeReplace);
  });

  it("records a follow-up decline and keeps the retrieved page", async () => {
    let calls = 0;
    const scripted = createScriptedRuntime({
      respond: () => {
        calls += 1;
        return {
          text: calls === 1 ? "Chlorophyll absorbs light." : "INSUFFICIENT_EVIDENCE",
          generationTimeMs: 1,
        };
      },
    });
    const tutor = createAiTutor({ runtime: scripted.runtime, modelPath: "local.gguf" });
    await tutor.initialize();
    tutor.prepareStudyMaterial([
      {
        documentId: "notes",
        documentName: "Cell Energy Notes",
        text: PHOTOSYNTHESIS_TEXT,
        pageNumber: 2,
      },
    ]);
    await tutor.askQuestion("What does chlorophyll absorb?");
    const missed = await tutor.askQuestion("Who wrote it?");
    assert.equal(missed.status, "insufficient_evidence");
    assert.equal(missed.insufficientReason, "model_declined");
    assert.equal(missed.followUp?.addedTerms.includes("chlorophyll"), true);
    assert.equal(missed.sources[0]?.pageNumber, 2);
    assert.equal(missed.sources.some((source) => source.pageNumber === 9), false);
    assert.equal(scripted.generateCalls.length, 2);
  });

  it("runs overlapping asks one at a time", async () => {
    let active = 0;
    let maxActive = 0;
    const calls: string[] = [];
    let status: ModelStatus = { state: "uninitialized", runtimeId: "scripted" };
    const runtime: ModelRuntime = {
      id: "scripted",
      getStatus: () => status,
      async initialize() {
        status = { state: "ready", runtimeId: "scripted", modelPath: "local.gguf" };
        return status;
      },
      async generate(request: GenerationRequest): Promise<GenerationResult> {
        active += 1;
        maxActive = Math.max(maxActive, active);
        calls.push(request.prompt);
        await new Promise((resolve) => setTimeout(resolve, 20));
        active -= 1;
        return { text: "Chlorophyll absorbs light.", generationTimeMs: 20 };
      },
      async release() {
        status = { state: "released", runtimeId: "scripted" };
      },
    };
    const tutor = createAiTutor({ runtime, modelPath: "local.gguf" });
    await tutor.initialize();
    tutor.prepareStudyMaterial([
      {
        documentId: "notes",
        documentName: "Notes",
        text: PHOTOSYNTHESIS_TEXT,
        pageNumber: 2,
      },
    ]);
    const [first, second] = await Promise.all([
      tutor.askQuestion("What does chlorophyll absorb?"),
      tutor.askQuestion("What does chlorophyll absorb?"),
    ]);
    assert.equal(first.status, "answered");
    assert.equal(second.status, "answered");
    assert.equal(maxActive, 1);
    assert.equal(calls.length, 2);
  });
});
