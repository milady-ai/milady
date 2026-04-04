import type { ContentPackManifest } from "@miladyai/shared/contracts/content-pack";
import { describe, expect, it, vi } from "vitest";
import {
  ContentPackLoadError,
  loadBundledContentPack,
  loadContentPackFromUrl,
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

    vi.unstubAllGlobals();
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

    vi.unstubAllGlobals();
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

    vi.unstubAllGlobals();
  });
});
