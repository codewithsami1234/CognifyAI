import { NativeModules } from 'react-native';
import { migrateCognifyDb } from '../../../src/ai/sql/migrate';
import type { SqlDatabase, SqlRow, SqlValue } from '../../../src/ai/sql/sqlDatabase';

interface CognifyDbNative {
  open: () => Promise<boolean>;
  exec: (sql: string, params: SqlValue[]) => Promise<boolean>;
  query: (sql: string, params: SqlValue[]) => Promise<SqlRow[]>;
  databaseBytes: () => Promise<number>;
  close: () => void;
}

let opening: Promise<SqlDatabase | null> | undefined;
let openError: string | undefined;

export function studyDatabaseError(): string | undefined {
  return openError;
}

export function getCognifyDbModule(): CognifyDbNative | undefined {
  const native = NativeModules.CognifyDb as CognifyDbNative | undefined;
  if (!native || typeof native.open !== 'function' || typeof native.query !== 'function') {
    return undefined;
  }
  return native;
}

/**
 * Opens the on-device SQLite file and applies migrations.
 * A build without the native module returns null. Callers must say that
 * records cannot be saved, and must not pretend the operation succeeded.
 */
export function openStudyDatabase(): Promise<SqlDatabase | null> {
  if (!opening) {
    opening = connect().catch(error => {
      opening = undefined;
      openError = error instanceof Error ? error.message : String(error);
      return null;
    });
  }
  return opening;
}

async function connect(): Promise<SqlDatabase | null> {
  const native = getCognifyDbModule();
  if (!native) {
    openError = 'This installed build does not include the local SQLite module. Study records cannot be saved until the app is rebuilt with that module.';
    return null;
  }
  await native.open();
  const db = createNativeSqlDatabase(native);
  await migrateCognifyDb(db, new Date().toISOString());
  openError = undefined;
  return db;
}

export function createNativeSqlDatabase(native: CognifyDbNative): SqlDatabase {
  let queue: Promise<unknown> = Promise.resolve();
  let depth = 0;

  function run<T>(fn: () => Promise<T>): Promise<T> {
    if (depth > 0) {
      return fn();
    }
    const task = queue.then(() => {
      depth += 1;
      return fn().finally(() => {
        depth -= 1;
      });
    });
    queue = task.then(
      () => undefined,
      () => undefined,
    );
    return task;
  }

  return {
    exec(sql, params = []) {
      return run(() => native.exec(sql, [...params]).then(() => undefined));
    },
    query(sql, params = []) {
      return run(() => native.query(sql, [...params]));
    },
    async transaction(fn) {
      return run(async () => {
        await native.exec('BEGIN', []);
        try {
          const value = await fn();
          await native.exec('COMMIT', []);
          return value;
        } catch (error) {
          try {
            await native.exec('ROLLBACK', []);
          } catch {
            // The original error is the one the caller needs.
          }
          throw error;
        }
      });
    },
    close() {
      native.close();
    },
  };
}

export async function studyDatabaseBytes(): Promise<number | undefined> {
  const native = getCognifyDbModule();
  if (!native) {
    return undefined;
  }
  const bytes = await native.databaseBytes();
  return typeof bytes === 'number' ? bytes : undefined;
}
