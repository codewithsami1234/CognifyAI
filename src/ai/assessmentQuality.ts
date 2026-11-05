import type { CorrectAnswerIndex } from "./aiTypes";

export interface ReviewedMcq {
  question: string;
  options: [string, string, string, string];
  correctAnswerIndex: CorrectAnswerIndex;
  sourceText: string;
}

/**
 * Manual-review helper. The designated option must occur in the source text.
 * Parsing JSON is not this check. A paraphrased model option can fail it
 * even when a person would accept the paraphrase.
 */
export function reviewMcqAgainstSource(item: ReviewedMcq): string[] {
  const issues: string[] = [];
  if (item.question.trim().length === 0) {
    issues.push("The question is empty.");
  }
  const normalized = item.options.map((option) => option.trim().toLowerCase());
  if (new Set(normalized).size !== 4) {
    issues.push("The options are not four distinct choices.");
  }
  const correct = item.options[item.correctAnswerIndex]?.trim().toLowerCase() ?? "";
  if (correct.length === 0 || !item.sourceText.toLowerCase().includes(correct)) {
    issues.push("The designated answer does not appear in the source text.");
  }
  return issues;
}
