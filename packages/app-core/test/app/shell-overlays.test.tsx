import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/** ShellOverlays imports these via `./Foo` — the barrel `@miladyai/app-core/components` mock does not apply. */
vi.mock("@miladyai/app-core/components/CommandPalette", () => ({
  CommandPalette: () => React.createElement("div", null, "CommandPalette"),
}));
vi.mock("@miladyai/app-core/components/RestartBanner", () => ({
  RestartBanner: () => React.createElement("div", null, "RestartBanner"),
}));
vi.mock("@miladyai/app-core/components/BugReportModal", () => ({
  BugReportModal: () => React.createElement("div", null, "BugReportModal"),
}));
vi.mock("@miladyai/app-core/components/ShortcutsOverlay", () => ({
  ShortcutsOverlay: () => React.createElement("div", null, "ShortcutsOverlay"),
}));
vi.mock("@miladyai/app-core/components/GlobalEmoteOverlay", () => ({
  GlobalEmoteOverlay: () =>
    React.createElement("div", null, "GlobalEmoteOverlay"),
}));

vi.mock("@miladyai/app-core/components", async () => {
  const actual = await vi.importActual<
    typeof import("@miladyai/app-core/components")
  >("@miladyai/app-core/components");
  return {
    ...actual,
    BugReportModal: () => React.createElement("div", null, "BugReportModal"),
    CommandPalette: () => React.createElement("div", null, "CommandPalette"),
    RestartBanner: () => React.createElement("div", null, "RestartBanner"),
    ShortcutsOverlay: () =>
      React.createElement("div", null, "ShortcutsOverlay"),
  };
});

vi.mock("@miladyai/app-core/components/MemoryDebugPanel", () => ({
  MemoryDebugPanel: () => React.createElement("div", null, "MemoryDebugPanel"),
}));

import { ShellOverlays } from "@miladyai/app-core/components/ShellOverlays";

function renderShell(actionNotice: Parameters<typeof ShellOverlays>[0]["actionNotice"]) {
  return renderToStaticMarkup(
    React.createElement(ShellOverlays, { actionNotice }),
  );
}

describe("ShellOverlays", () => {
  it("renders the shared overlay components once", () => {
    const markup = renderShell(null);

    expect(markup).toContain("CommandPalette");
    expect(markup).toContain("RestartBanner");

    expect(markup).toContain("BugReportModal");
    expect(markup).toContain("ShortcutsOverlay");
  });

  it.each([
    [{ text: "Saved", tone: "success" }, "bg-ok"],
    [{ text: "Failed", tone: "error" }, "bg-danger"],
    [{ text: "Working", tone: "info" }, "bg-accent"],
  ])("maps %o action notices to the expected tone class", (actionNotice, expectedClass) => {
    const markup = renderShell(actionNotice);

    expect(markup).toContain(actionNotice.text);
    expect(markup).toContain(expectedClass);
  });
});
