import { DatabaseSync } from "node:sqlite";
import type { SqlDatabase, SqlRow } from "./sqlDatabase";

function plainRow(row: object): SqlRow {
  const out: SqlRow = {};
  for (const key of Object.keys(row)) {
    const value = (row as Record<string, unknown>)[key];
    if (typeof value === "bigint") {
      const asNumber = Number(value);
      out[key] = Number.isSafeInteger(asNumber) ? asNumber : String(value);
    } else if (value === null || value === undefined) {
      out[key] = null;
    } else if (typeof value === "number" || typeof value === "string") {
      out[key] = value;
    } else if (typeof value === "boolean") {
      out[key] = value ? 1 : 0;
    } else {
      out[key] = String(value);
    }
  }
  return out;
}

/**
 * Opens a SQLite file, or ":memory:".
 * Foreign keys are enabled on this connection.
 */
export function openNodeSqlite(filename: string): SqlDatabase {
  const db = new DatabaseSync(filename);
  db.exec("PRAGMA foreign_keys = ON");
  return {
    async exec(sql, params = []) {
      if (params.length === 0) {
        db.exec(sql);
        return;
      }
      db.prepare(sql).run(...params);
    },
    async query(sql, params = []) {
      const rows = db.prepare(sql).all(...params);
      return rows.map((row) => plainRow(row as object));
    },
    async transaction(fn) {
      db.exec("BEGIN");
      try {
        const value = await fn();
        db.exec("COMMIT");
        return value;
      } catch (error) {
        try {
          db.exec("ROLLBACK");
        } catch {
          // The original error is the one the caller needs.
        }
        throw error;
      }
    },
    close() {
      db.close();
    },
  };
}
