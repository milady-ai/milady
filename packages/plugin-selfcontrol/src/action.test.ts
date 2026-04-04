import { afterEach, describe, expect, it, vi } from "vitest";
import {
  selfControlBlockWebsitesAction,
  selfControlGetStatusAction,
  selfControlUnblockWebsitesAction,
} from "./action";
import {
  resetSelfControlStatusCache,
  setSelfControlCommandRunnerForTests,
  setSelfControlPathExistsForTests,
  setSelfControlPluginConfig,
} from "./selfcontrol";

afterEach(() => {
  setSelfControlPluginConfig(undefined);
  setSelfControlCommandRunnerForTests(null);
  setSelfControlPathExistsForTests(null);
  resetSelfControlStatusCache();
  vi.restoreAllMocks();
});

describe("selfControlBlockWebsitesAction", () => {
  it("starts a block when SelfControl is available and idle", async () => {
    const runner = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        stdout: "NO",
        stderr: "",
        code: 0,
      })
      .mockResolvedValueOnce({
        ok: true,
        stdout: "INFO: Block successfully added.",
        stderr: "",
        code: 0,
      });

    setSelfControlPluginConfig({
      cliPath: "/Applications/SelfControl.app/Contents/MacOS/selfcontrol-cli",
    });
    setSelfControlPathExistsForTests(async () => true);
    setSelfControlCommandRunnerForTests(runner);

    const result = await selfControlBlockWebsitesAction.handler(
      {} as never,
      {
        content: { text: "Block x.com and twitter.com for 30 minutes." },
      } as never,
      undefined,
      undefined,
    );

    expect(result.success).toBe(true);
    expect(result.text).toMatch(/Started a SelfControl block/i);
    expect(runner).toHaveBeenNthCalledWith(
      2,
      "/Applications/SelfControl.app/Contents/MacOS/selfcontrol-cli",
      expect.arrayContaining(["start", "--blocklist", "--enddate"]),
    );
  });

  it("refuses to start a new block while another one is active", async () => {
    const runner = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        stdout: "YES",
        stderr: "",
        code: 0,
      })
      .mockResolvedValueOnce({
        ok: true,
        stdout: `
          BlockEndDate = "2026-04-04 13:44:54 +0000";
          ActiveBlocklist = (
            "x.com"
          );
        `,
        stderr: "",
        code: 0,
      });

    setSelfControlPluginConfig({
      cliPath: "/Applications/SelfControl.app/Contents/MacOS/selfcontrol-cli",
    });
    setSelfControlPathExistsForTests(async () => true);
    setSelfControlCommandRunnerForTests(runner);

    const result = await selfControlBlockWebsitesAction.handler(
      {} as never,
      {
        content: { text: "Block twitter.com for 30 minutes." },
      } as never,
      undefined,
      undefined,
    );

    expect(result.success).toBe(false);
    expect(result.text).toContain("already running");
  });
});

describe("selfControlGetStatusAction", () => {
  it("reports the active block details", async () => {
    const runner = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        stdout: "YES",
        stderr: "",
        code: 0,
      })
      .mockResolvedValueOnce({
        ok: true,
        stdout: `
          BlockEndDate = "2026-04-04 13:44:54 +0000";
          ActiveBlocklist = (
            "x.com",
            "twitter.com"
          );
        `,
        stderr: "",
        code: 0,
      });

    setSelfControlPluginConfig({
      cliPath: "/Applications/SelfControl.app/Contents/MacOS/selfcontrol-cli",
    });
    setSelfControlPathExistsForTests(async () => true);
    setSelfControlCommandRunnerForTests(runner);

    const result = await selfControlGetStatusAction.handler(
      {} as never,
      {} as never,
      undefined,
      undefined,
    );

    expect(result.success).toBe(true);
    expect(result.text).toContain("2026-04-04T13:44:54.000Z");
    expect(result.data).toMatchObject({
      active: true,
      websites: ["x.com", "twitter.com"],
    });
  });
});

describe("selfControlUnblockWebsitesAction", () => {
  it("explains that active SelfControl blocks cannot be ended early", async () => {
    const runner = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        stdout: "YES",
        stderr: "",
        code: 0,
      })
      .mockResolvedValueOnce({
        ok: true,
        stdout: `
          BlockEndDate = "2026-04-04 13:44:54 +0000";
          ActiveBlocklist = (
            "x.com"
          );
        `,
        stderr: "",
        code: 0,
      });

    setSelfControlPluginConfig({
      cliPath: "/Applications/SelfControl.app/Contents/MacOS/selfcontrol-cli",
    });
    setSelfControlPathExistsForTests(async () => true);
    setSelfControlCommandRunnerForTests(runner);

    const result = await selfControlUnblockWebsitesAction.handler(
      {} as never,
      {} as never,
      undefined,
      undefined,
    );

    expect(result.success).toBe(false);
    expect(result.text).toContain("cannot end an active block early");
    expect(result.data).toMatchObject({
      canUnblockEarly: false,
      active: true,
    });
  });
});
