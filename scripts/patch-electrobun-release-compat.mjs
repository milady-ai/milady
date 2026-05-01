#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
const checkOnly = process.argv.includes("--check");

const agentPath =
  "eliza/packages/app-core/platforms/electrobun/src/native/agent.ts";
const startupTracePath =
  "eliza/packages/app-core/platforms/electrobun/src/startup-trace.ts";
const windowsSmokePath =
  "eliza/packages/app-core/platforms/electrobun/scripts/smoke-test-windows.ps1";

const patches = [
  {
    relativePath: agentPath,
    description:
      "propagate the selected packaged API port to server-only child",
    transform(source) {
      if (
        source.includes("MILADY_API_PORT: String(apiPort)") &&
        source.includes("MILADY_PORT: String(apiPort)")
      ) {
        return source;
      }

      const match = source.match(
        / {6}const childEnv: Record<string, string> = \{[\s\S]*? {6}\};/,
      );
      if (!match) {
        throw new Error("could not locate childEnv object");
      }

      let block = match[0];
      const anchor = block.includes("        ELIZA_PORT: String(apiPort),")
        ? "        ELIZA_PORT: String(apiPort),"
        : "        ELIZA_API_PORT: String(apiPort),";

      if (!block.includes(anchor)) {
        throw new Error("could not locate API port assignment in childEnv");
      }

      const additions = [];
      if (!block.includes("MILADY_API_PORT: String(apiPort)")) {
        additions.push("        MILADY_API_PORT: String(apiPort),");
      }
      if (!block.includes("MILADY_PORT: String(apiPort)")) {
        additions.push("        MILADY_PORT: String(apiPort),");
      }
      block = block.replace(anchor, [anchor, ...additions].join("\n"));
      return source.replace(match[0], block);
    },
  },
  {
    relativePath: agentPath,
    description: "keep ELIZA_PORT for eliza start server-only mode",
    transform(source) {
      return source.replace(/\n\s*delete childEnv\.ELIZA_PORT;/, "");
    },
  },
  {
    relativePath: startupTracePath,
    description: "read Milady startup trace env aliases",
    transform(source) {
      let next = source;
      for (const suffix of ["SESSION_ID", "STATE_FILE", "EVENTS_FILE"]) {
        const miladyLine = `    trimEnv(env.MILADY_STARTUP_${suffix}) ??`;
        const elizaLine = `    trimEnv(env.ELIZA_STARTUP_${suffix}) ??`;
        if (next.includes(miladyLine)) {
          continue;
        }

        const duplicate = new RegExp(
          `    trimEnv\\(env\\.ELIZA_STARTUP_${suffix}\\) \\?\\?\\n    trimEnv\\(env\\.ELIZA_STARTUP_${suffix}\\) \\?\\?`,
        );
        if (duplicate.test(next)) {
          next = next.replace(duplicate, `${miladyLine}\n${elizaLine}`);
          continue;
        }

        if (!next.includes(elizaLine)) {
          throw new Error(`could not locate startup trace ${suffix} anchor`);
        }
        next = next.replace(elizaLine, `${miladyLine}\n${elizaLine}`);
      }
      return next;
    },
  },
  {
    relativePath: windowsSmokePath,
    description: "export legacy startup trace state paths",
    transform(source) {
      let next = source;
      if (!next.includes("$env:ELIZA_STARTUP_STATE_FILE = $startupStateFile")) {
        const anchor = "$env:MILADY_STARTUP_STATE_FILE = $startupStateFile";
        if (!next.includes(anchor)) {
          throw new Error("could not locate Milady startup state assignment");
        }
        next = next.replace(
          anchor,
          `$env:ELIZA_STARTUP_STATE_FILE = $startupStateFile\n${anchor}`,
        );
      }
      if (
        !next.includes("$env:ELIZA_STARTUP_EVENTS_FILE = $startupEventsFile")
      ) {
        const anchor = "$env:MILADY_STARTUP_EVENTS_FILE = $startupEventsFile";
        if (!next.includes(anchor)) {
          throw new Error("could not locate Milady startup events assignment");
        }
        next = next.replace(
          anchor,
          `$env:ELIZA_STARTUP_EVENTS_FILE = $startupEventsFile\n${anchor}`,
        );
      }
      return next;
    },
  },
  {
    relativePath: windowsSmokePath,
    description: "export branded and legacy packaged backend ports",
    transform(source) {
      if (source.includes('$env:MILADY_PORT = "$BackendPort"')) {
        return source;
      }
      const anchor = '$env:MILADY_API_PORT = "$BackendPort"';
      if (!source.includes(anchor)) {
        throw new Error("could not locate Milady API port assignment");
      }
      return source.replace(
        anchor,
        `${anchor}\n$env:MILADY_PORT = "$BackendPort"`,
      );
    },
  },
  {
    relativePath: windowsSmokePath,
    description: "publish legacy AppData paths for downstream diagnostics",
    transform(source) {
      let next = source;
      if (
        !next.includes(
          'Add-Content -Path $env:GITHUB_ENV -Value "ELIZA_TEST_WINDOWS_APPDATA_PATH=$($env:APPDATA)"',
        )
      ) {
        const anchor =
          '  Add-Content -Path $env:GITHUB_ENV -Value "MILADY_TEST_WINDOWS_APPDATA_PATH=$($env:APPDATA)"';
        if (!next.includes(anchor)) {
          throw new Error("could not locate Milady AppData GITHUB_ENV export");
        }
        next = next.replace(
          anchor,
          `${anchor}\n  Add-Content -Path $env:GITHUB_ENV -Value "ELIZA_TEST_WINDOWS_APPDATA_PATH=$($env:APPDATA)"`,
        );
      }
      if (
        !next.includes(
          'Add-Content -Path $env:GITHUB_ENV -Value "ELIZA_TEST_WINDOWS_LOCALAPPDATA_PATH=$($env:LOCALAPPDATA)"',
        )
      ) {
        const anchor =
          '  Add-Content -Path $env:GITHUB_ENV -Value "MILADY_TEST_WINDOWS_LOCALAPPDATA_PATH=$($env:LOCALAPPDATA)"';
        if (!next.includes(anchor)) {
          throw new Error(
            "could not locate Milady LocalAppData GITHUB_ENV export",
          );
        }
        next = next.replace(
          anchor,
          `${anchor}\n  Add-Content -Path $env:GITHUB_ENV -Value "ELIZA_TEST_WINDOWS_LOCALAPPDATA_PATH=$($env:LOCALAPPDATA)"`,
        );
      }
      return next;
    },
  },
];

function patchFile({ relativePath, description, transform }) {
  const filePath = path.join(repoRoot, relativePath);
  if (!fs.existsSync(filePath)) {
    throw new Error(`missing ${relativePath}`);
  }

  const current = fs.readFileSync(filePath, "utf8");
  const next = transform(current);
  if (next === current) {
    console.log(
      `[patch-electrobun-release-compat] already patched: ${description}`,
    );
    return false;
  }

  if (checkOnly) {
    console.log(
      `[patch-electrobun-release-compat] would patch: ${description}`,
    );
    return true;
  }

  fs.writeFileSync(filePath, next, "utf8");
  console.log(`[patch-electrobun-release-compat] patched: ${description}`);
  return true;
}

try {
  const changedCount = patches.filter((patch) => patchFile(patch)).length;
  console.log(
    `[patch-electrobun-release-compat] ${checkOnly ? "check complete" : "complete"} (${changedCount} change${changedCount === 1 ? "" : "s"})`,
  );
} catch (error) {
  console.error(
    `[patch-electrobun-release-compat] ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}
