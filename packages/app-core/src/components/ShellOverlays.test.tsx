// @vitest-environment jsdom
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { ShellOverlays } from "./ShellOverlays";

vi.mock("@miladyai/ui", () => ({
  Spinner: ({ className }: { className?: string }) =>
    React.createElement("span", {
      "data-testid": "spinner",
      className,
    }),
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
  it("uses readable text tokens for each notice tone", () => {
    const notice = {
      text: "Heads up",
      tone: "info",
      busy: false,
    };

    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(ShellOverlays, { actionNotice: notice }),
      );
    });

    const infoBanner = renderer!.root.findByProps({ role: "status" });
    expect(String(infoBanner.props.className)).toContain("bg-accent");
    expect(String(infoBanner.props.className)).toContain("text-accent-fg");

    act(() => {
      renderer!.update(
        React.createElement(ShellOverlays, {
          actionNotice: { ...notice, tone: "success" },
        }),
      );
    });

    const successBanner = renderer!.root.findByProps({ role: "status" });
    expect(String(successBanner.props.className)).toContain("bg-ok");
    expect(String(successBanner.props.className)).toContain("text-white");

    act(() => {
      renderer!.update(
        React.createElement(ShellOverlays, {
          actionNotice: { ...notice, tone: "error" },
        }),
      );
    });

    const errorBanner = renderer!.root.findByProps({ role: "status" });
    expect(String(errorBanner.props.className)).toContain("bg-danger");
    expect(String(errorBanner.props.className)).toContain("text-white");
  });
});
