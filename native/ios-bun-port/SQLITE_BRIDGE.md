# SQLite bridge — iOS Bun-port database layer

## Why not PGlite

The agent's `plugin-sql` uses [PGlite](https://pglite.dev) (a WebAssembly
build of PostgreSQL) as its embedded database backend on every other
platform: desktop, server, browser. PGlite does **not** work inside
JSContext on iOS 16.4+:

- WebAssembly is gated off in the JSC build that ships with iOS. The
  WASM runtime exists but `WebAssembly.compile()` returns "WebAssembly
  is not enabled" from JSC's flag check.
- Apple's policy (App Review section 2.5.2 + JIT restrictions) means
  even a hypothetical WASM-via-JIT path would fail review.
- PGlite's IndexedDB fallback (`idb://`) needs DOM `indexedDB`, which
  is also absent in JSContext.

Research summary (May 2026): three workarounds were considered and
rejected.

1. **AOT-compile PGlite to native** — Postgres is 1.5M LOC of C; an
   ahead-of-time port to iOS would be a multi-engineer-year project and
   would still hit JIT-page-allocation guards.
2. **Ship a Bun WASM interpreter** — Bun does have an interpreter mode,
   but it's roughly 100x slower than JIT and would push DB writes into
   "do not use in production" territory.
3. **Out-of-process Postgres via Capacitor IPC** — would require shipping
   a Postgres binary + a daemon process, which iOS sandbox forbids.

The chosen solution is the only viable one: replace PGlite with native
SQLite (free, system-linked, always available on iOS) and translate the
PG-flavored SQL the agent emits into SQLite-flavored SQL on the fly.

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│  Agent JS (plugin-sql)                                              │
│  import PGlite from '@electric-sql/pglite'  ← rewritten by bundler  │
│                          │                                          │
│                          ▼                                          │
│  polyfill/src/modules/pglite-shim.ts                                │
│   PGlite class:                                                     │
│    - constructor       → opens native SQLite handle                 │
│    - query(sql, ...)   → translatePgSqlToSqlite() → bridge          │
│    - exec(sql)         → translatePgSqlToSqlite() → bridge          │
│    - transaction(fn)   → BEGIN / COMMIT / ROLLBACK                  │
│    - listen/notify     → throws (Postgres-only)                     │
│                          │                                          │
│                          ▼                                          │
│  polyfill/src/modules/sqlite.ts                                     │
│   Database + Statement classes (the friendly TS surface)            │
│                          │                                          │
│                          ▼                                          │
│  globalThis.__MILADY_BRIDGE__.sqlite_*  (8 host functions)          │
│                          │  (string + Uint8Array marshalling)       │
│                          ▼                                          │
│  Swift: SqliteBridge.swift                                          │
│   sqlite3_open_v2 / prepare_v2 / bind_* / step / column_* / etc.    │
│                          │                                          │
│                          ▼                                          │
│  libsqlite3.tbd  (system framework, no Pod dependency)              │
│  + optional sqlite-vec static lib (registered via dlsym)            │
└──────────────────────────────────────────────────────────────────────┘
```

## The 8 host functions

Defined in `BRIDGE_CONTRACT.md`. Names + Swift implementations:

| Bridge function    | Swift impl                              | libsqlite3 calls                              |
|--------------------|-----------------------------------------|-----------------------------------------------|
| `sqlite_open`      | `SqliteBridge.open(args:ctx:)`          | `sqlite3_open_v2`, `sqlite3_busy_timeout`     |
| `sqlite_close`     | `SqliteBridge.closeDb(id:)`             | `sqlite3_close_v2`                            |
| `sqlite_exec`      | `SqliteBridge.exec(args:)`              | `sqlite3_exec`, `sqlite3_changes`             |
| `sqlite_query`     | `SqliteBridge.query(args:ctx:)`         | `prepare_v2` / `bind_*` / `step` / `column_*` |
| `sqlite_prepare`   | `SqliteBridge.prepare(args:)`           | `sqlite3_prepare_v2`                          |
| `sqlite_step`      | `SqliteBridge.step(args:ctx:)`          | `bind_*`, `step`, `column_*`, `reset`         |
| `sqlite_finalize`  | `SqliteBridge.finalizeStmt(id:)`        | `sqlite3_finalize`                            |
| `sqlite_version`   | `SqliteBridge.version()`                | `sqlite3_libversion`                          |

## PG → SQLite SQL translation

See `polyfill/src/modules/__tests__/pglite-shim-spec.md` for the 32+
patterns covered. The translator handles:

- **Types**: `BIGSERIAL`, `UUID`, `JSONB`, `TIMESTAMPTZ`, `BOOLEAN`,
  `BIGINT`, `BYTEA`, `vector(N)`, `TEXT[]` → their SQLite analogues.
- **Functions**: `now()` → `CURRENT_TIMESTAMP`, `gen_random_uuid()` →
  hex/randomblob expression that emits a v4-shaped UUID.
- **Casts**: `::jsonb`, `::text`, `::uuid`, etc. — stripped.
- **Schema qualifier**: `public.foo` → `foo`.
- **`USING btree` / hash / gist / gin**: stripped.
- **`ALTER TABLE ADD CONSTRAINT FOREIGN KEY`**: stripped (SQLite cannot
  add FKs post-create). Inline FKs in `CREATE TABLE` work.
- **JSON arrows**: `col->>'key'` → `json_extract(col, '$.key')`.
- **drizzle markers**: `--> statement-breakpoint` → `;`.

The translator is regex-based and intentionally simple. It is **not** a
SQL parser — it relies on the predictable shape of the SQL that
plugin-sql emits via drizzle. If plugin-sql's emitted SQL gains a new
PG-specific construct, that construct needs to be added to the
translator (or rewritten at the plugin-sql call site).

## sqlite-vec integration

`vector(N)` columns are translated to `BLOB` for plain `CREATE TABLE`,
which gives you storage but no similarity search. For KNN queries,
plugin-sql call sites must adopt sqlite-vec's virtual-table syntax:

```sql
CREATE VIRTUAL TABLE embeddings USING vec0(
  embedding float[1024],
  memory_id TEXT
);

INSERT INTO embeddings (embedding, memory_id) VALUES (?, ?);

SELECT rowid, distance, memory_id
  FROM embeddings
  WHERE embedding MATCH ?
    AND k = 10
  ORDER BY distance;
```

The `sqlite-vec.ts` polyfill module wraps this for direct callers.
`pglite-shim` does NOT yet rewrite pgvector operators (`<->`, `<=>`)
into sqlite-vec syntax — that's a separate plugin-sql rebase, tracked
outside this bridge.

### Linking sqlite-vec

The static lib is **not yet linked** as of this writing. The Swift
loader (`SqliteVecLoader.swift`) uses `dlsym(RTLD_DEFAULT, "sqlite3_vec_init")`
to detect availability at runtime, so:

- When the `.a` is absent: vector queries fail with SQLite's standard
  `"no such module: vec0"` error.
- When the `.a` is linked: `sqlite3_vec_init` is called on every opened
  DB during `sqlite_open`.

Build instructions for the static lib live in
[`eliza/packages/ios-native-deps/sqlite-vec/README.md`](../../eliza/packages/ios-native-deps/sqlite-vec/README.md).
The pinned version is in
[`eliza/packages/ios-native-deps/VERSIONS`](../../eliza/packages/ios-native-deps/VERSIONS).
(Both moved out of `native/ios-bun-port/vendor-deps/` on 2026-05-13.
npm: `@elizaos/ios-native-deps`.)

## Threading model

- All `sqlite_*` host functions run on the JSContext queue
  (`ai.eliza.bun.runtime`).
- `SQLITE_OPEN_FULLMUTEX` is used on every open so libsqlite3's
  per-handle mutex is enabled. Re-entry from the same queue is safe.
- Cross-queue calls are forbidden by the bridge contract. Async
  callers (the HTTP server, llama generation) must marshal back onto
  the JSContext queue before invoking the bridge.

## Type marshalling

| JS type           | Bridge param  | SQLite bind | SQLite column → JS                |
|-------------------|---------------|-------------|-----------------------------------|
| `null`            | `null`        | NULL        | NULL → `null`                     |
| `boolean`         | `boolean`     | INTEGER 0/1 | INTEGER → number (1.x rounding)   |
| `number` (int)    | `number`      | INTEGER     | INTEGER → number                  |
| `number` (float)  | `number`      | REAL        | REAL → number                     |
| `string`          | `string`      | TEXT        | TEXT → string                     |
| `Uint8Array`      | `Uint8Array`  | BLOB        | BLOB → `Uint8Array`               |
| `Date`            | (shim → ISO)  | TEXT        | TEXT → string                     |
| object / array    | (shim → JSON) | TEXT        | TEXT → string                     |

JS numbers are 64-bit doubles. When a JS number has no fractional part
and fits inside Int64 range, the bridge binds it as `INTEGER`, otherwise
as `REAL`. This preserves exact IDs and Unix-epoch timestamps.

## Known limitations

### From SQLite itself

- **No `LISTEN`/`NOTIFY`**: PGlite's pub/sub is Postgres-only.
  `PGlite.listen()` / `PGlite.notify()` throw.
- **No advisory locks**: Application-level locking must use other
  mechanisms.
- **No materialized views**: `CREATE MATERIALIZED VIEW` fails. SQLite
  views are non-materialized only.
- **Limited type system**: SQLite's "type affinity" model accepts any
  value into any column, which means PG check constraints that depend
  on strict typing won't behave identically.
- **No `RETURNING` on iOS 15.x**: iOS 15 ships SQLite 3.34.1, but
  `RETURNING` requires 3.35+. iOS 16+ ships 3.39+, so the floor matters.
  Plugin-sql queries that depend on RETURNING must be rewritten as a
  separate `SELECT ... WHERE rowid = last_insert_rowid()` on iOS 15.

### From the translator

- **Regex-based**: not a real parser. Edge cases in string literals
  containing keywords will misfire. Plugin-sql's generated SQL avoids
  these in practice.
- **Multi-level JSON arrows**: only single-arrow patterns are
  rewritten. `a->'b'->>'c'` is left alone — caller's responsibility.
- **Array literals**: `ARRAY[1,2,3]` passes through unmodified.
- **`ANY($1)` / `ALL($1)`**: not rewritten. Caller must use `IN (?)`.

### From the bridge architecture

- **No streaming results**: `sqlite_query` materializes all rows
  before returning. For large result sets, use `sqlite_prepare` +
  repeated `sqlite_step` calls (the `Statement.all()` helper does this).
- **No prepared-statement metadata**: `Database.prepare(sql)` returns
  a `Statement` without column-name hints. Use `Database.query(sql)`
  (single-shot) when you need column names, or pre-declare them at
  the call site.
- **No background commits**: SQLite WAL mode is enabled by default in
  the PGlite shim, but checkpoint timing is fully synchronous.

## Path to extend

1. **Add a new PG → SQLite translation**: edit
   `polyfill/src/modules/pglite-shim.ts`'s `translatePgSqlToSqlite()`
   and add a test entry to
   `polyfill/src/modules/__tests__/pglite-shim-spec.md`.
2. **Add a new sqlite-vec helper**: edit
   `polyfill/src/modules/sqlite-vec.ts`. The Swift side needs no changes
   — the extension is loaded at handle-open time.
3. **Expose a new sqlite_* host function**: extend
   `BRIDGE_CONTRACT.md` (bump version if breaking), update the bridge
   interface in `polyfill/src/bridge.ts`, implement the Swift side in
   `SqliteBridge.swift`, and surface it through `sqlite.ts`.
4. **Link sqlite-vec**: follow
   [`eliza/packages/ios-native-deps/sqlite-vec/README.md`](../../eliza/packages/ios-native-deps/sqlite-vec/README.md).
   The Swift loader auto-detects at startup.

## File index

```
native/ios-bun-port/
├── BRIDGE_CONTRACT.md                          # authoritative contract (v1)
├── SQLITE_BRIDGE.md                            # this file
└── polyfill/src/modules/

# Build harness has moved to eliza:
eliza/packages/ios-native-deps/                 # @elizaos/ios-native-deps
├── VERSIONS                                    # pinned sqlite-vec tag
└── sqlite-vec/README.md                        # build + link instructions

native/ios-bun-port/polyfill/src/modules/
    ├── sqlite.ts                               # Database + Statement TS API
    ├── pglite-shim.ts                          # @electric-sql/pglite shim
    ├── sqlite-vec.ts                           # KNN helper
    ├── sqlite-install.ts                       # installer entry point
    └── __tests__/pglite-shim-spec.md           # translation spec (32+ cases)

eliza/packages/native-plugins/bun-runtime/ios/Sources/ElizaBunRuntimePlugin/bridge/
├── SqliteBridge.swift                          # 8 host functions
├── SqliteVecLoader.swift                       # dlsym-based extension loader
└── SqliteBridgeInstaller.swift                 # install() entry for BridgeKit
```
