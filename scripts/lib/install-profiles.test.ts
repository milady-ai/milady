import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import {
  applyInstallProfileKey,
  buildInstallPlan,
  defaultInstallProfileIds,
  parseInstallProfileList,
  promptInstallProfiles,
  renderInstallProfilePrompt,
} from "./install-profiles.mjs";

class FakeInput extends EventEmitter {
  isRaw = false;
  rawModes: boolean[] = [];
  resumed = false;

  setRawMode(value: boolean) {
    this.rawModes.push(value);
    this.isRaw = value;
  }

  resume() {
    this.resumed = true;
  }
}

class FakeOutput {
  chunks: string[] = [];

  write(chunk: string) {
    this.chunks.push(chunk);
  }
}

describe("install profiles", () => {
  it("defaults to package mode for non-interactive installs", () => {
    expect(defaultInstallProfileIds()).toEqual(["packages"]);
  });

  it("expands all into the package install and local source setup paths", () => {
    const plan = buildInstallPlan(["all"], ["--frozen-lockfile"]);

    expect(plan.map((step) => step.id)).toEqual(["packages", "local"]);
    expect(plan[0]?.args).toEqual(["install", "--frozen-lockfile"]);
    expect(plan[0]?.env.MILADY_ELIZA_SOURCE).toBe("packages");
    expect(plan[1]?.args).toEqual([
      "scripts/eliza-source-mode.mjs",
      "local",
      "--install",
      "--",
      "--frozen-lockfile",
    ]);
    expect(plan[1]?.env.MILADY_ELIZA_SOURCE).toBe("local");
  });

  it("runs package install before local source setup for a local-only selection", () => {
    const plan = buildInstallPlan(["local"], ["--frozen-lockfile"]);

    expect(plan.map((step) => step.id)).toEqual(["packages", "local"]);
    expect(plan[0]?.args).toEqual(["install", "--frozen-lockfile"]);
    expect(plan[1]?.args).toEqual([
      "scripts/eliza-source-mode.mjs",
      "local",
      "--install",
      "--",
      "--frozen-lockfile",
    ]);
  });

  it("deduplicates profiles while preserving install order", () => {
    const plan = buildInstallPlan(["local", "packages", "all"], []);

    expect(plan.map((step) => step.id)).toEqual(["packages", "local"]);
  });

  it("parses comma separated profile lists", () => {
    expect(parseInstallProfileList("packages, local all")).toEqual([
      "packages",
      "local",
      "all",
    ]);
  });

  it("toggles the focused profile with space", () => {
    const state = applyInstallProfileKey(
      { cursor: 1, selectedIds: ["packages"] },
      " ",
    );

    expect(state.selectedIds).toEqual(["packages", "local"]);
  });

  it("moves with arrow keys and renders space bar instructions", () => {
    const state = applyInstallProfileKey(
      { cursor: 0, selectedIds: ["packages"] },
      "\u001b[B",
    );

    expect(state.cursor).toBe(1);
    expect(renderInstallProfilePrompt(state)).toContain(
      "Space to select, Enter to install",
    );
  });

  it("captures space and enter in raw mode", async () => {
    const input = new FakeInput();
    const output = new FakeOutput();
    const processRef = new EventEmitter();
    const profiles = promptInstallProfiles({ input, output, processRef });

    input.emit("data", Buffer.from("\u001b[B"));
    input.emit("data", Buffer.from(" "));
    input.emit("data", Buffer.from("\r"));

    await expect(profiles).resolves.toEqual(["packages", "local"]);
    expect(input.rawModes).toEqual([true, false]);
    expect(input.resumed).toBe(true);
  });

  it("restores raw mode when a signal interrupts the picker", async () => {
    const input = new FakeInput();
    const output = new FakeOutput();
    const processRef = new EventEmitter();
    const profiles = promptInstallProfiles({ input, output, processRef });

    processRef.emit("SIGTERM", "SIGTERM");

    await expect(profiles).rejects.toThrow("SIGTERM");
    expect(input.rawModes).toEqual([true, false]);
  });

  it("restores raw mode on process exit", async () => {
    const input = new FakeInput();
    const output = new FakeOutput();
    const processRef = new EventEmitter();
    const profiles = promptInstallProfiles({ input, output, processRef });

    processRef.emit("exit");
    input.emit("data", Buffer.from("\r"));

    await expect(profiles).resolves.toEqual(["packages"]);
    expect(input.rawModes).toEqual([true, false]);
  });
});
