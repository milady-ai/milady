/**
 * Locks `deriveConnectionScreen`, `resolveConnectionUiSpec`, and `applyConnectionTransition` together.
 * **Why merge + derive in tests:** patches alone do not prove the user lands on the right screen after an event.
 */
import { describe, expect, it } from "vitest";
import {
  applyConnectionTransition,
  computeShowProviderSelection,
  deriveConnectionScreen,
  getEffectiveRunMode,
  mergeConnectionSnapshot,
  resolveConnectionUiSpec,
  type ConnectionFlowSnapshot,
} from "../connection-flow";

const baseSnap = (
  overrides: Partial<ConnectionFlowSnapshot> = {},
): ConnectionFlowSnapshot => ({
  onboardingRunMode: "",
  onboardingCloudProvider: "",
  onboardingProvider: "",
  onboardingRemoteConnected: false,
  onboardingElizaCloudTab: "login",
  onboardingSubscriptionTab: "token",
  forceCloud: false,
  isNative: false,
  cloudOnly: false,
  onboardingDetectedProviders: [],
  ...overrides,
});

describe("connection-flow", () => {
  describe("deriveConnectionScreen", () => {
    it.each<
      [
        name: string,
        snap: ConnectionFlowSnapshot,
        screen: ReturnType<typeof deriveConnectionScreen>,
      ]
    >([
      ["hosting (web)", baseSnap(), "hosting"],
      [
        "hosting (forceCloud steady treats as local path → grid)",
        baseSnap({ forceCloud: true, onboardingRunMode: "" }),
        "providerGrid",
      ],
      [
        "remoteBackend",
        baseSnap({
          onboardingRunMode: "cloud",
          onboardingCloudProvider: "remote",
        }),
        "remoteBackend",
      ],
      [
        "elizaCloud_preProvider",
        baseSnap({
          onboardingRunMode: "cloud",
          onboardingCloudProvider: "elizacloud",
        }),
        "elizaCloud_preProvider",
      ],
      [
        "providerGrid (local)",
        baseSnap({ onboardingRunMode: "local" }),
        "providerGrid",
      ],
      [
        "providerGrid (remote connected)",
        baseSnap({ onboardingRemoteConnected: true }),
        "providerGrid",
      ],
      [
        "providerDetail",
        baseSnap({
          onboardingRunMode: "local",
          onboardingProvider: "openai",
        }),
        "providerDetail",
      ],
      [
        "remote connected wins over cloud path",
        baseSnap({
          onboardingRunMode: "cloud",
          onboardingCloudProvider: "remote",
          onboardingRemoteConnected: true,
          onboardingProvider: "",
        }),
        "providerGrid",
      ],
    ])("%s", (_name, snap, expected) => {
      expect(deriveConnectionScreen(snap)).toBe(expected);
    });
  });

  describe("resolveConnectionUiSpec", () => {
    it("matches deriveConnectionScreen.screen for fixtures", () => {
      const fixtures: ConnectionFlowSnapshot[] = [
        baseSnap(),
        baseSnap({ forceCloud: true }),
        baseSnap({
          onboardingRunMode: "cloud",
          onboardingCloudProvider: "remote",
        }),
        baseSnap({
          onboardingRunMode: "cloud",
          onboardingCloudProvider: "elizacloud",
        }),
        baseSnap({ onboardingRunMode: "local", onboardingProvider: "gemini" }),
      ];
      for (const s of fixtures) {
        expect(resolveConnectionUiSpec(s).screen).toBe(
          deriveConnectionScreen(s),
        );
      }
    });

    it("hides hosting local card when native or cloudOnly", () => {
      expect(
        resolveConnectionUiSpec(baseSnap({ isNative: true }))
          .showHostingLocalCard,
      ).toBe(false);
      expect(
        resolveConnectionUiSpec(baseSnap({ cloudOnly: true }))
          .showHostingLocalCard,
      ).toBe(false);
      expect(resolveConnectionUiSpec(baseSnap()).showHostingLocalCard).toBe(
        true,
      );
    });
  });

  describe("helpers", () => {
    it("getEffectiveRunMode maps forceCloud + empty run to local", () => {
      expect(
        getEffectiveRunMode(
          baseSnap({ forceCloud: true, onboardingRunMode: "" }),
        ),
      ).toBe("local");
      expect(
        getEffectiveRunMode(
          baseSnap({ forceCloud: true, onboardingRunMode: "cloud" }),
        ),
      ).toBe("cloud");
    });

    it("computeShowProviderSelection", () => {
      expect(computeShowProviderSelection(baseSnap())).toBe(false);
      expect(
        computeShowProviderSelection(
          baseSnap({ forceCloud: true, onboardingRunMode: "" }),
        ),
      ).toBe(true);
      expect(
        computeShowProviderSelection(
          baseSnap({ onboardingRemoteConnected: true }),
        ),
      ).toBe(true);
    });
  });

  describe("applyConnectionTransition", () => {
    it("forceCloudBootstrap only when forceCloud and runMode empty", () => {
      expect(
        applyConnectionTransition(baseSnap({ forceCloud: false }), {
          type: "forceCloudBootstrap",
        }),
      ).toBeNull();
      expect(
        applyConnectionTransition(
          baseSnap({ forceCloud: true, onboardingRunMode: "local" }),
          { type: "forceCloudBootstrap" },
        ),
      ).toBeNull();
      const r = applyConnectionTransition(
        baseSnap({ forceCloud: true, onboardingRunMode: "" }),
        { type: "forceCloudBootstrap" },
      );
      expect(r?.kind).toBe("patch");
      if (r?.kind === "patch") {
        expect(r.patch.onboardingRunMode).toBe("local");
        expect(r.patch.onboardingProvider).toBe("");
      }
    });

    it("selectLocalHosting then derive is providerGrid", () => {
      const s0 = baseSnap();
      const r = applyConnectionTransition(s0, { type: "selectLocalHosting" });
      expect(r?.kind).toBe("patch");
      if (r?.kind !== "patch") return;
      const s1 = mergeConnectionSnapshot(s0, r.patch);
      expect(deriveConnectionScreen(s1)).toBe("providerGrid");
    });

    it("selectRemoteHosting then derive is remoteBackend", () => {
      const s0 = baseSnap();
      const r = applyConnectionTransition(s0, { type: "selectRemoteHosting" });
      expect(r?.kind).toBe("patch");
      if (r?.kind !== "patch") return;
      const s1 = mergeConnectionSnapshot(s0, r.patch);
      expect(deriveConnectionScreen(s1)).toBe("remoteBackend");
    });

    it("backRemoteOrGrid when connected is effect", () => {
      const s = baseSnap({ onboardingRemoteConnected: true });
      expect(
        applyConnectionTransition(s, { type: "backRemoteOrGrid" }),
      ).toEqual({
        kind: "effect",
        effect: "useLocalBackend",
      });
    });

    it("backRemoteOrGrid when not connected resets hosting", () => {
      const s0 = baseSnap({
        onboardingRunMode: "cloud",
        onboardingCloudProvider: "remote",
      });
      const r = applyConnectionTransition(s0, { type: "backRemoteOrGrid" });
      expect(r?.kind).toBe("patch");
      if (r?.kind !== "patch") return;
      const s1 = mergeConnectionSnapshot(s0, r.patch);
      expect(deriveConnectionScreen(s1)).toBe("hosting");
    });

    it("selectProvider sets anthropic-subscription tab", () => {
      const s0 = baseSnap({ onboardingRunMode: "local" });
      const r = applyConnectionTransition(s0, {
        type: "selectProvider",
        providerId: "anthropic-subscription",
      });
      expect(r?.kind).toBe("patch");
      if (r?.kind !== "patch") return;
      expect(r.patch.onboardingSubscriptionTab).toBe("token");
      const s1 = mergeConnectionSnapshot(s0, r.patch);
      expect(deriveConnectionScreen(s1)).toBe("providerDetail");
    });

    it("setElizaCloudTab keeps screen", () => {
      const s0 = baseSnap({
        onboardingRunMode: "local",
        onboardingProvider: "elizacloud",
        onboardingElizaCloudTab: "login",
      });
      const r = applyConnectionTransition(s0, {
        type: "setElizaCloudTab",
        tab: "apikey",
      });
      expect(r?.kind).toBe("patch");
      if (r?.kind !== "patch") return;
      const s1 = mergeConnectionSnapshot(s0, r.patch);
      expect(deriveConnectionScreen(s1)).toBe("providerDetail");
    });
  });
});
