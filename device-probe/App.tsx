import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { initLlama } from 'llama.rn';
import {
  appendStudyActivity,
  chunksFromStudyMaterials,
  clearLearningProgress,
  clearQuizDraft,
  createAiTutor,
  createLlamaRnRuntime,
  createQuizSession,
  emptyDocumentLibrary,
  emptyLearningProgress,
  explainWithEvidence,
  generateAssessment,
  getDocument,
  goToQuestion,
  identifyWeakTopics,
  libraryFileBytes,
  loadDocumentLibrary,
  loadLearningProgress,
  loadQuizDraft,
  markFlashcard,
  missedQuestions,
  nextQuestion,
  PHOTOSYNTHESIS_TEXT,
  previousQuestion,
  progressFileBytes,
  recommendPassages,
  recommendRevision,
  recordQuiz,
  replaceQuizReport,
  requestSubmit,
  confirmSubmit,
  revisionCards,
  revealFlashcard,
  runInferenceProbe,
  saveDocumentLibrary,
  saveLearningProgress,
  saveQuizDraft,
  selectMcq,
  setShortAnswer,
  setShortAnswerSelfAssessment,
  topicScoresFromProgress,
  visibleQuestion,
  withGenerationQueue,
  addImportedDocument,
  addPastedDocument,
  buildPracticeAssessment,
  documentTypeFromFileName,
  removeDocument,
  COACH_METHOD_NOTE,
  type AiTutor,
  type AssessmentKind,
  type AssessmentResult,
  type DocumentLibrary,
  type InferenceProbeReport,
  type LearningProgress,
  type LibraryDocument,
  type LlamaRnModule,
  type ModelStatus,
  type PassageRecommendation,
  type PracticePlan,
  type QuizSession,
  type StudyMaterialInput,
  type UnansweredQuestion,
} from '../src/ai';
import {
  DEFAULT_MODEL_PATH,
  DEFAULT_PROMPT,
  formatProbeReport,
  PROBE_MAX_TOKENS,
  PROBE_N_CTX,
  PROBE_N_GPU_LAYERS,
  type ProbeReportView,
} from './src/formatProbeReport';
import { FALLBACK_MODEL_FILE_NAME, modelLocationNote, modelPathForFileName, normalizeExternalModelPath } from './src/externalModelPath';
import { getStudyDocumentModule, openStudyDocument } from './src/openStudyDocument';
import { formatTutorAnswer, TUTOR_LOADING_TEXT, TUTOR_MAX_TOKENS, TUTOR_N_CTX } from './src/formatTutorAnswer';
import { formatAssessment, formatAssessmentUnavailable } from './src/formatAssessment';
import { createAppTextStore, type LocalFileInfo } from './src/localTextStore';
import { ProbeScreen } from './src/ProbeScreen';
import { AssessmentScreen } from './src/screens/AssessmentScreen';
import { CoachScreen } from './src/screens/CoachScreen';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { DocumentScreen } from './src/screens/DocumentScreen';
import { LibraryScreen } from './src/screens/LibraryScreen';
import { QuizScreen } from './src/screens/QuizScreen';
import { ResultsScreen } from './src/screens/ResultsScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { TutorScreen } from './src/screens/TutorScreen';
import { createLocalId, colors } from './src/theme';
import { Notice } from './src/ui';
import { SearchScreen } from './src/screens/SearchScreen';
import { HistoryScreen } from './src/screens/HistoryScreen';
import { SavedScreen } from './src/screens/SavedScreen';
import { FlashcardsScreen } from './src/screens/FlashcardsScreen';
import { AnalyticsScreen } from './src/screens/AnalyticsScreen';
import { PracticeScreen } from './src/screens/PracticeScreen';
import { DocumentChatScreen } from './src/screens/DocumentChatScreen';
import { ModelManagerScreen } from './src/screens/ModelManagerScreen';
import { StudyPlanScreen } from './src/screens/StudyPlanScreen';
import { StudyToolsScreen } from './src/screens/StudyToolsScreen';
import { indexLibrary } from './src/offline/indexLibrary';
import { openStudyDatabase } from './src/offline/studyDatabase';
import { localDay } from './src/offline/dayKey';
import { addMessage, createConversation, recordDocumentOpen } from '../src/ai/persistence/historyRepository';
import { saveBookmark } from '../src/ai/persistence/knowledgeRepository';
import { createFlashcard, flashcardsFromPassage } from '../src/ai/persistence/flashcardRepository';
import { endLearningSession, startLearningSession } from '../src/ai/persistence/analyticsRepository';
import { createLexiconEmbedder } from '../src/ai/embeddings/lexiconEmbedder';
import { searchStoredChunks } from '../src/ai/embeddings/indexChunks';
import type { RagAnswer } from '../src/ai';

function start(task: () => Promise<void>): () => void {
  return () => {
    task().catch(() => undefined);
  };
}

type StudentScreen =
  | 'dashboard'
  | 'library'
  | 'document'
  | 'tutor'
  | 'assessment'
  | 'quiz'
  | 'results'
  | 'coach'
  | 'settings'
  | 'probe'
  | 'search'
  | 'tools'
  | 'history'
  | 'saved'
  | 'flashcards'
  | 'analytics'
  | 'practice'
  | 'docchat'
  | 'models'
  | 'plan';

type StoredStatus = 'loading' | 'empty' | 'ok' | 'unreadable';

function toView(report: InferenceProbeReport): ProbeReportView {
  const view: ProbeReportView = {
    loaded: report.loaded,
    generated: report.generated,
    statusState: report.status.state,
  };
  if (report.initTimeMs !== undefined) {
    view.initTimeMs = report.initTimeMs;
  }
  if (report.generationTimeMs !== undefined) {
    view.generationTimeMs = report.generationTimeMs;
  }
  if (report.firstTokenMs !== undefined) {
    view.firstTokenMs = report.firstTokenMs;
  }
  if (report.tokenCount !== undefined) {
    view.tokenCount = report.tokenCount;
  }
  if (report.outputText !== undefined) {
    view.outputText = report.outputText;
  }
  if (report.error) {
    view.error = {
      code: report.error.code,
      message: report.error.message,
    };
    if (report.error.cause) {
      view.error.cause = report.error.cause;
    }
  }
  return view;
}

function App() {
  const textStoreHandle = useMemo(() => createAppTextStore(), []);
  const runtime = useMemo(
    () =>
      withGenerationQueue(
        createLlamaRnRuntime({
          nCtx: PROBE_N_CTX,
          nGpuLayers: PROBE_N_GPU_LAYERS,
          loadModule: async () =>
            ({
              initLlama: (params: { model: string }) => initLlama(params),
            }) as unknown as LlamaRnModule,
        }),
      ),
    [],
  );
  const [screen, setScreen] = useState<StudentScreen>('dashboard');
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState<string | undefined>(undefined);
  const [modelPath, setModelPath] = useState(DEFAULT_MODEL_PATH);
  const resolvedModelPath = normalizeExternalModelPath(modelPath);
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [busy, setBusy] = useState(false);
  const [reportText, setReportText] = useState(
    'No probe has been run. The model file is not downloaded by this app.',
  );
  const tutor = useMemo<AiTutor>(
    () =>
      createAiTutor({
        runtime,
        modelPath: resolvedModelPath,
        nCtx: TUTOR_N_CTX,
        nGpuLayers: PROBE_N_GPU_LAYERS,
        maxTokens: TUTOR_MAX_TOKENS,
        temperature: 0.2,
        retrieveEvidence: async (question, chunks) => {
          const db = await openStudyDatabase();
          if (!db) {
            return undefined;
          }
          const result = await searchStoredChunks(db, createLexiconEmbedder(), question, { topK: 4 });
          const documentIds = new Set(chunks.map(chunk => chunk.documentId));
          const hits = result.hits.filter(hit => documentIds.has(hit.chunk.documentId));
          if (hits.length === 0) {
            return undefined;
          }
          const scores: Record<string, number> = {};
          for (const hit of hits) {
            scores[hit.chunk.chunkId] = hit.score;
          }
          const method = hits.some(hit => hit.channels.includes('semantic') && hit.channels.includes('keyword'))
            ? 'hybrid'
            : hits.some(hit => hit.channels.includes('semantic'))
              ? 'semantic'
              : 'keyword';
          return { chunks: hits.map(hit => hit.chunk), scores, method };
        },
      }),
    [runtime, resolvedModelPath],
  );
  const [studyText, setStudyText] = useState(PHOTOSYNTHESIS_TEXT);
  const [documentName, setDocumentName] = useState('Cell Energy Notes');
  const [pageText, setPageText] = useState('2');
  const [question, setQuestion] = useState('What does chlorophyll absorb?');
  const [tutorText, setTutorText] = useState(
    'No tutor question has been asked. Paste text or import a local document. This screen does not download a model.',
  );
  const [importStatus, setImportStatus] = useState(
    'No document imported. Paste text, or import .txt, .pdf, .docx, .pptx, .png, .jpg, or .jpeg. A failed import keeps the current text.',
  );
  const [importedMaterials, setImportedMaterials] = useState<StudyMaterialInput[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [assessmentKind, setAssessmentKind] = useState<AssessmentKind>('mcq');
  const [assessmentCount, setAssessmentCount] = useState<1 | 2 | 3>(2);
  const [assessmentFocus, setAssessmentFocus] = useState('');
  const [assessmentText, setAssessmentText] = useState(
    'No assessment has been generated. This screen uses the study text above. It does not upload documents or call a cloud model.',
  );
  const [library, setLibrary] = useState<DocumentLibrary>(emptyDocumentLibrary());
  const [progress, setProgress] = useState<LearningProgress>(emptyLearningProgress());
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);
  const [modelStatus, setModelStatus] = useState<ModelStatus | undefined>(undefined);
  const [ggufInfo, setGgufInfo] = useState<LocalFileInfo | undefined>(undefined);
  const [progressBytes, setProgressBytes] = useState(0);
  const [libraryBytes, setLibraryBytes] = useState(0);
  const [studentKind, setStudentKind] = useState<AssessmentKind>('mcq');
  const [studentCount, setStudentCount] = useState<1 | 2 | 3>(2);
  const [studentFocus, setStudentFocus] = useState('');
  const [studentAssessment, setStudentAssessment] = useState<AssessmentResult | undefined>(undefined);
  const [quizSession, setQuizSession] = useState<QuizSession | null>(null);
  const [unanswered, setUnanswered] = useState<UnansweredQuestion[] | null>(null);
  const [tutorQuestion, setTutorQuestion] = useState('What does chlorophyll absorb?');
  const [studentTutorText, setStudentTutorText] = useState(
    'No tutor question has been asked. Choose a library document first.',
  );
  const [spokenTutor, setSpokenTutor] = useState('');
  const [pasteTitle, setPasteTitle] = useState('Pasted notes');
  const [pastePage, setPastePage] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [coachQuestion, setCoachQuestion] = useState('');
  const [coachExplanation, setCoachExplanation] = useState('');
  const [passages, setPassages] = useState<PassageRecommendation | undefined>(undefined);
  const [practicePlan, setPracticePlan] = useState<PracticePlan | undefined>(undefined);
  const [practiceReady, setPracticeReady] = useState(false);
  const [savedDraft, setSavedDraft] = useState<QuizSession | null>(null);
  const [draftUnreadable, setDraftUnreadable] = useState(false);

  const libraryRef = useRef(library);
  const progressRef = useRef(progress);
  const libraryStatusRef = useRef<StoredStatus>('loading');
  const progressStatusRef = useRef<StoredStatus>('loading');
  const activeIdRef = useRef<string | null>(null);
  const quizRef = useRef<QuizSession | null>(null);
  const librarySave = useRef(Promise.resolve());
  const progressSave = useRef(Promise.resolve());
  const submitLock = useRef(false);
  const practiceQuizRef = useRef<QuizSession | null>(null);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftEpoch = useRef(0);
  const conversationIdRef = useRef<string | undefined>(undefined);
  const lastTutorAnswer = useRef<RagAnswer | null>(null);
  const draftSave = useRef(Promise.resolve());
  const busyRef = useRef(false);
  const backgroundedDuringWork = useRef(false);
  const onAppState = useRef<(nextState: string) => void>(() => undefined);
  busyRef.current = busy;

  const locationNote = modelLocationNote(modelPath);
  const activeDocument: LibraryDocument | undefined = activeDocumentId
    ? getDocument(library, activeDocumentId)
    : undefined;

  function selectDocument(id: string | null) {
    activeIdRef.current = id;
    setActiveDocumentId(id);
  }

  function cancelDraftTimer() {
    if (draftTimer.current) {
      clearTimeout(draftTimer.current);
      draftTimer.current = null;
    }
  }

  function closeDraftWrites() {
    draftEpoch.current += 1;
    cancelDraftTimer();
  }

  function flushDraft() {
    const epoch = draftEpoch.current;
    const current = quizRef.current;
    if (!current || current.submitted) {
      return;
    }
    draftSave.current = draftSave.current
      .then(async () => {
        if (draftEpoch.current !== epoch) {
          return;
        }
        const latest = quizRef.current;
        if (!latest || latest.submitted || latest.id !== current.id) {
          return;
        }
        await saveQuizDraft(textStoreHandle.store, latest, new Date().toISOString());
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        setNotice(`The unfinished quiz could not be saved. ${message}`);
      });
  }

  function scheduleDraftSave() {
    cancelDraftTimer();
    draftTimer.current = setTimeout(() => {
      draftTimer.current = null;
      flushDraft();
    }, 400);
  }

  function setQuiz(next: QuizSession | null, options?: { immediate?: boolean }) {
    quizRef.current = next;
    setQuizSession(next);
    if (next && !next.submitted) {
      setSavedDraft(next);
      if (options?.immediate === false) {
        scheduleDraftSave();
      } else {
        cancelDraftTimer();
        flushDraft();
      }
    }
  }

  function commitLibrary(next: DocumentLibrary) {
    libraryRef.current = next;
    setLibrary(next);
    if (libraryStatusRef.current === 'unreadable' || libraryStatusRef.current === 'loading') {
      if (libraryStatusRef.current === 'unreadable') {
        setNotice('The saved library could not be read, so this change was kept on screen and was not written over the file.');
      }
      return;
    }
    librarySave.current = librarySave.current
      .then(async () => {
        await saveDocumentLibrary(textStoreHandle.store, libraryRef.current);
        libraryStatusRef.current = 'ok';
        setLibraryBytes(await libraryFileBytes(textStoreHandle.store));
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        setNotice(`The library could not be saved. ${message}`);
      });
  }

  function commitProgress(next: LearningProgress, afterSave?: () => Promise<void>) {
    progressRef.current = next;
    setProgress(next);
    if (progressStatusRef.current === 'unreadable' || progressStatusRef.current === 'loading') {
      if (progressStatusRef.current === 'unreadable') {
        setNotice(
          'Saved learning history could not be read, so this change was kept on screen and was not written over the file.',
        );
      }
      return;
    }
    progressSave.current = progressSave.current
      .then(async () => {
        await saveLearningProgress(textStoreHandle.store, progressRef.current);
        progressStatusRef.current = 'ok';
        setProgressBytes(await progressFileBytes(textStoreHandle.store));
        if (afterSave) {
          await afterSave();
        }
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        setNotice(`Learning history could not be saved. ${message}`);
      });
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [loadedLibrary, loadedProgress, progressSize, librarySize] = await Promise.all([
        loadDocumentLibrary(textStoreHandle.store),
        loadLearningProgress(textStoreHandle.store),
        progressFileBytes(textStoreHandle.store),
        libraryFileBytes(textStoreHandle.store),
      ]);
      if (cancelled) {
        return;
      }
      libraryRef.current = loadedLibrary.library;
      libraryStatusRef.current = loadedLibrary.status;
      progressRef.current = loadedProgress.progress;
      progressStatusRef.current = loadedProgress.status;
      setLibrary(loadedLibrary.library);
      setProgress(loadedProgress.progress);
      setProgressBytes(progressSize);
      setLibraryBytes(librarySize);
      const loadedDraft = await loadQuizDraft(textStoreHandle.store, loadedProgress.progress);
      if (cancelled) {
        return;
      }
      const notes: string[] = [];
      if (!textStoreHandle.persistent) {
        notes.push('Local files are not available in this session, so new history will not survive a restart.');
      } else if (loadedProgress.status === 'unreadable') {
        notes.push('Saved learning history could not be read. It was not replaced. Clear history if you want to start again.');
      } else if (loadedLibrary.status === 'unreadable') {
        notes.push('The saved library could not be read. It was not replaced.');
      }
      if (loadedDraft.status === 'ready') {
        setSavedDraft(loadedDraft.session);
        setDraftUnreadable(false);
      } else if (loadedDraft.status === 'already_recorded') {
        setSavedDraft(null);
        setDraftUnreadable(false);
        await clearQuizDraft(textStoreHandle.store);
      } else if (loadedDraft.status === 'unreadable') {
        setSavedDraft(null);
        setDraftUnreadable(true);
        notes.push('An unfinished quiz file could not be read. It was left in place. Discard it from the dashboard to remove that file.');
      }
      if (notes.length > 0) {
        setNotice(notes.join(' '));
      }
      setReady(true);
    })().catch((error: unknown) => {
      if (!cancelled) {
        const message = error instanceof Error ? error.message : String(error);
        setNotice(`Saved study data could not be loaded. ${message}`);
        setReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [textStoreHandle]);

  const sessionRef = useRef<{ id: string; startedMs: number } | undefined>(undefined);

  useEffect(() => {
    const id = createLocalId('session');
    const startedMs = Date.now();
    sessionRef.current = { id, startedMs };
    void openStudyDatabase().then(db => {
      if (!db || sessionRef.current?.id !== id) {
        return undefined;
      }
      return startLearningSession(db, {
        id,
        moduleName: 'app',
        startedAt: new Date(startedMs).toISOString(),
        dayKey: localDay(),
      });
    });
    return () => {
      const current = sessionRef.current;
      sessionRef.current = undefined;
      if (!current) {
        return;
      }
      void openStudyDatabase().then(db => {
        if (!db) {
          return undefined;
        }
        return endLearningSession(db, current.id, new Date().toISOString(), Date.now() - current.startedMs);
      });
    };
  }, []);

  useEffect(() => {
    if (!ready) {
      return undefined;
    }
    let cancelled = false;
    void openStudyDatabase().then(db => {
      if (!db || cancelled) {
        return undefined;
      }
      return indexLibrary(db, library.documents, () => cancelled);
    });
    return () => {
      cancelled = true;
    };
  }, [ready, library]);

  useEffect(() => {
    if (screen !== 'document' || !activeDocument) {
      return undefined;
    }
    const page = activeDocument.materials.find(material => typeof material.pageNumber === 'number')?.pageNumber;
    void openStudyDatabase().then(db => {
      if (!db) {
        return undefined;
      }
      return recordDocumentOpen(db, {
        documentId: activeDocument.id,
        documentName: activeDocument.title,
        openedAt: new Date().toISOString(),
        dayKey: localDay(),
        ...(typeof page === 'number' ? { pageNumber: page } : {}),
      });
    });
    return undefined;
  }, [screen, activeDocument]);

  onAppState.current = nextState => {
    if (nextState === 'background' || nextState === 'inactive') {
      cancelDraftTimer();
      flushDraft();
      const current = sessionRef.current;
      sessionRef.current = undefined;
      if (current) {
        void openStudyDatabase().then(db => {
          if (!db) {
            return undefined;
          }
          return endLearningSession(db, current.id, new Date().toISOString(), Date.now() - current.startedMs);
        });
      }
      if (busyRef.current) {
        backgroundedDuringWork.current = true;
      }
    }
    if (nextState === 'active') {
      if (!sessionRef.current) {
        const id = createLocalId('session');
        const startedMs = Date.now();
        sessionRef.current = { id, startedMs };
        void openStudyDatabase().then(db => {
          if (!db || sessionRef.current?.id !== id) {
            return undefined;
          }
          return startLearningSession(db, {
            id,
            moduleName: 'app',
            startedAt: new Date(startedMs).toISOString(),
            dayKey: localDay(),
          });
        });
      }
      if (backgroundedDuringWork.current) {
        backgroundedDuringWork.current = false;
        setNotice(
          'The app was in the background while the local model was working. Wait for that work to finish. It does not use the network.',
        );
      }
    }
  };

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextState => {
      onAppState.current(nextState);
    });
    return () => {
      subscription.remove();
    };
  }, []);

  function libraryChunks() {
    const materials = libraryRef.current.documents.flatMap(document => document.materials);
    if (materials.length === 0) {
      return [];
    }
    return chunksFromStudyMaterials(materials);
  }

  function resolveStudyMaterials():
    | { ok: true; materials: StudyMaterialInput[] }
    | { ok: false; tutorMessage: string; assessmentMessage: string } {
    const imported = importedMaterials;
    if (imported && imported.length > 0) {
      return { ok: true, materials: imported };
    }
    const name = documentName.trim();
    if (name.length === 0) {
      return {
        ok: false,
        tutorMessage: 'Status: error\nEnter a document name. No answer was generated.\nAnswer:\nSources:\nNone.',
        assessmentMessage: formatAssessmentUnavailable(
          'INVALID_REQUEST',
          'Enter a document name. No assessment was generated.',
        ),
      };
    }
    let pageNumber: number | undefined;
    if (pageText.trim().length > 0) {
      const parsed = Number(pageText.trim());
      if (!Number.isInteger(parsed) || parsed < 1) {
        return {
          ok: false,
          tutorMessage:
            'Status: error\nPage must be a positive whole number, or left blank. No page was guessed and no answer was generated.\nAnswer:\nSources:\nNone.',
          assessmentMessage: formatAssessmentUnavailable(
            'INVALID_REQUEST',
            'Page must be a positive whole number, or left blank. No page was guessed and no assessment was generated.',
          ),
        };
      }
      pageNumber = parsed;
    }
    const material: StudyMaterialInput = {
      documentId: 'pasted-notes',
      documentName: name,
      text: studyText,
      section: 'Pasted text',
    };
    if (pageNumber !== undefined) {
      material.pageNumber = pageNumber;
    }
    return { ok: true, materials: [material] };
  }

  async function onProbe() {
    if (locationNote) {
      setReportText(
        `Loaded: no\nGenerated: no\nRuntime state: failed\nError MODEL_FILE_MISSING: ${locationNote}\nOutput:\n`,
      );
      return;
    }
    setBusy(true);
    await tutor.forgetInitialization();
    try {
      const report = await runInferenceProbe(runtime, {
        modelPath: resolvedModelPath,
        prompt,
        maxTokens: PROBE_MAX_TOKENS,
        readResources: () => ({
          source: 'unavailable',
          note: 'Use adb shell dumpsys meminfo com.cognify.deviceprobe for phone memory. This snapshot is not that measurement.',
        }),
      });
      const view = formatProbeReport(toView(report));
      console.log(`[cognify-probe] ${view.replace(/\n/g, ' | ')}`);
      setReportText(view);
      setModelStatus(runtime.getStatus());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setReportText(`Loaded: no\nGenerated: no\nRuntime state: failed\nError INFERENCE_FAILED: ${message}\nOutput:\n`);
    } finally {
      setBusy(false);
    }
  }

  async function onGenerateAgain() {
    setBusy(true);
    try {
      const started = Date.now();
      const generated = await runtime.generate({
        prompt,
        maxTokens: PROBE_MAX_TOKENS,
        temperature: 0,
      });
      const again = formatProbeReport({
        loaded: true,
        generated: generated.text.trim().length > 0,
        statusState: runtime.getStatus().state,
        generationTimeMs: Date.now() - started,
        ...(generated.firstTokenMs !== undefined ? { firstTokenMs: generated.firstTokenMs } : {}),
        ...(generated.tokenCount !== undefined ? { tokenCount: generated.tokenCount } : {}),
        outputText: generated.text,
      });
      console.log(`[cognify-probe] ${again.replace(/\n/g, ' | ')}`);
      setReportText(again);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const code = error instanceof Error && 'code' in error ? String(error.code) : 'INFERENCE_FAILED';
      const state = runtime.getStatus().state;
      setReportText(
        `Loaded: ${state === 'ready' ? 'yes' : 'no'}\nGenerated: no\nRuntime state: ${state}\nError ${code}: ${message}\nOutput:\n`,
      );
    } finally {
      setBusy(false);
    }
  }

  async function onAsk() {
    if (locationNote) {
      setTutorText(`Status: error\nError MODEL_FILE_MISSING: ${locationNote}\nAnswer:\nSources:\nNone.`);
      return;
    }
    const resolved = resolveStudyMaterials();
    if (!resolved.ok) {
      setTutorText(resolved.tutorMessage);
      return;
    }
    setBusy(true);
    setTutorText(TUTOR_LOADING_TEXT);
    try {
      tutor.prepareStudyMaterial(resolved.materials);
      const loaded = await tutor.initialize();
      setModelStatus(loaded);
      if (loaded.state !== 'ready') {
        setTutorText(
          `Status: error\nError ${loaded.error?.code ?? 'MODEL_LOAD_FAILED'}: ${loaded.error?.message ?? 'The local model did not become ready.'}\nAnswer:\nThe local model is not ready, so no answer was generated.\nSources:\nNone.`,
        );
        return;
      }
      const answer = await tutor.askQuestion(question);
      const tutorView = formatTutorAnswer(answer);
      console.log(`[cognify-tutor] ${tutorView.replace(/\n/g, ' | ')}`);
      setTutorText(tutorView);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setTutorText(
        `Status: error\nError INFERENCE_FAILED: ${message}\nAnswer:\nLocal generation failed before an answer could be produced.\nSources:\nNone.`,
      );
    } finally {
      setBusy(false);
    }
  }

  async function onGenerateAssessment() {
    if (locationNote) {
      setAssessmentText(formatAssessmentUnavailable('MODEL_FILE_MISSING', locationNote));
      return;
    }
    const resolved = resolveStudyMaterials();
    if (!resolved.ok) {
      setAssessmentText(resolved.assessmentMessage);
      return;
    }
    setBusy(true);
    setAssessmentText('The local model is generating an assessment from the retrieved passages. This line is not an assessment.');
    try {
      const loaded = await tutor.initialize();
      setModelStatus(loaded);
      if (loaded.state !== 'ready') {
        setAssessmentText(
          formatAssessmentUnavailable(
            loaded.error?.code ?? 'MODEL_LOAD_FAILED',
            loaded.error?.message ?? 'The local model did not become ready.',
          ),
        );
        return;
      }
      const chunks = chunksFromStudyMaterials(resolved.materials);
      const focus = assessmentFocus.trim();
      const request: {
        chunks: ReturnType<typeof chunksFromStudyMaterials>;
        kind: AssessmentKind;
        count: 1 | 2 | 3;
        focus?: string;
      } = {
        chunks,
        kind: assessmentKind,
        count: assessmentCount,
      };
      if (focus.length > 0) {
        request.focus = focus;
      }
      const result = await generateAssessment(runtime, request);
      const assessmentView = formatAssessment(result);
      console.log(`[cognify-assessment] ${assessmentView.replace(/\n/g, ' | ')}`);
      setAssessmentText(assessmentView);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setAssessmentText(formatAssessmentUnavailable('INVALID_REQUEST', message));
    } finally {
      setBusy(false);
    }
  }

  function onStudyTextChange(value: string) {
    setStudyText(value);
    if (importedMaterials) {
      setImportedMaterials(null);
      setImportStatus('Using pasted text. Import another document to replace it.');
    }
  }

  async function onImport(openDocument: boolean) {
    setImporting(true);
    setImportStatus('Reading the document on this device. This line is not an answer.');
    try {
      const result = await openStudyDocument(getStudyDocumentModule());
      if (result.status === 'cancelled') {
        setImportStatus('Import cancelled. The current study text was kept.');
        return;
      }
      if (result.status === 'error') {
        setImportStatus(result.message);
        return;
      }
      const combined = result.document.materials.map(material => material.text).join('\n\n');
      const preview =
        combined.length > 4000
          ? `${combined.slice(0, 4000)}\n\n… ${combined.length} characters imported. Editing this box uses only the pasted text.`
          : combined;
      setImportedMaterials(result.document.materials);
      setDocumentName(result.document.fileName);
      setPageText('');
      setStudyText(preview);
      const added = addImportedDocument(libraryRef.current, result.document, {
        id: createLocalId('doc'),
        type: documentTypeFromFileName(result.document.fileName),
        importedAt: new Date().toISOString(),
      });
      commitLibrary(added.library);
      selectDocument(added.document.id);
      commitProgress(
        appendStudyActivity(progressRef.current, {
          id: createLocalId('import'),
          at: new Date().toISOString(),
          kind: 'document_imported',
          label: added.replaced ? `Replaced ${added.document.title}` : `Imported ${added.document.title}`,
        }),
      );
      setImportStatus(
        `${added.document.title}: ${added.document.pageCount} section(s), ${added.document.charCount} characters. Page numbers are kept only when the file provided them.`,
      );
      if (openDocument) {
        setScreen('document');
      }
    } finally {
      setImporting(false);
    }
  }

  async function onRelease() {
    setBusy(true);
    try {
      await tutor.forgetInitialization();
      await runtime.release();
      setModelStatus(runtime.getStatus());
      setReportText(`Loaded: no\nGenerated: no\nRuntime state: ${runtime.getStatus().state}\nOutput:\n`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setReportText(`Loaded: no\nGenerated: no\nRuntime state: failed\nError INFERENCE_FAILED: ${message}\nOutput:\n`);
    } finally {
      setBusy(false);
    }
  }

  function onSavePaste() {
    const pageTrimmed = pastePage.trim();
    const input: { title: string; text: string; importedAt: string; pageNumber?: number } = {
      title: pasteTitle,
      text: pasteText,
      importedAt: new Date().toISOString(),
    };
    if (pageTrimmed.length > 0) {
      input.pageNumber = Number(pageTrimmed);
    }
    const added = addPastedDocument(libraryRef.current, input);
    if ('error' in added) {
      setNotice(added.error);
      return;
    }
    commitLibrary(added.library);
    selectDocument(added.document.id);
    commitProgress(
      appendStudyActivity(progressRef.current, {
        id: createLocalId('import'),
        at: input.importedAt,
        kind: 'document_imported',
        label: `Saved pasted notes ${added.document.title}`,
      }),
    );
    setNotice(`Saved ${added.document.title} in the library.`);
  }

  function onRemoveDocument() {
    const document = activeIdRef.current ? getDocument(libraryRef.current, activeIdRef.current) : undefined;
    if (!document) {
      return;
    }
    Alert.alert(
      'Remove document',
      `Remove "${document.title}" from the library on this device? The original file is not deleted. Quiz history is kept.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            const removed = removeDocument(libraryRef.current, document.id);
            commitLibrary(removed.library);
            selectDocument(null);
            commitProgress(
              appendStudyActivity(progressRef.current, {
                id: createLocalId('remove'),
                at: new Date().toISOString(),
                kind: 'document_removed',
                label: `Removed ${document.title}`,
              }),
            );
            setScreen('library');
          },
        },
      ],
    );
  }

  async function onStudentAsk() {
    const document = activeIdRef.current ? getDocument(libraryRef.current, activeIdRef.current) : undefined;
    if (!document) {
      setStudentTutorText('Choose a document before asking. No answer was generated.');
      return;
    }
    if (locationNote) {
      setStudentTutorText(`Status: error\nError MODEL_FILE_MISSING: ${locationNote}\nAnswer:\nSources:\nNone.`);
      return;
    }
    setBusy(true);
    setStudentTutorText(TUTOR_LOADING_TEXT);
    try {
      tutor.prepareStudyMaterial(document.materials);
      const loaded = await tutor.initialize();
      setModelStatus(loaded);
      if (loaded.state !== 'ready') {
        setStudentTutorText(
          `Status: error\nError ${loaded.error?.code ?? 'MODEL_LOAD_FAILED'}: ${loaded.error?.message ?? 'The local model did not become ready.'}\nAnswer:\nThe local model is not ready, so no answer was generated.\nSources:\nNone.`,
        );
        return;
      }
      const answer = await tutor.askQuestion(tutorQuestion);
      setStudentTutorText(formatTutorAnswer(answer));
      setSpokenTutor(answer.answer);
      lastTutorAnswer.current = answer;
      const label = tutorQuestion.trim().slice(0, 80);
      try {
        const db = await openStudyDatabase();
        if (db && tutorQuestion.trim().length > 0) {
          const now = new Date().toISOString();
          if (!conversationIdRef.current) {
            const id = createLocalId('conv');
            await createConversation(db, {
              id,
              title: label || 'Tutor',
              createdAt: now,
              documentId: document.id,
              documentName: document.title,
            });
            conversationIdRef.current = id;
          }
          const conversationId = conversationIdRef.current;
          await addMessage(db, {
            id: createLocalId('msg'),
            conversationId,
            role: 'user',
            content: tutorQuestion.trim(),
            createdAt: now,
          });
          await addMessage(db, {
            id: createLocalId('msg'),
            conversationId,
            role: 'assistant',
            content: answer.answer,
            createdAt: new Date().toISOString(),
            grounded: answer.status === 'answered' && answer.sources.length > 0,
            sources: answer.sources,
          });
        }
      } catch (persistError) {
        const message = persistError instanceof Error ? persistError.message : String(persistError);
        setNotice(`The answer was shown, but it was not added to history. ${message}`);
      }
      if (label.length > 0) {
        commitProgress(
          appendStudyActivity(progressRef.current, {
            id: createLocalId('tutor'),
            at: new Date().toISOString(),
            kind: 'tutor_question',
            label: `Asked: ${label}`,
          }),
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStudentTutorText(
        `Status: error\nError INFERENCE_FAILED: ${message}\nAnswer:\nLocal generation failed before an answer could be produced.\nSources:\nNone.`,
      );
    } finally {
      setBusy(false);
    }
  }

  async function onStudentGenerate() {
    const document = activeIdRef.current ? getDocument(libraryRef.current, activeIdRef.current) : undefined;
    if (!document) {
      setNotice('Select a document before generating an assessment.');
      return;
    }
    if (locationNote) {
      setNotice(locationNote);
      return;
    }
    setBusy(true);
    try {
      const loaded = await tutor.initialize();
      setModelStatus(loaded);
      if (loaded.state !== 'ready') {
        setStudentAssessment(undefined);
        setNotice(loaded.error?.message ?? 'The local model did not become ready.');
        return;
      }
      const chunks = chunksFromStudyMaterials(document.materials);
      const focus = studentFocus.trim();
      const request: {
        chunks: ReturnType<typeof chunksFromStudyMaterials>;
        kind: AssessmentKind;
        count: 1 | 2 | 3;
        focus?: string;
      } = { chunks, kind: studentKind, count: studentCount };
      if (focus.length > 0) {
        request.focus = focus;
      }
      const result = await generateAssessment(runtime, request);
      setStudentAssessment(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setNotice(message);
    } finally {
      setBusy(false);
    }
  }

  function beginQuiz(session: QuizSession) {
    closeDraftWrites();
    setQuiz(session);
    flushDraft();
    setUnanswered(null);
    setPracticeReady(false);
    setDraftUnreadable(false);
    setScreen('quiz');
  }

  function onStartQuiz() {
    if (!studentAssessment || studentAssessment.status !== 'ok') {
      setNotice('Generate a validated assessment before starting a quiz.');
      return;
    }
    const session = createQuizSession(studentAssessment, {
      id: createLocalId('quiz'),
      now: new Date().toISOString(),
    });
    if (!session) {
      setNotice('No validated items were available, so a quiz was not started.');
      return;
    }
    const current = quizRef.current;
    if (current && !current.submitted) {
      Alert.alert(
        'Start a new quiz?',
        'The unfinished quiz is saved on this device. Starting a new one replaces that saved attempt.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Start', onPress: () => beginQuiz(session) },
        ],
      );
      return;
    }
    beginQuiz(session);
  }

  function finishQuiz(session: QuizSession) {
    if (!session.report) {
      return;
    }
    closeDraftWrites();
    setQuiz(session);
    setUnanswered(null);
    const saved = recordQuiz(progressRef.current, session.report);
    if (saved === progressRef.current) {
      setNotice('This quiz was already saved. A second record was not added.');
    }
    const sessionId = session.id;
    commitProgress(saved, async () => {
      await draftSave.current;
      if (!progressRef.current.quizzes.some(quiz => quiz.sessionId === sessionId)) {
        return;
      }
      await clearQuizDraft(textStoreHandle.store);
      setSavedDraft(null);
    });
    setScreen('results');
  }

  function onSubmitQuiz() {
    const current = quizRef.current;
    if (!current || current.submitted || submitLock.current) {
      return;
    }
    submitLock.current = true;
    try {
      const outcome = requestSubmit(current, new Date().toISOString());
      if (outcome.status === 'needs_confirmation') {
        setQuiz(outcome.session);
        setUnanswered(outcome.unanswered);
        return;
      }
      if (outcome.status === 'already_submitted') {
        setQuiz(outcome.session);
        setScreen('results');
        return;
      }
      finishQuiz(outcome.session);
    } finally {
      submitLock.current = false;
    }
  }

  function onConfirmSubmit() {
    const current = quizRef.current;
    if (!current || current.submitted || submitLock.current) {
      return;
    }
    submitLock.current = true;
    try {
      const outcome = confirmSubmit(current, new Date().toISOString());
      if (outcome.status === 'submitted') {
        finishQuiz(outcome.session);
        return;
      }
      setQuiz(outcome.session);
      setScreen('results');
    } finally {
      submitLock.current = false;
    }
  }

  function onSelectOption(index: 0 | 1 | 2 | 3) {
    const current = quizRef.current;
    if (!current) {
      return;
    }
    const view = visibleQuestion(current);
    if (view?.kind !== 'mcq') {
      return;
    }
    setQuiz(selectMcq(current, view.id, index));
  }

  function onShortAnswer(text: string) {
    const current = quizRef.current;
    if (!current) {
      return;
    }
    const view = visibleQuestion(current);
    if (view?.kind !== 'short_answer') {
      return;
    }
    setQuiz(setShortAnswer(current, view.id, text), { immediate: false });
  }

  function onReveal() {
    const current = quizRef.current;
    if (!current) {
      return;
    }
    const view = visibleQuestion(current);
    if (view?.kind !== 'flashcard') {
      return;
    }
    setQuiz(revealFlashcard(current, view.id));
  }

  function onMark(mark: 'known' | 'needs_revision') {
    const current = quizRef.current;
    if (!current) {
      return;
    }
    const view = visibleQuestion(current);
    if (view?.kind !== 'flashcard') {
      return;
    }
    setQuiz(markFlashcard(current, view.id, mark));
  }

  function onSelfAssess(itemId: string, value: 'understood' | 'needs_review') {
    const current = quizRef.current;
    if (!current) {
      return;
    }
    const next = setShortAnswerSelfAssessment(current, itemId, value);
    setQuiz(next);
    if (next.report) {
      commitProgress(replaceQuizReport(progressRef.current, next.report));
    }
  }

  async function ensureReadyModel(): Promise<boolean> {
    if (locationNote) {
      setNotice(locationNote);
      return false;
    }
    const loaded = await tutor.initialize();
    setModelStatus(loaded);
    if (loaded.state !== 'ready') {
      setNotice(loaded.error?.message ?? 'The local model did not become ready.');
      return false;
    }
    return true;
  }

  function onRecommendPassages() {
    const scores = topicScoresFromProgress(progressRef.current);
    const weak = identifyWeakTopics(scores, 0.6);
    const missed = missedQuestions(progressRef.current);
    const query = weak[0]?.topic ?? missed[0]?.question ?? '';
    if (query.length === 0) {
      setPassages({
        status: 'insufficient_evidence',
        message: 'There is no recorded weak topic or incorrect question to look up.',
        methodNote: COACH_METHOD_NOTE,
        query: '',
        passages: [],
      });
      return;
    }
    try {
      setPassages(recommendPassages(libraryChunks(), query));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setNotice(message);
    }
  }

  async function onExplain() {
    const trimmed = coachQuestion.trim();
    if (trimmed.length === 0) {
      setCoachExplanation('Enter a question. No explanation was generated.');
      return;
    }
    setBusy(true);
    try {
      const readyModel = await ensureReadyModel();
      if (!readyModel) {
        return;
      }
      const answer = await explainWithEvidence(runtime, libraryChunks(), trimmed);
      setCoachExplanation(formatTutorAnswer(answer));
      commitProgress(
        appendStudyActivity(progressRef.current, {
          id: createLocalId('coach'),
          at: new Date().toISOString(),
          kind: 'coach_explanation',
          label: `Coach: ${trimmed.slice(0, 80)}`,
        }),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setNotice(message);
    } finally {
      setBusy(false);
    }
  }

  async function onPractice() {
    setBusy(true);
    setPracticeReady(false);
    try {
      let chunks;
      try {
        chunks = libraryChunks();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setNotice(message);
        return;
      }
      const plan = buildPracticeAssessment({
        chunks,
        scores: topicScoresFromProgress(progressRef.current),
        kind: 'mcq',
      });
      setPracticePlan(plan);
      if (plan.status !== 'ready') {
        return;
      }
      const readyModel = await ensureReadyModel();
      if (!readyModel) {
        return;
      }
      const result = await generateAssessment(runtime, plan.request);
      if (result.status === 'insufficient_evidence') {
        setPracticePlan({
          status: 'insufficient_evidence',
          message: result.message,
          methodNote: plan.methodNote,
          reason: 'no_matches',
        });
        return;
      }
      if (result.status !== 'ok') {
        setNotice(result.message);
        return;
      }
      const session = createQuizSession(result, {
        id: createLocalId('quiz'),
        now: new Date().toISOString(),
      });
      if (!session) {
        setNotice('The practice generation did not produce a quiz.');
        return;
      }
      setStudentAssessment(result);
      practiceQuizRef.current = session;
      setPracticeReady(true);
      commitProgress(
        appendStudyActivity(progressRef.current, {
          id: createLocalId('practice'),
          at: new Date().toISOString(),
          kind: 'coach_practice',
          label: `Practice quiz prepared for ${plan.topic}`,
        }),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setNotice(message);
    } finally {
      setBusy(false);
    }
  }

  async function onRefreshFile() {
    if (!textStoreHandle.fileInfo) {
      setGgufInfo({
        exists: false,
        sizeBytes: 0,
        readable: false,
        note: 'The file check is part of the Android build. It has not run in this session.',
      });
      return;
    }
    try {
      setGgufInfo(await textStoreHandle.fileInfo(resolvedModelPath));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setGgufInfo({ exists: false, sizeBytes: 0, readable: false, note: message });
    }
  }

  async function onInitialize() {
    if (locationNote) {
      setNotice(locationNote);
      return;
    }
    setBusy(true);
    try {
      if (textStoreHandle.fileInfo) {
        const info = await textStoreHandle.fileInfo(resolvedModelPath);
        setGgufInfo(info);
        if (!info.exists || !info.readable || info.ggufMagic === false) {
          setNotice(info.note ?? 'The GGUF file is not available, so the model was not loaded.');
          return;
        }
      }
      const status = await tutor.initialize();
      setModelStatus(status);
      if (status.state !== 'ready' && status.error) {
        setNotice(`${status.error.code}: ${status.error.message}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setNotice(message);
    } finally {
      setBusy(false);
    }
  }

  function onClearHistory() {
    Alert.alert(
      'Clear learning history',
      'This deletes quiz scores, self-assessments, flashcard marks, and the activity list on this device. An unfinished quiz stays until you discard it. Imported documents and the GGUF model are kept.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear history',
          style: 'destructive',
          onPress: () => {
            clearLearningProgress(textStoreHandle.store)
              .then(() => {
                const empty = emptyLearningProgress();
                progressRef.current = empty;
                progressStatusRef.current = 'empty';
                setProgress(empty);
                setProgressBytes(0);
                setNotice(
                  'Learning history was cleared. Documents, the unfinished quiz, and the model file were kept.',
                );
              })
              .catch((error: unknown) => {
                const message = error instanceof Error ? error.message : String(error);
                setNotice(`Learning history could not be cleared. ${message}`);
              });
          },
        },
      ],
    );
  }

  function onResumeDraft() {
    if (!savedDraft) {
      return;
    }
    beginQuiz(savedDraft);
  }

  function onDiscardDraft() {
    Alert.alert(
      'Discard unfinished quiz?',
      'The in-progress answers will be deleted. Completed quiz history is kept.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            closeDraftWrites();
            clearQuizDraft(textStoreHandle.store)
              .then(() => {
                if (quizRef.current && !quizRef.current.submitted) {
                  quizRef.current = null;
                  setQuizSession(null);
                }
                setSavedDraft(null);
                setDraftUnreadable(false);
                setScreen('dashboard');
                setNotice('The unfinished quiz was discarded.');
              })
              .catch((error: unknown) => {
                const message = error instanceof Error ? error.message : String(error);
                setNotice(`The unfinished quiz could not be discarded. ${message}`);
              });
          },
        },
      ],
    );
  }

  function openSettings() {
    setModelStatus(runtime.getStatus());
    setScreen('settings');
    onRefreshFile().catch(() => undefined);
  }

  async function ensureTutorReady(): Promise<ModelStatus> {
    if (locationNote) {
      return {
        state: 'failed',
        runtimeId: 'llama.rn',
        error: { code: 'MODEL_FILE_MISSING', message: locationNote },
      };
    }
    const loaded = await tutor.initialize();
    setModelStatus(loaded);
    return loaded;
  }

  async function onBookmarkTutor() {
    const answer = lastTutorAnswer.current;
    if (!answer || answer.sources.length === 0 || answer.answer.trim().length === 0) {
      setNotice('A bookmark is saved only when the tutor answer includes a retrieved source.');
      return;
    }
    const db = await openStudyDatabase();
    if (!db) {
      setNotice('The bookmark was not saved because the local database is unavailable.');
      return;
    }
    const source = answer.sources[0];
    await saveBookmark(db, {
      id: createLocalId('bookmark'),
      kind: 'answer',
      title: tutorQuestion.trim().slice(0, 80) || 'Tutor answer',
      body: answer.answer,
      createdAt: new Date().toISOString(),
      topic: source?.section,
      documentId: source?.documentId,
      documentName: source?.documentName,
      pageNumber: source?.pageNumber,
      chunkId: source?.chunkId,
    });
    setNotice('The tutor answer was bookmarked on this device.');
  }

  async function onTutorCards() {
    const answer = lastTutorAnswer.current;
    const source = answer?.sources[0];
    if (!answer || !source || answer.answer.trim().length === 0) {
      setNotice('Cards are created only from a tutor answer that has a retrieved source.');
      return;
    }
    const db = await openStudyDatabase();
    if (!db) {
      setNotice('The cards were not saved because the local database is unavailable.');
      return;
    }
    const drafts = flashcardsFromPassage({
      text: answer.answer,
      topic: source.section,
      documentId: source.documentId,
      documentName: source.documentName,
      pageNumber: source.pageNumber,
      sourceKind: 'tutor',
      createdAt: new Date().toISOString(),
      idFor: index => createLocalId(`tutorcard${index}`),
    });
    for (const draft of drafts) {
      await createFlashcard(db, {
        id: draft.id,
        front: draft.front,
        back: draft.back,
        createdAt: draft.createdAt,
        sourceKind: draft.sourceKind,
        topic: draft.topic ?? undefined,
        documentId: draft.documentId ?? undefined,
        documentName: draft.documentName ?? undefined,
        pageNumber: draft.pageNumber ?? undefined,
      });
    }
    setNotice(drafts.length === 0 ? 'The answer had no sentence long enough to save as a card.' : `${drafts.length} card(s) were saved.`);
  }

  const coachRecommendations = recommendRevision({
    scores: topicScoresFromProgress(progress),
    weakAccuracyAtOrBelow: 0.6,
    maxRecommendations: 3,
  });

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.screen}>
        <StatusBar barStyle="dark-content" />
        {notice ? (
          <View style={styles.noticeWrap}>
            <Notice>{notice}</Notice>
          </View>
        ) : null}
        {!ready ? (
          <Text style={styles.boot}>Loading saved study data on this device.</Text>
        ) : (
          <>
            {screen === 'dashboard' ? (
              <DashboardScreen
                library={library}
                progress={progress}
                onOpenLibrary={() => setScreen('library')}
                onOpenTutor={() => setScreen('tutor')}
                onOpenAssessment={() => setScreen('assessment')}
                onOpenCoach={() => setScreen('coach')}
                onOpenSettings={openSettings}
                onOpenSearch={() => setScreen('search')}
                onOpenTools={() => setScreen('tools')}
                savedDraft={savedDraft}
                draftUnreadable={draftUnreadable}
                onResumeDraft={onResumeDraft}
                onDiscardDraft={onDiscardDraft}
              />
            ) : null}
            {screen === 'library' ? (
              <LibraryScreen
                library={library}
                importStatus={importStatus}
                importing={importing}
                onBack={() => setScreen('dashboard')}
                onImport={start(() => onImport(true))}
                onOpenDocument={id => {
                  selectDocument(id);
                  setScreen('document');
                }}
              />
            ) : null}
            {screen === 'document' && activeDocument ? (
              <DocumentScreen
                document={activeDocument}
                onBack={() => setScreen('library')}
                onStudy={() => setScreen('tutor')}
                onAssess={() => setScreen('assessment')}
                onChat={() => setScreen('docchat')}
                onPractice={() => setScreen('practice')}
                onRemove={onRemoveDocument}
              />
            ) : null}
            {screen === 'tutor' ? (
              <TutorScreen
                document={activeDocument}
                question={tutorQuestion}
                onChangeQuestion={setTutorQuestion}
                answerText={studentTutorText}
                busy={busy}
                onAsk={start(onStudentAsk)}
                onBack={() => setScreen('dashboard')}
                pasteTitle={pasteTitle}
                pastePage={pastePage}
                pasteText={pasteText}
                onChangePasteTitle={setPasteTitle}
                onChangePastePage={setPastePage}
                onChangePasteText={setPasteText}
                onSavePaste={onSavePaste}
                onBookmark={() => {
                  onBookmarkTutor().catch(error => {
                    const message = error instanceof Error ? error.message : String(error);
                    setNotice(message);
                  });
                }}
                onMakeCards={() => {
                  onTutorCards().catch(error => {
                    const message = error instanceof Error ? error.message : String(error);
                    setNotice(message);
                  });
                }}
                spokenText={spokenTutor}
              />
            ) : null}
            {screen === 'assessment' ? (
              <AssessmentScreen
                document={activeDocument}
                kind={studentKind}
                count={studentCount}
                focus={studentFocus}
                busy={busy}
                result={studentAssessment}
                onBack={() => setScreen('dashboard')}
                onChangeKind={kind => {
                  setStudentKind(kind);
                  setStudentAssessment(undefined);
                }}
                onChangeCount={count => {
                  setStudentCount(count);
                  setStudentAssessment(undefined);
                }}
                onChangeFocus={value => {
                  setStudentFocus(value);
                  setStudentAssessment(undefined);
                }}
                onGenerate={start(onStudentGenerate)}
                onStart={onStartQuiz}
                canResume={quizSession !== null && !quizSession.submitted}
                onResume={() => setScreen('quiz')}
              />
            ) : null}
            {screen === 'quiz' && quizSession ? (
              <QuizScreen
                session={quizSession}
                unanswered={unanswered}
                busy={busy}
                onBack={() => setScreen('assessment')}
                onPrevious={() => {
                  const current = quizRef.current;
                  if (current) {
                    setQuiz(previousQuestion(current));
                  }
                }}
                onNext={() => {
                  const current = quizRef.current;
                  if (current) {
                    setQuiz(nextQuestion(current));
                  }
                }}
                onSelect={onSelectOption}
                onShortAnswer={onShortAnswer}
                onReveal={onReveal}
                onMarkKnown={() => onMark('known')}
                onMarkRevision={() => onMark('needs_revision')}
                onSubmit={onSubmitQuiz}
                onConfirmSubmit={onConfirmSubmit}
                onReviewUnanswered={index => {
                  const current = quizRef.current;
                  if (!current) {
                    return;
                  }
                  setQuiz(goToQuestion(current, index));
                  setUnanswered(null);
                }}
              />
            ) : null}
            {screen === 'results' && quizSession?.report ? (
              <ResultsScreen
                report={quizSession.report}
                onBack={() => setScreen('dashboard')}
                onHome={() => setScreen('dashboard')}
                onSelfAssess={onSelfAssess}
              />
            ) : null}
            {screen === 'coach' ? (
              <CoachScreen
                recommendations={coachRecommendations}
                missed={missedQuestions(progress)}
                revision={revisionCards(progress)}
                passages={passages}
                practice={practicePlan}
                question={coachQuestion}
                explanation={coachExplanation}
                busy={busy}
                documentCount={library.documents.length}
                onBack={() => setScreen('dashboard')}
                onChangeQuestion={setCoachQuestion}
                onPassages={onRecommendPassages}
                onExplain={start(onExplain)}
                onPractice={start(onPractice)}
                onOpenQuiz={() => {
                  const session = practiceQuizRef.current;
                  if (!practiceReady || !session) {
                    return;
                  }
                  const current = quizRef.current;
                  const open = () => beginQuiz(session);
                  if (current && !current.submitted && current.id !== session.id) {
                    Alert.alert(
                      'Open the practice quiz?',
                      'The unfinished quiz is saved on this device. Opening the practice quiz replaces that saved attempt.',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Open', onPress: open },
                      ],
                    );
                    return;
                  }
                  open();
                }}
                onOpenPlan={() => setScreen('plan')}
                explanationText={coachExplanation}
              />
            ) : null}
            {screen === 'search' ? <SearchScreen onBack={() => setScreen('dashboard')} /> : null}
            {screen === 'tools' ? (
              <StudyToolsScreen
                onBack={() => setScreen('dashboard')}
                onHistory={() => setScreen('history')}
                onSaved={() => setScreen('saved')}
                onFlashcards={() => setScreen('flashcards')}
                onAnalytics={() => setScreen('analytics')}
                onPractice={() => setScreen('practice')}
                onPlan={() => setScreen('plan')}
                onModels={() => setScreen('models')}
                onDocumentChat={() => setScreen('docchat')}
                hasDocument={activeDocument !== undefined}
              />
            ) : null}
            {screen === 'history' ? (
              <HistoryScreen
                onBack={() => setScreen('tools')}
                onResume={(conversationId, question) => {
                  conversationIdRef.current = conversationId;
                  setTutorQuestion(question);
                  setScreen('tutor');
                }}
                onOpenDocument={id => {
                  const document = getDocument(library, id);
                  if (!document) {
                    setNotice('That document is no longer in the library.');
                    return;
                  }
                  selectDocument(id);
                  setScreen('document');
                }}
              />
            ) : null}
            {screen === 'saved' ? <SavedScreen onBack={() => setScreen('tools')} /> : null}
            {screen === 'flashcards' ? <FlashcardsScreen onBack={() => setScreen('tools')} /> : null}
            {screen === 'analytics' ? <AnalyticsScreen onBack={() => setScreen('tools')} /> : null}
            {screen === 'practice' ? <PracticeScreen document={activeDocument} onBack={() => setScreen('tools')} /> : null}
            {screen === 'plan' ? <StudyPlanScreen documents={library.documents} onBack={() => setScreen('tools')} /> : null}
            {screen === 'docchat' && activeDocument ? (
              <DocumentChatScreen
                document={activeDocument}
                runtime={runtime}
                ensureReady={ensureTutorReady}
                onBack={() => setScreen('document')}
              />
            ) : null}
            {screen === 'models' ? (
              <ModelManagerScreen
                chatPath={resolvedModelPath}
                chatLabel="Llama 3.2 1B Instruct or the selected Qwen fallback"
                chatInUse={modelStatus?.state === 'ready'}
                onBack={() => setScreen('settings')}
              />
            ) : null}
            {screen === 'settings' ? (
              <SettingsScreen
                modelPath={resolvedModelPath}
                locationNote={locationNote}
                modelStatus={modelStatus}
                ggufInfo={ggufInfo}
                persistent={textStoreHandle.persistent}
                progressBytes={progressBytes}
                libraryBytes={libraryBytes}
                documentCount={library.documents.length}
                busy={busy}
                onBack={() => setScreen('dashboard')}
                onInitialize={start(onInitialize)}
                onRefreshFile={start(onRefreshFile)}
                onSelectFallback={() => {
                  setModelPath(modelPathForFileName(modelPath, FALLBACK_MODEL_FILE_NAME));
                  setNotice('The Qwen file name was selected. Initialize only after that GGUF file is already in the same folder. This app does not download it.');
                }}
                onClearHistory={onClearHistory}
                onOpenProbe={() => setScreen('probe')}
                onOpenModels={() => setScreen('models')}
              />
            ) : null}
            {screen === 'probe' ? (
              <ScrollView keyboardShouldPersistTaps="handled">
                <ProbeScreen
                  onBack={() => setScreen('settings')}
                  modelPath={modelPath}
                  onChangeModelPath={setModelPath}
                  locationNote={locationNote}
                  prompt={prompt}
                  onChangePrompt={setPrompt}
                  busy={busy}
                  onProbe={start(onProbe)}
                  onGenerateAgain={start(onGenerateAgain)}
                  onRelease={start(onRelease)}
                  reportText={reportText}
                  documentName={documentName}
                  onChangeDocumentName={setDocumentName}
                  pageText={pageText}
                  onChangePageText={setPageText}
                  studyText={studyText}
                  onChangeStudyText={onStudyTextChange}
                  importing={importing}
                  onImport={start(() => onImport(false))}
                  importStatus={importStatus}
                  question={question}
                  onChangeQuestion={setQuestion}
                  onAsk={start(onAsk)}
                  tutorText={tutorText}
                  assessmentKind={assessmentKind}
                  onChangeAssessmentKind={setAssessmentKind}
                  assessmentCount={assessmentCount}
                  onChangeAssessmentCount={setAssessmentCount}
                  assessmentFocus={assessmentFocus}
                  onChangeAssessmentFocus={setAssessmentFocus}
                  onGenerateAssessment={start(onGenerateAssessment)}
                  assessmentText={assessmentText}
                />
              </ScrollView>
            ) : null}
          </>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  boot: {
    padding: 16,
    color: colors.ink,
    fontSize: 16,
  },
  noticeWrap: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
});

export default App;
