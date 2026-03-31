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
import { allowAll, requireAdmin } from "./validators";
import type { DiscordSlashCommand } from "./types";

// ---------------------------------------------------------------------------
// Command definition validation
// ---------------------------------------------------------------------------

describe("command definitions", () => {
  const commands: DiscordSlashCommand[] = [codeCommand, agentsCommand, statusCommand];

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

  it("codeCommand and agentsCommand are guild-only", () => {
    expect(codeCommand.guildOnly).toBe(true);
    expect(agentsCommand.guildOnly).toBe(true);
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
  it("registers DISCORD_SERVER_CONNECTED and DISCORD_SLASH_COMMAND events", async () => {
    const { setupDiscordCommands } = await import("./index");

    const registeredEvents: string[] = [];
    const runtime = {
      agentId: "agent-1",
      registerEvent: vi.fn((event: string) => {
        registeredEvents.push(event);
      }),
      emitEvent: vi.fn().mockResolvedValue(undefined),
    } as never;

    setupDiscordCommands(runtime);

    expect(registeredEvents).toContain("DISCORD_SERVER_CONNECTED");
    expect(registeredEvents).toContain("DISCORD_SLASH_COMMAND");
  });
});
