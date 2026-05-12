// PGlite-shaped facade over the native SQLite bridge.
//
// PGlite (https://pglite.dev/) is a WASM build of PostgreSQL. It cannot run
// inside JSContext on iOS 16.4+ — WebAssembly is gated off in the iOS JSC
// build. The agent's plugin-sql imports `@electric-sql/pglite` for its
// embedded database backend; the bundle step rewrites that import to point
// here so the existing call sites work unchanged.
//
// This is a translation layer, not a faithful Postgres emulator. SQL with
// Postgres-specific syntax (JSONB casts, `::` casts, `gen_random_uuid()`,
// `vector(N)` columns, `RETURNING`, `ON CONFLICT DO UPDATE`) is translated
// into SQLite-compatible SQL on the fly. See `SQLITE_BRIDGE.md` for the
// full mapping table and known gaps.

import { Database, SqliteParam, SqliteValue, SQLiteError } from "./sqlite.js";

// ─────────────────────────────────────────────────────────────────────────────
// PG → SQLite translation
// ─────────────────────────────────────────────────────────────────────────────

const CAST_REGEX = /::\s*(?:jsonb|json|text|uuid|integer|bigint|real|boolean|timestamptz|timestamp(?:\s+with\s+time\s+zone)?|"[^"]+"|[a-zA-Z_]+(?:\s*\[\])?)/gi;

/**
 * Translates a chunk of Postgres-flavored SQL to SQLite-flavored SQL.
 * Returns the rewritten SQL string. Does NOT touch parameter placeholders
 * — `$1` style is left as-is; SQLite accepts `$1`, `?`, and `:name`.
 *
 * Order matters: type translations run before function translations so we
 * don't accidentally rewrite a type that contains a keyword.
 */
export function translatePgSqlToSqlite(sql: string): string {
  let s = sql;

  // 1. Strip "public." schema qualifier (SQLite has no schemas).
  s = s.replace(/\bpublic\.\b/gi, "");

  // 2. Column types.
  //   BIGSERIAL / SERIAL → INTEGER PRIMARY KEY AUTOINCREMENT only works when
  //   they're the PK. In the wild they always are. We rewrite the type and
  //   trust the surrounding `PRIMARY KEY` to be present.
  s = s.replace(/\b(BIG)?SERIAL\b/gi, "INTEGER");
  s = s.replace(/\bSMALLSERIAL\b/gi, "INTEGER");
  //   UUID → TEXT (SQLite has no UUID type; strings are stored as-is).
  s = s.replace(/\bUUID\b/gi, "TEXT");
  //   JSONB / JSON → TEXT (validated by the application layer; we store the
  //   serialized JSON string).
  s = s.replace(/\bJSONB\b/gi, "TEXT");
  s = s.replace(/\bJSON\b(?!_)/gi, "TEXT");
  //   TIMESTAMP WITH TIME ZONE / TIMESTAMPTZ → TEXT (ISO-8601 strings).
  s = s.replace(/\bTIMESTAMP\s+WITH\s+TIME\s+ZONE\b/gi, "TEXT");
  s = s.replace(/\bTIMESTAMPTZ\b/gi, "TEXT");
  s = s.replace(/\bTIMESTAMP\b/gi, "TEXT");
  //   BIGINT / INT8 → INTEGER (SQLite INTEGER is 64-bit).
  s = s.replace(/\bBIGINT\b/gi, "INTEGER");
  s = s.replace(/\bINT8\b/gi, "INTEGER");
  s = s.replace(/\bINT4\b/gi, "INTEGER");
  s = s.replace(/\bSMALLINT\b/gi, "INTEGER");
  //   DOUBLE PRECISION → REAL.
  s = s.replace(/\bDOUBLE\s+PRECISION\b/gi, "REAL");
  s = s.replace(/\bFLOAT8\b/gi, "REAL");
  s = s.replace(/\bFLOAT4\b/gi, "REAL");
  //   BOOLEAN → INTEGER (SQLite has no boolean type; 0/1).
  s = s.replace(/\bBOOLEAN\b/gi, "INTEGER");
  //   TEXT[] / text[] → TEXT (we store JSON-serialized arrays).
  s = s.replace(/\bTEXT\s*\[\s*\]\b/gi, "TEXT");
  s = s.replace(/\b([a-zA-Z_][a-zA-Z0-9_]*)\s*\[\s*\]/g, (_full, base: string) => {
    // Generic `<type>[]` → TEXT.
    if (/^(int|integer|bigint|smallint|real|float|double|text|varchar|char|uuid|jsonb|json|bytea)$/i.test(base)) {
      return "TEXT";
    }
    // Unknown → leave alone.
    return `${base}[]`;
  });
  //   BYTEA → BLOB.
  s = s.replace(/\bBYTEA\b/gi, "BLOB");
  //   `vector(N)` → BLOB (sqlite-vec stores vectors as BLOBs in virtual
  //   tables, but for plain CREATE TABLE we approximate as BLOB so the
  //   column at least exists. Real vector queries must use sqlite-vec
  //   virtual table syntax — see the vec module.)
  s = s.replace(/\bvector\s*\(\s*\d+\s*\)/gi, "BLOB");

  // 3. Postgres functions.
  //   gen_random_uuid() → we emit a deterministic placeholder; the shim
  //   intercepts inserts that use this and substitutes a crypto UUID via
  //   the bridge. SQLite has no built-in UUID generator.
  s = s.replace(/\bgen_random_uuid\s*\(\s*\)/gi, "(lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6))))");
  //   now() / CURRENT_TIMESTAMP → SQLite's current timestamp string.
  s = s.replace(/\bnow\s*\(\s*\)/gi, "CURRENT_TIMESTAMP");

  // 4. Postgres-specific casts. `'[]'::jsonb`, `'{}'::jsonb`, `value::text`.
  s = s.replace(CAST_REGEX, "");

  // 5. ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY ... — SQLite does not
  //    support ADD CONSTRAINT post-create. We strip these and emit a comment
  //    so the migration still parses. Foreign keys in SQLite must be declared
  //    inline in CREATE TABLE; runtime-added FKs are silently ignored.
  s = s.replace(
    /ALTER\s+TABLE\s+[^;]*?ADD\s+CONSTRAINT[^;]*?;/gi,
    "-- [pg-shim] ADD CONSTRAINT stripped (SQLite cannot add FKs post-create);",
  );

  // 6. CREATE INDEX ... USING btree (...) → CREATE INDEX ... (...).
  //    SQLite has only one index type; the USING clause is rejected.
  s = s.replace(/USING\s+btree\s*/gi, "");
  s = s.replace(/USING\s+hash\s*/gi, "");
  s = s.replace(/USING\s+gist\s*/gi, "");
  s = s.replace(/USING\s+gin\s*/gi, "");

  // 7. `metadata->>'key'` JSON arrow → `json_extract(metadata, '$.key')`.
  //    Only handles the common single-level `->>` form. Multi-level chains
  //    (`a->'b'->>'c'`) need manual rewriting at the call site.
  s = s.replace(/\b([a-zA-Z_][a-zA-Z0-9_]*)\s*->>\s*'([^']+)'/g, (_full, col: string, key: string) => `json_extract(${col}, '$.${key}')`);
  s = s.replace(/\b([a-zA-Z_][a-zA-Z0-9_]*)\s*->\s*'([^']+)'/g, (_full, col: string, key: string) => `json_extract(${col}, '$.${key}')`);

  // 8. Postgres-style placeholders `$1`, `$2` → SQLite accepts them as-is
  //    when running through sqlite3 statement binders. Leave alone.

  // 9. Statement-breakpoint markers used by drizzle migrations.
  s = s.replace(/--> statement-breakpoint/gi, ";");

  // 10. RETURNING is supported by SQLite 3.35+ (iOS 15 ships 3.34, iOS 16
  //     ships 3.39+). Document the floor in SQLITE_BRIDGE.md and leave the
  //     clause intact.

  return s;
}

// ─────────────────────────────────────────────────────────────────────────────
// Parameter binding helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * PGlite accepts JS objects/arrays directly and serializes JSON params on the
 * way in. Our SQLite bridge only accepts string/number/boolean/null/Uint8Array.
 * Coerce JS values into bridge-friendly forms.
 */
function coerceParam(p: unknown): SqliteParam {
  if (p === null || p === undefined) return null;
  if (typeof p === "string" || typeof p === "number" || typeof p === "boolean") return p;
  if (p instanceof Uint8Array) return p;
  if (p instanceof Date) return p.toISOString();
  // Arrays + plain objects become JSON-encoded text.
  return JSON.stringify(p);
}

function coerceParams(params: readonly unknown[] | undefined): SqliteParam[] {
  if (!params || params.length === 0) return [];
  return params.map(coerceParam);
}

// ─────────────────────────────────────────────────────────────────────────────
// PGlite types (faithful to the public surface of @electric-sql/pglite)
// ─────────────────────────────────────────────────────────────────────────────

export interface PGliteOptions {
  dataDir?: string;
  // The full PGlite options surface includes `extensions`, `relaxedDurability`,
  // `fs`, `loadDataDir`, etc. We accept and ignore them — they're WASM-specific.
  extensions?: Record<string, unknown>;
  relaxedDurability?: boolean;
  debug?: number;
}

export interface PGFieldInfo {
  name: string;
  dataTypeID: number;
}

export interface PGResults<T = Record<string, unknown>> {
  rows: T[];
  affectedRows?: number;
  fields: PGFieldInfo[];
  blob?: never;
}

export interface PGTransaction {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<PGResults<T>>;
  exec(sql: string): Promise<Array<PGResults>>;
  rollback(): Promise<void>;
}

export interface PGListenSubscription {
  unsubscribe(): Promise<void>;
}

// Postgres OIDs we surface to consumers. We only cover the types that the
// agent's plugin-sql actually probes — adding more is cheap when needed.
const OID = {
  TEXT: 25,
  INT8: 20,
  INT4: 23,
  FLOAT8: 701,
  BOOL: 16,
  BYTEA: 17,
  TIMESTAMPTZ: 1184,
  UUID: 2950,
  JSONB: 3802,
  JSON: 114,
} as const;

function inferOid(sample: SqliteValue): number {
  if (sample === null) return OID.TEXT;
  if (sample instanceof Uint8Array) return OID.BYTEA;
  if (typeof sample === "number") return Number.isInteger(sample) ? OID.INT8 : OID.FLOAT8;
  if (typeof sample === "string") {
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(sample)) return OID.TIMESTAMPTZ;
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sample)) return OID.UUID;
    if (sample.length > 0 && (sample.startsWith("{") || sample.startsWith("["))) return OID.JSONB;
  }
  return OID.TEXT;
}

// ─────────────────────────────────────────────────────────────────────────────
// PGlite class
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Drop-in shim for `@electric-sql/pglite`'s `PGlite` class. Only the methods
 * that plugin-sql actually exercises in production are implemented; the rest
 * throw with an explanatory message.
 *
 * Construction is synchronous (we open the native handle immediately), but the
 * `ready` / `waitReady` promises resolve on the next microtask so callers that
 * await them keep working.
 */
export class PGlite {
  public readonly ready: Promise<void>;
  public readonly waitReady: Promise<void>;
  private readonly db: Database;
  private closed = false;

  constructor(optionsOrDataDir?: PGliteOptions | string) {
    const opts: PGliteOptions =
      typeof optionsOrDataDir === "string"
        ? { dataDir: optionsOrDataDir }
        : optionsOrDataDir ?? {};

    // PGlite uses dataDir as a directory. SQLite needs a file path. We map:
    //   - dataDir === "memory://" or missing → ":memory:"
    //   - dataDir is a path → append "/database.sqlite"
    let path = ":memory:";
    if (opts.dataDir) {
      if (opts.dataDir === "memory://" || opts.dataDir === ":memory:") {
        path = ":memory:";
      } else {
        // Strip the `idb://` / `file://` prefixes PGlite uses; the bridge
        // expects a plain absolute path.
        const cleaned = opts.dataDir.replace(/^file:\/\//, "").replace(/^idb:\/\//, "");
        path = cleaned.endsWith(".sqlite") || cleaned.endsWith(".db")
          ? cleaned
          : `${cleaned.replace(/\/+$/, "")}/database.sqlite`;
      }
    }

    this.db = new Database(path);
    // Enable foreign keys (off by default in SQLite) so PG-style FK schemas
    // behave the same way.
    this.db.exec("PRAGMA foreign_keys = ON;");
    // WAL gives PG-like concurrent reads. Safe on iOS sandboxed file systems.
    try {
      this.db.exec("PRAGMA journal_mode = WAL;");
    } catch {
      // WAL fails on `:memory:` and some filesystems; fall back silently.
    }
    this.ready = Promise.resolve();
    this.waitReady = this.ready;
  }

  /** Execute a parameterized statement and return rows. */
  async query<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<PGResults<T>> {
    this.assertOpen();
    const translated = translatePgSqlToSqlite(sql);
    const bound = coerceParams(params);
    const isSelect = /^\s*(WITH|SELECT|RETURNING)/i.test(translated);
    if (isSelect || /\bRETURNING\b/i.test(translated)) {
      const result = this.db.query<Record<string, SqliteValue>>(translated, bound);
      const fields: PGFieldInfo[] = result.columns.map((name, idx) => {
        const sample = result.rows[0]?.[name] ?? result.rawRows[0]?.[idx] ?? null;
        return { name, dataTypeID: inferOid(sample) };
      });
      return {
        rows: result.rows as unknown as T[],
        fields,
      };
    }
    const r = this.db.exec(translated.endsWith(";") ? translated : `${translated};`);
    return { rows: [], affectedRows: r.rowsAffected, fields: [] };
  }

  /** Execute one or more semicolon-separated statements. */
  async exec(sql: string): Promise<Array<PGResults>> {
    this.assertOpen();
    const translated = translatePgSqlToSqlite(sql);
    // We can't split on `;` safely because of strings/comments. The bridge's
    // sqlite_exec handles multi-statement SQL natively via sqlite3_exec.
    const r = this.db.exec(translated);
    return [{ rows: [], affectedRows: r.rowsAffected, fields: [] }];
  }

  /** Transaction with optional rollback via `tx.rollback()`. */
  async transaction<T>(fn: (tx: PGTransaction) => Promise<T>): Promise<T> {
    this.assertOpen();
    this.db.exec("BEGIN");
    let rolledBack = false;
    const tx: PGTransaction = {
      query: async <U>(sql: string, params: unknown[] = []) => {
        return this.query<U>(sql, params) as Promise<PGResults<U>>;
      },
      exec: async (sql: string) => this.exec(sql),
      rollback: async () => {
        if (rolledBack) return;
        rolledBack = true;
        this.db.exec("ROLLBACK");
      },
    };
    try {
      const result = await fn(tx);
      if (!rolledBack) this.db.exec("COMMIT");
      return result;
    } catch (err) {
      if (!rolledBack) {
        try {
          this.db.exec("ROLLBACK");
        } catch {
          // already rolled back by the engine
        }
      }
      throw err;
    }
  }

  /** Close the database. Subsequent calls are no-ops. */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.db.close();
  }

  // ─── Stubbed PGlite surface ─────────────────────────────────────────────
  // The agent's plugin-sql does not exercise these in the SQLite-backed
  // configuration, but the type shape exists on real PGlite. We throw a
  // recognizable error so any accidental call surfaces quickly.

  async listen(_channel: string, _callback: (payload: string) => void): Promise<PGListenSubscription> {
    throw new SQLiteError(
      "PGlite.listen() is not supported on the iOS SQLite backend (LISTEN/NOTIFY is a Postgres-only feature).",
      "SQLITE_UNSUPPORTED",
    );
  }

  async notify(_channel: string, _payload?: string): Promise<void> {
    throw new SQLiteError(
      "PGlite.notify() is not supported on the iOS SQLite backend.",
      "SQLITE_UNSUPPORTED",
    );
  }

  async unlisten(_channel: string, _callback?: (payload: string) => void): Promise<void> {
    // Idempotent no-op so cleanup paths don't crash.
    return;
  }

  async subscribe(
    _query: string,
    _callback: (results: unknown) => void,
    _params?: unknown[],
  ): Promise<{ unsubscribe(): Promise<void> }> {
    throw new SQLiteError(
      "PGlite live subscriptions (live.changes, live.query) are not supported on the iOS SQLite backend.",
      "SQLITE_UNSUPPORTED",
    );
  }

  async refresh(): Promise<void> {
    // Live queries are stubbed; refresh is a no-op so callers in cleanup
    // paths don't crash.
    return;
  }

  async sync(): Promise<void> {
    // PGlite's `sync()` flushes the WASM filesystem to its persistent backend.
    // SQLite writes are durable already.
    return;
  }

  private assertOpen(): void {
    if (this.closed) throw new SQLiteError("PGlite handle has been closed", "SQLITE_MISUSE");
  }
}

// Default export mirrors `@electric-sql/pglite`'s shape, which exports `PGlite`
// as both a named and default export depending on the bundler.
export default PGlite;
