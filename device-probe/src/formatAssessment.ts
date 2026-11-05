import type { AssessmentItem, AssessmentResult, SourceReference } from '../../src/ai/aiTypes';

export const ASSESSMENT_LOADING_TEXT =
  'The local model is generating an assessment from the retrieved passages. This line is not an assessment.';

export const ASSESSMENT_DISCLAIMER =
  'Generated questions are not verified as correct. The marked option is the model selection. Sources are the retrieved chunks, not citations written by the model.';

const LETTERS = ['A', 'B', 'C', 'D'] as const;

function formatKind(kind: AssessmentResult['kind']): string {
  if (kind === 'mcq') {
    return 'MCQ';
  }
  if (kind === 'short_answer') {
    return 'Short answer';
  }
  return 'Flashcards';
}

function formatSourceLine(source: SourceReference): string {
  const slide = source.section?.startsWith('Slide ') === true;
  const place = slide
    ? source.section
    : source.pageNumber === undefined
      ? 'page not recorded'
      : `page ${source.pageNumber}`;
  const section = source.section === undefined || slide ? '' : `, section ${source.section}`;
  return `${source.documentName}, ${place}${section}, chunk ${source.chunkId}`;
}

function appendItem(lines: string[], item: AssessmentItem, index: number): void {
  const number = index + 1;
  if ('options' in item) {
    lines.push(`${number}. ${item.question}`);
    item.options.forEach((option, optionIndex) => {
      const letter = LETTERS[optionIndex] ?? '?';
      lines.push(`${letter}. ${option}`);
    });
    const letter = LETTERS[item.correctAnswerIndex] ?? '?';
    const chosen = item.options[item.correctAnswerIndex] ?? '';
    lines.push(`Correct option: ${letter}. ${chosen}`);
    if (item.explanation) {
      lines.push(`Explanation: ${item.explanation}`);
    }
    return;
  }
  if ('referenceAnswer' in item) {
    lines.push(`${number}. ${item.question}`);
    lines.push(`Reference answer: ${item.referenceAnswer}`);
    return;
  }
  lines.push(`${number}. Front: ${item.front}`);
  lines.push(`Back: ${item.back}`);
}

export function formatAssessmentUnavailable(code: string, message: string): string {
  return [
    'Status: error',
    ASSESSMENT_DISCLAIMER,
    `Error ${code}: ${message}`,
    'Items:',
    'None.',
    'Sources:',
    'None.',
  ].join('\n');
}

/**
 * Text for the probe screen.
 * Items are printed only when validation already accepted them.
 */
export function formatAssessment(result: AssessmentResult): string {
  const lines = [
    `Status: ${result.status}`,
    ASSESSMENT_DISCLAIMER,
    `Kind: ${formatKind(result.kind)}`,
    `Requested: ${result.requestedCount}`,
    `Returned: ${result.status === 'ok' ? result.items.length : 0}`,
    `Rejected items: ${result.rejectedCount}`,
    `Retrieval ms: ${result.timings.retrievalMs}`,
    `Generate ms: ${result.timings.generationMs ?? 'n/a'}`,
  ];
  if (result.insufficientReason) {
    lines.push(`Reason: ${result.insufficientReason}`);
  }
  if (result.error) {
    lines.push(`Error ${result.error.code}: ${result.error.message}`);
    if (result.error.cause) {
      lines.push(`Cause: ${result.error.cause}`);
    }
  }
  if (result.truncatedContext) {
    lines.push('Some passage text was cut to fit the context budget.');
  }
  lines.push(result.message);
  lines.push('Items:');
  if (result.status !== 'ok' || result.items.length === 0) {
    lines.push('None.');
  } else {
    result.items.forEach((item, index) => {
      appendItem(lines, item, index);
    });
  }
  lines.push('Sources:');
  if (result.sources.length === 0) {
    lines.push('None.');
  } else {
    for (const source of result.sources) {
      lines.push(formatSourceLine(source));
    }
  }
  return lines.join('\n');
}
