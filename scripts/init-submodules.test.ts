import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { runInitSubmodules } from "./init-submodules.mjs";

const tempDirs: string[] = [];

function makeTempRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "milady-init-submodules-"));
  tempDirs.push(dir);

  fs.mkdirSync(path.join(dir, ".git"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, ".gitmodules"),
    [
      '[submodule "eliza"]',
      "\tpath = eliza",
      "\turl = https://example.com/eliza.git",
      "",
    ].join("\n"),
    "utf8",
  );

  fs.mkdirSync(path.join(dir, "eliza"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "eliza", ".gitmodules"),
    [
      '[submodule "plugins/plugin-openrouter"]',
      "\tpath = plugins/plugin-openrouter",
      "\turl = https://example.com/plugin-openrouter.git",
      "",
    ].join("\n"),
    "utf8",
  );

  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir && fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("init-submodules", () => {
  it("initializes the top-level eliza submodule without recursive checkout", () => {
    const repoRoot = makeTempRepo();
    const execCalls: string[] = [];

    const exec = (command: string, options: { cwd?: string } = {}) => {
      execCalls.push(`${options.cwd ?? repoRoot} :: ${command}`);

      if (
        command ===
        'git config --file .gitmodules --get-regexp "^submodule\\..*\\.path$"'
      ) {
        return "submodule.eliza.path eliza\n";
      }

      if (command === 'git ls-files -s -- "cloud"') {
        return "";
      }

      if (command === 'git ls-files -s -- "eliza"') {
        return "160000 0123456789abcdef 0\teliza\n";
      }

      if (command === 'git submodule status -- "eliza"') {
        return "-0123456789abcdef eliza\n";
      }

      if (command === 'git submodule update --init "eliza"') {
        fs.writeFileSync(
          path.join(repoRoot, "eliza", "package.json"),
          '{ "name": "eliza" }\n',
          "utf8",
        );
        fs.mkdirSync(path.join(repoRoot, "eliza", "packages", "typescript"), {
          recursive: true,
        });
        fs.writeFileSync(
          path.join(
            repoRoot,
            "eliza",
            "packages",
            "typescript",
            "package.json",
          ),
          '{ "name": "@elizaos/typescript" }\n',
          "utf8",
        );
        return "";
      }

      if (command.includes('git submodule update --init --recursive "eliza"')) {
        throw new Error("unexpected recursive eliza init");
      }

      if (command === "git submodule sync --recursive") {
        return "";
      }

      if (
        command ===
        "git -c submodule.plugins/plugin-openrouter.update=none submodule update --init --recursive"
      ) {
        return "";
      }

      return "";
    };

    const result = runInitSubmodules({
      rootDir: repoRoot,
      exec,
      exists: fs.existsSync,
      log: () => {},
      logError: () => {},
      shouldSkipSubmodule: () => false,
    });

    expect(result.failed).toBe(0);
    expect(execCalls).toContain(
      `${repoRoot} :: git submodule update --init "eliza"`,
    );
    expect(
      execCalls.some((call) =>
        call.includes('git submodule update --init --recursive "eliza"'),
      ),
    ).toBe(false);
  });

  it("initializes tracked nested eliza submodules individually", () => {
    const rootDir = "/repo";
    const elizaRoot = path.join(rootDir, "eliza");
    const existingPaths = new Set([
      path.join(rootDir, ".git"),
      path.join(rootDir, ".gitmodules"),
      path.join(elizaRoot, ".gitmodules"),
      path.join(elizaRoot, "package.json"),
      path.join(elizaRoot, "packages/typescript/package.json"),
    ]);

    const exec = vi.fn((command: string, options?: { cwd?: string }) => {
      const cwd = options?.cwd ?? rootDir;

      if (
        command ===
        'git config --file .gitmodules --get-regexp "^submodule\\..*\\.path$"'
      ) {
        if (cwd === rootDir) {
          return "submodule.eliza.path eliza";
        }
        if (cwd === elizaRoot) {
          return [
            "submodule.plugins/plugin-shell.path plugins/plugin-shell",
            "submodule.plugins/plugin-sql.path plugins/plugin-sql",
          ].join("\n");
        }
      }

      if (command === 'git ls-files -s -- "eliza"' && cwd === rootDir) {
        return "160000 deadbeef 0\teliza";
      }
      if (
        command === 'git ls-files -s -- "plugins/plugin-shell"' &&
        cwd === elizaRoot
      ) {
        return "160000 deadbeef 0\tplugins/plugin-shell";
      }
      if (
        command === 'git ls-files -s -- "plugins/plugin-sql"' &&
        cwd === elizaRoot
      ) {
        return "160000 deadbeef 0\tplugins/plugin-sql";
      }

      if (command === 'git submodule status -- "eliza"' && cwd === rootDir) {
        return " 93b4bd488328f39d095cb30d98eb3118a7f28d7c eliza";
      }
      if (
        command === 'git submodule status -- "plugins/plugin-shell"' &&
        cwd === elizaRoot
      ) {
        return "-93b4bd488328f39d095cb30d98eb3118a7f28d7c plugins/plugin-shell";
      }
      if (
        command === 'git submodule status -- "plugins/plugin-sql"' &&
        cwd === elizaRoot
      ) {
        return "-93b4bd488328f39d095cb30d98eb3118a7f28d7c plugins/plugin-sql";
      }

      if (command === "git status --porcelain" && cwd === elizaRoot) {
        return "";
      }

      if (command === "git submodule sync --recursive") {
        return "";
      }

      if (
        command.includes(
          'submodule update --init --recursive -- "plugins/plugin-shell"',
        ) &&
        cwd === elizaRoot
      ) {
        return "";
      }
      if (
        command.includes(
          'submodule update --init --recursive -- "plugins/plugin-sql"',
        ) &&
        cwd === elizaRoot
      ) {
        return "";
      }

      throw new Error(`Unexpected command: ${command} (cwd=${cwd})`);
    });

    const result = runInitSubmodules({
      rootDir,
      exec,
      exists: (targetPath) => existingPaths.has(targetPath),
      log: vi.fn(),
      logError: vi.fn(),
      shouldSkipSubmodule: () => false,
    });

    const issuedCommands = exec.mock.calls.map(
      ([command, options]) => `${options?.cwd ?? rootDir} :: ${command}`,
    );

    expect(result.failed).toBe(0);
    expect(
      issuedCommands.some(
        (command) =>
          command.startsWith(`${elizaRoot} :: git `) &&
          command.includes(
            'submodule update --init --recursive -- "plugins/plugin-shell"',
          ),
      ),
    ).toBe(true);
    expect(issuedCommands).not.toContain(
      `${elizaRoot} :: git submodule update --init --recursive`,
    );
  });

  it("continues initializing later nested eliza submodules after one fails", () => {
    const rootDir = "/repo";
    const elizaRoot = path.join(rootDir, "eliza");
    const existingPaths = new Set([
      path.join(rootDir, ".git"),
      path.join(rootDir, ".gitmodules"),
      path.join(elizaRoot, ".gitmodules"),
      path.join(elizaRoot, "package.json"),
      path.join(elizaRoot, "packages/typescript/package.json"),
    ]);
    const logError = vi.fn();

    const exec = vi.fn((command: string, options?: { cwd?: string }) => {
      const cwd = options?.cwd ?? rootDir;

      if (
        command ===
        'git config --file .gitmodules --get-regexp "^submodule\\..*\\.path$"'
      ) {
        if (cwd === rootDir) {
          return "submodule.eliza.path eliza";
        }
        if (cwd === elizaRoot) {
          return [
            "submodule.plugins/plugin-broken.path plugins/plugin-broken",
            "submodule.plugins/plugin-shell.path plugins/plugin-shell",
          ].join("\n");
        }
      }

      if (command === 'git ls-files -s -- "eliza"' && cwd === rootDir) {
        return "160000 deadbeef 0\teliza";
      }
      if (
        command === 'git ls-files -s -- "plugins/plugin-broken"' &&
        cwd === elizaRoot
      ) {
        return "160000 deadbeef 0\tplugins/plugin-broken";
      }
      if (
        command === 'git ls-files -s -- "plugins/plugin-shell"' &&
        cwd === elizaRoot
      ) {
        return "160000 deadbeef 0\tplugins/plugin-shell";
      }

      if (command === 'git submodule status -- "eliza"' && cwd === rootDir) {
        return " 93b4bd488328f39d095cb30d98eb3118a7f28d7c eliza";
      }
      if (
        command === 'git submodule status -- "plugins/plugin-broken"' &&
        cwd === elizaRoot
      ) {
        return "-93b4bd488328f39d095cb30d98eb3118a7f28d7c plugins/plugin-broken";
      }
      if (
        command === 'git submodule status -- "plugins/plugin-shell"' &&
        cwd === elizaRoot
      ) {
        return "-93b4bd488328f39d095cb30d98eb3118a7f28d7c plugins/plugin-shell";
      }

      if (command === "git status --porcelain" && cwd === elizaRoot) {
        return "";
      }

      if (command === "git submodule sync --recursive") {
        return "";
      }

      if (
        command.includes(
          'submodule update --init --recursive -- "plugins/plugin-broken"',
        ) &&
        cwd === elizaRoot
      ) {
        throw new Error("missing nested commit");
      }

      if (
        command.includes(
          'submodule update --init --recursive -- "plugins/plugin-shell"',
        ) &&
        cwd === elizaRoot
      ) {
        return "";
      }

      throw new Error(`Unexpected command: ${command} (cwd=${cwd})`);
    });

    const result = runInitSubmodules({
      rootDir,
      exec,
      exists: (targetPath) => existingPaths.has(targetPath),
      log: vi.fn(),
      logError,
    });

    const issuedCommands = exec.mock.calls.map(
      ([command, options]) => `${options?.cwd ?? rootDir} :: ${command}`,
    );

    expect(result.failed).toBe(1);
    expect(
      issuedCommands.some((command) =>
        command.includes(
          'submodule update --init --recursive -- "plugins/plugin-shell"',
        ),
      ),
    ).toBe(true);
    expect(logError).toHaveBeenCalledWith(
      expect.stringContaining(
        "Failed to initialize nested plugins/plugin-broken (eliza/plugins/plugin-broken)",
      ),
    );
  });
});
