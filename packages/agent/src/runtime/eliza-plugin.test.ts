import { describe, expect, it } from "vitest";
import { createElizaPlugin } from "./eliza-plugin";

describe("createElizaPlugin", () => {
  it("registers lifeops provider and conversational actions", () => {
    const plugin = createElizaPlugin();

    expect(plugin.providers?.some((provider) => provider.name === "lifeops")).toBe(
      true,
    );
    expect(
      plugin.actions?.some((action) => action.name === "CALENDAR_ACTION"),
    ).toBe(true);
    expect(
      plugin.actions?.some((action) => action.name === "GMAIL_ACTION"),
    ).toBe(true);
    expect(
      plugin.actions?.some((action) => action.name === "LIFE"),
    ).toBe(true);
    expect(
      plugin.services?.some(
        (service) => service.serviceType === "milady_character_persistence",
      ),
    ).toBe(true);
  });
});
