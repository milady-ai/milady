import { describe, expect, it } from "vitest";
import { resolveChatSidebarWidgets } from "./registry";

describe("resolveChatSidebarWidgets", () => {
  it("falls back to default-enabled plugin widgets before plugin state loads", () => {
    expect(resolveChatSidebarWidgets([]).map((widget) => widget.id)).toEqual([
      "lifeops.overview",
      "lifeops.google",
      "agent-orchestrator.apps",
      "agent-orchestrator.tasks",
      "agent-orchestrator.activity",
    ]);
  });

  it("filters widgets by enabled plugin state", () => {
    expect(
      resolveChatSidebarWidgets([
        { id: "lifeops", enabled: false, isActive: false },
        { id: "agent-orchestrator", enabled: true, isActive: true },
      ]).map((widget) => widget.id),
    ).toEqual([
      "agent-orchestrator.apps",
      "agent-orchestrator.tasks",
      "agent-orchestrator.activity",
    ]);
  });

  it("hides widgets whose plugin is absent from the loaded plugin list", () => {
    expect(
      resolveChatSidebarWidgets([
        { id: "agent-orchestrator", enabled: true, isActive: true },
      ]).map((widget) => widget.id),
    ).toEqual([
      "agent-orchestrator.apps",
      "agent-orchestrator.tasks",
      "agent-orchestrator.activity",
    ]);
  });
});
