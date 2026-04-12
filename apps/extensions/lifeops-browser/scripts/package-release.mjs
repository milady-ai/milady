#!/usr/bin/env bun
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildLifeOpsBrowserReleaseMetadata,
  resolveLifeOpsBrowserReleaseVersion,
  versionedArtifactName,
} from "./release-version.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const extensionRoot = path.resolve(scriptDir, "..");
const artifactsDir = path.join(extensionRoot, "dist", "artifacts");
const appName = "LifeOps Browser";
const bundleIdentifier = "ai.milady.lifeopsbrowser";
const release = resolveLifeOpsBrowserReleaseVersion();
const metadata = buildLifeOpsBrowserReleaseMetadata(release);

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      ...options,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `${command} ${args.join(" ")} exited with code ${code ?? "unknown"}`,
        ),
      );
    });
  });
}

await run("bun", [path.join(scriptDir, "package-chrome.mjs")], {
  cwd: extensionRoot,
});
await run("bun", [path.join(scriptDir, "package-safari.mjs")], {
  cwd: extensionRoot,
});

await fs.mkdir(artifactsDir, { recursive: true });

const manifest = {
  ...metadata,
  generatedAt: new Date().toISOString(),
  chrome: {
    bundleKind: "chrome-extension",
    packagePath: path.join(artifactsDir, "lifeops-browser-chrome.zip"),
    releaseAssetPath: path.join(
      artifactsDir,
      versionedArtifactName("lifeops-browser-chrome", "zip", release),
    ),
  },
  safari: {
    bundleKind: "safari-web-extension",
    appName,
    bundleIdentifier,
    appBundlePath: path.join(artifactsDir, `${appName}.app`),
    packagePath: path.join(artifactsDir, "lifeops-browser-safari.zip"),
    releaseAssetPath: path.join(
      artifactsDir,
      versionedArtifactName("lifeops-browser-safari", "zip", release),
    ),
    projectAssetPath: path.join(
      artifactsDir,
      versionedArtifactName("lifeops-browser-safari-project", "zip", release),
    ),
  },
};

const manifestPath = path.join(
  artifactsDir,
  "lifeops-browser-release-manifest.json",
);
const versionedManifestPath = path.join(
  artifactsDir,
  versionedArtifactName("lifeops-browser-release-manifest", "json", release),
);
await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
await fs.writeFile(
  versionedManifestPath,
  `${JSON.stringify(manifest, null, 2)}\n`,
);

console.log(`Wrote release manifest at ${manifestPath}`);
console.log(`Wrote versioned release manifest at ${versionedManifestPath}`);
