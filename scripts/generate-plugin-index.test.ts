import { describe, expect, it } from "vitest";

import {
  categorize,
  connectorTags,
  inferDescription,
  resolveSetupGuideUrl,
  STREAMING_DESTINATIONS,
} from "./generate-plugin-index.js";

describe("generate-plugin-index", () => {
  it("classifies all streaming destinations as streaming", () => {
    for (const id of STREAMING_DESTINATIONS) {
      expect(categorize(id)).toBe("streaming");
    }
  });

  it("maps curated setup-guide URLs for streaming plugins", () => {
    expect(resolveSetupGuideUrl("x-streaming")).toMatch(
      /^https:\/\/docs\.(?:milady|eliza)\.ai\/plugin-setup-guide#x-streaming$/,
    );
    expect(resolveSetupGuideUrl("pumpfun-streaming")).toMatch(
      /^https:\/\/docs\.(?:milady|eliza)\.ai\/plugin-setup-guide#pumpfun-streaming$/,
    );
  });

  it("resolves full URLs as-is instead of appending to root", () => {
    const url = resolveSetupGuideUrl("telegram");
    expect(url).toMatch(/^https:\/\/docs\.milady\.ai\//);
    expect(url).not.toContain("plugin-setup-guide#");
  });

  it("returns undefined for unknown plugin IDs", () => {
    expect(resolveSetupGuideUrl("nonexistent-plugin")).toBeUndefined();
  });

  it("marks direct chat connectors with social-chat tags", () => {
    expect(connectorTags("telegram")).toEqual(
      expect.arrayContaining(["social", "social-chat", "messaging"]),
    );
    expect(connectorTags("github")).toEqual(["integration"]);
  });

  it("uses chat-first fallback descriptions for social connectors", () => {
    expect(inferDescription("telegram", "Telegram", "connector")).toBe(
      "Telegram connector for chatting with your agent.",
    );
  });
});
