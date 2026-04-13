declare module "@elizaos/plugin-agent-orchestrator";
declare module "@elizaos/plugin-agent-skills";
declare module "@elizaos/plugin-elizacloud";
declare module "@elizaos/plugin-pi-ai";
declare module "@elizaos/plugin-commands";
declare module "@elizaos/plugin-cron";
declare module "@elizaos/plugin-edge-tts";
declare module "@elizaos/plugin-edge-tts/node";
declare module "@elizaos/plugin-local-embedding";
declare module "@elizaos/plugin-ollama";
declare module "@elizaos/plugin-openai";
declare module "@elizaos/plugin-shell";
declare module "@elizaos/signal-native";
declare module "qrcode";

declare module "@elizaos/app-knowledge/routes" {
  export type KnowledgeRouteContext = any;
  export type KnowledgeRouteHelpers = any;
  export const handleKnowledgeRoutes: (
    context: any,
  ) => Promise<boolean> | boolean;
}

declare module "@elizaos/app-knowledge/service-loader" {
  export type KnowledgeLoadFailReason = any;
  export type KnowledgeServiceLike = any;
  export type KnowledgeServiceResult = any;
  export const getKnowledgeService: (runtime: any) => Promise<any>;
  export const getKnowledgeTimeoutMs: (...args: any[]) => number;
}

declare module "@elizaos/app-training/routes/trajectory" {
  export const handleTrajectoryRoute: (
    ...args: any[]
  ) => Promise<boolean> | boolean;
}

declare module "@elizaos/app-training/services" {
  export type BackendAvailability = any;
  export type TrainingServiceLike = any;
  export type TrainingServiceWithRuntime = any;
  export const detectAvailableBackends: (...args: any[]) => Promise<any>;
  export const clearBackendCache: (...args: any[]) => void;
}

declare module "@elizaos/app-training/routes/training" {
  export type TrainingRouteHelpers = any;
  export const handleTrainingRoutes: (
    ...args: any[]
  ) => Promise<boolean> | boolean;
}

declare module "@elizaos/app-training/core/context-types" {
  export type AgentContext = string;
  export const AGENT_CONTEXTS: AgentContext[];
}

declare module "@elizaos/app-training/core/context-catalog" {
  import type { AgentContext } from "@elizaos/app-training/core/context-types";

  export type ContextResolutionSource = string;
  export const ACTION_CONTEXT_MAP: Record<string, AgentContext[]>;
  export const PROVIDER_CONTEXT_MAP: Record<string, AgentContext[]>;
  export const ALL_CONTEXTS: AgentContext[];
  export const resolveActionContexts: (...args: any[]) => AgentContext[];
  export const resolveProviderContexts: (...args: any[]) => AgentContext[];
  export const resolveActionContextResolution: (...args: any[]) => {
    contexts: AgentContext[];
    source: ContextResolutionSource;
  };
  export const resolveProviderContextResolution: (...args: any[]) => {
    contexts: AgentContext[];
    source: ContextResolutionSource;
  };
}

declare module "@elizaos/app-training/core/cli" {}
declare module "@elizaos/app-training/core/context-audit" {}
declare module "@elizaos/app-training/core/dataset-generator" {}
declare module "@elizaos/app-training/core/replay-validator" {}
declare module "@elizaos/app-training/core/roleplay-executor" {}
declare module "@elizaos/app-training/core/roleplay-trajectories" {}
declare module "@elizaos/app-training/core/scenario-blueprints" {}
declare module "@elizaos/app-training/core/trajectory-task-datasets" {}
declare module "@elizaos/app-training/core/vertex-tuning" {}

declare module "abitype" {
  export type TypedData = Record<
    string,
    ReadonlyArray<{ name: string; type: string; [key: string]: unknown }>
  >;
  export type TypedDataDomain = {
    name?: string;
    version?: string;
    chainId?: bigint | number | undefined;
    verifyingContract?: `0x${string}` | undefined;
    salt?: `0x${string}` | undefined;
  };
  export type TypedDataToPrimitiveTypes<T extends TypedData> = {
    [K in keyof T]: unknown;
  };
  export type Address = `0x${string}`;
  export type TypedDataParameter = { name: string; type: string };
  export type TypedDataType = string;
}

declare module "@elizaos/core/roles" {
  import type { IAgentRuntime, Memory, UUID } from "@elizaos/core";

  export type RoleName = "OWNER" | "ADMIN" | "USER" | "GUEST";
  export type RoleGrantSource = "owner" | "manual" | "connector_admin";
  export const ROLE_RANK: Record<RoleName, number>;
  export type RolesWorldMetadata = Record<string, unknown> & {
    ownership?: { ownerId?: string };
    roles?: Record<string, RoleName>;
    roleSources?: Record<string, RoleGrantSource>;
  };
  export type ConnectorAdminWhitelist = Record<string, string[]>;
  export interface RolesConfig {
    connectorAdmins?: ConnectorAdminWhitelist;
    [key: string]: unknown;
  }
  export interface RoleCheckResult {
    entityId: UUID;
    role: RoleName;
    isOwner?: boolean;
    isAdmin?: boolean;
    canManageRoles?: boolean;
    source?: RoleGrantSource;
    [key: string]: unknown;
  }
  export interface PrivateAccessCheckResult extends RoleCheckResult {
    canAccessPrivateWorld?: boolean;
    worldId?: UUID;
  }
  export type WorldRoleResolution = {
    world: Awaited<ReturnType<IAgentRuntime["getWorld"]>>;
    metadata: RolesWorldMetadata;
  };
  export type ConnectorAdminMatch = {
    connector: string;
    matchedField: string;
    matchedValue: string;
  };
  export type ServerOwnershipState = RolesWorldMetadata | null;

  export function checkSenderRole(
    runtime: IAgentRuntime,
    message: Memory,
  ): Promise<RoleCheckResult | null>;
  export function checkSenderPrivateAccess(
    runtime: IAgentRuntime,
    message: Memory,
  ): Promise<PrivateAccessCheckResult | null>;
  export function canModifyRole(
    actorRole: RoleName,
    targetCurrentRole: RoleName,
    newRole: RoleName,
  ): boolean;
  export function getConfiguredOwnerEntityIds(
    runtime: IAgentRuntime,
  ): string[];
  export function getConnectorAdminWhitelist(
    runtime: IAgentRuntime,
  ): ConnectorAdminWhitelist;
  export function getEntityRole(
    metadata: RolesWorldMetadata | undefined,
    entityId: string,
  ): RoleName;
  export function getLiveEntityMetadataFromMessage(
    message: Memory,
  ): Record<string, unknown> | undefined;
  export function getUserServerRole(
    runtime: IAgentRuntime,
    entityId: string,
    serverId: string,
  ): Promise<RoleName | "NONE">;
  export function findWorldsForOwner(
    runtime: IAgentRuntime,
    entityId: string,
  ): Promise<Array<Awaited<ReturnType<IAgentRuntime["getAllWorlds"]>>[number]> | null>;
  export function hasConfiguredCanonicalOwner(
    runtime: IAgentRuntime,
  ): boolean;
  export function matchEntityToConnectorAdminWhitelist(
    entityMetadata: Record<string, unknown> | null | undefined,
    whitelist: ConnectorAdminWhitelist | Record<string, unknown> | undefined,
  ): ConnectorAdminMatch | null;
  export function normalizeRole(raw: unknown): RoleName;
  export function setEntityRole(
    runtime: IAgentRuntime,
    message: Memory,
    targetEntityId: string,
    newRole: RoleName,
    source?: RoleGrantSource,
  ): Promise<Record<string, RoleName>>;
  export function resolveCanonicalOwnerId(
    runtime: IAgentRuntime,
    metadata?: RolesWorldMetadata,
  ): string | null;
  export function resolveCanonicalOwnerIdForMessage(
    runtime: IAgentRuntime,
    message: Memory,
  ): Promise<string | null>;
  export function resolveEntityRole(
    runtime: IAgentRuntime,
    world: Awaited<ReturnType<IAgentRuntime["getWorld"]>>,
    metadata: RolesWorldMetadata | undefined,
    entityId: string,
    options?: { liveEntityMetadata?: Record<string, unknown> | null },
  ): Promise<RoleName>;
  export function resolveWorldForMessage(
    runtime: IAgentRuntime,
    message: Memory,
  ): Promise<WorldRoleResolution | null>;
  export function setConnectorAdminWhitelist(
    runtime: IAgentRuntime,
    whitelist: ConnectorAdminWhitelist | Record<string, unknown> | undefined,
  ): void;
}

declare module "@elizaos/plugin-sql" {
  import type { Plugin } from "@elizaos/core";

  export const PGLITE_ERROR_CODES: {
    ACTIVE_LOCK: string;
    CORRUPT_DATA: string;
    MANUAL_RESET_REQUIRED: string;
  };

  export function getPgliteErrorCode(error: unknown): string | null;
  export function createPgliteInitError(
    code: string,
    message: string,
    options?: Record<string, unknown>,
  ): Error;

  const plugin: Plugin;
  export default plugin;
}

declare module "jsdom" {
  export class JSDOM {
    constructor(
      html?: string,
      options?: {
        url?: string;
        pretendToBeVisual?: boolean;
        [key: string]: unknown;
      },
    );
    window: Window & typeof globalThis;
    serialize(): string;
  }
}
