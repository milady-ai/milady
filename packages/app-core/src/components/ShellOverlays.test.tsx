import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { ShellOverlays } from "./ShellOverlays";

vi.mock("@miladyai/ui", () => ({
  Spinner: (props: Record<string, unknown>) =>
    React.createElement("div", { "data-testid": "spinner", ...props }),
}));

vi.mock("./BugReportModal", () => ({
  BugReportModal: () => null,
}));

vi.mock("./CommandPalette", () => ({
  CommandPalette: () => null,
}));

vi.mock("./GlobalEmoteOverlay", () => ({
  GlobalEmoteOverlay: () => null,
}));

vi.mock("./RestartBanner", () => ({
  RestartBanner: () => null,
}));

vi.mock("./ShortcutsOverlay", () => ({
  ShortcutsOverlay: () => null,
}));

describe("ShellOverlays", () => {
  it("uses accent foreground text for accent action notices", () => {
    let tree: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        <ShellOverlays
          actionNotice={{ tone: "info", text: "Cloud login ready" }}
        />,
      );
    });

    const status = tree!.root.findByProps({ role: "status" });
    const className = String(status.props.className);

    expect(className).toContain("bg-accent text-accent-fg");
    expect(className).not.toContain("text-white");
  });

  it.each([
    ["error", "bg-danger text-white"],
    ["success", "bg-ok text-white"],
  ] as const)("keeps white text on %s notices", (tone, expectedClass) => {
    let tree: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        <ShellOverlays
          actionNotice={{ tone, text: `${tone} message`, busy: true }}
        />,
      );
    });

    const status = tree!.root.findByProps({ role: "status" });
    const className = String(status.props.className);

    expect(className).toContain(expectedClass);
    expect(tree!.root.findByProps({ "data-testid": "spinner" })).toBeTruthy();
  });
});
