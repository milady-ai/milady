import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("plugin-sql FK idempotency patch", () => {
  it("guards FK creation with pg_constraint existence checks", () => {
    const patchPath = resolve(
      process.cwd(),
      "patches/@elizaos%2Fplugin-sql@2.0.0-alpha.17.patch",
    );
    const patch = readFileSync(patchPath, "utf8");

    expect(patch).toContain(
      "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '",
    );
    expect(patch).toContain(
      "function generateCreateTableSQL(fullTableName, table)",
    );
    expect(patch).toContain("function generateCreateForeignKeySQL(fk)");
  });
});
