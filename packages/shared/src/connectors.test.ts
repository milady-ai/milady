import { describe, expect, it } from "vitest";
import {
  expandConnectorSourceFilter,
  getConnectorSourceAliases,
  normalizeConnectorSource,
} from "./connectors.js";

describe("connector source helpers", () => {
  it("normalizes transport aliases to canonical connector sources", () => {
    expect(normalizeConnectorSource("bluebubbles")).toBe("imessage");
    expect(normalizeConnectorSource("telegram-account")).toBe("telegram");
    expect(normalizeConnectorSource("discord-local")).toBe("discord");
  });

  it("returns all aliases for canonical sources", () => {
    expect(getConnectorSourceAliases("telegram")).toEqual([
      "telegram",
      "telegram-account",
      "telegramaccount",
    ]);
  });

  it("expands mixed source filters to every matching transport alias", () => {
    expect(
      Array.from(
        expandConnectorSourceFilter(["imessage", "discord-local"]),
      ).sort(),
    ).toEqual(["bluebubbles", "discord", "discord-local", "imessage"]);
  });
});
