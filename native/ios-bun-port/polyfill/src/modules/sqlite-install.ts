// One-shot installer for the SQLite-flavored polyfill surface.
//
// The index file owner imports this and calls `installSqlite()` after the
// bridge has been validated. It:
//
//   1. Stashes the raw bridge surface on `globalThis.__elizaSqlite` for
//      direct (debug-only) access.
//   2. Stashes the PGlite shim on `globalThis.__milady_pglite` so the
//      bundler can rewrite `@electric-sql/pglite` imports to it via a
//      static-replace at build time. (The agent bundle build script will
//      emit `import PGlite from 'globalThis.__milady_pglite'`-equivalent
//      glue.)
//   3. Registers `node:sqlite` in the polyfill's node-modules registry so
//      `require('node:sqlite')` and `import x from 'node:sqlite'` resolve
//      to the polyfill module.
//
// All of this is side-effect-only; the function returns nothing.

import { getBridge } from "../bridge.js";
import sqlite from "./sqlite.js";
import pgliteDefault, { PGlite, translatePgSqlToSqlite } from "./pglite-shim.js";
import sqliteVec from "./sqlite-vec.js";

interface NodeModuleRegistrar {
  register(name: string, module: unknown): void;
}

/**
 * Installs the SQLite + PGlite shim globals. Call after the bridge is
 * validated.
 *
 * @param registrar Optional node-modules registrar. If supplied, registers
 *                  `node:sqlite` and `@electric-sql/pglite` in the bundler's
 *                  resolver. The index file should hand in its `installRequire`
 *                  helper's registrar; the shape is just `{ register(name, mod) }`.
 */
export function installSqlite(registrar?: NodeModuleRegistrar): void {
  // Smoke-test the bridge — fails fast if a required host function is
  // missing instead of breaking later inside a query.
  const bridge = getBridge();
  for (const fn of [
    "sqlite_open",
    "sqlite_close",
    "sqlite_exec",
    "sqlite_query",
    "sqlite_prepare",
    "sqlite_step",
    "sqlite_finalize",
    "sqlite_version",
  ] as const) {
    if (typeof (bridge as unknown as Record<string, unknown>)[fn] !== "function") {
      throw new Error(`[milady-polyfill] SQLite bridge missing host function: ${fn}`);
    }
  }

  const g = globalThis as unknown as {
    __elizaSqlite?: unknown;
    __milady_pglite?: unknown;
    __milady_sqlite_vec?: unknown;
  };
  g.__elizaSqlite = sqlite;
  g.__milady_pglite = pgliteDefault;
  g.__milady_sqlite_vec = sqliteVec;

  if (registrar) {
    // node:sqlite shape (Node 22+).
    registrar.register("node:sqlite", {
      DatabaseSync: sqlite.Database,
      Database: sqlite.Database,
      StatementSync: sqlite.Statement,
      Statement: sqlite.Statement,
      SQLiteError: sqlite.SQLiteError,
      default: sqlite,
    });
    // @electric-sql/pglite shape (named + default).
    registrar.register("@electric-sql/pglite", {
      PGlite,
      translatePgSqlToSqlite,
      default: PGlite,
    });
  }

  bridge.log("info", "[milady-polyfill] SQLite + PGlite shim installed");
}

export default installSqlite;
