import type {
  Action,
  IAgentRuntime,
  Memory,
  Plugin,
  State,
} from "@elizaos/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyPluginRoleGating,
  ROLE_GATED_PLUGINS,
} from "../plugin-role-gating";

// Stub the roles module so we don't pull in the full runtime.
vi.mock("../roles/src/index.js", () => ({
  checkSenderRole: vi.fn(),
}));

async function getCheckSenderRoleMock() {
  const mod = await import("../roles/src/index.js");
  return (mod as unknown as { checkSenderRole: ReturnType<typeof vi.fn> })
    .checkSenderRole;
}

function makeAction(name: string, validate?: Action["validate"]): Action {
  return {
    name,
    description: `Test action ${name}`,
    similes: [],
    examples: [],
    validate: validate ?? (async () => true),
    handler: async () => ({ success: true }),
  };
}

function makePlugin(name: string, actions: Action[]): Plugin {
  return { name, description: `Test plugin ${name}`, actions };
}

const fakeRuntime = {} as IAgentRuntime;
const fakeMessage = { entityId: "user-1" } as Memory;
const fakeState = {} as State;

describe("plugin-role-gating", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("gates EVM and Solana plugins", () => {
    expect(ROLE_GATED_PLUGINS["@elizaos/plugin-evm"]).toBe("admin");
    expect(ROLE_GATED_PLUGINS["@elizaos/plugin-solana"]).toBe("admin");
  });

  it("wraps validate for gated plugin actions", () => {
    const action = makeAction("SEND_TOKEN");
    const original = action.validate;
    const plugin = makePlugin("@elizaos/plugin-evm", [action]);

    applyPluginRoleGating([plugin]);

    expect(action.validate).not.toBe(original);
  });

  it("does not wrap validate for ungated plugins", () => {
    const action = makeAction("CHAT");
    const original = action.validate;
    const plugin = makePlugin("@elizaos/plugin-chat", [action]);

    applyPluginRoleGating([plugin]);

    expect(action.validate).toBe(original);
  });

  it("allows admin users through gated actions", async () => {
    const mock = await getCheckSenderRoleMock();
    mock.mockResolvedValue({
      entityId: "user-1",
      role: "ADMIN",
      isOwner: false,
      isAdmin: true,
    });

    const action = makeAction("SEND_TOKEN");
    const plugin = makePlugin("@elizaos/plugin-evm", [action]);
    applyPluginRoleGating([plugin]);

    const result = await action.validate?.(fakeRuntime, fakeMessage, fakeState);
    expect(result).toBe(true);
  });

  it("allows owner users through gated actions", async () => {
    const mock = await getCheckSenderRoleMock();
    mock.mockResolvedValue({
      entityId: "owner-1",
      role: "OWNER",
      isOwner: true,
      isAdmin: true,
    });

    const action = makeAction("SEND_TOKEN");
    const plugin = makePlugin("@elizaos/plugin-solana", [action]);
    applyPluginRoleGating([plugin]);

    const result = await action.validate?.(fakeRuntime, fakeMessage, fakeState);
    expect(result).toBe(true);
  });

  it("blocks non-admin users from gated actions", async () => {
    const mock = await getCheckSenderRoleMock();
    mock.mockResolvedValue({
      entityId: "user-2",
      role: "MEMBER",
      isOwner: false,
      isAdmin: false,
    });

    const action = makeAction("SEND_TOKEN");
    const plugin = makePlugin("@elizaos/plugin-evm", [action]);
    applyPluginRoleGating([plugin]);

    const result = await action.validate?.(fakeRuntime, fakeMessage, fakeState);
    expect(result).toBe(false);
  });

  it("falls through to original validate when no world context", async () => {
    const mock = await getCheckSenderRoleMock();
    mock.mockResolvedValue(null); // no world context

    const innerValidate = vi.fn().mockResolvedValue(false);
    const action = makeAction("SEND_TOKEN", innerValidate);
    const plugin = makePlugin("@elizaos/plugin-evm", [action]);
    applyPluginRoleGating([plugin]);

    const result = await action.validate?.(fakeRuntime, fakeMessage, fakeState);
    expect(result).toBe(false);
    expect(innerValidate).toHaveBeenCalledWith(
      fakeRuntime,
      fakeMessage,
      fakeState,
    );
  });

  it("calls original validate after passing role check", async () => {
    const mock = await getCheckSenderRoleMock();
    mock.mockResolvedValue({
      entityId: "admin-1",
      role: "ADMIN",
      isOwner: false,
      isAdmin: true,
    });

    const innerValidate = vi.fn().mockResolvedValue(false);
    const action = makeAction("SEND_TOKEN", innerValidate);
    const plugin = makePlugin("@elizaos/plugin-evm", [action]);
    applyPluginRoleGating([plugin]);

    const result = await action.validate?.(fakeRuntime, fakeMessage, fakeState);
    // Admin passes role check, but original validate returns false
    expect(result).toBe(false);
    expect(innerValidate).toHaveBeenCalled();
  });

  it("skips plugins with no actions", () => {
    const plugin = makePlugin("@elizaos/plugin-evm", []);
    // Should not throw
    applyPluginRoleGating([plugin]);
  });
});
