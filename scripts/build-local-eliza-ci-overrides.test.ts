import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createTempDirManager } from "../test/helpers/temp-dir";
import {
  buildLocalElizaCiOverrides,
  LOCAL_ELIZA_CI_OVERRIDE_PACKAGES,
} from "./build-local-eliza-ci-overrides.mjs";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

function writeJson(filePath: string, value: JsonValue) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writePackage(root: string, packageDir: string) {
  writeJson(path.join(root, packageDir, "package.json"), {
    name: packageDir,
    scripts: {
      build: "tsc -p tsconfig.build.json",
    },
  });
}

const { makeTempDir, cleanupTempDirs } = createTempDirManager(
  "milady-local-eliza-ci-overrides-",
);

afterEach(() => {
  cleanupTempDirs();
});

describe("build-local-eliza-ci-overrides", () => {
  it("builds local-only eliza packages that expose dist entrypoints", async () => {
    const root = makeTempDir();
    const builtDirs: string[] = [];

    for (const packageInfo of LOCAL_ELIZA_CI_OVERRIDE_PACKAGES) {
      writePackage(root, packageInfo.packageDir);
    }

    await buildLocalElizaCiOverrides({
      root,
      log: () => {},
      runBuild: async (packageDir) => {
        builtDirs.push(path.relative(root, packageDir));
        fs.mkdirSync(path.join(packageDir, "dist"), { recursive: true });
        fs.writeFileSync(path.join(packageDir, "dist", "index.js"), "\n");
      },
    });

    expect(builtDirs).toEqual(
      LOCAL_ELIZA_CI_OVERRIDE_PACKAGES.map(
        (packageInfo) => packageInfo.packageDir,
      ),
    );
  });

  it("skips packages that already have their dist entrypoint", async () => {
    const root = makeTempDir();

    for (const packageInfo of LOCAL_ELIZA_CI_OVERRIDE_PACKAGES) {
      writePackage(root, packageInfo.packageDir);
      fs.mkdirSync(path.join(root, packageInfo.packageDir, "dist"), {
        recursive: true,
      });
      fs.writeFileSync(
        path.join(root, packageInfo.packageDir, "dist", "index.js"),
        "\n",
      );
    }

    await buildLocalElizaCiOverrides({
      root,
      log: () => {},
      runBuild: async () => {
        throw new Error("build should not run when dist entrypoint exists");
      },
    });
  });

  it("fails when a required local-only package is missing", async () => {
    const root = makeTempDir();

    await expect(
      buildLocalElizaCiOverrides({
        root,
        log: () => {},
        runBuild: async () => {},
      }),
    ).rejects.toThrow(/@elizaos\/skills is required/);
  });
});
