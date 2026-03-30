-- Repro: non-idempotent FK creation vs idempotent FK creation
-- Usage:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/repro-plugin-sql-fk-idempotency.sql

BEGIN;

DROP SCHEMA IF EXISTS repro_fk CASCADE;
CREATE SCHEMA repro_fk;

CREATE TABLE repro_fk.todos (
  id uuid PRIMARY KEY
);

CREATE TABLE repro_fk.todo_tags (
  id uuid PRIMARY KEY,
  todo_id uuid NOT NULL
);

-- Simulate "partial prior migration already added FK once"
ALTER TABLE repro_fk.todo_tags
ADD CONSTRAINT todo_tags_todo_id_todos_id_fk
FOREIGN KEY (todo_id)
REFERENCES repro_fk.todos(id)
ON DELETE CASCADE;

-- This is the problematic shape currently emitted by non-idempotent migration paths.
-- It should fail with duplicate constraint error if uncommented.
-- ALTER TABLE repro_fk.todo_tags
-- ADD CONSTRAINT todo_tags_todo_id_todos_id_fk
-- FOREIGN KEY (todo_id)
-- REFERENCES repro_fk.todos(id)
-- ON DELETE CASCADE;

-- Idempotent form (expected fix behavior):
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'todo_tags_todo_id_todos_id_fk'
  ) THEN
    ALTER TABLE repro_fk.todo_tags
    ADD CONSTRAINT todo_tags_todo_id_todos_id_fk
    FOREIGN KEY (todo_id)
    REFERENCES repro_fk.todos(id)
    ON DELETE CASCADE;
  END IF;
END $$;

-- Run idempotent block again to prove replay safety.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'todo_tags_todo_id_todos_id_fk'
  ) THEN
    ALTER TABLE repro_fk.todo_tags
    ADD CONSTRAINT todo_tags_todo_id_todos_id_fk
    FOREIGN KEY (todo_id)
    REFERENCES repro_fk.todos(id)
    ON DELETE CASCADE;
  END IF;
END $$;

COMMIT;

SELECT conname
FROM pg_constraint
WHERE conname = 'todo_tags_todo_id_todos_id_fk';
