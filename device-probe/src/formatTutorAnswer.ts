import type { RagAnswer } from '../../src/ai/aiTypes';

/** Context for the tutor on this phone. The diagnostic probe load stays at 512. */
export const TUTOR_N_CTX = 1024;

/** Short completion so the first tutor trial does not run for hundreds of tokens. */
export const TUTOR_MAX_TOKENS = 64;

export const TUTOR_LOADING_TEXT =
  'The local model is generating an answer from the retrieved passages. This line is not an answer.';

export const TUTOR_DISCLAIMER =
  'Generated text is not marked correct. Sources are the retrieved chunks, not a claim that the answer is true.';

export function formatTutorAnswer(answer: RagAnswer): string {
  const lines = [
    `Status: ${answer.status}`,
    TUTOR_DISCLAIMER,
    `Retrieval ms: ${answer.timings.retrievalMs}`,
    `Generate ms: ${answer.timings.generationMs ?? 'n/a'}`,
  ];
  if (answer.insufficientReason) {
    lines.push(`Reason: ${answer.insufficientReason}`);
  }
  if (answer.error) {
    lines.push(`Error ${answer.error.code}: ${answer.error.message}`);
    if (answer.error.cause) {
      lines.push(`Cause: ${answer.error.cause}`);
    }
  }
  if (answer.followUp && answer.followUp.addedTerms.length > 0) {
    lines.push(`Follow-up of: ${answer.followUp.priorQuestion}`);
    lines.push(`Added terms: ${answer.followUp.addedTerms.join(", ")}`);
  }
  lines.push('Answer:');
  lines.push(answer.answer);
  lines.push('Sources:');
  if (answer.sources.length === 0) {
    lines.push('None.');
  } else {
    for (const source of answer.sources) {
      const slide = source.section?.startsWith('Slide ') === true;
      const place = slide
        ? source.section
        : source.pageNumber === undefined
          ? 'page not recorded'
          : `page ${source.pageNumber}`;
      const section = source.section === undefined || slide ? '' : `, section ${source.section}`;
      lines.push(`${source.documentName}, ${place}${section}, chunk ${source.chunkId}`);
    }
  }
  return lines.join('\n');
}
