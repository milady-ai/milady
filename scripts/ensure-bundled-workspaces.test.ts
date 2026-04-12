import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  BUNDLED_WORKSPACE_BUILDS,
  ensureBundledWorkspaceBuilds,
} from "./ensure-bundled-workspaces.mjs";

describe("ensureBundledWorkspaceBuilds", () => {
  it("builds bundled workspaces when clean checkouts are missing artifacts", async () => {
    const repoRoot = mkdtempSync(
      path.join(os.tmpdir(), "milady-bundled-workspaces-"),
    );
    const workspace = BUNDLED_WORKSPACE_BUILDS[0];
    const workspaceDir = path.join(repoRoot, workspace.cwd);
    const runner = vi.fn(async () => undefined);

    try {
      mkdirSync(workspaceDir, { recursive: true });
      writeFileSync(path.join(workspaceDir, "package.json"), "{}", "utf8");

      await ensureBundledWorkspaceBuilds(repoRoot, {
        commandRunner: runner,
        log: () => undefined,
      });

      expect(runner).toHaveBeenCalledWith(
        "bun",
        ["run", "build"],
        expect.objectContaining({
          cwd: workspaceDir,
        }),
      );
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it("skips bundled workspace builds when the artifact is newer than manifest", async () => {
    const repoRoot = mkdtempSync(
      path.join(os.tmpdir(), "milady-bundled-workspaces-"),
    );
    const workspace = BUNDLED_WORKSPACE_BUILDS[0];
    const workspaceDir = path.join(repoRoot, workspace.cwd);
    const artifactPath = path.join(repoRoot, workspace.artifact);
    const runner = vi.fn(async () => undefined);

    try {
      mkdirSync(path.dirname(artifactPath), { recursive: true });
      mkdirSync(workspaceDir, { recursive: true });

      const manifestPath = path.join(workspaceDir, "package.json");
      writeFileSync(manifestPath, "{}", "utf8");
      // Set manifest mtime to the past
      const past = new Date(Date.now() - 60_000);
      utimesSync(manifestPath, past, past);

      // Write artifact after manifest so it's newer
      writeFileSync(artifactPath, "export default {};\n", "utf8");

      await ensureBundledWorkspaceBuilds(repoRoot, {
        commandRunner: runner,
        log: () => undefined,
      });

      expect(runner).not.toHaveBeenCalled();
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it("rebuilds when artifact exists but is older than manifest (stale dist)", async () => {
    const repoRoot = mkdtempSync(
      path.join(os.tmpdir(), "milady-bundled-workspaces-"),
    );
    const workspace = BUNDLED_WORKSPACE_BUILDS[0];
    const workspaceDir = path.join(repoRoot, workspace.cwd);
    const artifactPath = path.join(repoRoot, workspace.artifact);
    const runner = vi.fn(async () => undefined);

    try {
      mkdirSync(path.dirname(artifactPath), { recursive: true });
      mkdirSync(workspaceDir, { recursive: true });

      // Write artifact first
      writeFileSync(artifactPath, "export default {};\n", "utf8");
      // Set artifact mtime to the past (simulates old build)
      const past = new Date(Date.now() - 60_000);
      utimesSync(artifactPath, past, past);

      // Write manifest after artifact so it's newer (simulates submodule update)
      writeFileSync(path.join(workspaceDir, "package.json"), "{}", "utf8");

      await ensureBundledWorkspaceBuilds(repoRoot, {
        commandRunner: runner,
        log: () => undefined,
      });

      expect(runner).toHaveBeenCalledWith(
        "bun",
        ["run", "build"],
        expect.objectContaining({
          cwd: workspaceDir,
        }),
      );
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });
});
