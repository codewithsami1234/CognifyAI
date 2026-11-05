/**
 * Migration 1. Existing JSON files are not touched.
 * FTS5 is created separately so a SQLite build without FTS5 can still migrate.
 */

export const MIGRATION_VERSION = 1;

export const MIGRATION_1_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS search_capabilities (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    document_id TEXT,
    document_name TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    sources_json TEXT,
    grounded INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS search_history (
    id TEXT PRIMARY KEY,
    query TEXT NOT NULL,
    mode TEXT NOT NULL,
    result_count INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    day_key TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_search_history_created ON search_history(created_at)`,
  `CREATE TABLE IF NOT EXISTS document_history (
    document_id TEXT PRIMARY KEY,
    document_name TEXT NOT NULL,
    last_page INTEGER,
    last_section TEXT,
    last_offset INTEGER,
    opened_at TEXT NOT NULL,
    day_key TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS document_chunks (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL,
    document_name TEXT NOT NULL,
    page_number INTEGER,
    section TEXT,
    text TEXT NOT NULL,
    start_offset INTEGER,
    end_offset INTEGER,
    content_hash TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_chunks_document ON document_chunks(document_id)`,
  `CREATE TABLE IF NOT EXISTS embeddings (
    chunk_id TEXT NOT NULL,
    model_id TEXT NOT NULL,
    dimensions INTEGER NOT NULL,
    vector TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (chunk_id, model_id),
    FOREIGN KEY (chunk_id) REFERENCES document_chunks(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS indexing_jobs (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL,
    status TEXT NOT NULL,
    total_chunks INTEGER NOT NULL,
    embedded_chunks INTEGER NOT NULL,
    error TEXT,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS bookmarks (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    topic TEXT,
    document_id TEXT,
    document_name TEXT,
    page_number INTEGER,
    chunk_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_bookmarks_topic ON bookmarks(topic)`,
  `CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    topic TEXT,
    document_id TEXT,
    document_name TEXT,
    page_number INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_notes_topic ON notes(topic)`,
  `CREATE TABLE IF NOT EXISTS quiz_attempts (
    id TEXT PRIMARY KEY,
    document_id TEXT,
    document_name TEXT,
    topic TEXT NOT NULL,
    difficulty TEXT NOT NULL,
    question_count INTEGER NOT NULL,
    correct_count INTEGER NOT NULL,
    incorrect_count INTEGER NOT NULL,
    score_percent REAL NOT NULL,
    time_ms INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    day_key TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS quiz_questions (
    id TEXT PRIMARY KEY,
    attempt_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    topic TEXT NOT NULL,
    difficulty TEXT NOT NULL,
    prompt TEXT NOT NULL,
    correct INTEGER NOT NULL,
    student_answer TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (attempt_id) REFERENCES quiz_attempts(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_quiz_questions_attempt ON quiz_questions(attempt_id)`,
  `CREATE TABLE IF NOT EXISTS topic_performance (
    topic TEXT PRIMARY KEY,
    correct_count INTEGER NOT NULL,
    incorrect_count INTEGER NOT NULL,
    streak_correct INTEGER NOT NULL,
    streak_incorrect INTEGER NOT NULL,
    difficulty TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS flashcards (
    id TEXT PRIMARY KEY,
    front TEXT NOT NULL,
    back TEXT NOT NULL,
    topic TEXT,
    document_id TEXT,
    document_name TEXT,
    page_number INTEGER,
    source_kind TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS srs_schedule (
    card_id TEXT PRIMARY KEY,
    easiness REAL NOT NULL,
    interval_days INTEGER NOT NULL,
    repetitions INTEGER NOT NULL,
    lapses INTEGER NOT NULL,
    due_at TEXT NOT NULL,
    last_reviewed_at TEXT,
    last_grade TEXT,
    FOREIGN KEY (card_id) REFERENCES flashcards(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_srs_due ON srs_schedule(due_at)`,
  `CREATE TABLE IF NOT EXISTS learning_sessions (
    id TEXT PRIMARY KEY,
    module_name TEXT NOT NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    duration_ms INTEGER NOT NULL,
    day_key TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS learning_plans (
    id TEXT PRIMARY KEY,
    horizon TEXT NOT NULL,
    title TEXT NOT NULL,
    based_on TEXT NOT NULL,
    items_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS plan_completions (
    plan_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    completed_at TEXT NOT NULL,
    PRIMARY KEY (plan_id, item_id),
    FOREIGN KEY (plan_id) REFERENCES learning_plans(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS model_metadata (
    id TEXT PRIMARY KEY,
    role TEXT NOT NULL,
    label TEXT NOT NULL,
    file_name TEXT,
    status TEXT NOT NULL,
    size_bytes INTEGER,
    dimensions INTEGER,
    quantization TEXT,
    note TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
];

export const FTS5_STATEMENT = `CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
  chunk_id UNINDEXED,
  body
)`;
