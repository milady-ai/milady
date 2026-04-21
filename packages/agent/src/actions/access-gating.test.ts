import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockHasOwnerAccess,
  mockHasAdminAccess,
  mockRequestRestart,
} = vi.hoisted(() => ({
  mockHasOwnerAccess: vi.fn(),
  mockHasAdminAccess: vi.fn(),
  mockRequestRestart: vi.fn(),
}));

vi.mock("../security/access.js", () => ({
  hasOwnerAccess: mockHasOwnerAccess,
  hasAdminAccess: mockHasAdminAccess,
}));

vi.mock("../runtime/restart.js", () => ({
  requestRestart: mockRequestRestart,
}));

vi.mock("@elizaos/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@elizaos/core")>();
  return {
    ...actual,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  };
});

import { restartAction } from "./restart";
import { skillCommandAction, addRegisteredSkillSlug, clearRegisteredSkillSlugs } from "./skill-command";
import { goLiveAction, goOfflineAction } from "./stream-control";
import { setUserNameAction } from "./set-user-name";
import { terminalAction } from "./terminal";

describe("action role gating", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn());
    mockHasOwnerAccess.mockReset().mockResolvedValue(true);
    mockHasAdminAccess.mockReset().mockResolvedValue(true);
    mockRequestRestart.mockReset();
    clearRegisteredSkillSlugs();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    clearRegisteredSkillSlugs();
  });

  it("requires owner access for restart", async () => {
    mockHasOwnerAccess.mockResolvedValue(false);

    const valid = await restartAction.validate?.(
      { agentId: "agent-1" } as never,
      { content: { text: "restart please" } } as never,
      {} as never,
    );
    expect(valid).toBe(false);

    const runtime = {
      agentId: "agent-1",
      createMemory: vi.fn(),
    } as never;
    const result = await restartAction.handler?.(
      runtime,
      {
        entityId: "user-1",
        roomId: "room-1",
        worldId: "world-1",
        content: { text: "restart please" },
      } as never,
      {} as never,
      {} as never,
    );

    expect(result).toMatchObject({
      success: false,
      text: expect.stringContaining("only the owner"),
    });
    expect(runtime.createMemory).not.toHaveBeenCalled();
    expect(mockRequestRestart).not.toHaveBeenCalled();
  });

  it("still restarts for the owner after an explicit request", async () => {
    const runtime = {
      agentId: "agent-1",
      createMemory: vi.fn().mockResolvedValue(undefined),
    } as never;

    const result = await restartAction.handler?.(
      runtime,
      {
        entityId: "owner-1",
        roomId: "room-1",
        worldId: "world-1",
        content: { text: "restart please" },
      } as never,
      {} as never,
      { parameters: { reason: "reload config" } } as never,
    );

    expect(result).toMatchObject({
      success: true,
      text: "Restarting… (reload config)",
    });
    expect(runtime.createMemory).toHaveBeenCalledOnce();
    await vi.runAllTimersAsync();
    expect(mockRequestRestart).toHaveBeenCalledWith("reload config");
  });

  it("requires owner access for terminal execution", async () => {
    mockHasOwnerAccess.mockResolvedValue(false);

    const valid = await terminalAction.validate?.(
      { agentId: "agent-1" } as never,
      { content: { text: "run ls -la" } } as never,
      {} as never,
    );
    expect(valid).toBe(false);

    const result = await terminalAction.handler?.(
      { agentId: "agent-1" } as never,
      {
        entityId: "user-1",
        content: { text: "run ls -la" },
      } as never,
      {} as never,
      { parameters: { command: "ls -la" } } as never,
    );

    expect(result).toMatchObject({
      success: false,
      text: expect.stringContaining("only the owner"),
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("still executes terminal commands for the owner", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
    } as Response);

    const result = await terminalAction.handler?.(
      { agentId: "agent-1" } as never,
      {
        entityId: "owner-1",
        content: { text: "run ls -la" },
      } as never,
      {} as never,
      { parameters: { command: "ls -la" } } as never,
    );

    expect(result).toMatchObject({
      success: true,
      data: { command: "ls -la" },
    });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("requires owner access to save the owner name", async () => {
    mockHasOwnerAccess.mockResolvedValue(false);

    const valid = await setUserNameAction.validate?.(
      { agentId: "agent-1" } as never,
      {
        entityId: "user-1",
        content: { source: "client_chat", text: "call me Sam" },
      } as never,
      {} as never,
    );
    expect(valid).toBe(false);

    const result = await setUserNameAction.handler?.(
      { agentId: "agent-1" } as never,
      {
        entityId: "user-1",
        content: { source: "client_chat", text: "call me Sam" },
      } as never,
      {} as never,
      { parameters: { name: "Sam" } } as never,
    );

    expect(result).toMatchObject({
      success: false,
      data: { error: "PERMISSION_DENIED" },
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("still saves the owner name for the owner", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
      } as Response);

    const valid = await setUserNameAction.validate?.(
      { agentId: "agent-1" } as never,
      {
        entityId: "owner-1",
        content: { source: "client_chat", text: "call me Sam" },
      } as never,
      {} as never,
    );
    expect(valid).toBe(true);

    const result = await setUserNameAction.handler?.(
      { agentId: "agent-1" } as never,
      {
        entityId: "owner-1",
        content: { source: "client_chat", text: "call me Sam" },
      } as never,
      {} as never,
      { parameters: { name: "Sam" } } as never,
    );

    expect(result).toMatchObject({
      success: true,
      data: { name: "Sam" },
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("requires admin access for slash skill commands", async () => {
    addRegisteredSkillSlug("github");
    mockHasAdminAccess.mockResolvedValue(false);

    const valid = await skillCommandAction.validate?.(
      { agentId: "agent-1" } as never,
      { entityId: "user-1", content: { text: "/github open an issue" } } as never,
    );
    expect(valid).toBe(false);

    const callback = vi.fn();
    const result = await skillCommandAction.handler?.(
      { agentId: "agent-1" } as never,
      { entityId: "user-1", content: { text: "/github open an issue" } } as never,
      {} as never,
      {} as never,
      callback,
    );

    expect(result).toMatchObject({
      success: false,
      text: expect.stringContaining("owner or admin access"),
    });
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("owner or admin access"),
      }),
    );
  });

  it("still dispatches slash skill commands for admins", async () => {
    addRegisteredSkillSlug("github");
    const callback = vi.fn();
    const runtime = {
      agentId: "agent-1",
      getService: vi.fn().mockReturnValue({
        getSkillInstructions: () => ({ body: "Follow GitHub workflow." }),
        getLoadedSkills: () => [
          {
            slug: "github",
            name: "GitHub",
            description: "GitHub workflow",
          },
        ],
      }),
    } as never;

    await skillCommandAction.handler?.(
      runtime,
      { entityId: "owner-1", content: { text: "/github open an issue" } } as never,
      {} as never,
      {} as never,
      callback,
    );

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("Follow GitHub workflow."),
      }),
    );
  });

  it("requires owner access for stream control", async () => {
    mockHasOwnerAccess.mockResolvedValue(false);

    const valid = await goLiveAction.validate?.(
      { agentId: "agent-1" } as never,
      { entityId: "user-1" } as never,
      {} as never,
    );
    expect(valid).toBe(false);

    const deny = await goOfflineAction.handler?.(
      { agentId: "agent-1" } as never,
      { entityId: "user-1" } as never,
      {} as never,
      {} as never,
    );
    expect(deny).toMatchObject({
      success: false,
      text: expect.stringContaining("only the owner"),
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("still allows the owner to go live", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ live: true }),
    } as Response);

    const result = await goLiveAction.handler?.(
      { agentId: "agent-1" } as never,
      { entityId: "owner-1" } as never,
      {} as never,
      {} as never,
    );

    expect(result).toMatchObject({
      success: true,
      text: "Stream is now live! 🔴",
    });
  });
});
