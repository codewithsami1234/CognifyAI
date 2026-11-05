import type { DocumentChunk, SourceReference } from "../aiTypes";
import { toSourceReference } from "../sourceReferences";
import { stemStudyToken, studyContentTerms } from "../keywordRetrieval";
import type { Difficulty } from "./adaptiveDifficulty";

export type ExtractiveKind = "mcq" | "true_false" | "short_answer";

export interface ExtractiveQuestion {
  id: string;
  kind: ExtractiveKind;
  prompt: string;
  topic: string;
  difficulty: Difficulty;
  source: SourceReference;
  explanation: string;
  options?: [string, string, string, string];
  correctIndex?: 0 | 1 | 2 | 3;
  correctBoolean?: boolean;
  referenceAnswer?: string;
}

export interface ExtractiveQuiz {
  questions: ExtractiveQuestion[];
  /** Why fewer questions were returned than requested, when that happened. */
  note?: string;
}

function sentencesOf(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 20);
}

function topicOf(chunk: DocumentChunk): string {
  const section = chunk.section?.trim();
  if (section && section.length > 0) {
    return section;
  }
  return chunk.documentName;
}

function clip(value: string, max = 180): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) {
    return trimmed;
  }
  return `${trimmed.slice(0, max - 1)}…`;
}

/**
 * A short answer is accepted when at least 60% of the reference sentence's
 * content stems appear in the student answer. This is overlap with the source
 * sentence, not a human grade and not a model grade.
 */
export function gradeShortAnswer(response: string, reference: string): boolean {
  const expected = [...new Set(studyContentTerms(reference).map((term) => stemStudyToken(term)))];
  if (expected.length === 0) {
    return false;
  }
  const given = new Set(studyContentTerms(response).map((term) => stemStudyToken(term)));
  const hits = expected.filter((term) => given.has(term)).length;
  return hits / expected.length >= 0.6;
}

function otherSentences(chunks: readonly DocumentChunk[], currentId: string): string[] {
  const sentences: string[] = [];
  for (const chunk of chunks) {
    if (chunk.chunkId === currentId) {
      continue;
    }
    sentences.push(...sentencesOf(chunk.text));
  }
  return sentences;
}

function buildTrueFalse(chunk: DocumentChunk, sentence: string, others: readonly string[], id: string, difficulty: Difficulty): ExtractiveQuestion | undefined {
  const source = toSourceReference(chunk);
  const ownTerms = new Set(studyContentTerms(sentence).map((term) => stemStudyToken(term)));
  let swapped: string | undefined;
  let replacement: string | undefined;
  let original: string | undefined;
  for (const other of others) {
    for (const term of studyContentTerms(other)) {
      const stem = stemStudyToken(term);
      if (ownTerms.has(stem) || term.length < 5) {
        continue;
      }
      const victim = studyContentTerms(sentence).find((word) => word.length >= 5);
      if (!victim) {
        continue;
      }
      swapped = sentence.replace(victim, term);
      if (swapped !== sentence) {
        replacement = term;
        original = victim;
        break;
      }
    }
    if (swapped) {
      break;
    }
  }
  const statement = swapped ?? sentence;
  const isTrue = swapped === undefined;
  return {
    id,
    kind: "true_false",
    prompt: `True or false, according to the notes: ${statement}`,
    topic: topicOf(chunk),
    difficulty,
    source,
    correctBoolean: isTrue,
    explanation: isTrue
      ? `The notes contain this sentence: ${sentence}`
      : `The notes say "${original}", not "${replacement}". Sentence: ${sentence}`,
  };
}

function buildMcq(chunk: DocumentChunk, sentence: string, others: readonly string[], id: string, difficulty: Difficulty): ExtractiveQuestion | undefined {
  const distractors: string[] = [];
  for (const other of others) {
    if (other === sentence || distractors.includes(clip(other))) {
      continue;
    }
    distractors.push(clip(other));
    if (distractors.length === 3) {
      break;
    }
  }
  if (distractors.length < 3) {
    return undefined;
  }
  const options: [string, string, string, string] = [clip(sentence), distractors[0] ?? "", distractors[1] ?? "", distractors[2] ?? ""];
  return {
    id,
    kind: "mcq",
    prompt: "Which statement is in the notes?",
    topic: topicOf(chunk),
    difficulty,
    source: toSourceReference(chunk),
    options,
    correctIndex: 0,
    explanation: `The notes contain: ${sentence}`,
  };
}

function buildShort(chunk: DocumentChunk, sentence: string, id: string, difficulty: Difficulty): ExtractiveQuestion {
  const topic = topicOf(chunk);
  return {
    id,
    kind: "short_answer",
    prompt: `According to the notes, what is said about ${topic}?`,
    topic,
    difficulty,
    source: toSourceReference(chunk),
    referenceAnswer: sentence,
    explanation: `The reference answer is a sentence from the notes: ${sentence}`,
  };
}

/**
 * Builds questions from passage sentences. Distractors are other sentences from
 * the supplied notes. No statement is added from outside those notes.
 */
export function generateExtractiveQuiz(
  chunks: readonly DocumentChunk[],
  options: {
    count: number;
    difficulty: Difficulty;
    idFor: (index: number) => string;
    topic?: string;
  },
): ExtractiveQuiz {
  const count = options.count;
  if (!Number.isInteger(count) || count < 1 || count > 10) {
    throw new Error("Quiz count must be an integer from 1 to 10.");
  }
  const topicNeedle = options.topic?.trim().toLowerCase();
  const pool = chunks.filter((chunk) => {
    if (!topicNeedle) {
      return chunk.text.trim().length > 0;
    }
    const haystack = `${chunk.section ?? ""} ${chunk.text}`.toLowerCase();
    return haystack.includes(topicNeedle);
  });
  const questions: ExtractiveQuestion[] = [];
  const notes: string[] = [];
  for (const chunk of pool) {
    if (questions.length >= count) {
      break;
    }
    const sentence = sentencesOf(chunk.text)[0];
    if (!sentence) {
      continue;
    }
    const others = otherSentences(pool, chunk.chunkId);
    const id = options.idFor(questions.length);
    if (options.difficulty === "beginner") {
      const item = buildTrueFalse(chunk, sentence, others, id, options.difficulty);
      if (item) {
        questions.push(item);
      }
      continue;
    }
    if (options.difficulty === "intermediate") {
      const item = buildMcq(chunk, sentence, others, id, options.difficulty);
      if (item) {
        questions.push(item);
      } else {
        const fallback = buildTrueFalse(chunk, sentence, others, id, options.difficulty);
        if (fallback) {
          questions.push(fallback);
          notes.push("A multiple-choice item needed three other sentences, so a true/false item was used.");
        }
      }
      continue;
    }
    questions.push(buildShort(chunk, sentence, id, options.difficulty));
  }
  const quiz: ExtractiveQuiz = { questions };
  if (questions.length === 0) {
    quiz.note = "No question was built because the selected notes did not contain a usable sentence.";
  } else if (questions.length < count) {
    quiz.note = notes[0] ?? "Fewer questions were built than requested because the notes did not contain enough separate sentences.";
  } else if (notes.length > 0) {
    quiz.note = notes[0];
  }
  return quiz;
}
