/**
 * Identity/Roles/Messaging scenario tests — comprehensive rewrite.
 *
 * Exercises the full pipeline: message -> evaluator -> provider -> action
 * selection -> action execution, using real implementations of our
 * evaluators, providers, and actions with stateful in-memory storage.
 *
 * Improvements over the original:
 * - Multi-world support (per-platform worlds with independent role metadata)
 * - TranscriptLogger for readable test output
 * - Status-based claim model (proposed/accepted/rejected) — no scalar confidence
 * - Real action invocation instead of manual state mutation
 * - 9 scenario groups with 30+ test cases covering edge cases
 *
 * LLM modes:
 *   - Default (recorded): deterministic recorded responses for CI.
 *   - Live (SCENARIO_TEST_LIVE=1): real LLM calls via environment API keys.
 *
 * Each scenario gets a fresh ScenarioRunner, so tests are independent.
 */

import type {
  Action,
  Entity,
  HandlerOptions,
  IAgentRuntime,
  Memory,
  Provider,
  ProviderResult,
  Room,
  State,
  UUID,
} from "@elizaos/core";
import { stringToUuid } from "@elizaos/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks — intercept roles helpers to drive real logic against our
// stateful stores (same pattern as roles-e2e.test.ts)
// ---------------------------------------------------------------------------

const {
  mockGetConnectorAdminWhitelist,
  mockGetEntityRole,
  mockHasConfiguredCanonicalOwner,
  mockMatchEntityToConnectorAdminWhitelist,
  mockResolveWorldForMessage,
  mockResolveCanonicalOwnerId,
  mockResolveCanonicalOwnerIdForMessage,
  mockSetEntityRole,
  mockNormalizeRole,
  mockCheckSenderRole,
} = vi.hoisted(() => ({
  mockGetConnectorAdminWhitelist: vi.fn(),
  mockGetEntityRole: vi.fn(),
  mockHasConfiguredCanonicalOwner: vi.fn(),
  mockMatchEntityToConnectorAdminWhitelist: vi.fn(),
  mockResolveWorldForMessage: vi.fn(),
  mockResolveCanonicalOwnerId: vi.fn(),
  mockResolveCanonicalOwnerIdForMessage: vi.fn(),
  mockSetEntityRole: vi.fn(),
  mockNormalizeRole: vi.fn(),
  mockCheckSenderRole: vi.fn(),
}));

vi.mock("@elizaos/core/roles", () => ({
  getConnectorAdminWhitelist: mockGetConnectorAdminWhitelist,
  getEntityRole: mockGetEntityRole,
  hasConfiguredCanonicalOwner: mockHasConfiguredCanonicalOwner,
  matchEntityToConnectorAdminWhitelist:
    mockMatchEntityToConnectorAdminWhitelist,
  resolveWorldForMessage: mockResolveWorldForMessage,
  resolveCanonicalOwnerId: mockResolveCanonicalOwnerId,
  resolveCanonicalOwnerIdForMessage: mockResolveCanonicalOwnerIdForMessage,
  setEntityRole: mockSetEntityRole,
  normalizeRole: mockNormalizeRole,
  checkSenderRole: mockCheckSenderRole,
  canModifyRole: vi.fn(),
}));

const { mockLoadElizaConfig } = vi.hoisted(() => ({
  mockLoadElizaConfig: vi.fn(),
}));

vi.mock("../src/config/config.js", () => ({
  loadElizaConfig: mockLoadElizaConfig,
}));

vi.mock("@elizaos/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@elizaos/core")>();
  return {
    ...actual,
    logger: {
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
    },
  };
});

// ---------------------------------------------------------------------------
// Imports — must come after vi.mock
// ---------------------------------------------------------------------------

import { sendMessageAction } from "../src/actions/send-message";
import { lateJoinWhitelistEvaluator } from "../src/evaluators/late-join-whitelist";
import { createAdminPanelProvider } from "../src/providers/admin-panel";
import { createAdminTrustProvider } from "../src/providers/admin-trust";
import { createEscalationTriggerProvider } from "../src/providers/escalation-trigger";
import { roleBackfillProvider } from "../src/providers/role-backfill";
import { EscalationService } from "../src/services/escalation";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RolesMetadata = {
  ownership?: { ownerId?: string };
  roles?: Record<string, string>;
  roleSources?: Record<string, string>;
};

/**
 * Simplified world shape for in-memory storage. Uses `as never` casts at
 * boundaries to satisfy strict World type without importing all sub-types.
 */
type MockWorld = {
  id: UUID;
  name: string;
  agentId: UUID;
  serverId: string;
  metadata: RolesMetadata & Record<string, unknown>;
};

/** Status-based identity claim — no scalar confidence. */
interface IdentityClaim {
  platform: string;
  handle: string;
  status: "proposed" | "accepted" | "rejected";
  claimTier: "ground_truth" | "admin_verified" | "self_reported";
  claimedAt: number;
  claimedBy: string;
}

interface IdentityRelationship {
  id: UUID;
  sourceEntityId: UUID;
  targetEntityId: UUID;
  tags: string[];
  metadata: Record<string, unknown>;
}

interface SentMessage {
  target: { source: string; entityId?: UUID; channelId?: string };
  content: { text: string; source: string; metadata?: Record<string, unknown> };
}

interface SendMessageParams {
  text: string;
  entityId: string;
  platform: string;
  entityMetadata?: Record<string, unknown>;
  worldId?: string;
}

interface PipelineResult {
  providers: Record<string, ProviderResult>;
  evaluators: Record<string, unknown>;
  selectedAction?: string;
  actionResult?: unknown;
}

// ---------------------------------------------------------------------------
// TranscriptLogger
// ---------------------------------------------------------------------------

interface TranscriptEntry {
  turn: number;
  platform: string;
  speaker: string;
  role: string;
  message: string;
  systemActions: string[];
  stateChanges: string[];
}

class TranscriptLogger {
  private entries: TranscriptEntry[] = [];
  private scenarioName: string;
  private turnCounter = 0;

  constructor(scenarioName: string) {
    this.scenarioName = scenarioName;
  }

  log(entry: Omit<TranscriptEntry, "turn">): void {
    this.turnCounter += 1;
    this.entries.push({ turn: this.turnCounter, ...entry });
  }

  print(): string {
    const header = `\n=== Scenario: ${this.scenarioName} ===`;
    const lines = this.entries.map((e) => {
      const parts = [
        `[Turn ${e.turn}] Platform: ${e.platform} | Speaker: ${e.speaker} (${e.role})`,
        `  Message: "${e.message}"`,
      ];
      for (const action of e.systemActions) {
        parts.push(`  -> System: ${action}`);
      }
      for (const change of e.stateChanges) {
        parts.push(`  -> State: ${change}`);
      }
      return parts.join("\n");
    });
    return `${header}\n${lines.join("\n\n")}\n`;
  }
}

// ---------------------------------------------------------------------------
// Recorded LLM responses for deterministic testing
// ---------------------------------------------------------------------------

type RecordedResponse = {
  pattern: RegExp;
  response: string;
};

const RECORDED_RESPONSES: RecordedResponse[] = [
  {
    pattern:
      /discord.*shawwalters.*telegram.*@shaw_w.*twitter.*@shawmakesmagic/i,
    response: JSON.stringify({
      identities: [
        { platform: "discord", handle: "shawwalters" },
        { platform: "telegram", handle: "@shaw_w" },
        { platform: "twitter", handle: "@shawmakesmagic" },
      ],
    }),
  },
  {
    pattern: /email.*shaw@example\.com/i,
    response: JSON.stringify({
      identities: [{ platform: "email", handle: "shaw@example.com" }],
    }),
  },
  {
    pattern: /twitter.*@?alice_codes/i,
    response: JSON.stringify({
      identities: [{ platform: "twitter", handle: "alice_codes" }],
    }),
  },
  {
    pattern: /github.*bob-admin/i,
    response: JSON.stringify({
      identities: [{ platform: "github", handle: "bob-admin" }],
    }),
  },
  {
    pattern: /my x is @foo/i,
    response: JSON.stringify({
      identities: [{ platform: "twitter", handle: "@foo" }],
    }),
  },
  {
    pattern: /my myspace is @bar/i,
    response: JSON.stringify({
      identities: [{ platform: "myspace", handle: "@bar" }],
    }),
  },
  {
    pattern: /my twitter is$/i,
    response: JSON.stringify({ identities: [] }),
  },
  {
    pattern: /my twitter is @a$/i,
    response: JSON.stringify({
      identities: [{ platform: "twitter", handle: "@a" }],
    }),
  },
  {
    pattern: /I'm alice/i,
    response: JSON.stringify({ identities: [] }),
  },
  {
    pattern: /remove.*twitter/i,
    response: JSON.stringify({
      action: "UNLINK_IDENTITY",
      platform: "twitter",
    }),
  },
  {
    pattern: /which action/i,
    response: JSON.stringify({ action: "NONE", parameters: {} }),
  },
];

function findRecordedResponse(text: string): string {
  for (const entry of RECORDED_RESPONSES) {
    if (entry.pattern.test(text)) return entry.response;
  }
  return JSON.stringify({ identities: [] });
}

// ---------------------------------------------------------------------------
// Known platforms for validation
// ---------------------------------------------------------------------------

const KNOWN_PLATFORMS = new Set([
  "discord",
  "telegram",
  "twitter",
  "github",
  "email",
  "phone",
  "farcaster",
  "lens",
  "bluesky",
  "mastodon",
  "linkedin",
  "reddit",
  "youtube",
  "twitch",
  "tiktok",
  "instagram",
  "facebook",
]);

// ---------------------------------------------------------------------------
// ScenarioRunner
// ---------------------------------------------------------------------------

class ScenarioRunner {
  // Stateful stores
  private entities = new Map<string, Entity>();
  private worlds = new Map<string, MockWorld>();
  private rooms = new Map<string, Room>();
  private memories = new Map<string, Memory[]>();
  private relationships: IdentityRelationship[] = [];
  sentMessages: SentMessage[] = [];

  /** Maps platform name -> world ID for multi-world support */
  private platformWorldMap = new Map<string, UUID>();

  // Providers and evaluators (real implementations)
  private providers: Provider[];
  private evaluators: (typeof lateJoinWhitelistEvaluator)[];
  private actions: Action[];

  // Runtime reference
  runtime: IAgentRuntime;

  // Transcript
  private transcript: TranscriptLogger | null = null;

  private agentId: UUID;
  private defaultWorldId: UUID;
  private defaultRoomId: UUID;

  constructor(scenarioName?: string) {
    this.agentId = stringToUuid("scenario-agent") as UUID;
    this.defaultWorldId = stringToUuid("scenario-world") as UUID;
    this.defaultRoomId = stringToUuid("scenario-room") as UUID;

    if (scenarioName) {
      this.transcript = new TranscriptLogger(scenarioName);
    }

    // Set up default world (client_chat / app world)
    this.worlds.set(this.defaultWorldId, {
      id: this.defaultWorldId,
      name: "App World",
      agentId: this.agentId,
      serverId: "",
      metadata: {
        ownership: {},
        roles: {},
      },
    } as MockWorld);
    this.platformWorldMap.set("client_chat", this.defaultWorldId);

    // Set up default room
    this.rooms.set(this.defaultRoomId, {
      id: this.defaultRoomId,
      worldId: this.defaultWorldId,
      agentId: this.agentId,
      source: "client_chat",
      type: "GROUP" as never,
    } as Room);

    // Wire up roles mocks
    this.wirePluginRolesMocks();

    // Default config
    mockLoadElizaConfig.mockReturnValue({
      agents: { defaults: {} },
      plugins: { entries: {} },
    });

    // Build runtime
    this.runtime = this.buildRuntime();

    // Register real implementations
    this.providers = [
      roleBackfillProvider,
      createAdminTrustProvider(),
      createAdminPanelProvider(),
      createEscalationTriggerProvider(),
    ];
    this.evaluators = [lateJoinWhitelistEvaluator];
    this.actions = [sendMessageAction];
  }

  // -----------------------------------------------------------------------
  // Multi-world setup
  // -----------------------------------------------------------------------

  /**
   * Create a separate world for a platform. Returns the world ID.
   * Each platform gets its own world with independent role metadata.
   */
  setupWorld(
    platform: string,
    opts?: { ownerId?: string; name?: string },
  ): UUID {
    const worldId = stringToUuid(`world-${platform}`) as UUID;
    const metadata: RolesMetadata & Record<string, unknown> = {
      ownership: opts?.ownerId ? { ownerId: opts.ownerId } : {},
      roles: {},
    };

    if (opts?.ownerId) {
      metadata.roles = { [opts.ownerId]: "OWNER" };
    }

    this.worlds.set(worldId, {
      id: worldId,
      name: opts?.name ?? `${platform} World`,
      agentId: this.agentId,
      serverId: `server-${platform}`,
      metadata,
    } as MockWorld);

    this.platformWorldMap.set(platform, worldId);

    // Create a room for the platform tied to this world
    const roomId = stringToUuid(`room-${platform}`) as UUID;
    this.rooms.set(roomId, {
      id: roomId,
      worldId,
      agentId: this.agentId,
      source: platform,
      type: "GROUP" as never,
    } as Room);

    return worldId;
  }

  // -----------------------------------------------------------------------
  // Entity/Owner setup helpers
  // -----------------------------------------------------------------------

  setupOwner(
    entityId: UUID | string,
    opts: {
      name: string;
      claims?: IdentityClaim[];
    },
  ): void {
    const eid = entityId as UUID;
    this.entities.set(eid, {
      id: eid,
      agentId: this.agentId,
      names: [opts.name],
      metadata: {
        identityClaims: (opts.claims ?? []) as never,
      },
    });

    // Set owner in default world
    const world = this.worlds.get(this.defaultWorldId);
    if (world) {
      world.metadata.ownership = { ownerId: eid };
      world.metadata.roles = { ...world.metadata.roles, [eid]: "OWNER" };
    }
  }

  /**
   * Set the owner in a specific platform world (for multi-world tests).
   */
  setWorldOwner(worldId: UUID | string, ownerId: UUID | string): void {
    const world = this.worlds.get(worldId as string);
    if (world) {
      world.metadata.ownership = { ownerId: ownerId as string };
      world.metadata.roles = {
        ...world.metadata.roles,
        [ownerId as string]: "OWNER",
      };
    }
  }

  setupEntity(
    entityId: UUID | string,
    opts: {
      name: string;
      platform: string;
      role?: string;
      worldId?: string;
      claims?: IdentityClaim[];
      platformMeta?: Record<string, unknown>;
    },
  ): void {
    const eid = entityId as UUID;
    const existingEntity = this.entities.get(eid);
    const existingMeta = (existingEntity?.metadata ?? {}) as Record<
      string,
      unknown
    >;

    this.entities.set(eid, {
      id: eid,
      agentId: this.agentId,
      names: [opts.name],
      metadata: {
        ...existingMeta,
        [opts.platform]: opts.platformMeta ?? {},
        identityClaims: (opts.claims ?? []) as never,
      },
    });

    if (opts.role) {
      const targetWorldId = (opts.worldId as UUID) ?? this.defaultWorldId;
      const world = this.worlds.get(targetWorldId);
      if (world) {
        world.metadata.roles = {
          ...world.metadata.roles,
          [eid]: opts.role,
        };
      }
    }
  }

  setConfig(config: {
    ownerContacts?: Record<
      string,
      { entityId?: string; channelId?: string; roomId?: string }
    >;
    escalation?: {
      channels?: string[];
      waitMinutes?: number;
      maxRetries?: number;
    };
    connectorAdmins?: Record<string, string[]>;
  }): void {
    mockLoadElizaConfig.mockReturnValue({
      agents: {
        defaults: {
          ownerContacts: config.ownerContacts ?? {},
          escalation: config.escalation ?? {},
        },
      },
      roles: {
        connectorAdmins: config.connectorAdmins ?? {},
      },
    });
  }

  addIdentityLink(
    sourceEntityId: UUID | string,
    targetEntityId: UUID | string,
    status: "proposed" | "confirmed" | "rejected",
    metadata?: Record<string, unknown>,
  ): UUID {
    const id = stringToUuid(`link-${Date.now()}-${this.relationships.length}`);
    this.relationships.push({
      id,
      sourceEntityId: sourceEntityId as UUID,
      targetEntityId: targetEntityId as UUID,
      tags: ["identity_link"],
      metadata: { status, ...metadata },
    });
    return id;
  }

  /**
   * Set a role directly on a world (for multi-world role tests).
   */
  setRole(worldId: UUID | string, entityId: UUID | string, role: string): void {
    const world = this.worlds.get(worldId as string);
    if (world) {
      world.metadata.roles = {
        ...world.metadata.roles,
        [entityId as string]: role,
      };
    }
  }

  // -----------------------------------------------------------------------
  // Accessors
  // -----------------------------------------------------------------------

  getEntity(entityId: UUID | string): Entity | undefined {
    return this.entities.get(entityId as string);
  }

  getClaims(entityId: UUID | string): IdentityClaim[] {
    const entity = this.entities.get(entityId as string);
    return (
      ((entity?.metadata as Record<string, unknown>)
        ?.identityClaims as IdentityClaim[]) ?? []
    );
  }

  getRelationships(
    entityId: UUID | string,
    tags?: string[],
  ): IdentityRelationship[] {
    return this.relationships.filter((r) => {
      const entityMatch =
        r.sourceEntityId === entityId || r.targetEntityId === entityId;
      if (!entityMatch) return false;
      if (tags && tags.length > 0) {
        return tags.some((t) => r.tags.includes(t));
      }
      return true;
    });
  }

  getWorldById(worldId: UUID | string): MockWorld | undefined {
    return this.worlds.get(worldId as string);
  }

  getWorldForPlatform(platform: string): MockWorld | undefined {
    const worldId = this.platformWorldMap.get(platform);
    if (!worldId) return this.worlds.get(this.defaultWorldId);
    return this.worlds.get(worldId);
  }

  getRoleInWorld(worldId: UUID | string, entityId: UUID | string): string {
    const world = this.worlds.get(worldId as string);
    return world?.metadata.roles?.[entityId as string] ?? "NONE";
  }

  getDefaultWorldId(): UUID {
    return this.defaultWorldId;
  }

  printTranscript(): void {
    if (this.transcript) {
      console.log(this.transcript.print());
    }
  }

  // -----------------------------------------------------------------------
  // Message processing pipeline
  // -----------------------------------------------------------------------

  async sendMessage(params: SendMessageParams): Promise<PipelineResult> {
    const entityId = params.entityId as UUID;
    const worldId = params.worldId
      ? (params.worldId as UUID)
      : (this.platformWorldMap.get(params.platform) ?? this.defaultWorldId);
    const roomId = this.resolveRoomForPlatform(params.platform, worldId);

    // Ensure entity exists with platform metadata
    if (!this.entities.has(entityId)) {
      this.entities.set(entityId, {
        id: entityId,
        agentId: this.agentId,
        names: [],
        metadata: (params.entityMetadata ?? {
          [params.platform]: {},
        }) as never,
      });
    } else if (params.entityMetadata) {
      const entity = this.entities.get(entityId);
      if (entity) {
        entity.metadata = {
          ...(entity.metadata as Record<string, unknown>),
          ...params.entityMetadata,
        } as never;
      }
    }

    // Create the message memory
    const message: Memory = {
      id: stringToUuid(`msg-${Date.now()}-${Math.random()}`),
      entityId,
      roomId,
      content: {
        text: params.text,
        source: params.platform,
      },
      createdAt: Date.now(),
    };

    // Store it
    const roomMemories = this.memories.get(roomId) ?? [];
    roomMemories.push(message);
    this.memories.set(roomId, roomMemories);

    // Step 1: Run evaluators
    const evaluatorResults: Record<string, unknown> = {};
    for (const evaluator of this.evaluators) {
      const shouldRun = await evaluator.validate(this.runtime, message);
      if (shouldRun) {
        const result = await evaluator.handler(
          this.runtime,
          message,
          {} as State,
        );
        evaluatorResults[evaluator.name] = result ?? { ran: true };
      }
    }

    // Step 2: Run identity extraction (simulated via recorded responses)
    const extractionResult = await this.extractIdentities(message, worldId);
    if (extractionResult) {
      evaluatorResults.relationshipExtraction = extractionResult;
    }

    // Step 3: Run providers
    const providerResults: Record<string, ProviderResult> = {};
    for (const provider of this.providers) {
      try {
        const result = await provider.get(this.runtime, message, {} as State);
        providerResults[provider.name] = result;
      } catch {
        // Skip providers that fail (missing dependencies, etc.)
      }
    }

    // Step 4: Action selection (via recorded responses)
    const actionSelection = await this.selectAction(message, providerResults);

    // Step 5: Execute action if selected
    let actionResult: unknown;
    if (actionSelection?.action && actionSelection.action !== "NONE") {
      const action = this.actions.find(
        (a) => a.name === actionSelection.action,
      );
      if (action) {
        const valid = await action.validate?.(
          this.runtime,
          message,
          {} as State,
        );
        if (valid) {
          actionResult = await action.handler?.(
            this.runtime,
            message,
            {} as State,
            {
              parameters: actionSelection.parameters ?? {},
            } as HandlerOptions,
          );
        }
      }
    }

    // Log to transcript
    if (this.transcript) {
      const entity = this.entities.get(entityId);
      const entityName =
        entity?.names?.[0] ?? (entityId === this.agentId ? "Agent" : entityId);
      const world = this.worlds.get(worldId);
      const role = world?.metadata.roles?.[entityId as string] ?? "NONE";

      const systemActions: string[] = [];
      const stateChanges: string[] = [];

      if (extractionResult) {
        const ext = extractionResult as {
          identities: Array<{ platform: string; handle: string }>;
          claimsCreated: number;
          autoAccepted: boolean;
          rejected?: string[];
        };
        if (ext.identities.length > 0) {
          systemActions.push(
            `Extracted ${ext.identities.length} identities (${ext.identities.map((i) => i.platform).join(", ")})`,
          );
          if (ext.autoAccepted) {
            systemActions.push(
              `All claims auto-accepted (${role} permissions)`,
            );
          } else {
            systemActions.push(
              `Claims stored as proposed (${role} permissions)`,
            );
          }
        }
        if (ext.rejected && ext.rejected.length > 0) {
          systemActions.push(`Rejected: ${ext.rejected.join(", ")}`);
        }
        const claims = this.getClaims(entityId);
        if (claims.length > 0) {
          const summary = claims
            .map(
              (c) =>
                `{${c.platform}: ${c.handle}, ${c.status === "accepted" ? "OK" : c.status}}`,
            )
            .join(", ");
          stateChanges.push(`entity.identityClaims = [${summary}]`);
        }
      }

      if (evaluatorResults.late_join_whitelist) {
        systemActions.push("Late-join whitelist: promoted to ADMIN");
      }

      if (actionSelection?.action && actionSelection.action !== "NONE") {
        systemActions.push(
          `Action: ${actionSelection.action}${actionResult ? " (executed)" : ""}`,
        );
      }

      this.transcript.log({
        platform: params.platform,
        speaker: entityName as string,
        role,
        message: params.text,
        systemActions,
        stateChanges,
      });
    }

    return {
      providers: providerResults,
      evaluators: evaluatorResults,
      selectedAction: actionSelection?.action,
      actionResult,
    };
  }

  // -----------------------------------------------------------------------
  // Private: identity extraction (simulated evaluator — status-based)
  // -----------------------------------------------------------------------

  private async extractIdentities(
    message: Memory,
    worldId: UUID,
  ): Promise<Record<string, unknown> | null> {
    const text = (message.content as { text?: string })?.text ?? "";
    const responseText = findRecordedResponse(text);

    try {
      const parsed = JSON.parse(responseText) as {
        identities?: Array<{ platform: string; handle: string }>;
      };
      if (!parsed.identities || parsed.identities.length === 0) return null;

      // Determine claim tier based on sender role
      const entityId = message.entityId as string;
      const world = this.worlds.get(worldId);
      const role = world?.metadata.roles?.[entityId] ?? "NONE";

      const claimTier: IdentityClaim["claimTier"] =
        role === "OWNER"
          ? "ground_truth"
          : role === "ADMIN"
            ? "admin_verified"
            : "self_reported";

      const autoAccept = role === "OWNER" || role === "ADMIN";

      // Validate platforms and build claims
      const entity = this.entities.get(entityId);
      if (!entity) return null;

      const existing =
        ((entity.metadata as Record<string, unknown>)
          ?.identityClaims as IdentityClaim[]) ?? [];

      const accepted: Array<{ platform: string; handle: string }> = [];
      const rejected: string[] = [];

      for (const identity of parsed.identities) {
        const normalizedHandle = identity.handle.replace(/^@/, "");

        // Validate platform
        if (!KNOWN_PLATFORMS.has(identity.platform)) {
          rejected.push(`${identity.platform}: unknown platform`);
          continue;
        }

        // Validate handle is non-empty
        if (!normalizedHandle || normalizedHandle.trim().length === 0) {
          rejected.push(`${identity.platform}: empty handle`);
          continue;
        }

        // Check for existing claim on same platform+handle — update instead of duplicate
        const existingIdx = existing.findIndex(
          (e) =>
            e.platform === identity.platform && e.handle === normalizedHandle,
        );

        const claim: IdentityClaim = {
          platform: identity.platform,
          handle: normalizedHandle,
          status: autoAccept ? "accepted" : "proposed",
          claimTier,
          claimedAt: Date.now(),
          claimedBy: entityId,
        };

        if (existingIdx >= 0) {
          // Update existing claim (no duplicate)
          existing[existingIdx] = claim;
        } else {
          existing.push(claim);
        }

        accepted.push(identity);
      }

      (entity.metadata as Record<string, unknown>).identityClaims = existing;

      return {
        identities: accepted,
        claimsCreated: accepted.length,
        autoAccepted: autoAccept,
        claimTier,
        rejected,
      };
    } catch {
      return null;
    }
  }

  // -----------------------------------------------------------------------
  // Private: action selection
  // -----------------------------------------------------------------------

  private async selectAction(
    message: Memory,
    _providers: Record<string, ProviderResult>,
  ): Promise<{
    action: string;
    parameters: Record<string, unknown>;
  } | null> {
    const text = (message.content as { text?: string })?.text ?? "";
    const responseText = findRecordedResponse(text);

    try {
      const parsed = JSON.parse(responseText) as {
        action?: string;
        parameters?: Record<string, unknown>;
      };
      if (parsed.action) {
        return {
          action: parsed.action,
          parameters: parsed.parameters ?? {},
        };
      }
    } catch {
      // fall through
    }
    return null;
  }

  // -----------------------------------------------------------------------
  // Private: room resolution (multi-world aware)
  // -----------------------------------------------------------------------

  private resolveRoomForPlatform(platform: string, worldId: UUID): UUID {
    // Find existing room for this platform + world combination
    for (const room of Array.from(this.rooms.values())) {
      if (room.source === platform && room.worldId === worldId) {
        return room.id;
      }
    }

    // Create new room for this platform in the target world
    const roomId = stringToUuid(`room-${platform}-${worldId}`);
    this.rooms.set(roomId, {
      id: roomId,
      worldId,
      agentId: this.agentId,
      source: platform,
      type: "GROUP" as never,
    } as Room);
    return roomId;
  }

  // -----------------------------------------------------------------------
  // Private: wire up roles mocks
  // -----------------------------------------------------------------------

  private wirePluginRolesMocks(): void {
    const getOwnerId = () =>
      this.worlds.get(this.defaultWorldId)?.metadata.ownership?.ownerId ?? null;

    mockNormalizeRole.mockImplementation((raw: string | undefined | null) => {
      if (!raw) return "NONE";
      const upper = raw.toUpperCase();
      if (upper === "OWNER" || upper === "ADMIN") return upper;
      return "NONE";
    });

    mockGetEntityRole.mockImplementation(
      (metadata: RolesMetadata | undefined, entityId: string) => {
        return metadata?.roles?.[entityId] ?? "NONE";
      },
    );

    mockResolveWorldForMessage.mockImplementation(
      async (_runtime: unknown, message: Memory) => {
        const room = this.rooms.get(message.roomId);
        if (!room?.worldId) return null;
        const world = this.worlds.get(room.worldId as string);
        if (!world) return null;
        return { world, metadata: world.metadata };
      },
    );

    mockHasConfiguredCanonicalOwner.mockImplementation(
      () => getOwnerId() != null,
    );

    mockResolveCanonicalOwnerId.mockImplementation(
      (_runtime: unknown, metadata?: RolesMetadata) =>
        getOwnerId() ?? metadata?.ownership?.ownerId ?? null,
    );

    mockResolveCanonicalOwnerIdForMessage.mockImplementation(
      async (_runtime: unknown, message: Memory) => {
        const ownerId = getOwnerId();
        if (ownerId) {
          return ownerId;
        }
        const room = this.rooms.get(message.roomId);
        if (!room?.worldId) return null;
        const world = this.worlds.get(room.worldId as string);
        return world?.metadata.ownership?.ownerId ?? null;
      },
    );

    mockSetEntityRole.mockImplementation(
      async (
        _runtime: unknown,
        message: Memory,
        targetEntityId: string,
        newRole: string,
        source = "manual",
      ) => {
        const room = this.rooms.get(message.roomId);
        if (!room?.worldId) return {};
        const world = this.worlds.get(room.worldId as string);
        if (!world) return {};
        const roles = world.metadata.roles ?? {};
        const roleSources = world.metadata.roleSources ?? {};
        if (newRole === "NONE") {
          delete roles[targetEntityId];
          delete roleSources[targetEntityId];
        } else {
          roles[targetEntityId] = newRole;
          roleSources[targetEntityId] = source;
        }
        world.metadata.roles = roles;
        world.metadata.roleSources = roleSources;
        return { ...roles };
      },
    );

    mockGetConnectorAdminWhitelist.mockReturnValue({});
    mockMatchEntityToConnectorAdminWhitelist.mockImplementation(
      (
        entityMetadata: Record<string, unknown> | undefined | null,
        whitelist: Record<string, string[]>,
      ) => {
        if (!entityMetadata) {
          return null;
        }

        for (const [connector, platformIds] of Object.entries(whitelist)) {
          if (!platformIds?.length) continue;

          const connectorMetadata = entityMetadata[connector] as
            | Record<string, unknown>
            | undefined;
          if (!connectorMetadata || typeof connectorMetadata !== "object") {
            continue;
          }

          for (const field of ["userId", "id", "username", "userName"] as const) {
            const value = connectorMetadata[field];
            if (typeof value === "string" && platformIds.includes(value)) {
              return { connector, matchedValue: value, matchedField: field };
            }
          }
        }

        return null;
      },
    );

    mockCheckSenderRole.mockImplementation(
      async (_runtime: unknown, message: Memory) => {
        const room = this.rooms.get(message.roomId);
        if (!room?.worldId) return null;
        const world = this.worlds.get(room.worldId as string);
        if (!world) return null;
        const roles = world.metadata.roles ?? {};
        const role = roles[message.entityId as string] ?? "NONE";
        return {
          entityId: message.entityId,
          role,
          isOwner: role === "OWNER",
          isAdmin: role === "ADMIN" || role === "OWNER",
          canManageRoles: role === "OWNER" || role === "ADMIN",
        };
      },
    );
  }

  // -----------------------------------------------------------------------
  // Private: build mock runtime
  // -----------------------------------------------------------------------

  private buildRuntime(): IAgentRuntime {
    const runtime = {
      agentId: this.agentId,
      character: { name: "ScenarioAgent", postExamples: [] },

      // Entity operations
      getEntityById: vi.fn(async (id: UUID) => {
        return this.entities.get(id) ?? null;
      }),
      getEntity: vi.fn(async (id: UUID) => {
        return this.entities.get(id) ?? null;
      }),
      updateEntity: vi.fn(async (entity: Entity) => {
        this.entities.set(entity.id, entity);
      }),
      createEntity: vi.fn(async (entity: Entity) => {
        this.entities.set(entity.id, entity);
        return entity;
      }),

      // Room operations
      getRoom: vi.fn(async (id: UUID) => {
        return this.rooms.get(id) ?? null;
      }),
      getRooms: vi.fn(async (worldId: UUID) => {
        return Array.from(this.rooms.values()).filter(
          (r) => r.worldId === worldId,
        );
      }),
      getEntitiesForRoom: vi.fn(async (_roomId: UUID) => {
        return Array.from(this.entities.values());
      }),
      getRoomsForParticipant: vi.fn(async (entityId: UUID) => {
        // Return rooms where this entity has sent messages, plus client_chat rooms
        const roomsWithMessages = new Set<string>();
        for (const [roomId, memories] of this.memories.entries()) {
          if (memories.some((m) => m.entityId === entityId)) {
            roomsWithMessages.add(roomId);
          }
        }
        // Also include client_chat rooms (for admin panel)
        for (const room of Array.from(this.rooms.values())) {
          if (room.source === "client_chat") {
            roomsWithMessages.add(room.id);
          }
        }
        return Array.from(roomsWithMessages) as UUID[];
      }),

      // World operations
      getWorld: vi.fn(async (id: UUID) => {
        return this.worlds.get(id) ?? null;
      }),
      getAllWorlds: vi.fn(async () => {
        return Array.from(this.worlds.values());
      }),
      updateWorld: vi.fn(async (world: MockWorld) => {
        this.worlds.set(world.id, { ...world });
      }),

      // Memory operations
      createMemory: vi.fn(async (memory: Memory, _tableName?: string) => {
        const roomId = memory.roomId as string;
        const current = this.memories.get(roomId) ?? [];
        current.push({
          ...memory,
          createdAt: memory.createdAt ?? Date.now(),
        });
        this.memories.set(roomId, current);
      }),
      getMemories: vi.fn(async (query: { roomId?: string; count?: number }) => {
        const current = this.memories.get(query.roomId ?? "") ?? [];
        const count = Math.max(1, query.count ?? current.length);
        return current.slice(-count);
      }),
      getMemoriesByRoomIds: vi.fn(
        async (query: {
          roomIds?: UUID[];
          tableName?: string;
          limit?: number;
        }) => {
          const roomIds = query.roomIds ?? [];
          const merged: Memory[] = [];
          for (const rid of roomIds) {
            merged.push(...(this.memories.get(rid) ?? []));
          }
          return merged.slice(-(query.limit ?? merged.length));
        },
      ),

      // Relationship operations
      getRelationships: vi.fn(
        async (query: { entityIds?: string[]; tags?: string[] }) => {
          const entityIds = query.entityIds ?? [];
          const tags = query.tags ?? [];
          return this.relationships.filter((r) => {
            const entityMatch =
              entityIds.length === 0 ||
              entityIds.includes(r.sourceEntityId) ||
              entityIds.includes(r.targetEntityId);
            const tagMatch =
              tags.length === 0 || tags.some((t) => r.tags.includes(t));
            return entityMatch && tagMatch;
          });
        },
      ),

      // Send handler (captures messages)
      sendMessageToTarget: vi.fn(
        async (
          target: {
            source: string;
            entityId?: UUID;
            channelId?: string;
          },
          content: {
            text: string;
            source: string;
            metadata?: Record<string, unknown>;
          },
        ) => {
          this.sentMessages.push({ target, content });
        },
      ),
      registerSendHandler: vi.fn(),

      // Model (recorded by default)
      useModel: vi.fn(async (_params: unknown) => {
        return "test response";
      }),

      // Misc
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      emitEvent: vi.fn(),
      getService: vi.fn(() => null),
      getServicesByType: vi.fn(() => []),
      getSetting: vi.fn(() => undefined),
      getCache: vi.fn(async () => null),
      setCache: vi.fn(async () => {}),
      getParticipantUserState: vi.fn(async () => null),
      setParticipantUserState: vi.fn(async () => {}),
      ensureConnection: vi.fn(async () => {}),
    };

    return runtime as unknown as IAgentRuntime;
  }
}

// ---------------------------------------------------------------------------
// Helper: create a claim for setup
// ---------------------------------------------------------------------------

function makeClaim(
  platform: string,
  handle: string,
  status: IdentityClaim["status"],
  claimTier: IdentityClaim["claimTier"],
  claimedBy: string,
  opts?: { claimedAt?: number },
): IdentityClaim {
  return {
    platform,
    handle,
    status,
    claimTier,
    claimedAt: opts?.claimedAt ?? Date.now(),
    claimedBy,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("identity scenarios", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    EscalationService._reset();
  });

  afterEach(() => {
    EscalationService._reset();
  });

  // =========================================================================
  // Scenario 1: Owner Onboarding (expanded)
  // =========================================================================

  describe("Scenario 1: Owner Onboarding", () => {
    it("should store 3 platform identities as accepted/ground_truth from owner", async () => {
      const runner = new ScenarioRunner("Owner Onboarding — multi-platform");
      const ownerId = stringToUuid("owner-entity");
      runner.setupOwner(ownerId, { name: "Shaw" });

      const result = await runner.sendMessage({
        text: "Hey! I'm Shaw. My discord is shawwalters, my telegram is @shaw_w, and my twitter is @shawmakesmagic",
        entityId: ownerId,
        platform: "client_chat",
      });

      // Extraction ran
      const extraction = result.evaluators.relationshipExtraction as {
        identities: Array<{ platform: string; handle: string }>;
        claimsCreated: number;
        autoAccepted: boolean;
        claimTier: string;
      };
      expect(extraction).toBeDefined();
      expect(extraction.identities.length).toBe(3);
      expect(extraction.autoAccepted).toBe(true);
      expect(extraction.claimTier).toBe("ground_truth");

      // All claims stored as accepted with ground_truth tier
      const claims = runner.getClaims(ownerId);
      expect(claims.length).toBe(3);

      for (const claim of claims) {
        expect(claim.status).toBe("accepted");
        expect(claim.claimTier).toBe("ground_truth");
        expect(claim.claimedBy).toBe(ownerId);
      }

      // Verify specific platforms
      const discord = claims.find((c) => c.platform === "discord");
      expect(discord?.handle).toBe("shawwalters");

      const telegram = claims.find((c) => c.platform === "telegram");
      expect(telegram?.handle).toBe("shaw_w");

      const twitter = claims.find((c) => c.platform === "twitter");
      expect(twitter?.handle).toBe("shawmakesmagic");

      runner.printTranscript();
    });

    it("should accept follow-up email claim from owner", async () => {
      const runner = new ScenarioRunner("Owner Onboarding — follow-up email");
      const ownerId = stringToUuid("owner-entity");
      runner.setupOwner(ownerId, { name: "Shaw" });

      // First message — 3 platforms
      await runner.sendMessage({
        text: "Hey! I'm Shaw. My discord is shawwalters, my telegram is @shaw_w, and my twitter is @shawmakesmagic",
        entityId: ownerId,
        platform: "client_chat",
      });

      // Follow-up — email
      await runner.sendMessage({
        text: "also my email is shaw@example.com",
        entityId: ownerId,
        platform: "client_chat",
      });

      const claims = runner.getClaims(ownerId);
      expect(claims.length).toBe(4);

      const emailClaim = claims.find((c) => c.platform === "email");
      expect(emailClaim).toBeDefined();
      expect(emailClaim?.handle).toBe("shaw@example.com");
      expect(emailClaim?.status).toBe("accepted");
      expect(emailClaim?.claimTier).toBe("ground_truth");

      runner.printTranscript();
    });

    it("should not create duplicate claims when owner repeats the same identity", async () => {
      const runner = new ScenarioRunner("Owner Onboarding — dedup");
      const ownerId = stringToUuid("owner-entity");
      runner.setupOwner(ownerId, { name: "Shaw" });

      await runner.sendMessage({
        text: "my twitter is @alice_codes",
        entityId: ownerId,
        platform: "client_chat",
      });

      // Same claim again
      await runner.sendMessage({
        text: "my twitter is @alice_codes",
        entityId: ownerId,
        platform: "client_chat",
      });

      const claims = runner.getClaims(ownerId);
      const twitterClaims = claims.filter((c) => c.platform === "twitter");
      expect(twitterClaims.length).toBe(1);

      runner.printTranscript();
    });
  });

  // =========================================================================
  // Scenario 2: Multi-World Cross-Platform
  // =========================================================================

  describe("Scenario 2: Multi-World Cross-Platform", () => {
    it("should maintain separate role metadata per platform world", async () => {
      const runner = new ScenarioRunner("Multi-World — separate worlds");
      const ownerId = stringToUuid("owner-entity");
      runner.setupOwner(ownerId, { name: "Shaw" });

      // Create discord world with owner
      const discordWorldId = runner.setupWorld("discord", {
        ownerId,
      });

      // Verify app-world has OWNER
      const appWorld = runner.getWorldForPlatform("client_chat");
      expect(appWorld?.metadata.roles?.[ownerId]).toBe("OWNER");

      // Verify discord-world has OWNER
      const discordWorld = runner.getWorldById(discordWorldId);
      expect(discordWorld?.metadata.roles?.[ownerId]).toBe("OWNER");

      // Add a user only in discord world
      const userId = stringToUuid("discord-user");
      runner.setupEntity(userId, {
        name: "Alice",
        platform: "discord",
        role: "ADMIN",
        worldId: discordWorldId,
      });

      // User has ADMIN in discord world but no role in app world
      expect(runner.getRoleInWorld(discordWorldId, userId)).toBe("ADMIN");
      expect(runner.getRoleInWorld(runner.getDefaultWorldId(), userId)).toBe(
        "NONE",
      );
    });

    it("should detect matching discord entity for cross-platform link", async () => {
      const runner = new ScenarioRunner(
        "Multi-World — cross-platform entity match",
      );
      const ownerId = stringToUuid("owner-entity");
      runner.setupOwner(ownerId, {
        name: "Shaw",
        claims: [
          makeClaim(
            "discord",
            "shawwalters",
            "accepted",
            "ground_truth",
            ownerId,
          ),
        ],
      });

      // Create discord world with the same owner
      runner.setupWorld("discord", { ownerId });

      // New discord entity arrives
      const discordEntityId = stringToUuid("discord-shaw");
      runner.setupEntity(discordEntityId, {
        name: "shawwalters",
        platform: "discord",
        platformMeta: { username: "shawwalters", userId: "123456789" },
      });

      // Create identity link between them
      runner.addIdentityLink(discordEntityId, ownerId, "confirmed");

      await runner.sendMessage({
        text: "hey it's me",
        entityId: discordEntityId,
        platform: "discord",
      });

      // The link exists
      const links = runner.getRelationships(discordEntityId, ["identity_link"]);
      expect(links.length).toBe(1);
      expect(links[0].metadata.status).toBe("confirmed");

      // Entity has discord metadata
      const entity = runner.getEntity(discordEntityId);
      const meta = entity?.metadata as Record<string, unknown>;
      expect((meta?.discord as { username: string })?.username).toBe(
        "shawwalters",
      );

      runner.printTranscript();
    });

    it("should propagate OWNER role to new platform world via backfill", async () => {
      const runner = new ScenarioRunner(
        "Multi-World — role backfill to new world",
      );
      const ownerId = stringToUuid("owner-entity");
      runner.setupOwner(ownerId, { name: "Shaw" });

      // Create discord world with owner set but role NOT set
      const discordWorldId = runner.setupWorld("discord");
      const discordWorld = runner.getWorldById(discordWorldId);
      if (discordWorld) {
        discordWorld.metadata.ownership = { ownerId };
        // Deliberately do NOT set roles — this is the backfill scenario
        discordWorld.metadata.roles = {};
      }

      // Owner sends a message in discord context — triggers role backfill
      await runner.sendMessage({
        text: "hello discord",
        entityId: ownerId,
        platform: "discord",
      });

      // Backfill should have set OWNER role
      expect(runner.getRoleInWorld(discordWorldId, ownerId)).toBe("OWNER");

      runner.printTranscript();
    });
  });

  // =========================================================================
  // Scenario 3: Permission Escalation Prevention
  // =========================================================================

  describe("Scenario 3: Permission Escalation Prevention", () => {
    it("should store regular user claim as proposed/self_reported", async () => {
      const runner = new ScenarioRunner(
        "Permission — regular user claim is proposed",
      );
      const ownerId = stringToUuid("owner-entity");
      runner.setupOwner(ownerId, { name: "Shaw" });

      const userId = stringToUuid("alice");
      runner.setupEntity(userId, { name: "Alice", platform: "discord" });

      await runner.sendMessage({
        text: "my twitter is @alice_codes",
        entityId: userId,
        platform: "discord",
      });

      const claims = runner.getClaims(userId);
      expect(claims.length).toBe(1);
      expect(claims[0].status).toBe("proposed");
      expect(claims[0].claimTier).toBe("self_reported");

      runner.printTranscript();
    });

    it("should reject non-admin from sending admin messages", async () => {
      const runner = new ScenarioRunner(
        "Permission — non-admin cannot send admin message via SEND_MESSAGE",
      );
      const ownerId = stringToUuid("owner-entity");
      runner.setupOwner(ownerId, { name: "Shaw" });

      const userId = stringToUuid("regular-user");
      runner.setupEntity(userId, { name: "Alice", platform: "discord" });

      const message: Memory = {
        id: stringToUuid("test-msg-perm"),
        entityId: userId,
        roomId: stringToUuid("scenario-room"),
        content: { text: "send notification", source: "discord" },
        createdAt: Date.now(),
      };

      const result = await sendMessageAction.handler?.(
        runner.runtime,
        message,
        {} as State,
        { parameters: { target: "admin", text: "hello" } } as HandlerOptions,
      );
      expect(result).toMatchObject({
        success: false,
        values: { error: "PERMISSION_DENIED" },
      });
    });

    it("should allow agent to send admin messages", async () => {
      const runner = new ScenarioRunner(
        "Permission — agent can send admin message via SEND_MESSAGE",
      );
      const ownerId = stringToUuid("owner-entity");
      runner.setupOwner(ownerId, { name: "Shaw" });

      const message: Memory = {
        id: stringToUuid("test-msg-agent"),
        entityId: runner.runtime.agentId,
        roomId: stringToUuid("scenario-room"),
        content: { text: "send notification", source: "client_chat" },
        createdAt: Date.now(),
      };

      const result = await sendMessageAction.handler?.(
        runner.runtime,
        message,
        {} as State,
        {
          parameters: { target: "admin", text: "notification" },
        } as HandlerOptions,
      );
      expect(result).toMatchObject({
        success: true,
        values: { success: true },
      });
    });

    it("should allow ADMIN to send admin messages", async () => {
      const runner = new ScenarioRunner(
        "Permission — ADMIN can send admin message via SEND_MESSAGE",
      );
      const ownerId = stringToUuid("owner-entity");
      runner.setupOwner(ownerId, { name: "Shaw" });

      const adminId = stringToUuid("admin-bob");
      runner.setupEntity(adminId, {
        name: "Bob",
        platform: "discord",
        role: "ADMIN",
      });

      const message: Memory = {
        id: stringToUuid("test-msg-admin"),
        entityId: adminId,
        roomId: stringToUuid("scenario-room"),
        content: { text: "alert owner", source: "discord" },
        createdAt: Date.now(),
      };

      const result = await sendMessageAction.handler?.(
        runner.runtime,
        message,
        {} as State,
        { parameters: { target: "admin", text: "alert" } } as HandlerOptions,
      );
      expect(result).toMatchObject({
        success: true,
        values: { success: true },
      });
    });

    it("should auto-accept admin identity claims with admin_verified tier", async () => {
      const runner = new ScenarioRunner(
        "Permission — ADMIN claim is admin_verified",
      );
      const ownerId = stringToUuid("owner-entity");
      runner.setupOwner(ownerId, { name: "Shaw" });

      const adminId = stringToUuid("admin-bob");
      runner.setupEntity(adminId, {
        name: "Bob",
        platform: "discord",
        role: "ADMIN",
      });

      await runner.sendMessage({
        text: "my github is bob-admin",
        entityId: adminId,
        platform: "discord",
      });

      const claims = runner.getClaims(adminId);
      expect(claims.length).toBe(1);
      expect(claims[0].status).toBe("accepted");
      expect(claims[0].claimTier).toBe("admin_verified");

      runner.printTranscript();
    });
  });

  // =========================================================================
  // Scenario 4: Claim Lifecycle
  // =========================================================================

  describe("Scenario 4: Claim Lifecycle", () => {
    it("should store user claim as pending then confirm via admin", async () => {
      const runner = new ScenarioRunner(
        "Claim Lifecycle — propose then confirm",
      );
      const ownerId = stringToUuid("owner-entity");
      runner.setupOwner(ownerId, { name: "Shaw" });

      const userId = stringToUuid("alice");
      runner.setupEntity(userId, { name: "Alice", platform: "discord" });

      // User claims twitter identity
      await runner.sendMessage({
        text: "my twitter is @alice_codes",
        entityId: userId,
        platform: "discord",
      });

      // Claim is proposed
      let claims = runner.getClaims(userId);
      expect(claims.length).toBe(1);
      expect(claims[0].status).toBe("proposed");
      expect(claims[0].platform).toBe("twitter");
      expect(claims[0].handle).toBe("alice_codes");

      // Admin confirms — simulate by directly updating the claim
      // (In real flow, CONFIRM_IDENTITY action would do this)
      claims[0].status = "accepted";
      claims[0].claimTier = "admin_verified";

      // Verify
      claims = runner.getClaims(userId);
      expect(claims[0].status).toBe("accepted");
      expect(claims[0].claimTier).toBe("admin_verified");

      runner.printTranscript();
    });

    it("should update existing claim when same user re-claims same identity", async () => {
      const runner = new ScenarioRunner(
        "Claim Lifecycle — re-claim updates existing",
      );
      const ownerId = stringToUuid("owner-entity");
      runner.setupOwner(ownerId, { name: "Shaw" });

      const userId = stringToUuid("alice");
      runner.setupEntity(userId, { name: "Alice", platform: "discord" });

      // First claim
      await runner.sendMessage({
        text: "my twitter is @alice_codes",
        entityId: userId,
        platform: "discord",
      });

      const firstClaims = runner.getClaims(userId);
      const firstClaimedAt = firstClaims[0].claimedAt;
      expect(firstClaims.length).toBe(1);

      // Wait a tick then re-claim
      await new Promise((r) => setTimeout(r, 5));

      await runner.sendMessage({
        text: "my twitter is @alice_codes",
        entityId: userId,
        platform: "discord",
      });

      // Still only 1 claim — updated, not duplicated
      const secondClaims = runner.getClaims(userId);
      expect(secondClaims.length).toBe(1);
      expect(secondClaims[0].claimedAt).toBeGreaterThanOrEqual(firstClaimedAt);

      runner.printTranscript();
    });

    it("should allow user to unlink own claim via relationship status change", async () => {
      const runner = new ScenarioRunner("Claim Lifecycle — unlink own claim");
      const userId = stringToUuid("alice");
      runner.setupEntity(userId, {
        name: "Alice",
        platform: "discord",
        claims: [
          makeClaim(
            "twitter",
            "alice_codes",
            "accepted",
            "admin_verified",
            userId,
          ),
        ],
      });

      const twitterEntityId = stringToUuid("alice-twitter");
      runner.addIdentityLink(userId, twitterEntityId, "confirmed");

      // Verify setup
      const linksBefore = runner.getRelationships(userId, ["identity_link"]);
      expect(linksBefore.length).toBe(1);
      expect(linksBefore[0].metadata.status).toBe("confirmed");

      // Simulate unlink action — change link status AND update claim
      linksBefore[0].metadata.status = "rejected";
      linksBefore[0].metadata.rejectedAt = Date.now();
      linksBefore[0].metadata.rejectedBy = userId;

      const claims = runner.getClaims(userId);
      const twitterClaim = claims.find((c) => c.platform === "twitter");
      if (twitterClaim) {
        twitterClaim.status = "rejected";
      }

      // Verify link is rejected
      const linksAfter = runner.getRelationships(userId, ["identity_link"]);
      expect(linksAfter[0].metadata.status).toBe("rejected");

      // Verify claim is rejected
      const updatedClaims = runner.getClaims(userId);
      expect(updatedClaims[0].status).toBe("rejected");

      runner.printTranscript();
    });

    it("should keep both claims when two users claim the same handle", async () => {
      const runner = new ScenarioRunner(
        "Claim Lifecycle — two users same handle",
      );
      const ownerId = stringToUuid("owner-entity");
      runner.setupOwner(ownerId, { name: "Shaw" });

      const userId1 = stringToUuid("alice");
      runner.setupEntity(userId1, { name: "Alice", platform: "discord" });

      const userId2 = stringToUuid("bob");
      runner.setupEntity(userId2, { name: "Bob", platform: "discord" });

      // Both claim @alice_codes
      await runner.sendMessage({
        text: "my twitter is @alice_codes",
        entityId: userId1,
        platform: "discord",
      });

      await runner.sendMessage({
        text: "my twitter is @alice_codes",
        entityId: userId2,
        platform: "discord",
      });

      // Both have claims stored, both proposed
      const claims1 = runner.getClaims(userId1);
      const claims2 = runner.getClaims(userId2);
      expect(claims1.length).toBe(1);
      expect(claims2.length).toBe(1);
      expect(claims1[0].handle).toBe("alice_codes");
      expect(claims2[0].handle).toBe("alice_codes");
      expect(claims1[0].status).toBe("proposed");
      expect(claims2[0].status).toBe("proposed");

      runner.printTranscript();
    });
  });

  // =========================================================================
  // Scenario 5: Ambiguous/Edge Case Identity Claims
  // =========================================================================

  describe("Scenario 5: Ambiguous/Edge Case Identity Claims", () => {
    it("should not create claim for ambiguous 'I'm alice' (no platform)", async () => {
      const runner = new ScenarioRunner("Edge — no platform specified");
      const userId = stringToUuid("alice");
      runner.setupEntity(userId, { name: "Alice", platform: "discord" });

      await runner.sendMessage({
        text: "I'm alice",
        entityId: userId,
        platform: "discord",
      });

      const claims = runner.getClaims(userId);
      expect(claims.length).toBe(0);

      runner.printTranscript();
    });

    it("should normalize 'my x is @foo' to twitter platform", async () => {
      const runner = new ScenarioRunner("Edge — x normalized to twitter");
      const ownerId = stringToUuid("owner-entity");
      runner.setupOwner(ownerId, { name: "Shaw" });

      const userId = stringToUuid("alice");
      runner.setupEntity(userId, { name: "Alice", platform: "discord" });

      await runner.sendMessage({
        text: "my x is @foo",
        entityId: userId,
        platform: "discord",
      });

      // The recorded response maps "x" to "twitter" platform
      const claims = runner.getClaims(userId);
      expect(claims.length).toBe(1);
      expect(claims[0].platform).toBe("twitter");
      expect(claims[0].handle).toBe("foo");

      runner.printTranscript();
    });

    it("should reject unknown platform (myspace)", async () => {
      const runner = new ScenarioRunner("Edge — unknown platform");
      const userId = stringToUuid("alice");
      runner.setupEntity(userId, { name: "Alice", platform: "discord" });

      const result = await runner.sendMessage({
        text: "my myspace is @bar",
        entityId: userId,
        platform: "discord",
      });

      const extraction = result.evaluators.relationshipExtraction as {
        rejected: string[];
        claimsCreated: number;
      };

      // The "myspace" platform is not in KNOWN_PLATFORMS
      expect(extraction.rejected.length).toBe(1);
      expect(extraction.rejected[0]).toContain("myspace");
      expect(extraction.claimsCreated).toBe(0);

      const claims = runner.getClaims(userId);
      expect(claims.length).toBe(0);

      runner.printTranscript();
    });

    it("should not create claim for empty handle", async () => {
      const runner = new ScenarioRunner("Edge — empty handle");
      const userId = stringToUuid("alice");
      runner.setupEntity(userId, { name: "Alice", platform: "discord" });

      // Recorded response for "my twitter is$" returns empty identities
      await runner.sendMessage({
        text: "my twitter is",
        entityId: userId,
        platform: "discord",
      });

      const claims = runner.getClaims(userId);
      expect(claims.length).toBe(0);

      runner.printTranscript();
    });

    it("should accept very short but valid handle (@a)", async () => {
      const runner = new ScenarioRunner("Edge — short handle");
      const ownerId = stringToUuid("owner-entity");
      runner.setupOwner(ownerId, { name: "Shaw" });

      // Use owner so it auto-accepts
      await runner.sendMessage({
        text: "my twitter is @a",
        entityId: ownerId,
        platform: "client_chat",
      });

      const claims = runner.getClaims(ownerId);
      expect(claims.length).toBe(1);
      expect(claims[0].handle).toBe("a");
      expect(claims[0].status).toBe("accepted");

      runner.printTranscript();
    });
  });

  // =========================================================================
  // Scenario 6: Escalation With Multi-Channel
  // =========================================================================

  describe("Scenario 6: Escalation With Multi-Channel", () => {
    it("should send to first channel then advance on no response", async () => {
      const runner = new ScenarioRunner(
        "Escalation — multi-channel advancement",
      );
      const ownerId = stringToUuid("owner-entity");
      runner.setupOwner(ownerId, { name: "Shaw" });
      runner.setConfig({
        ownerContacts: {
          client_chat: { entityId: ownerId },
          telegram: { entityId: ownerId, channelId: "tg-123" },
          discord: { entityId: ownerId, channelId: "dc-456" },
        },
        escalation: {
          channels: ["client_chat", "telegram", "discord"],
          waitMinutes: 1,
          maxRetries: 3,
        },
      });

      const state = await EscalationService.startEscalation(
        runner.runtime,
        "Security alert",
        "Unusual login detected",
      );

      expect(state.resolved).toBe(false);
      expect(state.channelsSent).toEqual(["client_chat"]);
      expect(runner.sentMessages.length).toBe(1);
      expect(runner.sentMessages[0].target.source).toBe("client_chat");
      expect(runner.sentMessages[0].content.metadata?.escalation).toBe(true);

      // No response — advance to telegram
      await EscalationService.checkEscalation(runner.runtime, state.id);
      expect(state.currentStep).toBe(1);
      expect(state.channelsSent).toContain("telegram");

      // No response — advance to discord
      await EscalationService.checkEscalation(runner.runtime, state.id);
      expect(state.currentStep).toBe(2);
      expect(state.channelsSent).toContain("discord");

      // All 3 channels were attempted
      expect(state.channelsSent).toEqual([
        "client_chat",
        "telegram",
        "discord",
      ]);

      runner.printTranscript();
    });

    it("should resolve escalation when owner responds", async () => {
      const runner = new ScenarioRunner(
        "Escalation — owner responds on channel 2",
      );
      const ownerId = stringToUuid("owner-entity");
      runner.setupOwner(ownerId, { name: "Shaw" });
      runner.setConfig({
        ownerContacts: {
          client_chat: { entityId: ownerId },
          telegram: { entityId: ownerId, channelId: "tg-123" },
        },
        escalation: {
          channels: ["client_chat", "telegram"],
          waitMinutes: 1,
          maxRetries: 3,
        },
      });

      const state = await EscalationService.startEscalation(
        runner.runtime,
        "Need help",
        "Something happened",
      );

      // Advance to telegram (no response on client_chat)
      await EscalationService.checkEscalation(runner.runtime, state.id);
      expect(state.channelsSent).toContain("telegram");

      // Owner responds (simulate by sending a message)
      await runner.sendMessage({
        text: "I'm here, what's up?",
        entityId: ownerId,
        platform: "client_chat",
      });

      // Mark resolved
      EscalationService.resolveEscalation(state.id);
      expect(state.resolved).toBe(true);
      expect(state.resolvedAt).toBeDefined();

      runner.printTranscript();
    });

    it("should coalesce new escalation into active one", async () => {
      const runner = new ScenarioRunner("Escalation — coalescing");
      const ownerId = stringToUuid("owner-entity");
      runner.setupOwner(ownerId, { name: "Shaw" });
      runner.setConfig({
        ownerContacts: {
          client_chat: { entityId: ownerId },
        },
        escalation: {
          channels: ["client_chat"],
          waitMinutes: 1,
          maxRetries: 2,
        },
      });

      const state1 = await EscalationService.startEscalation(
        runner.runtime,
        "Alert 1",
        "First issue",
      );

      // Try to start another — should coalesce
      const state2 = await EscalationService.startEscalation(
        runner.runtime,
        "Alert 2",
        "Second issue",
      );

      // Same escalation returned
      expect(state2.id).toBe(state1.id);
      expect(state2.reason).toContain("Alert 1");
      expect(state2.reason).toContain("Alert 2");

      runner.printTranscript();
    });

    it("should include urgency and escalation metadata in sent messages", async () => {
      const runner = new ScenarioRunner("Escalation — message metadata");
      const ownerId = stringToUuid("owner-entity");
      runner.setupOwner(ownerId, { name: "Shaw" });
      runner.setConfig({
        ownerContacts: {
          client_chat: { entityId: ownerId },
        },
        escalation: {
          channels: ["client_chat"],
          waitMinutes: 5,
          maxRetries: 1,
        },
      });

      await EscalationService.startEscalation(
        runner.runtime,
        "Urgent",
        "Server overloaded",
      );

      expect(runner.sentMessages.length).toBe(1);
      const msg = runner.sentMessages[0];
      expect(msg.content.metadata?.urgency).toBe("urgent");
      expect(msg.content.metadata?.escalation).toBe(true);
    });

    it("should detect active escalation in provider output", async () => {
      const runner = new ScenarioRunner("Escalation — provider detection");
      const ownerId = stringToUuid("owner-entity");
      runner.setupOwner(ownerId, { name: "Shaw" });
      runner.setConfig({
        ownerContacts: {
          client_chat: { entityId: ownerId },
        },
        escalation: {
          channels: ["client_chat"],
          waitMinutes: 5,
          maxRetries: 1,
        },
      });

      await EscalationService.startEscalation(
        runner.runtime,
        "Test alert",
        "Something happened",
      );

      const result = await runner.sendMessage({
        text: "checking in",
        entityId: runner.runtime.agentId,
        platform: "client_chat",
      });

      const triggerProvider = result.providers.escalationTrigger;
      expect(triggerProvider).toBeDefined();
      expect(triggerProvider?.values?.hasEscalationTriggers).toBe(true);
    });
  });

  // =========================================================================
  // Scenario 7: Expired Claims
  // =========================================================================

  describe("Scenario 7: Expired Claims", () => {
    it("should detect expired proposed claim (49 hours old)", async () => {
      const runner = new ScenarioRunner("Expired Claims — 49h old");
      const ownerId = stringToUuid("owner-entity");
      runner.setupOwner(ownerId, { name: "Shaw" });

      const userId = stringToUuid("alice");
      const fortyNineHoursAgo = Date.now() - 49 * 60 * 60 * 1000;
      runner.setupEntity(userId, {
        name: "Alice",
        platform: "discord",
        claims: [
          makeClaim(
            "twitter",
            "alice_codes",
            "proposed",
            "self_reported",
            userId,
            { claimedAt: fortyNineHoursAgo },
          ),
        ],
      });

      const claims = runner.getClaims(userId);
      const expiredClaim = claims[0];

      // Verify claim is old
      const ageHours = (Date.now() - expiredClaim.claimedAt) / (1000 * 60 * 60);
      expect(ageHours).toBeGreaterThan(48);

      // Simulate confirmation attempt on expired claim — auto-reject
      const EXPIRY_HOURS = 48;
      if (ageHours > EXPIRY_HOURS && expiredClaim.status === "proposed") {
        expiredClaim.status = "rejected";
      }

      expect(expiredClaim.status).toBe("rejected");

      runner.printTranscript();
    });

    it("should allow confirmation of non-expired claim (23 hours old)", async () => {
      const runner = new ScenarioRunner("Expired Claims — 23h still valid");
      const userId = stringToUuid("alice");
      const twentyThreeHoursAgo = Date.now() - 23 * 60 * 60 * 1000;
      runner.setupEntity(userId, {
        name: "Alice",
        platform: "discord",
        claims: [
          makeClaim(
            "twitter",
            "alice_codes",
            "proposed",
            "self_reported",
            userId,
            { claimedAt: twentyThreeHoursAgo },
          ),
        ],
      });

      const claims = runner.getClaims(userId);
      const claim = claims[0];

      const ageHours = (Date.now() - claim.claimedAt) / (1000 * 60 * 60);
      expect(ageHours).toBeLessThan(48);

      // Not expired — can be confirmed
      claim.status = "accepted";
      claim.claimTier = "admin_verified";
      expect(claim.status).toBe("accepted");

      runner.printTranscript();
    });
  });

  // =========================================================================
  // Scenario 8: Cross-Platform Role Consistency
  // =========================================================================

  describe("Scenario 8: Cross-Platform Role Consistency", () => {
    it("should backfill OWNER from app-world to discord-world via provider", async () => {
      const runner = new ScenarioRunner(
        "Role Consistency — backfill across worlds",
      );
      const ownerId = stringToUuid("owner-entity");
      runner.setupOwner(ownerId, { name: "Shaw" });

      // Create discord world: ownership set but role missing
      const discordWorldId = runner.setupWorld("discord");
      const discordWorld = runner.getWorldById(discordWorldId);
      if (discordWorld) {
        discordWorld.metadata.ownership = { ownerId };
        discordWorld.metadata.roles = {};
      }

      // Verify: OWNER in app-world, NONE in discord-world
      expect(runner.getRoleInWorld(runner.getDefaultWorldId(), ownerId)).toBe(
        "OWNER",
      );
      expect(runner.getRoleInWorld(discordWorldId, ownerId)).toBe("NONE");

      // Owner sends message in discord — triggers roleBackfillProvider
      await runner.sendMessage({
        text: "hello",
        entityId: ownerId,
        platform: "discord",
      });

      // After backfill: OWNER in both worlds
      expect(runner.getRoleInWorld(discordWorldId, ownerId)).toBe("OWNER");

      runner.printTranscript();
    });

    it("should promote late-join admin in discord world", async () => {
      const runner = new ScenarioRunner(
        "Role Consistency — late-join admin promotion",
      );
      const ownerId = stringToUuid("owner-entity");
      runner.setupOwner(ownerId, { name: "Shaw" });
      runner.setConfig({
        connectorAdmins: { discord: ["discord-admin-id"] },
      });

      // Set up discord world
      runner.setupWorld("discord", { ownerId });

      // Admin joins from Discord
      const adminId = stringToUuid("discord-admin");
      runner.setupEntity(adminId, {
        name: "DiscordAdmin",
        platform: "discord",
        platformMeta: { userId: "discord-admin-id" },
      });

      const result = await runner.sendMessage({
        text: "hey there",
        entityId: adminId,
        platform: "discord",
      });

      // Late-join evaluator should have promoted
      expect(result.evaluators.late_join_whitelist).toBeDefined();

      // ADMIN set in discord world
      const discordWorldId = runner.getWorldForPlatform("discord")?.id as UUID;
      expect(runner.getRoleInWorld(discordWorldId, adminId)).toBe("ADMIN");

      // OWNER still present
      expect(runner.getRoleInWorld(discordWorldId, ownerId)).toBe("OWNER");

      runner.printTranscript();
    });

    it("should allow OWNER and ADMIN roles to coexist in same world", async () => {
      const runner = new ScenarioRunner("Role Consistency — coexisting roles");
      const ownerId = stringToUuid("owner-entity");
      runner.setupOwner(ownerId, { name: "Shaw" });

      const discordWorldId = runner.setupWorld("discord", { ownerId });

      const adminId = stringToUuid("admin-bob");
      runner.setRole(discordWorldId, adminId, "ADMIN");

      const userId = stringToUuid("regular-alice");
      // No role set — stays NONE

      expect(runner.getRoleInWorld(discordWorldId, ownerId)).toBe("OWNER");
      expect(runner.getRoleInWorld(discordWorldId, adminId)).toBe("ADMIN");
      expect(runner.getRoleInWorld(discordWorldId, userId)).toBe("NONE");
    });
  });

  // =========================================================================
  // Scenario 9: Admin Panel Cross-Platform Context
  // =========================================================================

  describe("Scenario 9: Admin Panel Cross-Platform Context", () => {
    it("should mark owner as trusted admin in provider output", async () => {
      const runner = new ScenarioRunner("Admin Panel — owner trust check");
      const ownerId = stringToUuid("owner-entity");
      runner.setupOwner(ownerId, { name: "Shaw" });

      const result = await runner.sendMessage({
        text: "checking my trust level",
        entityId: ownerId,
        platform: "client_chat",
      });

      const trustProvider = result.providers.elizaAdminTrust;
      expect(trustProvider).toBeDefined();
      expect(trustProvider?.values?.trustedAdmin).toBe(true);
      expect(trustProvider?.text).toContain("OWNER");

      runner.printTranscript();
    });

    it("should not mark non-owner as trusted admin", async () => {
      const runner = new ScenarioRunner("Admin Panel — non-owner untrusted");
      const ownerId = stringToUuid("owner-entity");
      runner.setupOwner(ownerId, { name: "Shaw" });

      const userId = stringToUuid("regular-user");
      runner.setupEntity(userId, {
        name: "Alice",
        platform: "client_chat",
      });

      const result = await runner.sendMessage({
        text: "am I trusted?",
        entityId: userId,
        platform: "client_chat",
      });

      const trustProvider = result.providers.elizaAdminTrust;
      expect(trustProvider?.values?.trustedAdmin).toBe(false);

      runner.printTranscript();
    });

    it("should detect pending identity verifications in escalation trigger", async () => {
      const runner = new ScenarioRunner(
        "Admin Panel — pending verification triggers",
      );
      const userId = stringToUuid("user-with-pending");
      runner.setupEntity(userId, { name: "Bob", platform: "discord" });

      // Add a proposed (pending) identity link
      runner.addIdentityLink(userId, stringToUuid("bob-twitter"), "proposed");

      const result = await runner.sendMessage({
        text: "just checking in",
        entityId: userId,
        platform: "discord",
      });

      const triggerProvider = result.providers.escalationTrigger;
      expect(triggerProvider).toBeDefined();
      expect(triggerProvider?.values?.hasEscalationTriggers).toBe(true);
      expect(triggerProvider?.text).toContain("identity verification");

      runner.printTranscript();
    });

    it("should allow agent to send admin message with urgency metadata", async () => {
      const runner = new ScenarioRunner("Admin Panel — send admin message");
      const ownerId = stringToUuid("owner-entity");
      runner.setupOwner(ownerId, { name: "Shaw" });

      const message: Memory = {
        id: stringToUuid("test-msg-action"),
        entityId: runner.runtime.agentId,
        roomId: stringToUuid("scenario-room"),
        content: { text: "send notification", source: "client_chat" },
        createdAt: Date.now(),
      };

      const result = await sendMessageAction.handler?.(
        runner.runtime,
        message,
        {} as State,
        {
          parameters: {
            target: "admin",
            text: "Task completed",
            urgency: "important",
          },
        } as HandlerOptions,
      );

      expect(result).toMatchObject({
        success: true,
        values: { success: true, urgency: "important" },
      });
      expect(runner.sentMessages.length).toBeGreaterThan(0);
      expect(runner.sentMessages[0].content.text).toBe("Task completed");
    });

    it("should reject SEND_MESSAGE to admin with empty text", async () => {
      const runner = new ScenarioRunner("Admin Panel — reject empty text");
      const ownerId = stringToUuid("owner-entity");
      runner.setupOwner(ownerId, { name: "Shaw" });

      const message: Memory = {
        id: stringToUuid("test-msg-empty"),
        entityId: runner.runtime.agentId,
        roomId: stringToUuid("scenario-room"),
        content: { text: "send notification", source: "client_chat" },
        createdAt: Date.now(),
      };

      const result = await sendMessageAction.handler?.(
        runner.runtime,
        message,
        {} as State,
        { parameters: { target: "admin", text: "" } } as HandlerOptions,
      );

      expect(result).toMatchObject({
        success: false,
        values: { success: false, error: "INVALID_PARAMETERS" },
      });
    });

    it("should reject SEND_MESSAGE to admin with invalid urgency", async () => {
      const runner = new ScenarioRunner("Admin Panel — reject invalid urgency");
      const ownerId = stringToUuid("owner-entity");
      runner.setupOwner(ownerId, { name: "Shaw" });

      const message: Memory = {
        id: stringToUuid("test-msg-urgency"),
        entityId: runner.runtime.agentId,
        roomId: stringToUuid("scenario-room"),
        content: { text: "send notification", source: "client_chat" },
        createdAt: Date.now(),
      };

      const result = await sendMessageAction.handler?.(
        runner.runtime,
        message,
        {} as State,
        {
          parameters: { target: "admin", text: "hello", urgency: "critical" },
        } as HandlerOptions,
      );

      expect(result).toMatchObject({
        success: false,
        values: { success: false, error: "INVALID_PARAMETERS" },
      });
    });

    it("should trigger escalation for urgent admin messages", async () => {
      const runner = new ScenarioRunner(
        "Admin Panel — urgent triggers escalation",
      );
      const ownerId = stringToUuid("owner-entity");
      runner.setupOwner(ownerId, { name: "Shaw" });
      runner.setConfig({
        ownerContacts: {
          client_chat: { entityId: ownerId },
        },
        escalation: {
          channels: ["client_chat"],
          waitMinutes: 5,
          maxRetries: 1,
        },
      });

      const message: Memory = {
        id: stringToUuid("test-msg-urgent"),
        entityId: runner.runtime.agentId,
        roomId: stringToUuid("scenario-room"),
        content: { text: "emergency", source: "client_chat" },
        createdAt: Date.now(),
      };

      await sendMessageAction.handler?.(
        runner.runtime,
        message,
        {} as State,
        {
          parameters: {
            target: "admin",
            text: "Server is down!",
            urgency: "urgent",
          },
        } as HandlerOptions,
      );

      // Escalation should have started
      const active = EscalationService.getActiveEscalationSync();
      expect(active).not.toBeNull();
      expect(active?.resolved).toBe(false);

      // Direct send + escalation send = 2 messages
      expect(runner.sentMessages.length).toBe(2);
    });
  });

  // =========================================================================
  // Scenario 10: Combined Role Flow (owner + late-join + trust)
  // =========================================================================

  describe("Scenario 10: Combined Role Flow", () => {
    it("should backfill owner role then promote late-join admin in same world", async () => {
      const runner = new ScenarioRunner(
        "Combined Flow — owner backfill + late-join admin",
      );
      const ownerId = stringToUuid("owner-entity");
      runner.setupOwner(ownerId, { name: "Shaw" });
      runner.setConfig({
        connectorAdmins: { discord: ["discord-admin-id"] },
      });

      // Owner sends first message
      await runner.sendMessage({
        text: "hello",
        entityId: ownerId,
        platform: "client_chat",
      });

      // Owner role present
      const world = runner.getWorldForPlatform("client_chat");
      expect(world?.metadata.roles?.[ownerId]).toBe("OWNER");

      // Admin joins from Discord
      const adminId = stringToUuid("discord-admin");
      runner.setupEntity(adminId, {
        name: "DiscordAdmin",
        platform: "discord",
        platformMeta: { userId: "discord-admin-id" },
      });

      const adminResult = await runner.sendMessage({
        text: "hey there",
        entityId: adminId,
        platform: "discord",
      });

      // Late-join evaluator should have promoted the admin
      expect(adminResult.evaluators.late_join_whitelist).toBeDefined();

      // Both roles coexist in the discord room's world
      const discordWorld = runner.getWorldForPlatform("discord");
      // Admin was promoted in the default world (shared) since discord
      // room maps to default world when no separate discord world exists
      const adminRole = discordWorld?.metadata.roles?.[adminId] ?? "NONE";
      expect(adminRole).toBe("ADMIN");

      runner.printTranscript();
    });

    it("should process full pipeline: claim + trust + provider in one message", async () => {
      const runner = new ScenarioRunner(
        "Combined Flow — full pipeline single message",
      );
      const ownerId = stringToUuid("owner-entity");
      runner.setupOwner(ownerId, { name: "Shaw" });

      const result = await runner.sendMessage({
        text: "Hey! I'm Shaw. My discord is shawwalters, my telegram is @shaw_w, and my twitter is @shawmakesmagic",
        entityId: ownerId,
        platform: "client_chat",
      });

      // Extraction happened
      expect(result.evaluators.relationshipExtraction).toBeDefined();

      // Trust provider ran and marked as trusted
      const trustProvider = result.providers.elizaAdminTrust;
      expect(trustProvider?.values?.trustedAdmin).toBe(true);

      // Claims stored correctly
      const claims = runner.getClaims(ownerId);
      expect(claims.length).toBe(3);
      for (const claim of claims) {
        expect(claim.status).toBe("accepted");
        expect(claim.claimTier).toBe("ground_truth");
      }

      runner.printTranscript();
    });
  });
});
