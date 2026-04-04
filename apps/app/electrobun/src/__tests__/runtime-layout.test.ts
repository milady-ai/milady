import { describe, expect, it } from "vitest";
import {
  resolvePreloadBaseDir,
  resolveRendererAssetDir,
} from "../runtime-layout";

describe("runtime-layout", () => {
  it("resolves renderer assets from the source tree during local development", () => {
    const moduleDir = "/repo/apps/app/electrobun/src";
    const rendererDir = resolveRendererAssetDir(
      moduleDir,
      "/repo/apps/app/electrobun/build/bun",
      "darwin",
      {
        existsSync: (filePath) =>
          filePath === "/repo/apps/app/electrobun/renderer",
      },
    );

    expect(rendererDir).toBe("/repo/apps/app/electrobun/renderer");
  });

  it("prefers packaged Windows renderer assets under resources/app", () => {
    const execPath = "C:\\mi\\bin\\launcher.exe";
    const rendererDir = resolveRendererAssetDir(
      "C:\\mi\\Resources\\app\\bun",
      execPath,
      "win32",
      {
        existsSync: (filePath) =>
          filePath === "C:\\mi\\resources\\app\\renderer" ||
          filePath === "C:\\mi\\Resources\\app\\renderer",
      },
    );

    expect(rendererDir.toLowerCase()).toBe("c:\\mi\\resources\\app\\renderer");
  });

  it("resolves the packaged Windows preload from resources/app/bun", () => {
    const calls: string[] = [];
    const preloadBaseDir = resolvePreloadBaseDir(
      "C:\\mi\\Resources",
      "C:\\mi\\bin\\launcher.exe",
      "win32",
      {
        existsSync: (filePath) => {
          calls.push(String(filePath));
          return (
            filePath === "C:\\mi\\resources\\app\\bun\\preload.js" ||
            filePath === "C:\\mi\\Resources\\app\\bun\\preload.js"
          );
        },
      },
    );

    expect(preloadBaseDir.toLowerCase()).toBe("c:\\mi\\resources\\app\\bun");
    expect(
      calls.some((filePath) =>
        filePath.toLowerCase().includes("resources\\app\\bun\\preload.js"),
      ),
    ).toBe(true);
  });
});
