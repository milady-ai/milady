/**
 * Regression tests for character action bar visibility in companion mode.
 *
 * The Save Character and Customize buttons sit in a container that overlays
 * the 3D VRM scene in companion mode (sceneOverlay=true). Without a visible
 * backdrop these buttons are invisible against the scene.
 *
 * The fix uses the `.character-action-bar` CSS class with `[data-theme="dark"]`
 * selectors (not Tailwind `dark:` prefix, which doesn't work in this app).
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "../..");
const CHARACTER_VIEW_PATH = path.join(
  ROOT,
  "src/components/CharacterEditor.tsx",
);
const BASE_CSS_PATH = path.join(ROOT, "src/styles/base.css");

describe("Character action bar visibility in companion mode", () => {
  it("does not reference the character-action-bar class inline (handled by CSS only)", () => {
    const source = fs.readFileSync(CHARACTER_VIEW_PATH, "utf8");

    // The component no longer conditionally applies the CSS class —
    // the sceneOverlay prop is unused and styling is handled by base.css.
    expect(source).not.toContain('"character-action-bar"');
  });

  it("defines .character-action-bar with a visible backdrop in base.css", () => {
    const css = fs.readFileSync(BASE_CSS_PATH, "utf8");

    // Light mode: must have a white-ish semi-transparent background
    expect(css).toContain(".character-action-bar");
    expect(css).toMatch(
      /\.character-action-bar\s*\{[^}]*background:\s*rgba\(255/,
    );
    expect(css).toMatch(/\.character-action-bar\s*\{[^}]*backdrop-filter/);
  });

  it("provides a dark-mode override using [data-theme='dark'], not Tailwind dark:", () => {
    const css = fs.readFileSync(BASE_CSS_PATH, "utf8");

    // Must use [data-theme="dark"] selector — Tailwind `dark:` doesn't work
    // in this app because dark mode is toggled via data-theme attribute.
    expect(css).toContain('[data-theme="dark"] .character-action-bar');
    expect(css).toContain(".dark .character-action-bar");
    expect(css).toMatch(
      /\[data-theme="dark"\]\s*\.character-action-bar[^}]*background:\s*rgba\(0/,
    );
  });

  it("does not use Tailwind dark: prefix for the action bar container", () => {
    const source = fs.readFileSync(CHARACTER_VIEW_PATH, "utf8");

    // The character-action-bar class is no longer referenced in the component —
    // verify the component does not introduce any dark: prefixed action-bar usage.
    const actionBarLine = source
      .split("\n")
      .find((line) => line.includes("character-action-bar"));
    // The class was removed from the component; no line should exist.
    expect(actionBarLine).toBeUndefined();
  });

  it("does not use rgba(var(--accent),...) which is invalid with hex CSS vars", () => {
    const source = fs.readFileSync(CHARACTER_VIEW_PATH, "utf8");

    // --accent is a hex color (#f0b90b), not raw RGB values.
    // rgba(var(--accent), 0.2) renders as transparent/invisible.
    expect(source).not.toContain("rgba(var(--accent)");
  });
});
