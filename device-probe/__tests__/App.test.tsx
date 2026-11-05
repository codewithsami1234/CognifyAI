import {
  DEFAULT_MODEL_PATH,
  DEFAULT_PROMPT,
  formatProbeReport,
  PROBE_MAX_TOKENS,
  PROBE_N_CTX,
  PROBE_N_GPU_LAYERS,
} from '../src/formatProbeReport';
import {
  EXTERNAL_MODEL_PATH,
  FALLBACK_MODEL_FILE_NAME,
  isPrivateAppFilesPath,
  modelLocationNote,
  modelPathForFileName,
  normalizeExternalModelPath,
} from '../src/externalModelPath';
import {
  formatTutorAnswer,
  TUTOR_LOADING_TEXT,
  TUTOR_MAX_TOKENS,
  TUTOR_N_CTX,
} from '../src/formatTutorAnswer';
import {
  ASSESSMENT_DISCLAIMER,
  ASSESSMENT_LOADING_TEXT,
  formatAssessment,
  formatAssessmentUnavailable,
} from '../src/formatAssessment';
import type { AssessmentResult, RagAnswer } from '../../src/ai/aiTypes';

test('formats a failed load without inventing output', () => {
  const text = formatProbeReport({
    loaded: false,
    generated: false,
    statusState: 'failed',
    initTimeMs: 12,
    error: {
      code: 'MODEL_FILE_MISSING',
      message: 'Model file not found.',
      cause: 'File does not exist.',
    },
  });
  expect(text).toContain('Loaded: no');
  expect(text).toContain('Generated: no');
  expect(text).toContain('Error MODEL_FILE_MISSING: Model file not found.');
  expect(text).toContain('Cause: File does not exist.');
  expect(text).toContain('Init ms: 12');
  expect(text).toContain('Generate ms: n/a');
  expect(text.endsWith('Output:\n')).toBe(true);
});

test('formats a successful generation', () => {
  const text = formatProbeReport({
    loaded: true,
    generated: true,
    statusState: 'ready',
    initTimeMs: 1000,
    generationTimeMs: 250,
    outputText: 'pong',
  });
  expect(text).toContain('Loaded: yes');
  expect(text).toContain('Generate ms: 250');
  expect(text.endsWith('pong')).toBe(true);
  expect(text).not.toContain('Error ');
});

function tutorAnswer(partial: Partial<RagAnswer>): RagAnswer {
  return {
    status: 'error',
    answer: 'The local model is not ready, so no answer was generated.',
    sources: [],
    retrieval: {
      hits: [],
      queryTerms: [],
      ignoredTerms: [],
      expandedTerms: [],
      evidenceStrength: 'none',
      outcome: 'empty_query',
    },
    timings: { retrievalMs: 1, totalMs: 2 },
    contextCharCount: 0,
    usedChunkIds: [],
    truncatedContext: false,
    ...partial,
  };
}

test('shows a tutor loading line that is not an answer', () => {
  expect(TUTOR_LOADING_TEXT.toLowerCase()).toContain('not an answer');
  expect(TUTOR_N_CTX).toBeGreaterThan(PROBE_N_CTX);
  expect(TUTOR_MAX_TOKENS).toBeLessThanOrEqual(64);
});

test('formats a tutor error without calling it correct', () => {
  const text = formatTutorAnswer(
    tutorAnswer({
      error: { code: 'MODEL_NOT_LOADED', message: 'Model runtime is uninitialized.' },
    }),
  );
  expect(text).toContain('Status: error');
  expect(text).toContain('Error MODEL_NOT_LOADED: Model runtime is uninitialized.');
  expect(text).toContain('Sources:\nNone.');
  expect(text).toContain('not marked correct');
  expect(text).toContain('Generate ms: n/a');
});

test('formats retrieved sources separately from the generated answer', () => {
  const text = formatTutorAnswer(
    tutorAnswer({
      status: 'answered',
      answer: 'Chlorophyll absorbs light. See page 9.',
      timings: { retrievalMs: 3, generationMs: 20, totalMs: 25 },
      sources: [
        {
          documentId: 'notes-cell',
          documentName: 'Cell Energy Notes',
          chunkId: 'notes-cell:0-10',
          pageNumber: 2,
          section: 'Photosynthesis',
        },
      ],
      contextCharCount: 10,
      usedChunkIds: ['notes-cell:0-10'],
    }),
  );
  expect(text).toContain('Status: answered');
  expect(text).toContain('Answer:\nChlorophyll absorbs light. See page 9.');
  const sources = text.split('Sources:\n')[1] ?? '';
  expect(sources).toContain('Cell Energy Notes, page 2, section Photosynthesis, chunk notes-cell:0-10');
  expect(sources).not.toContain('page 9');
});

test('formats a slide label and a follow-up without calling the answer correct', () => {
  const text = formatTutorAnswer(
    tutorAnswer({
      status: 'answered',
      answer: 'Chlorophyll absorbs light.',
      timings: { retrievalMs: 2, generationMs: 8, totalMs: 11 },
      sources: [
        {
          documentId: 'slides',
          documentName: 'lecture.pptx',
          chunkId: 'slides:3',
          pageNumber: 3,
          section: 'Slide 3',
        },
      ],
      contextCharCount: 20,
      usedChunkIds: ['slides:3'],
      followUp: {
        priorQuestion: 'What does chlorophyll absorb?',
        addedTerms: ['chlorophyll', 'absorb'],
      },
    }),
  );
  expect(text).toContain('Follow-up of: What does chlorophyll absorb?');
  expect(text).toContain('Added terms: chlorophyll, absorb');
  expect(text).toContain('lecture.pptx, Slide 3, chunk slides:3');
  expect(text).toContain('not marked correct');
  expect(text.split('Sources:\n')[1]).not.toContain('page 3');
});

test('loads the verified model from app-specific external storage', () => {
  const onSdcard =
    '/sdcard/Android/data/com.cognify.deviceprobe/files/Llama-3.2-1B-Instruct-Q4_K_M.gguf';
  expect(normalizeExternalModelPath(onSdcard)).toBe(EXTERNAL_MODEL_PATH);
  expect(normalizeExternalModelPath(`file://${onSdcard}`)).toBe(EXTERNAL_MODEL_PATH);
  expect(normalizeExternalModelPath(DEFAULT_MODEL_PATH)).toBe(EXTERNAL_MODEL_PATH);
  expect(DEFAULT_MODEL_PATH.startsWith('/storage/emulated/0/Android/data/')).toBe(true);
  expect(isPrivateAppFilesPath(EXTERNAL_MODEL_PATH)).toBe(false);
  expect(modelLocationNote(EXTERNAL_MODEL_PATH)).toBeUndefined();
});

test('refuses a private files path instead of pretending a copy succeeded', () => {
  const privatePath =
    '/data/user/0/com.cognify.deviceprobe/files/Llama-3.2-1B-Instruct-Q4_K_M.gguf';
  expect(isPrivateAppFilesPath(privatePath)).toBe(true);
  expect(normalizeExternalModelPath(privatePath)).toBe(privatePath);
  expect(modelLocationNote(privatePath)).toMatch(/not copied/i);
  expect(modelLocationNote(privatePath)).not.toMatch(/success/i);
});

function assessmentResult(partial: Partial<AssessmentResult>): AssessmentResult {
  return {
    status: 'error',
    kind: 'mcq',
    items: [],
    rejectedCount: 0,
    requestedCount: 2,
    sources: [],
    message: 'No assessment was generated.',
    timings: { retrievalMs: 1, totalMs: 2 },
    contextCharCount: 0,
    usedChunkIds: [],
    truncatedContext: false,
    ...partial,
  };
}

test('shows an assessment loading line that is not an assessment', () => {
  expect(ASSESSMENT_LOADING_TEXT.toLowerCase()).toContain('not an assessment');
  expect(ASSESSMENT_DISCLAIMER.toLowerCase()).toContain('not verified');
});

test('formats an MCQ with the model selection and the chunk source', () => {
  const text = formatAssessment(
    assessmentResult({
      status: 'ok',
      kind: 'mcq',
      message: 'The model returned assessment items from the retrieved passages. They are not verified as correct.',
      timings: { retrievalMs: 4, generationMs: 30, totalMs: 40 },
      items: [
        {
          id: 'mcq-1',
          question: 'What does chlorophyll absorb?',
          options: ['Light', 'Sound', 'Heat', 'Gravity'],
          correctAnswerIndex: 0,
          explanation: 'Chlorophyll can absorb light.',
          sources: [
            {
              documentId: 'notes-cell',
              documentName: 'Cell Energy Notes',
              chunkId: 'notes-cell:photo',
              pageNumber: 2,
              section: 'Photosynthesis',
            },
          ],
        },
      ],
      sources: [
        {
          documentId: 'notes-cell',
          documentName: 'Cell Energy Notes',
          chunkId: 'notes-cell:photo',
          pageNumber: 2,
          section: 'Photosynthesis',
        },
      ],
      contextCharCount: 40,
      usedChunkIds: ['notes-cell:photo'],
    }),
  );
  expect(text).toContain('Status: ok');
  expect(text).toContain('Kind: MCQ');
  expect(text).toContain('What does chlorophyll absorb?');
  expect(text).toContain('A. Light');
  expect(text).toContain('Correct option: A. Light');
  expect(text).toContain('Explanation: Chlorophyll can absorb light.');
  expect(text).toContain('Cell Energy Notes, page 2, section Photosynthesis, chunk notes-cell:photo');
  expect(text).toContain('not verified');
});

test('formats a short answer, a flashcard, and a slide without treating an error as items', () => {
  const short = formatAssessment(
    assessmentResult({
      status: 'ok',
      kind: 'short_answer',
      items: [
        {
          id: 'short-answer-1',
          question: 'What does chlorophyll absorb?',
          referenceAnswer: 'Light',
          sources: [],
        },
      ],
      message: 'The model returned assessment items from the retrieved passages. They are not verified as correct.',
    }),
  );
  expect(short).toContain('Kind: Short answer');
  expect(short).toContain('Reference answer: Light');

  const card = formatAssessment(
    assessmentResult({
      status: 'ok',
      kind: 'flashcard',
      items: [
        {
          id: 'flashcard-1',
          front: 'Chlorophyll',
          back: 'It can absorb light.',
          sources: [],
        },
      ],
      sources: [
        {
          documentId: 'slides',
          documentName: 'lecture.pptx',
          chunkId: 'slides:3',
          pageNumber: 3,
          section: 'Slide 3',
        },
      ],
      message: 'The model returned assessment items from the retrieved passages. They are not verified as correct.',
    }),
  );
  expect(card).toContain('Front: Chlorophyll');
  expect(card).toContain('Back: It can absorb light.');
  expect(card).toContain('lecture.pptx, Slide 3, chunk slides:3');
  expect(card.split('Sources:\n')[1]).not.toContain('page 3');

  const rejected = formatAssessment(
    assessmentResult({
      status: 'error',
      error: { code: 'MALFORMED_OUTPUT', message: 'The model output could not be read as assessment JSON.' },
      items: [
        {
          id: 'mcq-1',
          question: 'SHOULD_NOT_RENDER',
          options: ['Light', 'Sound', 'Heat', 'Gravity'],
          correctAnswerIndex: 0,
          sources: [],
        },
      ],
      sources: [
        {
          documentId: 'notes',
          documentName: 'Cell Energy Notes',
          chunkId: 'notes:0',
          pageNumber: 2,
        },
      ],
    }),
  );
  expect(rejected).toContain('Status: error');
  expect(rejected).toContain('Error MALFORMED_OUTPUT: The model output could not be read as assessment JSON.');
  expect(rejected).toContain('Items:\nNone.');
  expect(rejected).not.toContain('SHOULD_NOT_RENDER');
  expect(rejected).toContain('Cell Energy Notes, page 2, chunk notes:0');
  expect(formatAssessmentUnavailable('MODEL_NOT_LOADED', 'Model runtime is uninitialized.')).toContain(
    'Error MODEL_NOT_LOADED: Model runtime is uninitialized.',
  );
});

test('keeps the first trial on CPU with a small context', () => {
  expect(PROBE_N_GPU_LAYERS).toBe(0);
  expect(PROBE_N_CTX).toBeLessThanOrEqual(512);
  expect(PROBE_MAX_TOKENS).toBeLessThanOrEqual(64);
  expect(DEFAULT_PROMPT.length).toBeGreaterThan(0);
  expect(DEFAULT_MODEL_PATH.endsWith('Llama-3.2-1B-Instruct-Q4_K_M.gguf')).toBe(true);
  expect(DEFAULT_MODEL_PATH.includes('http')).toBe(false);
  expect(modelPathForFileName(DEFAULT_MODEL_PATH, FALLBACK_MODEL_FILE_NAME).endsWith(FALLBACK_MODEL_FILE_NAME)).toBe(true);
  expect(modelPathForFileName(DEFAULT_MODEL_PATH, FALLBACK_MODEL_FILE_NAME).includes('http')).toBe(false);
});
