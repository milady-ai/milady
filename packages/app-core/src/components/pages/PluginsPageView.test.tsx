// @vitest-environment jsdom

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

vi.mock("./PluginsView", () => ({
  PluginsView: (props: Record<string, unknown>) =>
    React.createElement("div", {
      "data-in-modal": String(props.inModal),
      "data-mode": String(props.mode),
    }),
}));

import { PluginsPageView } from "./PluginsPageView";

describe("PluginsPageView", () => {
  it("renders the advanced plugins surface as a page by default", async () => {
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(PluginsPageView));
    });

    expect(tree.root.findByType("div").props["data-mode"]).toBe("all-social");
    expect(tree.root.findByType("div").props["data-in-modal"]).toBe("false");
  });

  it("passes through modal rendering when requested explicitly", async () => {
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(PluginsPageView, { inModal: true }),
      );
    });

    expect(tree.root.findByType("div").props["data-mode"]).toBe("all-social");
    expect(tree.root.findByType("div").props["data-in-modal"]).toBe("true");
  });
});
