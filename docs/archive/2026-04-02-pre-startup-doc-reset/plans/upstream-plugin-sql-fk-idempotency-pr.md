# plugin-sql: make FK migrations idempotent (PostgreSQL)

## Summary
`@elizaos/plugin-sql` can emit `ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY ...` statements that are not idempotent across partial migration states. If the FK already exists (for example after a prior partial run), PostgreSQL errors with duplicate constraint and plugin startup fails.

This change makes FK creation idempotent by guarding FK DDL with a `pg_constraint` existence check.

## Problem
Generated migration SQL currently creates foreign keys via unconditional `ADD CONSTRAINT`:

- during `generateCreateTableSQL(...)` for new tables
- during `generateCreateForeignKeySQL(...)` for diff-based FK creation

When a previous run already created the FK, reruns can fail with:

`duplicate_object` / `constraint already exists`

Observed user-facing failure included:

`todo_tags_todo_id_todos_id_fk`

## Root Cause
The migration engine mixes:

1. `CREATE TABLE IF NOT EXISTS` (safe/idempotent for table presence)
2. unconditional FK `ALTER TABLE ... ADD CONSTRAINT` (not idempotent)

So a partially-migrated DB can have the table and FK already present, but migration replay still tries to add the FK again.

## Fix
Wrap FK creation in:

`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '<fk_name>') THEN <ADD CONSTRAINT>; END IF; END $$;`

Applied in all shipped outputs:

- `dist/node/index.node.js`
- `dist/browser/index.browser.js`
- `dist/cjs/index.node.cjs`

## Why this approach
- Minimal change surface (no schema-model changes).
- Safe for repeated migrations and partial recovery states.
- Keeps existing FK names and generated DDL shape.

## Validation
1. Run migration once: succeeds.
2. Re-run migration against same DB: succeeds (no duplicate FK failure).
3. Re-run after interrupted/partial previous run where FK already exists: succeeds.

## Repro
Use:

[`scripts/repro-plugin-sql-fk-idempotency.sql`](/C:/Users/epj33/Documents/Playground/milady/scripts/repro-plugin-sql-fk-idempotency.sql)

## Notes
- This issue is in migration idempotency, not in `plugin-todo` business logic.
- This can affect any plugin schema with FK statements, not only todo tables.
