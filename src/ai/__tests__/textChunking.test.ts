import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chunkText } from "../textChunking";

describe("chunkText", () => {
  it("keeps document metadata and offsets that round-trip with slice", () => {
    const text = "Alpha sentence about cells. Beta sentence about leaves.";
    const chunks = chunkText(text, {
      documentId: "doc-1",
      documentName: "Lab Notes",
      pageNumber: 4,
      section: "Leaves",
      maxChars: 28,
      overlapChars: 0,
    });

    assert.ok(chunks.length >= 2);
    for (const chunk of chunks) {
      assert.equal(chunk.documentId, "doc-1");
      assert.equal(chunk.documentName, "Lab Notes");
      assert.equal(chunk.pageNumber, 4);
      assert.equal(chunk.section, "Leaves");
      assert.equal(text.slice(chunk.startOffset, chunk.endOffset), chunk.text);
      assert.equal(chunk.chunkId, `doc-1:${chunk.startOffset}-${chunk.endOffset}`);
    }
  });

  it("overlaps windows by the requested character count", () => {
    const chunks = chunkText("abcdefghij", {
      documentId: "d",
      documentName: "D",
      maxChars: 4,
      overlapChars: 1,
    });
    assert.deepEqual(
      chunks.map((chunk) => chunk.text),
      ["abcd", "defg", "ghij"],
    );
    assert.deepEqual(
      chunks.map((chunk) => [chunk.startOffset, chunk.endOffset]),
      [
        [0, 4],
        [3, 7],
        [6, 10],
      ],
    );
  });

  it("returns no chunks for empty or whitespace-only text", () => {
    assert.deepEqual(chunkText("", { documentId: "d", documentName: "D" }), []);
    assert.deepEqual(chunkText("   \n", { documentId: "d", documentName: "D" }), []);
  });

  it("omits page and section when the caller does not know them", () => {
    const [chunk] = chunkText("Short note.", {
      documentId: "d",
      documentName: "D",
    });
    assert.ok(chunk);
    assert.equal(chunk.pageNumber, undefined);
    assert.equal(chunk.section, undefined);
  });

  it("prefers a sentence boundary and keeps unicode text intact", () => {
    const text = "Alpha sentence about cells. Beta sentence about leaves.";
    const chunks = chunkText(text, {
      documentId: "doc-1",
      documentName: "Lab Notes",
      maxChars: 40,
      overlapChars: 0,
    });
    assert.equal(chunks[0]?.text.endsWith("."), true);
    assert.equal(chunks[0]?.text.includes("Beta"), false);
    const unicode = chunkText("Café chlorophyll.", { documentId: "d", documentName: "D" });
    assert.equal(unicode[0]?.text, "Café chlorophyll.");
  });

  it("rejects a non-positive window", () => {
    assert.throws(() => chunkText("abc", { documentId: "d", documentName: "D", maxChars: 0 }));
  });
});
