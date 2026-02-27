import type { IAgentRuntime } from "@elizaos/core";

// ---------------------------------------------------------------------------
// Module-level singleton state (ESM live bindings ensure all consumers see
// mutations via the setter functions below).
// ---------------------------------------------------------------------------

export let chatPollTimer: ReturnType<typeof setInterval> | null = null;
export let viewerStatsPollTimer: ReturnType<typeof setInterval> | null = null;
export let lastSeenId: string | null = null;
export let pluginRuntime: IAgentRuntime | null = null;
export let chatPollInFlight = false;
export let ourUserDbId: string | null = null;
export let initialPollDone = false;
export let cachedAccessToken = "";
export let cachedApiUrl = "https://retake.tv/api/v1";

/** Tracks usernames seen during the current stream session for new viewer detection. */
export const seenViewers = new Set<string>();

// ---------------------------------------------------------------------------
// Setters
// ---------------------------------------------------------------------------

export function setChatPollTimer(t: ReturnType<typeof setInterval> | null) {
  chatPollTimer = t;
}
export function setViewerStatsPollTimer(
  t: ReturnType<typeof setInterval> | null,
) {
  viewerStatsPollTimer = t;
}
export function setLastSeenId(id: string | null) {
  lastSeenId = id;
}
export function setPluginRuntime(rt: IAgentRuntime | null) {
  pluginRuntime = rt;
}
export function setChatPollInFlight(v: boolean) {
  chatPollInFlight = v;
}
export function setOurUserDbId(id: string | null) {
  ourUserDbId = id;
}
export function setInitialPollDone(v: boolean) {
  initialPollDone = v;
}
export function setCachedAccessToken(token: string) {
  cachedAccessToken = token;
}
export function setCachedApiUrl(url: string) {
  cachedApiUrl = url;
}
