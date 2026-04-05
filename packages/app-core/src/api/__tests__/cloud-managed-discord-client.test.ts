/**
 * Verifies the managed Discord client helpers target the cloud v1 agent routes.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.resolve(import.meta.dirname, "..", "client-cloud.ts"),
  "utf-8",
);

describe("managed cloud Discord client helpers", () => {
  it("defines a getter for managed Discord agent status", () => {
    const idx = source.indexOf("prototype.getCloudCompatAgentManagedDiscord");
    const nearby = source.slice(idx, idx + 260);
    expect(nearby).toContain("/api/cloud/v1/milady/agents/");
    expect(nearby).toContain("/discord");
    expect(nearby).toContain("encodeURIComponent(agentId)");
  });

  it("defines a POST helper for starting managed Discord OAuth", () => {
    const idx = source.indexOf(
      "prototype.createCloudCompatAgentManagedDiscordOauth",
    );
    const nearby = source.slice(idx, idx + 360);
    expect(nearby).toContain('method: "POST"');
    expect(nearby).toContain("/api/cloud/v1/milady/agents/");
    expect(nearby).toContain("/discord/oauth");
  });

  it("defines a DELETE helper for disconnecting managed Discord", () => {
    const idx = source.indexOf(
      "prototype.disconnectCloudCompatAgentManagedDiscord",
    );
    const nearby = source.slice(idx, idx + 320);
    expect(nearby).toContain('method: "DELETE"');
    expect(nearby).toContain("/api/cloud/v1/milady/agents/");
    expect(nearby).toContain("/discord");
  });
});
