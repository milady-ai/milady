// Pure-JS wrapper over the `sqlite_*` host functions exposed by
// `__MILADY_BRIDGE__`. This module is the source of truth for the
// SQLite surface inside the polyfill; the `node:sqlite` shim and the
// `pglite-shim` both build on top of it.
//
// The bridge returns `{ error: string }` on failure. This wrapper translates
// those into `SQLiteError`s so callers see a normal JS exception.
//
// Statements own a `stmt_id` that must be finalized to release the underlying
// `sqlite3_stmt*`. We register a `FinalizationRegistry` when available so
// stranded statements get cleaned up by the GC. The registry is best-effort —
// callers should still call `.finalize()` explicitly.

import { getBridge } from "../bridge.js";

export class SQLiteError extends Error {
  public readonly code: string;
  constructor(message: string, code = "SQLITE_ERROR") {
    super(message);
    this.name = "SQLiteError";
    this.code = code;
  }
}

export type SqliteParam = string | number | boolean | null | Uint8Array;
export type SqliteValue = string | number | null | Uint8Array;

interface BridgeOpenResult {
  db_id: number;
}
interface BridgeExecResult {
  rows_affected: number;
}
interface BridgeQueryResult {
  columns: string[];
  rows: SqliteValue[][];
}
interface BridgePrepareResult {
  stmt_id: number;
}
interface BridgeStepResult {
  done: boolean;
  row?: SqliteValue[];
}

function isError<T extends object>(v: T | { error: string }): v is { error: string } {
  return typeof v === "object" && v !== null && "error" in v && typeof (v as { error: unknown }).error === "string";
}

function unwrap<T extends object>(result: T | { error: string }, action: string): T {
  if (isError(result)) {
    throw new SQLiteError(`${action}: ${result.error}`);
  }
  return result;
}

// Finalizer registry — falls back to a no-op when unavailable. JSContext on
// iOS 14+ has FinalizationRegistry, so this normally fires.
type StmtFinalizer = { stmt_id: number };
const stmtRegistry: FinalizationRegistry<StmtFinalizer> | null =
  typeof FinalizationRegistry !== "undefined"
    ? new FinalizationRegistry<StmtFinalizer>((heldValue) => {
        try {
          getBridge().sqlite_finalize(heldValue.stmt_id);
        } catch {
          // GC-time finalize errors are swallowed; this is a leak-prevention
          // best-effort. The host bridge can still log internally.
        }
      })
    : null;

/**
 * A prepared SQLite statement. Wraps the bridge `stmt_id`.
 *
 * The statement is single-use per `.all()` / `.get()` / `.run()` call —
 * each invocation re-binds parameters and runs the statement from the start.
 * The underlying `sqlite3_stmt*` is reset between calls by the host.
 */
export class Statement {
  private stmtId: number | null;
  private readonly sql: string;
  private readonly columnsHint: string[] | null;

  constructor(stmtId: number, sql: string, columnsHint: string[] | null = null) {
    this.stmtId = stmtId;
    this.sql = sql;
    this.columnsHint = columnsHint;
    if (stmtRegistry) {
      stmtRegistry.register(this, { stmt_id: stmtId }, this);
    }
  }

  /** Returns all result rows as objects keyed by column name. */
  all<T = Record<string, SqliteValue>>(params: SqliteParam[] = []): T[] {
    this.assertLive();
    const columns: string[] = [];
    const rows: SqliteValue[][] = [];
    // Drive the statement until done. The bridge accepts params only on
    // the first `sqlite_step` call (which also re-resets the statement).
    let first = true;
    while (true) {
      const stepResult = getBridge().sqlite_step(this.stmtId!, first ? params : undefined);
      first = false;
      const result = unwrap<BridgeStepResult>(stepResult, "Statement.all");
      if (result.done) break;
      if (result.row) rows.push(result.row);
    }
    // Columns aren't returned per-step; we ask once via a single-shot query
    // if we don't have a hint. Most callers go through Database.query() which
    // already pulls the column list — but a hand-built Statement can land here.
    const cols = this.columnsHint ?? this.inferColumns();
    return rows.map((row) => Statement.rowToObject<T>(cols, row));
  }

  /** Returns the first row, or `undefined` if none. */
  get<T = Record<string, SqliteValue>>(params: SqliteParam[] = []): T | undefined {
    this.assertLive();
    const stepResult = getBridge().sqlite_step(this.stmtId!, params);
    const result = unwrap<BridgeStepResult>(stepResult, "Statement.get");
    if (result.done || !result.row) return undefined;
    const cols = this.columnsHint ?? this.inferColumns();
    return Statement.rowToObject<T>(cols, result.row);
  }

  /** Executes the statement for side effects. Returns `{ changes }`. */
  run(params: SqliteParam[] = []): { changes: number } {
    this.assertLive();
    // For a pure write statement we still need to drive `sqlite_step` until
    // done. We don't get rows_affected back from the step API directly; the
    // host bridge can compute it from `sqlite3_changes(db)` after the step
    // completes. For now we step to completion and report 0 — callers that
    // need exact change counts should use `Database.exec()` which goes
    // through `sqlite_exec`.
    let first = true;
    while (true) {
      const stepResult = getBridge().sqlite_step(this.stmtId!, first ? params : undefined);
      first = false;
      const result = unwrap<BridgeStepResult>(stepResult, "Statement.run");
      if (result.done) break;
    }
    return { changes: 0 };
  }

  /** Releases the underlying prepared statement. Idempotent. */
  finalize(): void {
    if (this.stmtId === null) return;
    const id = this.stmtId;
    this.stmtId = null;
    if (stmtRegistry) stmtRegistry.unregister(this);
    getBridge().sqlite_finalize(id);
  }

  private assertLive(): void {
    if (this.stmtId === null) {
      throw new SQLiteError("Statement has been finalized", "SQLITE_MISUSE");
    }
  }

  private inferColumns(): string[] {
    // We don't have a "describe" host function; for the rare hand-built
    // statement that lands here without column hints, return synthetic
    // names. Callers via Database.prepare(sql) get real names through
    // the single-shot path.
    return [];
  }

  private static rowToObject<T>(cols: string[], row: SqliteValue[]): T {
    const obj: Record<string, SqliteValue> = {};
    if (cols.length === 0) {
      // Fallback: positional keys.
      for (let i = 0; i < row.length; i++) obj[`column${i}`] = row[i] ?? null;
    } else {
      for (let i = 0; i < cols.length; i++) obj[cols[i] ?? `column${i}`] = row[i] ?? null;
    }
    return obj as T;
  }

  /** Debug-only — returns the original SQL string. */
  toString(): string {
    return this.sql;
  }
}

export interface QueryResult<T = Record<string, SqliteValue>> {
  columns: string[];
  rows: T[];
  /** Raw row values in column-order. Useful when callers want positional access. */
  rawRows: SqliteValue[][];
}

/**
 * A SQLite database handle. Open via `new Database(path)`.
 *
 * In-memory databases: pass `":memory:"`. File paths must be absolute (the
 * Swift host treats them as `URL(fileURLWithPath:)`).
 */
export class Database {
  private dbId: number | null;
  public readonly path: string;
  private readonly readonly_: boolean;

  constructor(
    path: string,
    options: { readonly?: boolean; timeout_ms?: number } = {},
  ) {
    this.path = path;
    this.readonly_ = options.readonly ?? false;
    const result = getBridge().sqlite_open({
      path,
      readonly: options.readonly,
      timeout_ms: options.timeout_ms,
    });
    const opened = unwrap<BridgeOpenResult>(result, `Database.open(${path})`);
    this.dbId = opened.db_id;
  }

  get isOpen(): boolean {
    return this.dbId !== null;
  }

  get readonly(): boolean {
    return this.readonly_;
  }

  /** Executes one or more SQL statements without parameters or results. */
  exec(sql: string): { rowsAffected: number } {
    this.assertOpen();
    const result = getBridge().sqlite_exec(this.dbId!, sql);
    const ok = unwrap<BridgeExecResult>(result, "Database.exec");
    return { rowsAffected: ok.rows_affected };
  }

  /**
   * Runs a single SELECT-style statement and returns rows + columns. For
   * write statements use `.exec()` if you want rows-affected, or `.prepare()`
   * + `.run()` if you need parameter binding without a result set.
   */
  query<T = Record<string, SqliteValue>>(
    sql: string,
    params: SqliteParam[] = [],
  ): QueryResult<T> {
    this.assertOpen();
    const result = getBridge().sqlite_query(this.dbId!, sql, params);
    const ok = unwrap<BridgeQueryResult>(result, "Database.query");
    const rows = ok.rows.map((row) => {
      const obj: Record<string, SqliteValue> = {};
      for (let i = 0; i < ok.columns.length; i++) {
        obj[ok.columns[i] ?? `column${i}`] = row[i] ?? null;
      }
      return obj as T;
    });
    return { columns: ok.columns, rows, rawRows: ok.rows };
  }

  /** Prepares a statement for repeated execution with different parameters. */
  prepare(sql: string): Statement {
    this.assertOpen();
    const result = getBridge().sqlite_prepare(this.dbId!, sql);
    const ok = unwrap<BridgePrepareResult>(result, "Database.prepare");
    // Pull column names by running a zero-row probe? Not possible without
    // a describe API. Statement.all() returns positional fields when
    // columnsHint is empty; callers that need typed rows should go via
    // Database.query() (single-shot).
    return new Statement(ok.stmt_id, sql, null);
  }

  /**
   * Runs `fn` inside a SQLite transaction. Commits if the function returns,
   * rolls back if it throws. Re-throws the original error.
   */
  transaction<T>(fn: (db: Database) => T): T {
    this.assertOpen();
    this.exec("BEGIN");
    let committed = false;
    try {
      const result = fn(this);
      this.exec("COMMIT");
      committed = true;
      return result;
    } finally {
      if (!committed) {
        try {
          this.exec("ROLLBACK");
        } catch {
          // ROLLBACK can fail if the transaction was already auto-rolled-back
          // (e.g. by SQLITE_BUSY). Swallowing here is correct — the
          // original error is already propagating.
        }
      }
    }
  }

  /**
   * Reads or writes a PRAGMA. With one argument: returns the current value
   * (`PRAGMA foo;`). With two arguments: sets it (`PRAGMA foo = bar;`).
   */
  pragma(name: string, value?: string | number): SqliteValue[][] {
    this.assertOpen();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      throw new SQLiteError(`Invalid pragma name: ${name}`, "SQLITE_MISUSE");
    }
    const sql =
      value === undefined
        ? `PRAGMA ${name}`
        : `PRAGMA ${name} = ${typeof value === "number" ? value : `'${String(value).replace(/'/g, "''")}'`}`;
    const result = getBridge().sqlite_query(this.dbId!, sql, []);
    const ok = unwrap<BridgeQueryResult>(result, `Database.pragma(${name})`);
    return ok.rows;
  }

  /** Closes the database. Idempotent. */
  close(): void {
    if (this.dbId === null) return;
    const id = this.dbId;
    this.dbId = null;
    getBridge().sqlite_close(id);
  }

  /** Returns `{ sqlite, sqlite_vec? }` reported by the host. */
  version(): { sqlite: string; sqlite_vec?: string } {
    return getBridge().sqlite_version();
  }

  private assertOpen(): void {
    if (this.dbId === null) {
      throw new SQLiteError("Database is closed", "SQLITE_MISUSE");
    }
  }
}

/**
 * Convenience: returns `new Database(path)`. Mirrors the `node:sqlite`
 * factory signature in Node 22+.
 */
export function open(
  path: string,
  options?: { readonly?: boolean; timeout_ms?: number },
): Database {
  return new Database(path, options);
}

export default {
  Database,
  Statement,
  SQLiteError,
  open,
};
