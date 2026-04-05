import { describe, expect, it } from "vitest";
import { consumeManagedDiscordCallbackUrl } from "./cloud-dashboard-utils";

describe("consumeManagedDiscordCallbackUrl", () => {
  it("extracts managed Discord callback state and removes transient params", () => {
    const { callback, cleanedUrl } = consumeManagedDiscordCallbackUrl(
      "http://localhost:4173/dashboard/settings?tab=agents&discord=connected&managed=1&agentId=agent-1&guildId=guild-1&guildName=Milady%20HQ&restarted=1",
    );

    expect(callback).toEqual({
      status: "connected",
      managed: true,
      agentId: "agent-1",
      guildId: "guild-1",
      guildName: "Milady HQ",
      message: null,
      restarted: true,
    });
    expect(cleanedUrl).toBe(
      "http://localhost:4173/dashboard/settings?tab=agents",
    );
  });

  it("ignores non-managed Discord callback params", () => {
    const { callback, cleanedUrl } = consumeManagedDiscordCallbackUrl(
      "http://localhost:4173/dashboard/settings?tab=agents&discord=connected",
    );

    expect(callback).toBeNull();
    expect(cleanedUrl).toBeNull();
  });
});
