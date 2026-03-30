import { AvatarLoader } from "../../src/components/AvatarLoader";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The AvatarLoader component uses useLinearProgress which relies on
// requestAnimationFrame. In a non-jsdom Node environment these globals
// are missing, so we stub them here.
let rafId = 0;
const rafCallbacks = new Map<number, FrameRequestCallback>();
beforeEach(() => {
  rafId = 0;
  rafCallbacks.clear();
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    const id = ++rafId;
    rafCallbacks.set(id, cb);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    rafCallbacks.delete(id);
  });
});
afterEach(() => {
  vi.restoreAllMocks();
});

function extractText(node: TestRenderer.ReactTestInstance): string {
  return node.children
    .map((child) =>
      typeof child === "string" ? child : extractText(child),
    )
    .join("");
}

function renderedText(tree: TestRenderer.ReactTestRenderer): string {
  return extractText(tree.root);
}

describe("AvatarLoader", () => {
  it("shows default label", async () => {
    let tree: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(AvatarLoader));
    });
    if (!tree) throw new Error("failed to render");

    expect(renderedText(tree)).toContain("Initializing entity");
  });

  it("shows custom label", async () => {
    let tree: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(AvatarLoader, { label: "Starting systems" }),
      );
    });
    if (!tree) throw new Error("failed to render");

    expect(renderedText(tree)).toContain("Starting systems");
  });

  it("shows LOADING text", async () => {
    let tree: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(AvatarLoader));
    });
    if (!tree) throw new Error("failed to render");

    expect(renderedText(tree)).toContain("LOADING");
  });
});
