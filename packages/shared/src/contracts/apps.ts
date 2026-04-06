/**
 * Shared app manager contracts.
 */

export type AppSessionMode = "viewer" | "spectate-and-steer" | "external";

export type AppSessionFeature =
  | "commands"
  | "telemetry"
  | "pause"
  | "resume"
  | "suggestions";

export type AppSessionControlAction = "pause" | "resume";
export type AppRunViewerAttachment = "attached" | "detached" | "unavailable";
export type AppRunHealthState = "healthy" | "degraded" | "offline";
export type AppRunCapabilityAvailability =
  | "available"
  | "unavailable"
  | "unknown";
export type AppRunEventKind =
  | "launch"
  | "refresh"
  | "attach"
  | "detach"
  | "stop"
  | "status"
  | "summary"
  | "health";
export type AppRunEventSeverity = "info" | "warning" | "error";

export type AppSessionJsonValue =
  | string
  | number
  | boolean
  | null
  | AppSessionJsonValue[]
  | { [key: string]: AppSessionJsonValue };

export interface AppViewerAuthMessage {
  type: string;
  authToken?: string;
  characterId?: string;
  sessionToken?: string;
  agentId?: string;
  followEntity?: string;
}

export interface AppViewerConfig {
  url: string;
  embedParams?: Record<string, string>;
  postMessageAuth?: boolean;
  sandbox?: string;
  authMessage?: AppViewerAuthMessage;
}

export interface AppSessionConfig {
  mode: AppSessionMode;
  features?: AppSessionFeature[];
}

export interface AppSessionState {
  sessionId: string;
  appName: string;
  mode: AppSessionMode;
  status: string;
  displayName?: string;
  agentId?: string;
  characterId?: string;
  followEntity?: string;
  canSendCommands?: boolean;
  controls?: AppSessionControlAction[];
  summary?: string | null;
  goalLabel?: string | null;
  suggestedPrompts?: string[];
  telemetry?: Record<string, AppSessionJsonValue> | null;
}

export interface AppSessionActionResult {
  success: boolean;
  message: string;
  session?: AppSessionState | null;
}

export interface AppRunHealth {
  state: AppRunHealthState;
  message: string | null;
}

export interface AppRunHealthFacet {
  state: AppRunHealthState | "unknown";
  message: string | null;
}

export interface AppRunHealthDetails {
  checkedAt: string | null;
  auth: AppRunHealthFacet;
  runtime: AppRunHealthFacet;
  viewer: AppRunHealthFacet;
  chat: AppRunHealthFacet;
  control: AppRunHealthFacet;
  message: string | null;
}

export interface AppRunEvent {
  eventId: string;
  kind: AppRunEventKind;
  severity: AppRunEventSeverity;
  message: string;
  createdAt: string;
  status?: string | null;
  details?: Record<string, AppSessionJsonValue> | null;
}

export interface AppRunAwaySummary {
  generatedAt: string;
  message: string;
  eventCount: number;
  since: string | null;
  until: string | null;
}

export interface AppRunSummary {
  runId: string;
  appName: string;
  displayName: string;
  pluginName: string;
  launchType: string;
  launchUrl: string | null;
  viewer: AppViewerConfig | null;
  session: AppSessionState | null;
  characterId: string | null;
  agentId: string | null;
  status: string;
  summary: string | null;
  startedAt: string;
  updatedAt: string;
  lastHeartbeatAt: string | null;
  supportsBackground: boolean;
  supportsViewerDetach: boolean;
  chatAvailability: AppRunCapabilityAvailability;
  controlAvailability: AppRunCapabilityAvailability;
  viewerAttachment: AppRunViewerAttachment;
  recentEvents: AppRunEvent[];
  awaySummary: AppRunAwaySummary | null;
  health: AppRunHealth;
  healthDetails: AppRunHealthDetails;
}

export interface AppRunActionResult {
  success: boolean;
  message: string;
  run?: AppRunSummary | null;
}

export type AppLaunchDiagnosticSeverity = "info" | "warning" | "error";

export interface AppLaunchDiagnostic {
  code: string;
  severity: AppLaunchDiagnosticSeverity;
  message: string;
}

export interface AppLaunchResult {
  pluginInstalled: boolean;
  needsRestart: boolean;
  displayName: string;
  launchType: string;
  launchUrl: string | null;
  viewer: AppViewerConfig | null;
  session: AppSessionState | null;
  run: AppRunSummary | null;
  diagnostics?: AppLaunchDiagnostic[];
}

export interface InstalledAppInfo {
  name: string;
  displayName: string;
  pluginName: string;
  version: string;
  installedAt: string;
}

export interface AppStopResult {
  success: boolean;
  appName: string;
  runId: string | null;
  stoppedAt: string;
  pluginUninstalled: boolean;
  needsRestart: boolean;
  stopScope: "plugin-uninstalled" | "viewer-session" | "no-op";
  message: string;
}

function packageNameToBasename(packageName: string): string {
  return packageName.trim().replace(/^@[^/]+\//, "").trim();
}

export function packageNameToAppRouteSlug(
  packageName: string,
): string | null {
  const basename = packageNameToBasename(packageName);
  if (!basename) return null;

  const withoutPrefix = basename.replace(/^(app|plugin)-/, "").trim();
  return withoutPrefix || basename;
}

export function packageNameToAppDisplayName(packageName: string): string {
  const slug =
    packageNameToAppRouteSlug(packageName) ??
    packageNameToBasename(packageName) ??
    packageName.trim();

  return slug
    .split(/[^a-zA-Z0-9]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function hasAppInterface(
  value: { kind?: string | null; appMeta?: unknown } | null | undefined,
): boolean {
  return Boolean(value && (value.kind === "app" || value.appMeta));
}
