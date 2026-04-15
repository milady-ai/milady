import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

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

      if (command === 'git ls-files -s -- "steward-fi"') {
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
    expect(execCalls).toContain(
      `${path.join(repoRoot, "eliza")} :: git -c submodule.plugins/plugin-openrouter.update=none submodule update --init --recursive`,
    );
  });
});
