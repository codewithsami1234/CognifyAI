import { FTS5_STATEMENT, MIGRATION_1_STATEMENTS, MIGRATION_VERSION } from "./schema";
import type { SqlDatabase } from "./sqlDatabase";

export interface MigrationReport {
  version: number;
  applied: boolean;
  fts5: boolean;
}

async function tableExists(db: SqlDatabase, name: string): Promise<boolean> {
  const rows = await db.query(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`, [name]);
  return rows.length > 0;
}

export async function fts5Enabled(db: SqlDatabase): Promise<boolean> {
  if (!(await tableExists(db, "search_capabilities"))) {
    return false;
  }
  const rows = await db.query(`SELECT value FROM search_capabilities WHERE key = 'fts5'`);
  return rows[0]?.value === "yes";
}

/**
 * Applies pending migrations. Running this twice does not drop tables or rows.
 */
export async function migrateCognifyDb(db: SqlDatabase, nowIso: string): Promise<MigrationReport> {
  await db.exec(MIGRATION_1_STATEMENTS[0] ?? "SELECT 1");
  const currentRow = await db.query(`SELECT MAX(version) AS version FROM schema_migrations`);
  const current = Number(currentRow[0]?.version ?? 0);
  if (current >= MIGRATION_VERSION) {
    return { version: current, applied: false, fts5: await fts5Enabled(db) };
  }

  await db.transaction(async () => {
    for (const statement of MIGRATION_1_STATEMENTS.slice(1)) {
      await db.exec(statement);
    }
    await db.exec(`INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)`, [MIGRATION_VERSION, nowIso]);
  });

  const fts5 = await ensureFts5(db);
  return { version: MIGRATION_VERSION, applied: true, fts5 };
}

async function ensureFts5(db: SqlDatabase): Promise<boolean> {
  let fts5 = false;
  try {
    await db.exec(FTS5_STATEMENT);
    fts5 = true;
  } catch {
    fts5 = false;
  }
  const flag = fts5 ? "yes" : "no";
  const existing = await db.query(`SELECT value FROM search_capabilities WHERE key = 'fts5'`);
  if (existing.length === 0) {
    await db.exec(`INSERT INTO search_capabilities (key, value) VALUES ('fts5', ?)`, [flag]);
  } else if (existing[0]?.value !== flag) {
    await db.exec(`UPDATE search_capabilities SET value = ? WHERE key = 'fts5'`, [flag]);
  }
  return fts5;
}
