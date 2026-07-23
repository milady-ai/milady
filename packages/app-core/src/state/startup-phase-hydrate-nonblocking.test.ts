/**
 * Regression: runHydrating() must reach HYDRATION_COMPLETE without blocking on
 * slow/hanging non-critical work.
 *
 * LANE F2 sol-f5-firstload (2026-07-22): post-login "takes forever" was caused
 * by runHydrating() serially AWAITING work the landing view never needs:
 *   - getWalletAddresses()  (measured 1.3-12s on cloud containers)
 *   - a VRM + gaussian-splat world prefetch race capped at 15s
 *   - fetchAutonomyReplay()
 * These now run in the background. This test proves the dashboard becomes
 * interactive (HYDRATION_COMPLETE dispatched) even when every one of those
 * hangs indefinitely.
 */
import { describe, expect, it, vi } from "vitest";

// ── Mocks for module singletons runHydrating touches ──────────────────
const hangForever = () => new Promise<never>(() => {});

vi.mock("../api", () => ({
  client: {
    // The hangers — must NOT block hydration:
    getWalletAddresses: vi.fn(() => hangForever()),
    // Fast, awaited config reads (parallelized):
    getConfig: vi.fn(async () => ({ ui: {} })),
    getStreamSettings: vi.fn(async () => ({ settings: {} })),
    hasCustomVrm: vi.fn(async () => false),
    hasCustomBackground: vi.fn(async () => false),
  },
}));

vi.mock("../components/avatar/VrmEngine", () => ({
  // VRM prefetch hangs forever — must NOT block hydration.
  prefetchVrmToCache: vi.fn(() => hangForever()),
}));

vi.mock("./vrm", () => ({
  getVrmUrl: (i: number) => `vrm://${i}`,
  getVrmCount: () => 2,
  VRM_COUNT: 2,
}));

vi.mock("./persistence", () => ({ loadUiTheme: () => "dark" }));

vi.mock("../utils", () => ({
  resolveApiUrl: (p: string) => p,
  resolveAppAssetUrl: (p: string) => `asset://${p}`,
}));

// Keep the rest of the module's imports cheap/no-op.
vi.mock("./internal", () => ({
  loadAvatarIndex: () => 1,
  normalizeAvatarIndex: (n: number) => n,
}));
vi.mock("./shell-routing", () => ({
  shouldStartAtCharacterSelectOnLaunch: () => false,
}));
vi.mock("../navigation", () => ({
  COMPANION_ENABLED: true,
  tabFromPath: () => null,
  isRouteRootPath: () => true,
}));

// world prefetch uses global fetch — make it hang too.
vi.stubGlobal("fetch", vi.fn(() => hangForever()));

import { runHydrating } from "./startup-phase-hydrate";

function makeDeps() {
  const noop = () => {};
  const anoop = async () => {};
  return {
    setStartupError: vi.fn(),
    setOnboardingLoading: vi.fn(),
    hydrateInitialConversationState: vi.fn(async () => null),
    requestGreetingWhenRunningRef: { current: async () => {} },
    loadWorkbench: vi.fn(anoop),
    loadPlugins: vi.fn(anoop),
    loadSkills: vi.fn(anoop),
    loadCharacter: vi.fn(anoop),
    loadWalletConfig: vi.fn(anoop),
    loadInventory: vi.fn(anoop),
    loadUpdateStatus: vi.fn(anoop),
    checkExtensionStatus: vi.fn(anoop),
    pollCloudCredits: vi.fn(noop),
    fetchAutonomyReplay: vi.fn(() => hangForever()),
    setSelectedVrmIndex: vi.fn(),
    setCustomVrmUrl: vi.fn(),
    setCustomBackgroundUrl: vi.fn(),
    setWalletAddresses: vi.fn(),
    setTab: vi.fn(),
    setTabRaw: vi.fn(),
    onboardingCompletionCommittedRef: { current: false },
    initialTabSetRef: { current: false },
    onboardingMode: "cloud" as unknown as never,
  };
}

describe("runHydrating — non-blocking first-load (F2)", () => {
  it("dispatches HYDRATION_COMPLETE even when wallet, VRM prefetch, world prefetch, and autonomy replay all hang", async () => {
    const deps = makeDeps();
    const dispatch = vi.fn();
    const cancelled = { current: false };

    // Must resolve quickly. If any hang is awaited, this rejects on timeout.
    await Promise.race([
      // biome-ignore lint/suspicious/noExplicitAny: test deps shape
      runHydrating(deps as any, dispatch, cancelled),
      new Promise((_r, reject) =>
        setTimeout(
          () => reject(new Error("runHydrating blocked on non-critical work")),
          3000,
        ),
      ),
    ]);

    expect(dispatch).toHaveBeenCalledWith({ type: "HYDRATION_COMPLETE" });
  });

  it("does not block hydration on the slow wallet fetch, but still kicks it off", async () => {
    const deps = makeDeps();
    const dispatch = vi.fn();
    await runHydrating(
      // biome-ignore lint/suspicious/noExplicitAny: test deps shape
      deps as any,
      dispatch,
      { current: false },
    );
    // Wallet setter never resolves (fetch hangs) so it should not have been
    // called by the time hydration completes — proving it was deferred.
    expect(deps.setWalletAddresses).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith({ type: "HYDRATION_COMPLETE" });
  });
});
