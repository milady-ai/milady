import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockHasOwnerAccess,
  mockHasAdminAccess,
  mockLoadWorkspaceInitFiles,
  mockCheckSenderRole,
  mockResolveCanonicalOwnerIdForMessage,
} = vi.hoisted(() => ({
  mockHasOwnerAccess: vi.fn(),
  mockHasAdminAccess: vi.fn(),
  mockLoadWorkspaceInitFiles: vi.fn(),
  mockCheckSenderRole: vi.fn(),
  mockResolveCanonicalOwnerIdForMessage: vi.fn(),
}));

vi.mock("../security/access.js", () => ({
  hasOwnerAccess: mockHasOwnerAccess,
  hasAdminAccess: mockHasAdminAccess,
}));

vi.mock("./workspace.js", () => ({
  DEFAULT_AGENT_WORKSPACE_DIR: "/tmp/workspace",
  filterInitFilesForSession: (files: unknown[]) => files,
  isDefaultBoilerplate: () => false,
  loadWorkspaceInitFiles: mockLoadWorkspaceInitFiles,
  resolveDefaultAgentWorkspaceDir: () => "/tmp/workspace",
}));

vi.mock("@elizaos/core/roles", () => ({
  checkSenderRole: mockCheckSenderRole,
  resolveCanonicalOwnerIdForMessage: mockResolveCanonicalOwnerIdForMessage,
}));

import { activityProfileProvider } from "./activity-profile";
import { createAdminTrustProvider } from "./admin-trust";
import { createDynamicSkillProvider } from "./skill-provider";
import { uiCatalogProvider } from "./ui-catalog";
import { createUserNameProvider } from "./user-name";
import { createWorkspaceProvider } from "./workspace-provider";

describe("provider role gating", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    mockHasOwnerAccess.mockReset().mockResolvedValue(true);
    mockHasAdminAccess.mockReset().mockResolvedValue(true);
    mockLoadWorkspaceInitFiles.mockReset().mockResolvedValue([
      {
        name: "AGENTS.md",
        path: "/tmp/workspace/AGENTS.md",
        content: "Internal instructions",
        missing: false,
      },
    ]);
    mockCheckSenderRole.mockReset().mockResolvedValue({
      role: "USER",
      isOwner: false,
      isAdmin: false,
    });
    mockResolveCanonicalOwnerIdForMessage
      .mockReset()
      .mockResolvedValue("owner-1");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("gates workspace context to admins", async () => {
    const provider = createWorkspaceProvider({
      workspaceDir: "/tmp/workspace",
    });
    mockHasAdminAccess.mockResolvedValue(false);

    const denied = await provider.get(
      { agentId: "agent-1" } as never,
      { entityId: "user-1", content: {} } as never,
      {} as never,
    );
    expect(denied).toMatchObject({
      text: "",
      data: { skipped: "role_gate" },
    });

    mockHasAdminAccess.mockResolvedValue(true);
    const allowed = await provider.get(
      { agentId: "agent-1" } as never,
      { entityId: "owner-1", content: {} } as never,
      {} as never,
    );
    expect(allowed.text).toContain("Internal instructions");
  });

  it("gates dynamic skill injection to admins", async () => {
    const provider = createDynamicSkillProvider();
    const runtime = {
      getService: vi.fn().mockReturnValue({
        getLoadedSkills: () => [
          {
            slug: "github",
            name: "GitHub",
            description: "Use when you need GitHub automation",
          },
        ],
        getSkillInstructions: () => ({ body: "GitHub instructions" }),
      }),
    } as never;

    mockHasAdminAccess.mockResolvedValue(false);
    const denied = await provider.get(
      runtime,
      { entityId: "user-1", content: { text: "github issue" } } as never,
      { recentMessages: [] } as never,
    );
    expect(denied).toEqual({ text: "", values: {}, data: {} });

    mockHasAdminAccess.mockResolvedValue(true);
    const allowed = await provider.get(
      runtime,
      { entityId: "owner-1", content: { text: "github issue" } } as never,
      { recentMessages: [] } as never,
    );
    expect(allowed.text).toContain("GitHub");
  });

  it("gates the saved owner-name context to the owner", async () => {
    const provider = createUserNameProvider();
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ ui: { ownerName: "Shaw" } }),
    } as Response);

    mockHasOwnerAccess.mockResolvedValue(false);
    const denied = await provider.get(
      { agentId: "agent-1" } as never,
      {
        entityId: "user-1",
        content: { source: "client_chat", text: "hi" },
      } as never,
      {} as never,
    );
    expect(denied.text).toBe("");

    mockHasOwnerAccess.mockResolvedValue(true);
    const allowed = await provider.get(
      { agentId: "agent-1" } as never,
      {
        entityId: "owner-1",
        content: { source: "client_chat", text: "hi" },
      } as never,
      {} as never,
    );
    expect(allowed.text).toContain("Shaw");
  });

  it("gates the plugin-configuration UI catalog to admins", async () => {
    mockHasAdminAccess.mockResolvedValue(false);
    const denied = await uiCatalogProvider.get(
      { agentId: "agent-1" } as never,
      { entityId: "user-1", content: { channelType: undefined } } as never,
      {} as never,
    );
    expect(denied.text).toBe("");

    mockHasAdminAccess.mockResolvedValue(true);
    const allowed = await uiCatalogProvider.get(
      { agentId: "agent-1" } as never,
      { entityId: "owner-1", content: { channelType: undefined } } as never,
      {} as never,
    );
    expect(allowed.text).toContain("[CONFIG:pluginId]");
  });

  it("blocks activity-profile context for non-admin client chat callers", async () => {
    mockHasAdminAccess.mockResolvedValue(false);

    const result = await activityProfileProvider.get(
      { agentId: "agent-1" } as never,
      {
        entityId: "user-1",
        content: { source: "client_chat", text: "hi" },
      } as never,
      {} as never,
    );

    expect(result).toEqual({ text: "", values: {}, data: {} });
  });

  it("hides canonical owner identifiers from non-admin trust context", async () => {
    const provider = createAdminTrustProvider();
    mockHasAdminAccess.mockResolvedValue(false);

    const denied = await provider.get(
      { agentId: "agent-1" } as never,
      { entityId: "user-1", content: { text: "hi" } } as never,
      {} as never,
    );
    expect(denied.values).toMatchObject({
      trustedAdmin: false,
      adminEntityId: "",
    });
    expect(denied.data).toMatchObject({
      ownerId: null,
    });

    mockHasAdminAccess.mockResolvedValue(true);
    mockCheckSenderRole.mockResolvedValue({
      role: "OWNER",
      isOwner: true,
      isAdmin: true,
    });
    const allowed = await provider.get(
      { agentId: "agent-1" } as never,
      { entityId: "owner-1", content: { text: "hi" } } as never,
      {} as never,
    );
    expect(allowed.values).toMatchObject({
      trustedAdmin: true,
      adminEntityId: "owner-1",
    });
    expect(allowed.data).toMatchObject({
      ownerId: "owner-1",
    });
  });
});
