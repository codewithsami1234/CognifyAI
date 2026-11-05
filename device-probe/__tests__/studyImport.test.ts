import { openStudyDocument } from '../src/openStudyDocument';

test('mocked extraction failures do not become an imported document', async () => {
  const unsupported = await openStudyDocument({
    openAndExtract: async () => ({ kind: 'unsupported', fileName: 'slides.pptx' }),
  });
  expect(unsupported.status).toBe('error');
  if (unsupported.status === 'error') {
    expect(unsupported.code).toBe('UNSUPPORTED');
    expect(unsupported.message).toMatch(/not added/);
  }

  const failed = await openStudyDocument({
    openAndExtract: async () => {
      throw new Error('picker crashed');
    },
  });
  expect(failed.status).toBe('error');
  if (failed.status === 'error') {
    expect(failed.code).toBe('EXTRACT_FAILED');
    expect(failed.message).toBe('picker crashed');
  }
});

test('mocked docx, slides, images, and OCR failure stay labeled as mocks', async () => {
  const docx = await openStudyDocument({
    openAndExtract: async () => ({
      kind: 'docx',
      fileName: 'notes.docx',
      pages: [{ text: 'Chlorophyll absorbs light.', pageNumber: 4 }],
    }),
  });
  expect(docx.status).toBe('ready');
  if (docx.status === 'ready') {
    expect(docx.document.materials[0]?.pageNumber).toBeUndefined();
  }

  const slide = await openStudyDocument({
    openAndExtract: async () => ({
      kind: 'pptx',
      fileName: 'lecture.pptx',
      pages: [{ text: 'Chlorophyll absorbs light.', pageNumber: 3 }],
    }),
  });
  expect(slide.status).toBe('ready');
  if (slide.status === 'ready') {
    expect(slide.document.materials[0]?.section).toBe('Slide 3');
  }

  const ocrFailed = await openStudyDocument({
    openAndExtract: async () => ({ kind: 'ocr_failed', fileName: 'scan.pdf' }),
  });
  expect(ocrFailed.status).toBe('error');
  if (ocrFailed.status === 'error') {
    expect(ocrFailed.message).toMatch(/not imported/);
  }
});

test('a mocked text import is ready and a missing native module is an error', async () => {
  const ready = await openStudyDocument({
    openAndExtract: async () => ({
      kind: 'text',
      fileName: 'notes.txt',
      sizeBytes: 40,
      pages: [{ text: 'Chlorophyll absorbs light.' }],
    }),
  });
  expect(ready.status).toBe('ready');
  if (ready.status === 'ready') {
    expect(ready.document.materials[0]?.documentName).toBe('notes.txt');
    expect(ready.document.materials[0]?.pageNumber).toBeUndefined();
  }

  const missing = await openStudyDocument(undefined);
  expect(missing.status).toBe('error');
  if (missing.status === 'error') {
    expect(missing.message).toMatch(/not available in this build/);
  }
});
