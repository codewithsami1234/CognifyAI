import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DocumentChunk } from "../aiTypes";
import { createLexiconEmbedder } from "../embeddings/lexiconEmbedder";
import { hybridSearch } from "../embeddings/hybridSearch";
import { indexDocumentChunks, searchStoredChunks } from "../embeddings/indexChunks";
import { migrateCognifyDb } from "../sql/migrate";
import { openNodeSqlite } from "../sql/nodeSqlite";
import { decodeVector, encodeVector } from "../embeddings/vectorMath";
import { createLlamaTextEmbedder, type LlamaEmbeddingContext } from "../embeddings/llamaEmbedder";

const ML_TEXT = "Machine learning algorithms learn patterns from training datasets.";
const PHOTO_TEXT =
  "Photosynthesis in green plants converts light energy into chemical energy. Chlorophyll in the chloroplast can absorb light. The Calvin cycle uses carbon dioxide to produce glucose.";
const OS_TEXT =
  "A process is a program in execution. The scheduler chooses which ready thread runs next.";

function chunk(id: string, documentName: string, text: string, pageNumber: number, section: string): DocumentChunk {
  return {
    documentId: id.split(":")[0] ?? id,
    documentName,
    chunkId: id,
    text,
    pageNumber,
    section,
  };
}

const library = [
  chunk("ml:1", "Machine Learning Notes", ML_TEXT, 4, "Training"),
  chunk("photo:1", "Cell Energy Notes", PHOTO_TEXT, 2, "Photosynthesis"),
  chunk("os:1", "Operating Systems Notes", OS_TEXT, 5, "Processes"),
];

describe("local semantic search", () => {
  const embedder = createLexiconEmbedder();

  async function rows() {
    const vectors = await embedder.embed(library.map((item) => item.text));
    return library.map((item, index) => ({ chunk: item, vector: vectors[index] }));
  }

  it("round-trips a vector through base64", () => {
    const vector = Float32Array.from([0.25, -1.5, 0, 42]);
    const decoded = decodeVector(encodeVector(vector));
    assert.equal(decoded.length, 4);
    assert.ok(Math.abs((decoded[0] ?? 0) - 0.25) < 1e-6);
    assert.ok(Math.abs((decoded[1] ?? 0) + 1.5) < 1e-6);
  });

  it("retrieves the machine-learning passage for paraphrases that do not share its wording", async () => {
    const stored = await rows();
    const queries = [
      "How do computers learn?",
      "Explain the model training process.",
      "How does a machine identify patterns?",
      "What is learning from datasets?",
    ];
    for (const query of queries) {
      const result = await hybridSearch(query, stored, embedder, { topK: 3 });
      assert.equal(result.outcome, "ranked", query);
      assert.equal(result.hits[0]?.chunk.chunkId, "ml:1", `${query} -> ${result.hits.map((hit) => hit.chunk.chunkId).join(",")}`);
      assert.equal(result.hits[0]?.chunk.pageNumber, 4);
      assert.equal(result.hits[0]?.chunk.documentName, "Machine Learning Notes");
      assert.ok(result.hits[0]?.channels.includes("semantic"), query);
    }
  });

  it("retrieves an exact keyword and a listed synonym", async () => {
    const stored = await rows();
    const exact = await hybridSearch("chlorophyll", stored, embedder);
    assert.equal(exact.hits[0]?.chunk.chunkId, "photo:1");
    assert.ok(exact.hits[0]?.channels.includes("keyword"));
    const synonym = await hybridSearch("sugar", stored, embedder);
    assert.equal(synonym.hits[0]?.chunk.chunkId, "photo:1");
  });

  it("keeps keyword and semantic channels distinct and drops duplicate chunk ids", async () => {
    const stored = await rows();
    const duplicated = [...stored, stored[0]].filter((row): row is NonNullable<typeof row> => row !== undefined);
    const result = await hybridSearch("How do computers learn?", duplicated, embedder);
    const ids = result.hits.map((hit) => hit.chunk.chunkId);
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(result.duplicateChunkIdsRemoved, 1);
    const both = result.hits.find((hit) => hit.channels.includes("semantic") && hit.channels.includes("keyword"));
    assert.ok(both || result.hits.some((hit) => hit.channels.includes("semantic")));
  });

  it("returns no hits for an empty query, a missing embedding, or unrelated words", async () => {
    const stored = await rows();
    const empty = await hybridSearch("   ", stored, embedder);
    assert.equal(empty.outcome, "empty_query");
    assert.equal(empty.hits.length, 0);

    const missing = await hybridSearch(
      "chlorophyll",
      library.map((item) => ({ chunk: item })),
      embedder,
    );
    assert.equal(missing.semanticStatus, "missing_embeddings");
    assert.equal(missing.hits[0]?.chunk.chunkId, "photo:1");
    assert.deepEqual(missing.hits[0]?.channels, ["keyword"]);

    const none = await hybridSearch("zygote meiosis allele", stored, embedder);
    assert.equal(none.outcome, "no_matches");
  });

  it("stores embeddings once and can resume after a cancelled batch", async () => {
    const db = openNodeSqlite(":memory:");
    await migrateCognifyDb(db, "2026-11-04T00:00:00.000Z");
    const pages = [
      library[0]!,
      chunk("ml:2", "Machine Learning Notes", "A model updates its weights while it is training.", 5, "Weights"),
    ];
    let checks = 0;
    const interrupted = await indexDocumentChunks(db, embedder, pages, {
      batchSize: 1,
      nowIso: "2026-11-04T00:00:00.000Z",
      shouldCancel: () => {
        checks += 1;
        return checks > 1;
      },
    });
    assert.equal(interrupted.status, "interrupted");
    assert.equal(interrupted.embedded, 1);
    const resumed = await indexDocumentChunks(db, embedder, pages, {
      batchSize: 1,
      nowIso: "2026-11-04T00:01:00.000Z",
    });
    assert.equal(resumed.skipped, 1);
    assert.equal(resumed.embedded, 1);
    for (const item of library) {
      if (item.documentId === "ml") {
        continue;
      }
      await indexDocumentChunks(db, embedder, [item], { nowIso: "2026-11-04T00:02:00.000Z" });
    }
    const found = await searchStoredChunks(db, embedder, "How do computers learn?");
    assert.equal(found.hits[0]?.chunk.documentName, "Machine Learning Notes");
    db.close();
  });
});

describe("llama embedding adapter", () => {
  it("reads vectors from an injected embedding context and does not call a chat completion", async () => {
    const calls: string[] = [];
    const context: LlamaEmbeddingContext = {
      async embedding(text) {
        calls.push(text);
        return {
          requestId: calls.length,
          promise: Promise.resolve({ embedding: [text.length, 1, 0] }),
        };
      },
    };
    const embedder = createLlamaTextEmbedder({
      id: "test-embed",
      label: "Test embedder",
      context,
    });
    const vectors = await embedder.embed(["alpha", "beta"]);
    assert.deepEqual(calls, ["alpha", "beta"]);
    assert.equal(vectors.length, 2);
    assert.equal(embedder.dimensions, 3);
    assert.ok(Math.abs((vectors[0]?.[0] ?? 0) + (vectors[0]?.[1] ?? 0) + (vectors[0]?.[2] ?? 0)) <= 2);
  });
});
