import { describe, expect, it } from "vitest";
import { resolveWidgetsForSlot } from "../../src/widgets/registry";
import type { PluginWidgetDeclaration } from "../../src/widgets/types";

describe("resolveWidgetsForSlot", () => {
  it("keeps bundled chat widgets available when unrelated plugins are loaded", () => {
    const resolved = resolveWidgetsForSlot("chat-sidebar", [
      { id: "openai", enabled: true, isActive: true },
    ]);

    expect(
      resolved.map(
        (widget) =>
          `${widget.declaration.pluginId}/${widget.declaration.id}`,
      ),
    ).toEqual(
      expect.arrayContaining([
        "lifeops/lifeops.overview",
        "lifeops/lifeops.google",
        "todo/todo.items",
        "agent-orchestrator/agent-orchestrator.apps",
        "agent-orchestrator/agent-orchestrator.tasks",
        "agent-orchestrator/agent-orchestrator.activity",
      ]),
    );
  });

  it(
    "does not enable server-only widgets when the owning plugin is missing",
    () => {
      const serverWidget: PluginWidgetDeclaration = {
        id: "custom.sidebar",
        pluginId: "custom",
        slot: "chat-sidebar",
        label: "Custom sidebar",
        defaultEnabled: true,
        uiSpec: {
          type: "section",
          title: "Custom",
          body: [],
        },
      };

      const resolved = resolveWidgetsForSlot(
        "chat-sidebar",
        [{ id: "openai", enabled: true, isActive: true }],
        [serverWidget],
      );

      expect(
        resolved.some(
          (widget) =>
            widget.declaration.pluginId === "custom" &&
            widget.declaration.id === "custom.sidebar",
        ),
      ).toBe(false);
    },
  );
});
