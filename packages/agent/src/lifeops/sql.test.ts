import { PGlite } from "@electric-sql/pglite";
import type { IAgentRuntime } from "@elizaos/core";
import { afterEach, describe, expect, it } from "vitest";
import { describeIf } from "../../../../test/helpers/conditional-tests.ts";
import { listTableColumns } from "./sql";
import {
  DatabaseSync,
  hasSqlite,
  type SqliteDatabaseSync,
} from "../test-utils/sqlite-compat";

type SqlQuery = {
  queryChunks?: Array<{ value?: unknown }>;
};

function extractSqlText(query: SqlQuery): string {
  if (!Array.isArray(query.queryChunks)) {
    return "";
  }

  return query.queryChunks
    .map((chunk) => {
      const value = chunk?.value;
      if (Array.isArray(value)) {
        return value.join("");
      }
      return String(value ?? "");
    })
    .join("");
}

describeIf(hasSqlite)("lifeops sql helpers", () => {
  let sqlite: SqliteDatabaseSync | null = null;
  let pg: PGlite | null = null;

  function requireSqlite(): SqliteDatabaseSync {
    if (!sqlite) {
      throw new Error("SQLite test database unavailable");
    }
    return sqlite;
  }

  function requirePg(): PGlite {
    if (!pg) {
      throw new Error("PGlite test database unavailable");
    }
    return pg;
  }

  afterEach(async () => {
    sqlite?.close();
    sqlite = null;
    if (pg) {
      await pg.close();
      pg = null;
    }
  });

  it("lists columns through SQLite PRAGMA", async () => {
    sqlite = new DatabaseSync(":memory:");
    sqlite.exec(
      "CREATE TABLE life_connector_grants (id TEXT PRIMARY KEY, preferred_by_agent INTEGER NOT NULL DEFAULT 0)",
    );

    const runtime = {
      adapter: {
        db: {
          execute: async (query: SqlQuery) => {
            const sql = extractSqlText(query).trim();
            if (/^(select|pragma)\b/i.test(sql)) {
              return requireSqlite().prepare(sql).all() as Array<
                Record<string, unknown>
              >;
            }
            requireSqlite().exec(sql);
            return [];
          },
        },
      },
    } as unknown as IAgentRuntime;

    await expect(
      listTableColumns(runtime, "life_connector_grants"),
    ).resolves.toEqual(["id", "preferred_by_agent"]);
  });

  it("lists columns through information_schema on PGlite", async () => {
    pg = new PGlite();
    await pg.query(
      "CREATE TABLE life_connector_grants (id TEXT PRIMARY KEY, preferred_by_agent BOOLEAN NOT NULL DEFAULT FALSE)",
    );

    const runtime = {
      adapter: {
        db: {
          execute: async (query: SqlQuery) => {
            const sql = extractSqlText(query).trim();
            return requirePg().query(sql);
          },
        },
      },
    } as unknown as IAgentRuntime;

    await expect(
      listTableColumns(runtime, "life_connector_grants"),
    ).resolves.toEqual(["id", "preferred_by_agent"]);
  });
});
