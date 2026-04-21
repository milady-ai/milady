/**
 * Verifies that the shared chat generation path delegates trajectory creation to
 * the native trajectories MESSAGE_RECEIVED event handler,
 * which sets trajectoryStepId on the message metadata before handleMessage.
 *
 * The server.ts code must NOT create its own trajectory (which would
 * conflict with the native handler's step ID).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const chatRoutesSource = readFileSync(
  path.resolve(import.meta.dirname, "..", "chat-routes.ts"),
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

  it("reads MESSAGE_RECEIVED step ids before wrapping handleMessage", () => {
    const emitIdx = chatRoutesSource.indexOf('emitEvent("MESSAGE_RECEIVED"');
    const contextReadIdx = chatRoutesSource.indexOf(
      "const trajectoryStepId = readMessageTrajectoryStepId(message);",
    );
    const wrapperIdx = chatRoutesSource.indexOf(
      "runWithTrajectoryContext(trajectoryContext, async () => {",
    );
    const handleIdx = chatRoutesSource.indexOf(
      "runtime.messageService?.handleMessage",
    );

    expect(contextReadIdx).toBeGreaterThan(emitIdx);
    expect(wrapperIdx).toBeGreaterThan(contextReadIdx);
    expect(handleIdx).toBeGreaterThan(wrapperIdx);
    expect(chatRoutesSource).not.toContain("withMiladyTrajectoryStep(");
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
