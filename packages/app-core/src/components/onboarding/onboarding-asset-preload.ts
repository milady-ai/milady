import { getBootConfig } from "../../config/boot-config";
import { getVrmPreviewUrl, getVrmUrl } from "../../state/vrm";
import {
  fetchWithTimeout,
  resolveCompatApiToken,
} from "../../utils/api-request";
import { resolveApiUrl } from "../../utils/asset-url";
import { PREMADE_VOICES } from "../../voice/types";
import { prefetchVrmToCache } from "../avatar/VrmEngine";
import type { CharacterRosterEntry } from "../character/CharacterRoster";
import { buildPreviewTtsRequestPlans } from "./identity-preview-tts";

const PREVIEW_TTS_FETCH_TIMEOUT_MS = 15_000;
const START_SCREEN_PRELOAD_TIMEOUT_MS = 10_000;
const imagePreloadSet = new Set<string>();
const linkPreloadSet = new Set<string>();
const vrmPrefetchSet = new Set<string>();
const voicePreviewPromiseCache = new Map<string, Promise<Blob | null>>();
const imagePromiseCache = new Map<string, Promise<boolean>>();
const vrmPromiseCache = new Map<string, Promise<boolean>>();

type OnboardingAssetKind = "roster" | "image" | "vrm" | "voice";

export interface OnboardingAssetPreloadSnapshot {
  started: boolean;
  ready: boolean;
  timedOut: boolean;
  phase: "idle" | "loading" | "ready" | "timeout";
  loaded: number;
  total: number;
  criticalLoaded: number;
  criticalTotal: number;
  loadedLabel: string;
  criticalLabel: string;
  connectionLabel: string;
  rosterCount: number;
}

interface ProgressItem {
  key: string;
  kind: OnboardingAssetKind;
  critical: boolean;
}

interface NetworkProfile {
  connectionLabel: string;
  imageConcurrency: number;
  vrmConcurrency: number;
  voiceConcurrency: number;
  waitForVrmsBeforeReady: boolean;
}

interface PreloadSession {
  key: string;
  snapshot: OnboardingAssetPreloadSnapshot;
  listeners: Set<(snapshot: OnboardingAssetPreloadSnapshot) => void>;
  promise: Promise<OnboardingAssetPreloadSnapshot>;
}

const EMPTY_SNAPSHOT: OnboardingAssetPreloadSnapshot = {
  started: false,
  ready: false,
  timedOut: false,
  phase: "idle",
  loaded: 0,
  total: 0,
  criticalLoaded: 0,
  criticalTotal: 0,
  loadedLabel: "0/0",
  criticalLabel: "0/0",
  connectionLabel: "",
  rosterCount: 0,
};

let activePreloadSession: PreloadSession | null = null;

function appendPreloadLink(
  href: string,
  as: "image" | "fetch",
  type?: string,
): void {
  if (typeof document === "undefined") return;
  const key = `${as}:${href}`;
  if (linkPreloadSet.has(key)) return;
  linkPreloadSet.add(key);
  const link = document.createElement("link");
  link.rel = "preload";
  link.as = as;
  link.href = href;
  if (type) link.type = type;
  if (as === "fetch") link.crossOrigin = "anonymous";
  document.head?.appendChild(link);
}

function warmImage(url: string): Promise<boolean> {
  if (typeof window === "undefined" || typeof globalThis.Image !== "function") {
    return Promise.resolve(false);
  }
  const cached = imagePromiseCache.get(url);
  if (cached) return cached;

  const promise = new Promise<boolean>((resolve) => {
    if (imagePreloadSet.has(url)) {
      resolve(true);
      return;
    }
    imagePreloadSet.add(url);
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(true);
    image.onerror = () => resolve(false);
    image.src = url;
  });

  imagePromiseCache.set(url, promise);
  return promise;
}

function getNetworkProfile(): NetworkProfile {
  const nav = typeof navigator !== "undefined" ? navigator : undefined;
  const connection =
    nav && "connection" in nav
      ? (
          nav as Navigator & {
            connection?: { effectiveType?: string; saveData?: boolean };
          }
        ).connection
      : undefined;

  const effectiveType = connection?.effectiveType?.toLowerCase() ?? "";
  const saveData = connection?.saveData === true;
  const slowConnection =
    saveData || effectiveType === "slow-2g" || effectiveType === "2g";
  const mediumConnection = effectiveType === "3g";

  if (slowConnection) {
    return {
      connectionLabel: saveData ? "data-saver" : effectiveType || "slow",
      imageConcurrency: 2,
      vrmConcurrency: 1,
      voiceConcurrency: 1,
      waitForVrmsBeforeReady: false,
    };
  }

  if (mediumConnection) {
    return {
      connectionLabel: effectiveType,
      imageConcurrency: 4,
      vrmConcurrency: 2,
      voiceConcurrency: 2,
      waitForVrmsBeforeReady: false,
    };
  }

  return {
    connectionLabel: effectiveType || "fast",
    imageConcurrency: 6,
    vrmConcurrency: 3,
    voiceConcurrency: 3,
    waitForVrmsBeforeReady: true,
  };
}

function createSnapshot(
  partial?: Partial<OnboardingAssetPreloadSnapshot>,
): OnboardingAssetPreloadSnapshot {
  const next = {
    ...EMPTY_SNAPSHOT,
    ...partial,
  };
  return {
    ...next,
    loadedLabel: `${next.loaded}/${next.total}`,
    criticalLabel: `${next.criticalLoaded}/${next.criticalTotal}`,
  };
}

function emitSnapshot(
  session: PreloadSession,
  partial?: Partial<OnboardingAssetPreloadSnapshot>,
): OnboardingAssetPreloadSnapshot {
  session.snapshot = createSnapshot({
    ...session.snapshot,
    ...partial,
  });
  for (const listener of session.listeners) {
    listener(session.snapshot);
  }
  return session.snapshot;
}

function buildRosterSessionKey(entries: CharacterRosterEntry[]): string {
  const boot = getBootConfig();
  const bootVersion = [
    boot.apiBase ?? "",
    boot.assetBaseUrl ?? "",
    boot.vrmAssets?.length ?? 0,
    boot.onboardingStyles?.length ?? 0,
  ].join("|");

  return JSON.stringify(
    entries.map((entry) => ({
      id: entry.id,
      avatarIndex: entry.avatarIndex,
      voicePresetId: entry.voicePresetId ?? "",
      catchphrase: entry.catchphrase ?? "",
    })),
  ).concat(`::${bootVersion}`);
}

async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number,
): Promise<T[]> {
  if (tasks.length === 0) return [];
  const safeConcurrency = Math.max(1, Math.min(concurrency, tasks.length));
  const results: T[] = new Array(tasks.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= tasks.length) return;
      results[index] = await tasks[index]();
    }
  }

  await Promise.all(Array.from({ length: safeConcurrency }, () => worker()));
  return results;
}

function buildProgressItems(
  entries: CharacterRosterEntry[],
  waitForVrmsBeforeReady: boolean,
): ProgressItem[] {
  const items: ProgressItem[] = [
    {
      key: "roster",
      kind: "roster",
      critical: true,
    },
  ];

  for (const entry of entries) {
    items.push({
      key: `image:${entry.id}`,
      kind: "image",
      critical: true,
    });
    items.push({
      key: `vrm:${entry.id}`,
      kind: "vrm",
      critical: waitForVrmsBeforeReady,
    });
    if (entry.catchphrase?.trim()) {
      items.push({
        key: `voice:${entry.id}`,
        kind: "voice",
        critical: false,
      });
    }
  }

  return items;
}

function createProgressTracker(
  session: PreloadSession,
): (item: ProgressItem, success?: boolean) => void {
  const completed = new Set<string>();
  return (item: ProgressItem, success = true) => {
    if (completed.has(item.key)) return;
    completed.add(item.key);
    const loaded = session.snapshot.loaded + 1;
    const criticalLoaded =
      item.critical && success
        ? session.snapshot.criticalLoaded + 1
        : session.snapshot.criticalLoaded;
    const criticalReady =
      session.snapshot.criticalTotal === 0 ||
      criticalLoaded >= session.snapshot.criticalTotal;

    emitSnapshot(session, {
      loaded,
      criticalLoaded,
      ready: session.snapshot.timedOut || criticalReady,
      phase: session.snapshot.timedOut
        ? "timeout"
        : criticalReady
          ? "ready"
          : "loading",
      timedOut: session.snapshot.timedOut,
    });
  };
}

export function preloadRosterImages(entries: CharacterRosterEntry[]): void {
  for (const entry of entries) {
    const previewUrl = getVrmPreviewUrl(entry.avatarIndex);
    appendPreloadLink(previewUrl, "image", "image/png");
    void warmImage(previewUrl);
  }
}

async function warmVrm(url: string): Promise<boolean> {
  const cached = vrmPromiseCache.get(url);
  if (cached) return cached;

  const promise = (async () => {
    appendPreloadLink(url, "fetch", "model/gltf-binary");
    if (!vrmPrefetchSet.has(url)) {
      vrmPrefetchSet.add(url);
      void prefetchVrmToCache(url);
    }
    try {
      const response = await fetch(url, { cache: "force-cache" });
      if (!response.ok) return false;
      await response.arrayBuffer();
      return true;
    } catch {
      return false;
    }
  })();

  vrmPromiseCache.set(url, promise);
  return promise;
}

export function preloadRosterVrms(entries: CharacterRosterEntry[]): void {
  for (const entry of entries) {
    const vrmUrl = getVrmUrl(entry.avatarIndex);
    void warmVrm(vrmUrl);
  }
}

export async function getOnboardingVoicePreviewBlob(
  entry: Pick<CharacterRosterEntry, "catchphrase" | "voicePresetId">,
): Promise<Blob | null> {
  const text = entry.catchphrase?.trim();
  if (!text || typeof window === "undefined") return null;

  const selectedPreset = entry.voicePresetId
    ? PREMADE_VOICES.find((voice) => voice.id === entry.voicePresetId)
    : undefined;
  const voiceId = selectedPreset?.voiceId?.trim() ?? "";
  const cacheKey = `${voiceId}::${text}`;
  const cached = voicePreviewPromiseCache.get(cacheKey);
  if (cached) return cached;

  const promise = (async () => {
    const apiToken = resolveCompatApiToken();
    const requestPlans = buildPreviewTtsRequestPlans({
      text,
      voiceId: voiceId || undefined,
      // Prefer the cloud proxy first during onboarding so Eliza Cloud logins
      // can synthesize the selected preset voice without requiring a browser key.
      preferCloudProxy: true,
    });

    for (const plan of requestPlans) {
      try {
        const response = await fetchWithTimeout(
          resolveApiUrl(plan.endpoint),
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "audio/mpeg",
              ...(apiToken ? { Authorization: `Bearer ${apiToken}` } : {}),
            },
            body: JSON.stringify(plan.body),
          },
          PREVIEW_TTS_FETCH_TIMEOUT_MS,
        );
        if (!response.ok) continue;
        const audioBlob = await response.blob();
        if (audioBlob.size > 0) {
          return audioBlob;
        }
      } catch {
        // Best-effort warm cache — try the next endpoint or return null.
      }
    }

    return null;
  })();

  voicePreviewPromiseCache.set(cacheKey, promise);
  return promise;
}

export function preloadOnboardingCharacterAssets(
  entries: CharacterRosterEntry[],
  options?: { voiceEntry?: CharacterRosterEntry | null },
): void {
  primeOnboardingCharacterAssets(entries);
  if (options?.voiceEntry) {
    void getOnboardingVoicePreviewBlob(options.voiceEntry);
  }
}

function createSession(
  entries: CharacterRosterEntry[],
  profile: NetworkProfile,
): PreloadSession {
  const items = buildProgressItems(entries, profile.waitForVrmsBeforeReady);
  const criticalTotal = items.filter((item) => item.critical).length;
  const session: PreloadSession = {
    key: buildRosterSessionKey(entries),
    listeners: new Set(),
    snapshot: createSnapshot({
      started: true,
      ready: false,
      timedOut: false,
      phase: "loading",
      total: items.length,
      criticalTotal,
      connectionLabel: profile.connectionLabel,
      rosterCount: entries.length,
    }),
    promise: Promise.resolve(EMPTY_SNAPSHOT),
  };

  const markComplete = createProgressTracker(session);
  const rosterItem = items.find((item) => item.kind === "roster");

  session.promise = (async () => {
    markComplete(
      rosterItem ?? { key: "roster", kind: "roster", critical: true },
    );

    const setTimeoutFn =
      typeof window !== "undefined" && typeof window.setTimeout === "function"
        ? window.setTimeout.bind(window)
        : globalThis.setTimeout.bind(globalThis);
    const clearTimeoutFn =
      typeof window !== "undefined" && typeof window.clearTimeout === "function"
        ? window.clearTimeout.bind(window)
        : globalThis.clearTimeout.bind(globalThis);

    const timeoutId = setTimeoutFn(() => {
      if (!session.snapshot.ready) {
        emitSnapshot(session, {
          ready: true,
          timedOut: true,
          phase: "timeout",
        });
      }
    }, START_SCREEN_PRELOAD_TIMEOUT_MS);

    const imageTasks = entries.map((entry) => async () => {
      const item = items.find(
        (candidate) => candidate.key === `image:${entry.id}`,
      );
      const previewUrl = getVrmPreviewUrl(entry.avatarIndex);
      appendPreloadLink(previewUrl, "image", "image/png");
      const success = await warmImage(previewUrl);
      if (item) markComplete(item, success);
    });

    const vrmTasks = entries.map((entry) => async () => {
      const item = items.find(
        (candidate) => candidate.key === `vrm:${entry.id}`,
      );
      const vrmUrl = getVrmUrl(entry.avatarIndex);
      const success = await warmVrm(vrmUrl);
      if (item) markComplete(item, success);
    });

    const voiceTasks = entries
      .filter((entry) => entry.catchphrase?.trim())
      .map((entry) => async () => {
        const item = items.find(
          (candidate) => candidate.key === `voice:${entry.id}`,
        );
        const success = Boolean(await getOnboardingVoicePreviewBlob(entry));
        if (item) markComplete(item, success);
      });

    await Promise.all([
      runWithConcurrency(imageTasks, profile.imageConcurrency),
      runWithConcurrency(vrmTasks, profile.vrmConcurrency),
      runWithConcurrency(voiceTasks, profile.voiceConcurrency),
    ]);

    clearTimeoutFn(timeoutId);
    const criticalReady =
      session.snapshot.criticalTotal === 0 ||
      session.snapshot.criticalLoaded >= session.snapshot.criticalTotal;
    return emitSnapshot(session, {
      ready: session.snapshot.timedOut || criticalReady,
      timedOut: session.snapshot.timedOut,
      phase: session.snapshot.timedOut
        ? "timeout"
        : criticalReady
          ? "ready"
          : "loading",
      loaded: session.snapshot.total,
      criticalLoaded: session.snapshot.criticalLoaded,
    });
  })();

  return session;
}

export function primeOnboardingCharacterAssets(
  entries: CharacterRosterEntry[],
): Promise<OnboardingAssetPreloadSnapshot> {
  if (typeof window === "undefined") {
    return Promise.resolve(EMPTY_SNAPSHOT);
  }

  const key = buildRosterSessionKey(entries);
  if (activePreloadSession?.key === key) {
    return activePreloadSession.promise;
  }

  const profile = getNetworkProfile();
  activePreloadSession = createSession(entries, profile);
  return activePreloadSession.promise;
}

export function subscribeOnboardingAssetPreload(
  listener: (snapshot: OnboardingAssetPreloadSnapshot) => void,
): () => void {
  const session = activePreloadSession;
  if (!session) {
    listener(EMPTY_SNAPSHOT);
    return () => {};
  }

  session.listeners.add(listener);
  listener(session.snapshot);
  return () => {
    session.listeners.delete(listener);
  };
}

export function getOnboardingAssetPreloadSnapshot(): OnboardingAssetPreloadSnapshot {
  return activePreloadSession?.snapshot ?? EMPTY_SNAPSHOT;
}
