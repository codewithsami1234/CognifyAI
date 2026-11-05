/**
 * Minimal SQL port used by Cognify's local database.
 * Node tests use node:sqlite. The Android app uses the CognifyDb native module.
 * This module does not open a network connection.
 */

export type SqlValue = string | number | null;

export interface SqlRow {
  [column: string]: SqlValue;
}

export interface SqlDatabase {
  exec(sql: string, params?: readonly SqlValue[]): Promise<void>;
  query(sql: string, params?: readonly SqlValue[]): Promise<SqlRow[]>;
  /** Runs `fn` inside BEGIN/COMMIT. A throw rolls the transaction back. */
  transaction<T>(fn: () => Promise<T> | T): Promise<T>;
  close(): void;
}
