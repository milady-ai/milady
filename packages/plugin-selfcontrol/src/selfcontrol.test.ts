import { afterEach, describe, expect, it } from "vitest";
import {
  buildSelfControlBlocklistPlist,
  normalizeWebsiteTargets,
  parseSelfControlBlockRequest,
  parseSelfControlIsRunningOutput,
  parseSelfControlSettingsOutput,
  resetSelfControlStatusCache,
} from "./selfcontrol";

afterEach(() => {
  resetSelfControlStatusCache();
});

describe("normalizeWebsiteTargets", () => {
  it("normalizes URLs and removes duplicates", () => {
    expect(
      normalizeWebsiteTargets([
        "https://x.com/home",
        "x.com",
        "twitter.com,",
        "localhost",
      ]),
    ).toEqual(["x.com", "twitter.com"]);
  });

  it("rejects invalid or private-looking targets", () => {
    expect(
      normalizeWebsiteTargets(["localhost", "127.0.0.1", "intranet", ""]),
    ).toEqual([]);
  });
});

describe("parseSelfControlBlockRequest", () => {
  it("parses websites and duration from message text", () => {
    const parsed = parseSelfControlBlockRequest(undefined, {
      content: {
        text: "Block twitter.com and x.com for 2 hours.",
      },
    } as never);

    expect(parsed.request).toEqual({
      websites: ["twitter.com", "x.com"],
      durationMinutes: 120,
    });
  });

  it("returns an error when no websites are present", () => {
    const parsed = parseSelfControlBlockRequest(undefined, {
      content: {
        text: "Help me focus for an hour.",
      },
    } as never);

    expect(parsed.request).toBeNull();
    expect(parsed.error).toMatch(/at least one public website hostname/i);
  });
});

describe("SelfControl output parsing", () => {
  it("parses the running flag", () => {
    expect(parseSelfControlIsRunningOutput("2026-04-04 YES")).toBe(true);
    expect(parseSelfControlIsRunningOutput("2026-04-04 NO")).toBe(false);
  });

  it("parses active settings output", () => {
    const parsed = parseSelfControlSettingsOutput(`
      BlockEndDate = "2026-04-04 13:44:54 +0000";
      ActiveBlocklist = (
        "x.com",
        "twitter.com"
      );
    `);

    expect(parsed.endsAt).toBe("2026-04-04T13:44:54.000Z");
    expect(parsed.websites).toEqual(["x.com", "twitter.com"]);
  });
});

describe("buildSelfControlBlocklistPlist", () => {
  it("writes the expected plist keys", () => {
    const plist = buildSelfControlBlocklistPlist(["x.com", "twitter.com"]);

    expect(plist).toContain("<key>HostBlacklist</key>");
    expect(plist).toContain("<string>x.com</string>");
    expect(plist).toContain("<key>BlockAsWhitelist</key>");
    expect(plist).toContain("<false/>");
  });
});
