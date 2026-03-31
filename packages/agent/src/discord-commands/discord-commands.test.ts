/**
 * Tests for Discord slash commands integration.
 *
 * Validates command definitions, handler dispatch, and validator logic
 * without requiring a live Discord connection or full elizaOS runtime.
 */

import { describe, expect, it, vi } from "vitest";
import { agentsCommand } from "./agents";
import { codeCommand } from "./code";
import { statusCommand } from "./status";
import { cronCommand } from "./cron";
import { workspaceCommand } from "./workspace";
import { issueCommand } from "./issue";
import { allowAll, requireAdmin } from "./validators";
import { ApplicationCommandOptionType, escapeXml } from "./types";
import { makeCommandMemory } from "./utils";
import type { DiscordSlashCommand } from "./types";

// ---------------------------------------------------------------------------
// Command definition validation
// ---------------------------------------------------------------------------

describe("command definitions", () => {
  const commands: DiscordSlashCommand[] = [
    codeCommand,
    agentsCommand,
    statusCommand,
    cronCommand,
    workspaceCommand,
    issueCommand,
  ];

  it("each command has a non-empty name and description", () => {
    for (const cmd of commands) {
      expect(cmd.name.length).toBeGreaterThan(0);
      expect(cmd.description.length).toBeGreaterThan(0);
    }
  });

  it("codeCommand has required agent and task options", () => {
    const optionNames = (codeCommand.options ?? []).map((o) => o.name);
    expect(optionNames).toContain("agent");
    expect(optionNames).toContain("task");
  });

  it("agentsCommand has list, status, stop, send subcommands", () => {
    const subcommands = (agentsCommand.options ?? []).map((o) => o.name);
    expect(subcommands).toContain("list");
    expect(subcommands).toContain("status");
    expect(subcommands).toContain("stop");
    expect(subcommands).toContain("send");
  });

  it("statusCommand has no required options", () => {
    const required = (statusCommand.options ?? []).filter((o) => o.required);
    expect(required).toHaveLength(0);
  });

  it("statusCommand uses allowAll validator (available to everyone)", () => {
    // Reviewer fix 1c: /status should not be admin-only
    expect(statusCommand.validator).toBe(allowAll);
  });

  it("codeCommand and agentsCommand are guild-only", () => {
    expect(codeCommand.guildOnly).toBe(true);
    expect(agentsCommand.guildOnly).toBe(true);
  });

  it("cronCommand has list, create, delete, run subcommands", () => {
    const subcommands = (cronCommand.options ?? []).map((o) => o.name);
    expect(subcommands).toContain("list");
    expect(subcommands).toContain("create");
    expect(subcommands).toContain("delete");
    expect(subcommands).toContain("run");
  });

  it("workspaceCommand has provision and finalize subcommands", () => {
    const subcommands = (workspaceCommand.options ?? []).map((o) => o.name);
    expect(subcommands).toContain("provision");
    expect(subcommands).toContain("finalize");
  });

  it("issueCommand has create and list subcommands", () => {
    const subcommands = (issueCommand.options ?? []).map((o) => o.name);
    expect(subcommands).toContain("create");
    expect(subcommands).toContain("list");
  });

  it("issueCommand create subcommand has required repo, title, body options", () => {
    const createSub = (issueCommand.options ?? []).find((o) => o.name === "create");
    expect(createSub).toBeDefined();
    const optNames = (createSub?.options ?? []).map((o) => o.name);
    expect(optNames).toContain("repo");
    expect(optNames).toContain("title");
    expect(optNames).toContain("body");
  });
});

// ---------------------------------------------------------------------------
// Local ApplicationCommandOptionType enum (1d — no discord.js hard dep)
// ---------------------------------------------------------------------------

describe("ApplicationCommandOptionType local enum", () => {
  it("Subcommand = 1", () => {
    expect(ApplicationCommandOptionType.Subcommand).toBe(1);
  });

  it("String = 3", () => {
    expect(ApplicationCommandOptionType.String).toBe(3);
  });

  it("Boolean = 5", () => {
    expect(ApplicationCommandOptionType.Boolean).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// escapeXml utility
// ---------------------------------------------------------------------------

describe("escapeXml", () => {
  it("escapes &, <, >, \", '", () => {
    expect(escapeXml('a & b < c > d "e" \'f\'')).toBe(
      "a &amp; b &lt; c &gt; d &quot;e&quot; &apos;f&apos;",
    );
  });

  it("returns plain strings unchanged", () => {
    expect(escapeXml("hello world")).toBe("hello world");
  });
});

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

describe("allowAll", () => {
  it("always returns true", async () => {
    const result = await allowAll({} as never, {} as never);
    expect(result).toBe(true);
  });
});

describe("requireAdmin", () => {
  it("returns false when interaction has no guild", async () => {
    const interaction = { guild: null, user: { id: "u1" } } as never;
    const runtime = {
      agentId: "agent-1",
      getWorld: vi.fn().mockResolvedValue(null),
    } as never;

    const result = await requireAdmin(interaction, runtime);
    expect(result).toBe(false);
  });

  it("returns false when world does not exist", async () => {
    const interaction = {
      guild: { id: "guild-1" },
      user: { id: "u1" },
    } as never;
    const runtime = {
      agentId: "agent-1",
      getWorld: vi.fn().mockResolvedValue(null),
    } as never;

    const result = await requireAdmin(interaction, runtime);
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// setupDiscordCommands event wiring
// ---------------------------------------------------------------------------

describe("setupDiscordCommands", () => {
  it("registers DISCORD_SERVER_CONNECTED, DISCORD_SLASH_COMMAND, and DISCORD_MESSAGE_RECEIVED events", async () => {
    const { setupDiscordCommands } = await import("./index");

    const registeredEvents: string[] = [];
    const runtime = {
      agentId: "agent-1",
      registerEvent: vi.fn((event: string) => {
        registeredEvents.push(event);
      }),
      emitEvent: vi.fn().mockResolvedValue(undefined),
      getAllActions: vi.fn().mockReturnValue([]),
    } as never;

    setupDiscordCommands(runtime);

    expect(registeredEvents).toContain("DISCORD_SERVER_CONNECTED");
    expect(registeredEvents).toContain("DISCORD_SLASH_COMMAND");
    // Phase 4: vision auto-trigger
    expect(registeredEvents).toContain("DISCORD_MESSAGE_RECEIVED");
  });
});

// ---------------------------------------------------------------------------
// makeCommandMemory utility (1g — typed Memory helper)
// ---------------------------------------------------------------------------

describe("makeCommandMemory", () => {
  it("returns an object with the expected shape", () => {
    const runtime = {
      agentId: "agent-1",
    } as never;

    const interaction = {
      user: { id: "user-1" },
      channelId: "channel-1",
    } as never;

    const memory = makeCommandMemory(runtime, interaction, {
      idSuffix: "test",
      text: "hello",
      actions: ["SOME_ACTION"],
    });

    expect(memory).toMatchObject({
      content: {
        text: "hello",
        source: "discord",
        actions: ["SOME_ACTION"],
      },
    });
    expect(typeof memory.id).toBe("string");
    expect(typeof memory.entityId).toBe("string");
    expect(typeof memory.roomId).toBe("string");
  });
});
