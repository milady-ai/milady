// @vitest-environment jsdom

import type { ContentPackManifest } from "@miladyai/shared/contracts/content-pack";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ContentPackLoadError,
  loadBundledContentPack,
  loadContentPackFromFiles,
  loadContentPackFromUrl,
  releaseLoadedContentPack,
  resolveContentPackFromManifest,
} from "./load-pack";

const VALID_MANIFEST: ContentPackManifest = {
  id: "test-pack",
  name: "Test Pack",
  version: "1.0.0",
  assets: {
    vrm: { file: "model.vrm.gz", preview: "preview.png", slug: "test-model" },
    background: "bg.png",
    world: "world.spz",
    colorScheme: { accent: "#ff00ff" },
    streamOverlay: "overlay/",
    personality: { name: "Nyx", bio: ["Cyberpunk AI"] },
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

function makeFile(
  path: string,
  content: string,
  type = "application/json",
): File {
  const file = new File([content], path.split("/").at(-1) ?? path, { type });
  Object.defineProperty(file, "webkitRelativePath", {
    configurable: true,
    value: path,
  });
  return file;
}

describe("resolveContentPackFromManifest", () => {
  it("resolves all asset paths relative to base URL", () => {
    const pack = resolveContentPackFromManifest(
      VALID_MANIFEST,
      "https://cdn.example.com/packs/test-pack/",
      { kind: "url", url: "https://cdn.example.com/packs/test-pack/" },
    );

    expect(pack.manifest).toBe(VALID_MANIFEST);
    expect(pack.vrmUrl).toBe(
      "https://cdn.example.com/packs/test-pack/model.vrm.gz",
    );
    expect(pack.vrmPreviewUrl).toBe(
      "https://cdn.example.com/packs/test-pack/preview.png",
    );
    expect(pack.backgroundUrl).toBe(
      "https://cdn.example.com/packs/test-pack/bg.png",
    );
    expect(pack.worldUrl).toBe(
      "https://cdn.example.com/packs/test-pack/world.spz",
    );
    expect(pack.streamOverlayPath).toBe(
      "https://cdn.example.com/packs/test-pack/overlay/",
    );
    expect(pack.colorScheme).toEqual({ accent: "#ff00ff" });
    expect(pack.personality).toEqual({ name: "Nyx", bio: ["Cyberpunk AI"] });
  });

  it("adds trailing slash to base URL", () => {
    const pack = resolveContentPackFromManifest(
      VALID_MANIFEST,
      "https://cdn.example.com/packs/test-pack",
      { kind: "url", url: "https://cdn.example.com/packs/test-pack" },
    );
    expect(pack.vrmUrl).toBe(
      "https://cdn.example.com/packs/test-pack/model.vrm.gz",
    );
  });

  it("leaves undefined for missing optional assets", () => {
    const minimal: ContentPackManifest = {
      id: "minimal",
      name: "Minimal",
      version: "1.0.0",
      assets: {},
    };
    const pack = resolveContentPackFromManifest(minimal, "/packs/minimal/", {
      kind: "bundled",
      id: "minimal",
    });
    expect(pack.vrmUrl).toBeUndefined();
    expect(pack.backgroundUrl).toBeUndefined();
    expect(pack.worldUrl).toBeUndefined();
    expect(pack.colorScheme).toBeUndefined();
    expect(pack.personality).toBeUndefined();
  });
});

describe("loadBundledContentPack", () => {
  it("resolves paths under /packs/<id>/", () => {
    const pack = loadBundledContentPack(VALID_MANIFEST);
    expect(pack.source).toEqual({ kind: "bundled", id: "test-pack" });
    expect(pack.vrmUrl).toBe("/packs/test-pack/model.vrm.gz");
    expect(pack.backgroundUrl).toBe("/packs/test-pack/bg.png");
  });

  it("uses custom packs base URL", () => {
    const pack = loadBundledContentPack(VALID_MANIFEST, "/custom-packs");
    expect(pack.vrmUrl).toBe("/custom-packs/test-pack/model.vrm.gz");
  });
});

describe("loadContentPackFromUrl", () => {
  it("throws ContentPackLoadError on fetch failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 404, statusText: "Not Found" })),
    );

    await expect(
      loadContentPackFromUrl("https://example.com/packs/missing/"),
    ).rejects.toThrow(ContentPackLoadError);
  });

  it("throws ContentPackLoadError on invalid manifest", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ invalid: true }),
      })),
    );

    await expect(
      loadContentPackFromUrl("https://example.com/packs/bad/"),
    ).rejects.toThrow(ContentPackLoadError);
  });

  it("resolves a valid manifest from URL", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => VALID_MANIFEST,
      })),
    );

    const pack = await loadContentPackFromUrl(
      "https://example.com/packs/test-pack/",
    );
    expect(pack.manifest.id).toBe("test-pack");
    expect(pack.vrmUrl).toBe(
      "https://example.com/packs/test-pack/model.vrm.gz",
    );
    expect(pack.source).toEqual({
      kind: "url",
      url: "https://example.com/packs/test-pack/",
    });
  });
});

describe("loadContentPackFromFiles", () => {
  it("loads a valid pack from a selected local folder", async () => {
    const createObjectURL = vi
      .fn()
      .mockReturnValueOnce("blob:vrm")
      .mockReturnValueOnce("blob:preview")
      .mockReturnValueOnce("blob:bg");
    vi.stubGlobal("URL", {
      createObjectURL,
      revokeObjectURL: vi.fn(),
    });

    const pack = await loadContentPackFromFiles([
      makeFile("medusa/pack.json", JSON.stringify(VALID_MANIFEST)),
      makeFile("medusa/model.vrm.gz", "vrm", "model/gltf-binary"),
      makeFile("medusa/preview.png", "preview", "image/png"),
      makeFile("medusa/bg.png", "background", "image/png"),
    ]);

    expect(pack.source).toEqual({ kind: "file", path: "medusa" });
    expect(pack.vrmUrl).toBe("blob:vrm");
    expect(pack.vrmPreviewUrl).toBe("blob:preview");
    expect(pack.backgroundUrl).toBe("blob:bg");
    expect(createObjectURL).toHaveBeenCalledTimes(3);
  });

  it("releases tracked object URLs for file-backed packs", async () => {
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", {
      createObjectURL: vi
        .fn()
        .mockReturnValueOnce("blob:vrm")
        .mockReturnValueOnce("blob:preview"),
      revokeObjectURL,
    });

    const pack = await loadContentPackFromFiles([
      makeFile("medusa/pack.json", JSON.stringify(VALID_MANIFEST)),
      makeFile("medusa/model.vrm.gz", "vrm", "model/gltf-binary"),
      makeFile("medusa/preview.png", "preview", "image/png"),
    ]);

    releaseLoadedContentPack(pack);

    expect(revokeObjectURL).toHaveBeenCalledWith("blob:vrm");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:preview");
  });

  it("matches trailing path segments instead of the first duplicate filename", async () => {
    const createObjectURL = vi
      .fn()
      .mockReturnValueOnce("blob:vrm")
      .mockReturnValueOnce("blob:preview");
    vi.stubGlobal("URL", {
      createObjectURL,
      revokeObjectURL: vi.fn(),
    });

    const pack = await loadContentPackFromFiles([
      makeFile("medusa/pack.json", JSON.stringify(VALID_MANIFEST)),
      makeFile("medusa/preview.png", "preview", "image/png"),
      makeFile("other/model.vrm.gz", "wrong", "model/gltf-binary"),
      makeFile("medusa/model.vrm.gz", "right", "model/gltf-binary"),
    ]);

    expect(pack.vrmUrl).toBe("blob:vrm");
    expect(createObjectURL.mock.calls[0][0]).toBeInstanceOf(File);
    expect((createObjectURL.mock.calls[0][0] as File).webkitRelativePath).toBe(
      "medusa/model.vrm.gz",
    );
  });
});
