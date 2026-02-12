import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockUseApp } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
}));

vi.mock("../../src/AppContext", () => ({
  useApp: () => mockUseApp(),
}));

import { Header } from "../../src/components/Header";

let baseAppState: Record<string, unknown>;

describe("header status", () => {
  beforeEach(() => {
    mockUseApp.mockReset();
    baseAppState = {
      agentStatus: { state: "running", agentName: "Milaidy", model: undefined, startedAt: undefined, uptime: undefined },
      cloudEnabled: false,
      cloudConnected: false,
      cloudCredits: null,
      cloudCreditsCritical: false,
      cloudCreditsLow: false,
      cloudTopUpUrl: "",
      walletAddresses: null,
      handlePauseResume: vi.fn(),
      handleRestart: vi.fn(),
      openCommandPalette: vi.fn(),
      copyToClipboard: vi.fn(),
      setTab: vi.fn(),
      dropStatus: null,
      loadDropStatus: vi.fn().mockResolvedValue(undefined),
      registryStatus: null,
    };
    mockUseApp.mockReturnValue(baseAppState);
  });

  it("renders starting state with loading indicator", async () => {
    mockUseApp.mockReturnValue({
      ...baseAppState,
      agentStatus: { state: "starting", agentName: "Milaidy", model: undefined, startedAt: undefined, uptime: undefined },
    });

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(Header));
    });

    const renderedText = tree!.root
      .findAllByType("span")
      .map((node) => node.children.join(""))
      .join("\n");

    expect(renderedText).toContain("starting");
    expect(renderedText).toContain("⏳");
    expect(renderedText).not.toContain("⏸️");
  });
});
