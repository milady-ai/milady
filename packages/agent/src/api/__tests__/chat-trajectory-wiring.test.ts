/**
 * Verifies that the /api/chat handler delegates trajectory creation to
 * @elizaos/plugin-trajectory-logger's MESSAGE_RECEIVED event handler,
 * which sets trajectoryStepId on the message metadata before handleMessage.
 *
 * The server.ts code must NOT create its own trajectory (which would
 * conflict with the plugin's step ID).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const chatRoutesSource = readFileSync(
  path.resolve(import.meta.dirname, "..", "chat-routes.ts"),
  "utf-8",
);

const corePluginsSource = readFileSync(
  path.resolve(import.meta.dirname, "..", "..", "runtime", "core-plugins.ts"),
  "utf-8",
);

const storageSource = readFileSync(
  path.resolve(
    import.meta.dirname,
    "..",
    "..",
    "runtime",
    "trajectory-storage.ts",
  ),
  "utf-8",
);

describe("chat trajectory wiring", () => {
  it("emits MESSAGE_RECEIVED before handleMessage", () => {
    const emitIdx = chatRoutesSource.indexOf('emitEvent("MESSAGE_RECEIVED"');
    const handleIdx = chatRoutesSource.indexOf(
      "runtime.messageService?.handleMessage",
    );
    expect(emitIdx).toBeGreaterThan(-1);
    expect(handleIdx).toBeGreaterThan(-1);
    expect(emitIdx).toBeLessThan(handleIdx);
  });

  it("only falls back to manual trajectory start after MESSAGE_RECEIVED", () => {
    const emitIdx = chatRoutesSource.indexOf('emitEvent("MESSAGE_RECEIVED"');
    const fallbackIdx = chatRoutesSource.lastIndexOf(
      "await ensureChatTrajectoryStep(",
    );

    expect(fallbackIdx).toBeGreaterThan(-1);
    expect(fallbackIdx).toBeGreaterThan(emitIdx);
    expect(chatRoutesSource).toContain("readMessageTrajectoryStepId(message)");
  });

  it("keeps the trajectory logger in the core plugin list", () => {
    expect(corePluginsSource).toContain("@elizaos/plugin-trajectory-logger");
  });
});

describe("startStep returns trajectory ID (regression)", () => {
  it("DatabaseTrajectoryLogger.startStep returns trajectoryId", () => {
    const classMatch = storageSource.match(
      /startStep\(trajectoryId:\s*string\):\s*string\s*\{\s*return\s+trajectoryId;/m,
    );
    expect(classMatch).toBeTruthy();
  });

  it("no startStep generates step-xxx IDs", () => {
    const startStepBlock =
      storageSource.match(
        /startStep\(trajectoryId:\s*string\):\s*string\s*\{[\s\S]*?\n\s*\}/m,
      )?.[0] ?? "";
    expect(startStepBlock).not.toContain("step-${Date.now()}");
  });
});
