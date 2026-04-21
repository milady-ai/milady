import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Verifies that previously-silent failure points now have error handling.
 * Checks that `.catch(() => {})` patterns have been replaced with logging.
 */
describe("silent failure guards", () => {
  const serverSource = readFileSync(
    path.resolve(import.meta.dirname, "..", "server.ts"),
    "utf-8",
  );

  it("provider cache warm-up logs errors", () => {
    // Should NOT have empty .catch(() => {})
    const warmupIdx = serverSource.indexOf("getOrFetchAllProviders");
    expect(warmupIdx).toBeGreaterThan(-1);
    const nearby = serverSource.slice(warmupIdx, warmupIdx + 200);
    expect(nearby).not.toContain(".catch(() => {})");
  });

  it("conversation restore has error handling", () => {
    // Find the CALL site (void beginConversationRestore), not the definition
    const callIdx = serverSource.indexOf("void beginConversationRestore(");
    if (callIdx === -1) return;
    const nearby = serverSource.slice(callIdx, callIdx + 200);
    expect(nearby).toContain("catch");
  });

  const cloudSource = readFileSync(
    path.resolve(import.meta.dirname, "..", "cloud-routes.ts"),
    "utf-8",
  );

  it("cloud config save has try/catch", () => {
    const saveIdx = cloudSource.indexOf("saveConfig");
    expect(saveIdx).toBeGreaterThan(-1);
    const nearby = cloudSource.slice(
      Math.max(0, saveIdx - 300),
      saveIdx + 50,
    );
    expect(nearby).toContain("try");
  });

  it("cloud agent operations have try/catch", () => {
    const createIdx = cloudSource.indexOf("client.createAgent");
    if (createIdx > -1) {
      const nearby = cloudSource.slice(
        Math.max(0, createIdx - 200),
        createIdx + 50,
      );
      expect(nearby).toContain("try");
    }
  });

  const walletSource = readFileSync(
    path.resolve(import.meta.dirname, "..", "wallet-routes.ts"),
    "utf-8",
  );

  it("wallet config save failures return warnings", () => {
    expect(walletSource).toContain("configSaveWarning");
  });

  const knowledgeSource = readFileSync(
    path.resolve(import.meta.dirname, "..", "knowledge-routes.ts"),
    "utf-8",
  );

  it("knowledge URL fetch has error handling", () => {
    const fetchIdx = knowledgeSource.indexOf("fetchUrlContent");
    expect(fetchIdx).toBeGreaterThan(-1);
    const nearby = knowledgeSource.slice(
      Math.max(0, fetchIdx - 400),
      fetchIdx + 50,
    );
    expect(nearby).toContain("try");
  });

  const elizaSource = readFileSync(
    path.resolve(import.meta.dirname, "..", "..", "runtime", "eliza.ts"),
    "utf-8",
  );

  it("skills warm-up has error handling", () => {
    const callIdx = elizaSource.indexOf("void warmAgentSkillsService()");
    if (callIdx === -1) return;
    const nearby = elizaSource.slice(callIdx, callIdx + 200);
    expect(nearby).toContain("catch");
  });
});
