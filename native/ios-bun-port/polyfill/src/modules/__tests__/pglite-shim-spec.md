# PGlite → SQLite translation spec

This document specifies the SQL rewrites that `pglite-shim.ts`'s
`translatePgSqlToSqlite()` must perform. Each entry is a real pattern
drawn from `plugins/plugin-sql/drizzle/migrations/*.sql` (the SQL that
the agent emits at runtime).

There is no test runner inside JSContext yet, so this is an inspection
spec, not executable tests. When a runner lands, each entry below
should become a regression case.

## Conventions

- INPUT is the literal SQL the plugin emits (Postgres dialect).
- OUTPUT is the SQL after `translatePgSqlToSqlite()`.
- Where the bridge then runs the OUTPUT through `sqlite3_exec` / `sqlite3_prepare_v2`,
  we annotate the expected SQLite behavior.

---

### 1. SERIAL primary key

```
INPUT:  CREATE TABLE t (id BIGSERIAL PRIMARY KEY, data TEXT);
OUTPUT: CREATE TABLE t (id INTEGER PRIMARY KEY, data TEXT);
```

SQLite treats `INTEGER PRIMARY KEY` as a rowid alias and autoincrements it.

### 2. UUID column type

```
INPUT:  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL
OUTPUT: "id" TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || ...) NOT NULL
```

### 3. JSONB column with default

```
INPUT:  "bio" jsonb DEFAULT '[]'::jsonb
OUTPUT: "bio" TEXT DEFAULT '[]'
```

### 4. TIMESTAMP WITH TIME ZONE

```
INPUT:  "created_at" timestamp with time zone DEFAULT now() NOT NULL
OUTPUT: "created_at" TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
```

### 5. TIMESTAMPTZ alias

```
INPUT:  "expires_at" timestamptz NOT NULL
OUTPUT: "expires_at" TEXT NOT NULL
```

### 6. BOOLEAN

```
INPUT:  "enabled" boolean DEFAULT true NOT NULL
OUTPUT: "enabled" INTEGER DEFAULT true NOT NULL
```

NOTE: SQLite accepts `true` / `false` as keywords (returns 1 / 0); no further rewriting needed.

### 7. BIGINT

```
INPUT:  "ts" bigint NOT NULL
OUTPUT: "ts" INTEGER NOT NULL
```

### 8. TEXT[] (Postgres array)

```
INPUT:  "names" text[] DEFAULT '{}'::text[] NOT NULL
OUTPUT: "names" TEXT DEFAULT '{}' NOT NULL
```

Application code must JSON-encode the array on write and decode on read.

### 9. UUID[] array (TODO)

```
INPUT:  "evidence_message_ids" uuid[]
OUTPUT: "evidence_message_ids" TEXT
```

NOTE: Only the bare `<type>[]` form is rewritten. `uuid[] DEFAULT '{}'`
gets the array bracket stripped but the literal is preserved; callers
must handle the parse.

### 10. vector(N)

```
INPUT:  "dim_1024" vector(1024)
OUTPUT: "dim_1024" BLOB
```

NOTE: Plain `CREATE TABLE` with `BLOB` works for storage but does NOT
enable similarity search. Use `sqlite-vec`'s `CREATE VIRTUAL TABLE
... USING vec0(...)` (see `sqlite-vec.ts`) for KNN-enabled tables.

### 11. gen_random_uuid()

```
INPUT:  DEFAULT gen_random_uuid()
OUTPUT: DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || ... )
```

Produces a v4-shaped UUID. Uses sqlite's `randomblob()` which seeds from
`/dev/urandom` on iOS — cryptographically sound enough for identifier use.

### 12. now() function call

```
INPUT:  DEFAULT now()
OUTPUT: DEFAULT CURRENT_TIMESTAMP
```

### 13. ::jsonb cast on literal

```
INPUT:  DEFAULT '{}'::jsonb
OUTPUT: DEFAULT '{}'
```

### 14. ::text cast on value

```
INPUT:  WHERE col = $1::text
OUTPUT: WHERE col = $1
```

### 15. ::uuid cast

```
INPUT:  WHERE id = $1::uuid
OUTPUT: WHERE id = $1
```

### 16. Schema-qualified table name

```
INPUT:  ALTER TABLE "approval_requests" ADD CONSTRAINT "fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade;
OUTPUT: -- [pg-shim] ADD CONSTRAINT stripped (SQLite cannot add FKs post-create);
```

NOTE: The `public.` qualifier strip is a no-op here because the whole
ALTER statement is replaced by a comment. For SELECTs that reference
`public.agents`, the `public.` prefix is stripped, leaving the bare
table name.

### 17. ALTER TABLE ADD CONSTRAINT (FK)

Covered in (16). SQLite cannot add FKs after CREATE; these get stripped.
Inline FKs in CREATE TABLE work as expected.

### 18. CREATE INDEX USING btree

```
INPUT:  CREATE INDEX "idx_x" ON "t" USING btree ("a","b");
OUTPUT: CREATE INDEX "idx_x" ON "t" ("a","b");
```

### 19. CREATE UNIQUE INDEX USING btree

```
INPUT:  CREATE UNIQUE INDEX "u" ON "t" USING btree ("a");
OUTPUT: CREATE UNIQUE INDEX "u" ON "t" ("a");
```

### 20. JSON path `->>` operator

```
INPUT:  CREATE INDEX "idx_memories_metadata_type" ON "memories" USING btree (((metadata->>'type')));
OUTPUT: CREATE INDEX "idx_memories_metadata_type" ON "memories" ((((json_extract(metadata, '$.type')))));
```

NOTE: The extra parens are preserved from the input; SQLite tolerates
them.

### 21. JSON path `->` operator (single arrow)

```
INPUT:  WHERE metadata->'tags' = '[]'
OUTPUT: WHERE json_extract(metadata, '$.tags') = '[]'
```

### 22. RETURNING clause

```
INPUT:  INSERT INTO t (a) VALUES ($1) RETURNING id;
OUTPUT: INSERT INTO t (a) VALUES ($1) RETURNING id;
```

NOTE: SQLite 3.35+ (iOS 15+ ships ≥ 3.34, iOS 16+ ships ≥ 3.39) supports
RETURNING natively. **iOS 15.0 ships SQLite 3.34.1 — RETURNING is NOT
supported on iOS 15.x.** Document this in the iOS minimum-version policy.

### 23. ON CONFLICT DO UPDATE (upsert)

```
INPUT:  INSERT INTO t (k, v) VALUES ($1, $2)
        ON CONFLICT (k) DO UPDATE SET v = excluded.v;
OUTPUT: INSERT INTO t (k, v) VALUES ($1, $2)
        ON CONFLICT (k) DO UPDATE SET v = excluded.v;
```

NOTE: SQLite 3.24+ supports this natively. iOS 15+ has 3.34+, so no
rewriting needed.

### 24. CHECK constraint

```
INPUT:  CONSTRAINT "embedding_source_check" CHECK ("memory_id" IS NOT NULL)
OUTPUT: CONSTRAINT "embedding_source_check" CHECK ("memory_id" IS NOT NULL)
```

Passes through unchanged.

### 25. CREATE TABLE composite PRIMARY KEY

```
INPUT:  CREATE TABLE cache (
          "key" text NOT NULL,
          "agent_id" uuid NOT NULL,
          CONSTRAINT "cache_key_agent_id_pk" PRIMARY KEY("key","agent_id")
        );
OUTPUT: CREATE TABLE cache (
          "key" TEXT NOT NULL,
          "agent_id" TEXT NOT NULL,
          CONSTRAINT "cache_key_agent_id_pk" PRIMARY KEY("key","agent_id")
        );
```

### 26. Postgres positional placeholder ($1)

```
INPUT:  SELECT * FROM t WHERE id = $1
OUTPUT: SELECT * FROM t WHERE id = $1
```

Passes through. SQLite's prepare API accepts `$1`, `?`, and `:name`.

### 27. drizzle statement-breakpoint marker

```
INPUT:  CREATE TABLE a (id INTEGER);
        --> statement-breakpoint
        CREATE TABLE b (id INTEGER);
OUTPUT: CREATE TABLE a (id INTEGER);
        ;
        CREATE TABLE b (id INTEGER);
```

The marker becomes a semicolon so multi-statement `sqlite3_exec` handles
the boundary correctly.

### 28. REAL / DOUBLE PRECISION

```
INPUT:  "confidence" real DEFAULT 0 NOT NULL
OUTPUT: "confidence" REAL DEFAULT 0 NOT NULL
```

```
INPUT:  "score" double precision NOT NULL
OUTPUT: "score" REAL NOT NULL
```

### 29. BYTEA

```
INPUT:  "blob" bytea NOT NULL
OUTPUT: "blob" BLOB NOT NULL
```

### 30. SMALLINT / INT4 / INT8 family

```
INPUT:  "count" smallint NOT NULL, "small_id" int4, "big_id" int8
OUTPUT: "count" INTEGER NOT NULL, "small_id" INTEGER, "big_id" INTEGER
```

### 31. FLOAT4 / FLOAT8

```
INPUT:  "x" float4, "y" float8
OUTPUT: "x" REAL, "y" REAL
```

### 32. Multiple INSERTs in one exec

```
INPUT:  INSERT INTO t (a) VALUES (1);
        INSERT INTO t (a) VALUES (2);
OUTPUT: INSERT INTO t (a) VALUES (1);
        INSERT INTO t (a) VALUES (2);
```

Pass-through; `sqlite_exec` handles multiple statements.

---

## Patterns NOT (yet) translated — TODO

These need manual rewrites at the call site, or follow-up shim work:

- **Window functions**: SQLite 3.25+ supports them natively, but
  Postgres-specific syntax like `FILTER (WHERE ...)` may need rewriting.
- **CTEs (WITH ...)**: SQLite supports them, but `WITH RECURSIVE` and
  `MATERIALIZED` keywords differ — caller's responsibility.
- **Multi-level JSON arrows**: `a->'b'->>'c'` is left alone (only
  single-arrow patterns are rewritten). Plugin-sql must rewrite manually
  if it uses chained arrows.
- **`ARRAY[1,2,3]` literal**: Postgres array literals are not translated.
  Callers should JSON-encode before passing as text.
- **`ANY($1)` / `ALL($1)`**: PG array-comparison operators have no SQLite
  equivalent; rewrite as `IN (?)`.
- **`generate_series()`**: Not in SQLite. Caller must materialize.
- **`unnest()`**: Not in SQLite. Caller must JSON-decode and iterate.
- **`COALESCE` with `::type` mixing**: Casts inside COALESCE are stripped
  by the regex, but type-mixed COALESCE may break under SQLite's looser
  type system.
- **`'value' = ANY(array_col)`**: Not rewritten. Plugin-sql currently
  doesn't use this pattern but it'll fail loudly if introduced.
- **`pg_catalog.*` introspection**: All queries against `pg_class` /
  `information_schema.*` are unsupported. Use `sqlite_master` instead.
- **`EXTRACT(epoch FROM timestamp)`**: Not rewritten. Use `unixepoch(col)`
  in SQLite.
- **`DISTINCT ON (col)`**: Not in SQLite. Rewrite as window-function +
  `ROW_NUMBER()`.
- **Range types (`int4range`, `tstzrange`)**: Not supported; agent doesn't
  use them.
- **Triggers using PL/pgSQL**: Not supported. SQLite has triggers but
  with a different syntax; agent doesn't currently use them.
- **`LISTEN` / `NOTIFY`**: Stubbed at the PGlite class level (throws).
  Real pub/sub needs an out-of-DB channel.
- **Advisory locks (`pg_advisory_lock`)**: No equivalent. Application
  code that needs them must use OS-level locks.

---

## Threading model verified

The bridge installs every `sqlite_*` host function on the JSContext
queue (`ai.eliza.bun.runtime`). libsqlite3 handles are opened with
`SQLITE_OPEN_FULLMUTEX`, so concurrent re-entry from the same queue is
safe. Cross-queue calls are forbidden by the bridge contract.

The PGlite shim returns promises that resolve synchronously (under
`Promise.resolve()`). This is faithful to PGlite's behavior in
"relaxed durability" mode and avoids exposing the agent to a thread
context it shouldn't see.
