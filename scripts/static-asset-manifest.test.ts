import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  APP_PUBLIC_REPO_PREFIX,
  buildStaticAssetManifest,
  HOMEPAGE_PUBLIC_REPO_PREFIX,
  resolveStaticAssetManifestPath,
  serializeStaticAssetManifest,
  validateStaticAssetManifest,
  writeStaticAssetManifest,
} from "./lib/static-asset-manifest.mjs";

const tempDirs: string[] = [];

function makeTempRepo() {
  const rootDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "milady-static-assets-"),
  );
  tempDirs.push(rootDir);
  fs.mkdirSync(path.join(rootDir, APP_PUBLIC_REPO_PREFIX), { recursive: true });
  fs.mkdirSync(path.join(rootDir, HOMEPAGE_PUBLIC_REPO_PREFIX), {
    recursive: true,
  });
  return rootDir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("static-asset-manifest", () => {
  it("builds a deterministic manifest from public asset roots", () => {
    const rootDir = makeTempRepo();
    fs.mkdirSync(path.join(rootDir, APP_PUBLIC_REPO_PREFIX, "vrms"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(rootDir, APP_PUBLIC_REPO_PREFIX, "vrms", "a.vrm.gz"),
      "",
    );
    fs.writeFileSync(
      path.join(rootDir, HOMEPAGE_PUBLIC_REPO_PREFIX, "logo.png"),
      "",
    );

    expect(buildStaticAssetManifest(rootDir)).toEqual({
      app: ["apps/app/public/vrms/a.vrm.gz"],
      homepage: ["apps/homepage/public/logo.png"],
    });
  });

  it("writes and validates the checked-in manifest file", () => {
    const rootDir = makeTempRepo();
    fs.mkdirSync(path.join(rootDir, APP_PUBLIC_REPO_PREFIX, "vrms"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(rootDir, APP_PUBLIC_REPO_PREFIX, "vrms", "a.vrm.gz"),
      "",
    );

    const manifestPath = writeStaticAssetManifest(rootDir);
    expect(manifestPath).toBe(resolveStaticAssetManifestPath(rootDir));
    expect(fs.readFileSync(manifestPath, "utf8")).toBe(
      serializeStaticAssetManifest({
        app: ["apps/app/public/vrms/a.vrm.gz"],
        homepage: [],
      }),
    );
    expect(validateStaticAssetManifest(rootDir).ok).toBe(true);
  });

  it("detects manifest drift after assets change", () => {
    const rootDir = makeTempRepo();
    fs.mkdirSync(path.join(rootDir, APP_PUBLIC_REPO_PREFIX, "vrms"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(rootDir, APP_PUBLIC_REPO_PREFIX, "vrms", "a.vrm.gz"),
      "",
    );
    writeStaticAssetManifest(rootDir);
    fs.writeFileSync(
      path.join(rootDir, APP_PUBLIC_REPO_PREFIX, "vrms", "b.vrm.gz"),
      "",
    );

    const validation = validateStaticAssetManifest(rootDir);
    expect(validation.ok).toBe(false);
    expect(validation.reason).toBe("stale");
  });
});
