import { describe, expect, it } from "vitest";
import {
  type ContentPackManifest,
  validateContentPackManifest,
} from "./content-pack";

function validManifest(
  overrides?: Partial<ContentPackManifest>,
): ContentPackManifest {
  return {
    id: "test-pack",
    name: "Test Pack",
    version: "1.0.0",
    assets: {},
    ...overrides,
  };
}

describe("validateContentPackManifest", () => {
  it("accepts a minimal valid manifest", () => {
    expect(validateContentPackManifest(validManifest())).toEqual([]);
  });

  it("accepts a full manifest with all asset types", () => {
    const errors = validateContentPackManifest(
      validManifest({
        author: "Test Author",
        description: "A test content pack",
        preview: "preview.png",
        assets: {
          vrm: {
            file: "model.vrm.gz",
            preview: "model-preview.png",
            slug: "test-model",
          },
          background: "bg.png",
          world: "world.spz",
          colorScheme: { accent: "#ff00ff", bg: "#0a0a1a", card: "#1a1a2e" },
          streamOverlay: "overlay/",
          personality: {
            name: "Nyx",
            bio: ["A cyberpunk AI"],
            system: "You are Nyx.",
          },
        },
      }),
    );
    expect(errors).toEqual([]);
  });

  it("rejects non-object input", () => {
    expect(validateContentPackManifest(null)).toHaveLength(1);
    expect(validateContentPackManifest("string")).toHaveLength(1);
    expect(validateContentPackManifest(42)).toHaveLength(1);
    expect(validateContentPackManifest([1, 2])).toHaveLength(1);
  });

  it("requires id, name, version", () => {
    const errors = validateContentPackManifest({ assets: {} });
    const fields = errors.map((e) => e.field);
    expect(fields).toContain("id");
    expect(fields).toContain("name");
    expect(fields).toContain("version");
  });

  it("rejects invalid pack id format", () => {
    const errors = validateContentPackManifest(
      validManifest({ id: "Invalid ID!" }),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe("id");
  });

  it("requires assets object", () => {
    const errors = validateContentPackManifest({
      id: "test",
      name: "Test",
      version: "1.0.0",
    });
    expect(errors.some((e) => e.field === "assets")).toBe(true);
  });

  it("validates VRM requires file and slug", () => {
    const errors = validateContentPackManifest(
      validManifest({ assets: { vrm: { file: "", slug: "", preview: "" } } }),
    );
    const fields = errors.map((e) => e.field);
    expect(fields).toContain("assets.vrm.file");
    expect(fields).toContain("assets.vrm.slug");
  });

  it("validates color scheme hex values", () => {
    const errors = validateContentPackManifest(
      validManifest({
        assets: { colorScheme: { accent: "not-a-color", bg: "#fff" } },
      }),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe("assets.colorScheme.accent");
  });

  it("accepts valid hex colors in various formats", () => {
    const errors = validateContentPackManifest(
      validManifest({
        assets: {
          colorScheme: {
            accent: "#f0f",
            bg: "#ff00ff",
            card: "#ff00ff80",
          },
        },
      }),
    );
    expect(errors).toEqual([]);
  });
});
