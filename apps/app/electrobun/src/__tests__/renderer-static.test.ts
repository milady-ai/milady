import { describe, expect, it } from "vitest";

import { resolveRendererAsset } from "../renderer-static";

describe("resolveRendererAsset", () => {
  const rendererDir = "/tmp/renderer";

  function resolve(paths: Record<string, "file" | "dir">, urlPath: string) {
    return resolveRendererAsset({
      rendererDir,
      urlPath,
      existsSync: (candidate) => candidate in paths,
      statSync: (candidate) => ({
        isDirectory: () => paths[candidate] === "dir",
      }),
    });
  }

  it("serves precompressed assets when the plain file is missing", () => {
    const result = resolve(
      {
        "/tmp/renderer/index.html": "file",
        "/tmp/renderer/animations/idle.glb.gz": "file",
      },
      "/animations/idle.glb",
    );

    expect(result).toEqual({
      filePath: "/tmp/renderer/animations/idle.glb.gz",
      isGzipped: true,
      mimeExt: ".glb",
    });
  });

  it("falls back to plain assets when packaged wrappers drop the .gz suffix", () => {
    const result = resolve(
      {
        "/tmp/renderer/index.html": "file",
        "/tmp/renderer/vrms/milady-1.vrm": "file",
      },
      "/vrms/milady-1.vrm.gz",
    );

    expect(result).toEqual({
      filePath: "/tmp/renderer/vrms/milady-1.vrm",
      isGzipped: false,
      mimeExt: ".vrm",
    });
  });

  it("falls back to index.html for traversal attempts", () => {
    const result = resolve(
      {
        "/tmp/renderer/index.html": "file",
      },
      "/../../etc/passwd",
    );

    expect(result).toEqual({
      filePath: "/tmp/renderer/index.html",
      isGzipped: false,
      mimeExt: ".html",
    });
  });
});
