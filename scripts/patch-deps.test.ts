import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("patch-deps runtime hotfixes", () => {
  it("contains plugin-sql participant conflict workaround", () => {
    const source = readFileSync(
      resolve(process.cwd(), "scripts/patch-deps.mjs"),
      "utf8",
    );

    expect(source).toContain("patchPluginSqlParticipantInsertConflict");
    expect(source).toContain(
      "Applied plugin-sql participant ON CONFLICT workaround",
    );
    expect(source).toContain(
      "const existing = await this.db.select({ id: participantTable.id })",
    );
  });

  it("contains local-embedding lspci log downgrade patch", () => {
    const source = readFileSync(
      resolve(process.cwd(), "scripts/patch-deps.mjs"),
      "utf8",
    );

    expect(source).toContain("patchLocalEmbeddingLinuxGpuProbe");
    expect(source).toContain(
      'logger3.debug("Linux GPU detection skipped: lspci not installed")',
    );
    expect(source).toContain('message.includes("lspci")');
  });
});
