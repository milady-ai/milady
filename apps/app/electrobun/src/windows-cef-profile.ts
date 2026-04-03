import fs from "node:fs";
import path from "node:path";

type FileSystemLike = Pick<
  typeof fs,
  | "existsSync"
  | "mkdirSync"
  | "readFileSync"
  | "readdirSync"
  | "rmSync"
  | "writeFileSync"
>;

function trimToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function shouldResetWindowsCefProfile(args: {
  currentVersion: string | null;
  previousVersion: string | null;
  cefDirExists: boolean;
}): boolean {
  if (!args.cefDirExists) return false;
  const currentVersion = trimToNull(args.currentVersion);
  if (!currentVersion || currentVersion === "unknown") return false;
  const previousVersion = trimToNull(args.previousVersion);
  return previousVersion !== currentVersion;
}

export function shouldWriteWindowsCefProfileMarker(
  currentVersion: string | null,
): boolean {
  const normalized = trimToNull(currentVersion);
  return Boolean(normalized && normalized !== "unknown");
}

export function resolveDesktopBundleVersion(
  moduleDir: string,
  fileSystem: Pick<typeof fs, "readFileSync"> = fs,
): string {
  try {
    const pkgPath = path.join(moduleDir, "..", "package.json");
    return JSON.parse(fileSystem.readFileSync(pkgPath, "utf-8")).version;
  } catch {
    return "unknown";
  }
}

export function resetWindowsCefProfile(args: {
  moduleDir: string;
  userDataDir: string;
  fileSystem?: FileSystemLike;
  log?: (message: string) => void;
  warn?: (message: string, error: unknown) => void;
}): {
  currentVersion: string;
  previousVersion: string | null;
  reset: boolean;
  wroteMarker: boolean;
} {
  const fileSystem = args.fileSystem ?? fs;
  const log = args.log ?? console.log;
  const warn = args.warn ?? console.warn;
  const cefDir = path.join(args.userDataDir, "CEF");
  const cefVersionMarker = path.join(cefDir, ".milady-version");
  const currentVersion = resolveDesktopBundleVersion(
    args.moduleDir,
    fileSystem,
  );
  let previousVersion: string | null = null;

  try {
    previousVersion = fileSystem.readFileSync(cefVersionMarker, "utf-8").trim();
  } catch {
    previousVersion = null;
  }

  const shouldReset = shouldResetWindowsCefProfile({
    currentVersion,
    previousVersion,
    cefDirExists: fileSystem.existsSync(cefDir),
  });

  if (shouldReset) {
    log(
      `[Main] CEF version mismatch (${previousVersion ?? "none"} -> ${currentVersion}), clearing stale CEF profile`,
    );
    for (const entry of fileSystem.readdirSync(cefDir)) {
      if (entry === ".milady-version") continue;
      const entryPath = path.join(cefDir, entry);
      try {
        fileSystem.rmSync(entryPath, { recursive: true, force: true });
      } catch (error) {
        warn(`[Main] Could not remove ${entryPath}:`, error);
      }
    }
  }

  const wroteMarker = shouldWriteWindowsCefProfileMarker(currentVersion);
  if (wroteMarker) {
    fileSystem.mkdirSync(cefDir, { recursive: true });
    fileSystem.writeFileSync(cefVersionMarker, currentVersion);
  }

  return {
    currentVersion,
    previousVersion,
    reset: shouldReset,
    wroteMarker,
  };
}
