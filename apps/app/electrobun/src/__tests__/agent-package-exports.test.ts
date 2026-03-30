import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "..",
  "..",
);
const AGENT_PACKAGE_JSON_PATH = path.join(
  REPO_ROOT,
  "packages",
  "agent",
  "package.json",
);
const APP_CORE_SOURCE_ROOT = path.join(
  REPO_ROOT,
  "packages",
  "app-core",
  "src",
);
const SOURCE_FILE_RE = /\.[cm]?[jt]sx?$/;
const TEST_FILE_RE = /\.(?:test|e2e|live)\.[cm]?[jt]sx?$/;
const AGENT_IMPORT_RE = /["'](@miladyai\/agent[^"']*)["']/g;

function escapeRegex(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

function buildExportMatchers(exportsField: Record<string, unknown>): RegExp[] {
  return Object.keys(exportsField)
    .filter((key) => key.includes("*"))
    .map((key) => new RegExp(`^${escapeRegex(key).replace(/\*/g, "[^/]+")}$`));
}

function collectAgentImports(
  dir: string,
  found = new Set<string>(),
): Set<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === "__tests__") continue;
      collectAgentImports(entryPath, found);
      continue;
    }

    if (!SOURCE_FILE_RE.test(entry.name) || TEST_FILE_RE.test(entry.name)) {
      continue;
    }

    const source = fs.readFileSync(entryPath, "utf8");
    for (const match of source.matchAll(AGENT_IMPORT_RE)) {
      found.add(match[1]);
    }
  }

  return found;
}

function toExportSubpath(specifier: string): string {
  return specifier === "@miladyai/agent"
    ? "."
    : `.${specifier.slice("@miladyai/agent".length)}`;
}

describe("@miladyai/agent package exports", () => {
  it("cover every non-test app-core subpath import used by the packaged desktop runtime", () => {
    const packageJson = JSON.parse(
      fs.readFileSync(AGENT_PACKAGE_JSON_PATH, "utf8"),
    ) as {
      exports?: Record<string, unknown>;
    };
    const exportsField = packageJson.exports ?? {};
    const exactExports = new Set(Object.keys(exportsField));
    const exportMatchers = buildExportMatchers(exportsField);
    const missing = [...collectAgentImports(APP_CORE_SOURCE_ROOT)]
      .sort()
      .map(toExportSubpath)
      .filter(
        (subpath) =>
          !exactExports.has(subpath) &&
          !exportMatchers.some((matcher) => matcher.test(subpath)),
      );

    expect(missing).toEqual([]);
  });
});
