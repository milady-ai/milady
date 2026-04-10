import type { IAgentRuntime } from "@elizaos/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const configMocks = vi.hoisted(() => ({
  loadElizaConfig: vi.fn(),
  saveElizaConfig: vi.fn(),
}));

vi.mock("../config/config.js", () => ({
  loadElizaConfig: configMocks.loadElizaConfig,
  saveElizaConfig: configMocks.saveElizaConfig,
}));

import {
  MiladyCharacterPersistenceService,
  syncCharacterIntoConfig,
} from "./character-persistence";

describe("syncCharacterIntoConfig", () => {
  it("copies runtime character fields into the primary agent config", () => {
    const config = {
      agents: {
        list: [{ id: "main", default: true, name: "Old Milady" }],
      },
      ui: {
        assistant: {
          name: "Old Milady",
        },
      },
    };

    syncCharacterIntoConfig(config as never, {
      name: "Milady",
      username: "milady",
      bio: ["Helpful", "Direct"],
      system: "You are Milady.",
      adjectives: ["helpful"],
      topics: ["agents"],
      style: { chat: ["Keep it short."] },
      postExamples: ["example post"],
      messageExamples: [{ examples: [] }],
    } as never);

    expect(config.agents?.list?.[0]).toMatchObject({
      name: "Milady",
      username: "milady",
      bio: ["Helpful", "Direct"],
      system: "You are Milady.",
      adjectives: ["helpful"],
      topics: ["agents"],
      style: { chat: ["Keep it short."] },
      postExamples: ["example post"],
    });
    expect(config.ui?.assistant?.name).toBe("Milady");
  });
});

describe("MiladyCharacterPersistenceService", () => {
  let runtime: IAgentRuntime & {
    updateAgent: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    configMocks.loadElizaConfig.mockReset();
    configMocks.saveElizaConfig.mockReset();
    configMocks.loadElizaConfig.mockReturnValue({
      agents: {
        list: [{ id: "main", default: true, name: "Old Milady" }],
      },
      ui: {
        assistant: {
          name: "Old Milady",
        },
      },
    });

    runtime = {
      agentId: "agent-1",
      character: {
        name: "Milady",
        bio: ["Helpful assistant"],
        system: "You are Milady.",
        topics: ["agents"],
        style: { chat: ["Keep responses concise."] },
        metadata: { existing: true },
      },
      updateAgent: vi.fn(async () => undefined),
      getSetting: vi.fn(() => null),
    } as unknown as IAgentRuntime & {
      updateAgent: ReturnType<typeof vi.fn>;
    };
  });

  it("persists runtime character changes to config and agent storage", async () => {
    const service = new MiladyCharacterPersistenceService(runtime);

    const result = await service.persistCharacter();

    expect(result).toEqual({ success: true });
    expect(configMocks.saveElizaConfig).toHaveBeenCalledTimes(1);
    expect(runtime.updateAgent).toHaveBeenCalledWith("agent-1", {
      name: "Milady",
      metadata: {
        existing: true,
        character: {
          name: "Milady",
          bio: ["Helpful assistant"],
          system: "You are Milady.",
          topics: ["agents"],
          style: { chat: ["Keep responses concise."] },
        },
      },
    });
  });

  it("implements the required static start method", async () => {
    const service = await MiladyCharacterPersistenceService.start(runtime);

    expect(service).toBeInstanceOf(MiladyCharacterPersistenceService);
  });
});
