import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MAX_ASSESSMENT_FIELD_CHARS, parseAssessmentDrafts, validateFlashcardDraft, validateMcqDraft, validateShortAnswerDraft } from "../assessmentValidation";

function mcq(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    question: "What does chlorophyll absorb?",
    options: ["Light", "Sound", "Heat", "Gravity"],
    correctAnswerIndex: 0,
    explanation: "Chlorophyll can absorb light.",
    ...overrides,
  };
}

describe("validateMcqDraft", () => {
  it("accepts a question with four options and one correct index", () => {
    const draft = validateMcqDraft(mcq());
    assert.ok(draft);
    assert.equal(draft.question, "What does chlorophyll absorb?");
    assert.deepEqual(draft.options, ["Light", "Sound", "Heat", "Gravity"]);
    assert.equal(draft.correctAnswerIndex, 0);
    assert.equal(draft.explanation, "Chlorophyll can absorb light.");
  });

  it("rejects fewer than four options", () => {
    assert.equal(validateMcqDraft(mcq({ options: ["Light", "Sound", "Heat"] })), undefined);
  });

  it("rejects more than four options", () => {
    assert.equal(
      validateMcqDraft(mcq({ options: ["Light", "Sound", "Heat", "Gravity", "Water"] })),
      undefined,
    );
  });

  it("rejects duplicate options", () => {
    assert.equal(validateMcqDraft(mcq({ options: ["Light", "light", "Heat", "Gravity"] })), undefined);
    assert.equal(validateMcqDraft(mcq({ options: ["Light", " Light ", "Heat", "Gravity"] })), undefined);
  });

  it("rejects an invalid correct-answer index", () => {
    assert.equal(validateMcqDraft(mcq({ correctAnswerIndex: -1 })), undefined);
    assert.equal(validateMcqDraft(mcq({ correctAnswerIndex: 4 })), undefined);
    assert.equal(validateMcqDraft(mcq({ correctAnswerIndex: 1.5 })), undefined);
    assert.equal(validateMcqDraft(mcq({ correctAnswerIndex: "0" })), undefined);
    assert.equal(validateMcqDraft(mcq({ correctAnswerIndex: undefined })), undefined);
  });

  it("rejects an empty question and an empty option", () => {
    assert.equal(validateMcqDraft(mcq({ question: "   " })), undefined);
    assert.equal(validateMcqDraft(mcq({ options: ["Light", " ", "Heat", "Gravity"] })), undefined);
  });

  it("rejects a non-string explanation instead of dropping the item into a guess", () => {
    assert.equal(validateMcqDraft(mcq({ explanation: 12 })), undefined);
  });

  it("omits a blank explanation", () => {
    const draft = validateMcqDraft(mcq({ explanation: "  " }));
    assert.ok(draft);
    assert.equal(draft.explanation, undefined);
  });

  it("accepts correctIndex only when correctAnswerIndex is absent", () => {
    const draft = validateMcqDraft(mcq({ correctAnswerIndex: undefined, correctIndex: 2 }));
    assert.ok(draft);
    assert.equal(draft.correctAnswerIndex, 2);
  });

  it("rejects disagreeing correctAnswerIndex and correctIndex values", () => {
    assert.equal(validateMcqDraft(mcq({ correctAnswerIndex: 0, correctIndex: 1 })), undefined);
  });
});

describe("validateShortAnswerDraft", () => {
  it("accepts a question and a reference answer", () => {
    const draft = validateShortAnswerDraft({
      question: "What does chlorophyll absorb?",
      referenceAnswer: "Light",
    });
    assert.deepEqual(draft, {
      question: "What does chlorophyll absorb?",
      referenceAnswer: "Light",
    });
  });

  it("rejects an empty reference answer", () => {
    assert.equal(
      validateShortAnswerDraft({
        question: "What does chlorophyll absorb?",
        referenceAnswer: " ",
      }),
      undefined,
    );
    assert.equal(
      validateShortAnswerDraft({
        question: "",
        referenceAnswer: "Light",
      }),
      undefined,
    );
  });
});

describe("validateFlashcardDraft", () => {
  it("accepts a front and a back", () => {
    const draft = validateFlashcardDraft({
      front: "Chlorophyll",
      back: "It can absorb light.",
    });
    assert.deepEqual(draft, {
      front: "Chlorophyll",
      back: "It can absorb light.",
    });
  });

  it("rejects an empty side", () => {
    assert.equal(validateFlashcardDraft({ front: "Chlorophyll", back: "" }), undefined);
    assert.equal(validateFlashcardDraft({ front: " ", back: "Light" }), undefined);
  });
});

describe("parseAssessmentDrafts", () => {
  it("rejects malformed model output", () => {
    assert.equal(parseAssessmentDrafts("this is not json", "mcq").status, "malformed");
    assert.equal(parseAssessmentDrafts("{", "mcq").status, "malformed");
    assert.equal(parseAssessmentDrafts('{"questions":[]}', "mcq").status, "malformed");
    assert.equal(parseAssessmentDrafts("function(){return 1}", "mcq").status, "malformed");
    assert.equal(parseAssessmentDrafts("   ", "short_answer").status, "malformed");
  });

  it("reads a fenced JSON object and a bare array without evaluating text", () => {
    const fenced = `\`\`\`json\n${JSON.stringify({ items: [mcq()] })}\n\`\`\``;
    const fromFence = parseAssessmentDrafts(fenced, "mcq");
    assert.equal(fromFence.status, "items");
    if (fromFence.status === "items") {
      assert.equal(fromFence.drafts.length, 1);
      assert.equal(fromFence.rejectedCount, 0);
    }

    const listed = parseAssessmentDrafts(
      `Note:\n${JSON.stringify([
        { question: "What does chlorophyll absorb?", referenceAnswer: "Light" },
      ])}`,
      "short_answer",
    );
    assert.equal(listed.status, "items");
    if (listed.status === "items") {
      assert.equal(listed.drafts[0]?.referenceAnswer, "Light");
    }
  });

  it("counts an invalid item and keeps a valid sibling", () => {
    const parsed = parseAssessmentDrafts(
      JSON.stringify({
        items: [mcq(), mcq({ options: ["Only", "Three", "Options"] })],
      }),
      "mcq",
    );
    assert.equal(parsed.status, "items");
    if (parsed.status === "items") {
      assert.equal(parsed.drafts.length, 1);
      assert.equal(parsed.rejectedCount, 1);
    }
  });

  it("treats the insufficient-evidence line as a decline, including inside a fence", () => {
    assert.equal(parseAssessmentDrafts("INSUFFICIENT_EVIDENCE\n", "flashcard").status, "declined");
    assert.equal(parseAssessmentDrafts("```\nINSUFFICIENT_EVIDENCE\n```", "mcq").status, "declined");
  });

  it("rejects a field that is longer than the text cap", () => {
    const parsed = parseAssessmentDrafts(
      JSON.stringify({
        items: [{ front: "Term", back: "y".repeat(MAX_ASSESSMENT_FIELD_CHARS + 1) }],
      }),
      "flashcard",
    );
    assert.equal(parsed.status, "items");
    if (parsed.status === "items") {
      assert.equal(parsed.drafts.length, 0);
      assert.equal(parsed.rejectedCount, 1);
    }
  });
});
