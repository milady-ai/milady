import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  LifeOpsBrowserCompanionPackageStatus,
  LifeOpsBrowserKind,
} from "../contracts/lifeops.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../",
);
const extensionRoot = path.join(
  repoRoot,
  "apps",
  "extensions",
  "lifeops-browser",
);

function existingPath(candidate: string): string | null {
  return fs.existsSync(candidate) ? candidate : null;
}

function packageScriptName(browser: LifeOpsBrowserKind): string {
  return browser === "safari" ? "package-safari.mjs" : "package-chrome.mjs";
}

function runCommand(
  command: string,
  args: string[],
  cwd: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          stderr.trim() ||
            `${command} ${args.join(" ")} exited with code ${code ?? "unknown"}`,
        ),
      );
    });
  });
}

export function resolveLifeOpsBrowserExtensionPath(): string | null {
  return existingPath(extensionRoot);
}

export function getLifeOpsBrowserCompanionPackageStatus(): LifeOpsBrowserCompanionPackageStatus {
  const resolvedExtensionPath = resolveLifeOpsBrowserExtensionPath();
  if (!resolvedExtensionPath) {
    return {
      extensionPath: null,
      chromeBuildPath: null,
      chromePackagePath: null,
      safariWebExtensionPath: null,
      safariAppPath: null,
      safariPackagePath: null,
    };
  }

  const distDir = path.join(resolvedExtensionPath, "dist");
  const artifactsDir = path.join(distDir, "artifacts");

  return {
    extensionPath: resolvedExtensionPath,
    chromeBuildPath: existingPath(path.join(distDir, "chrome")),
    chromePackagePath: existingPath(
      path.join(artifactsDir, "lifeops-browser-chrome.zip"),
    ),
    safariWebExtensionPath: existingPath(path.join(distDir, "safari")),
    safariAppPath: existingPath(path.join(artifactsDir, "LifeOps Browser.app")),
    safariPackagePath: existingPath(
      path.join(artifactsDir, "lifeops-browser-safari.zip"),
    ),
  };
}

export function getLifeOpsBrowserCompanionDownloadFile(
  browser: LifeOpsBrowserKind,
): { path: string; filename: string; contentType: string } {
  const status = getLifeOpsBrowserCompanionPackageStatus();
  const filePath =
    browser === "safari" ? status.safariPackagePath : status.chromePackagePath;
  if (!filePath) {
    throw new Error(
      `${browser === "safari" ? "Safari" : "Chrome"} package has not been built yet`,
    );
  }
  return {
    path: filePath,
    filename: path.basename(filePath),
    contentType: "application/zip",
  };
}

export async function buildLifeOpsBrowserCompanionPackage(
  browser: LifeOpsBrowserKind,
): Promise<LifeOpsBrowserCompanionPackageStatus> {
  const resolvedExtensionPath = resolveLifeOpsBrowserExtensionPath();
  if (!resolvedExtensionPath) {
    throw new Error("LifeOps Browser extension workspace is not available");
  }

  await runCommand(
    "bun",
    [path.join(resolvedExtensionPath, "scripts", packageScriptName(browser))],
    resolvedExtensionPath,
  );

  return getLifeOpsBrowserCompanionPackageStatus();
}
