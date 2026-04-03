/**
 * Locks `deriveConnectionScreen`, `resolveConnectionUiSpec`, and `applyConnectionTransition` together.
 * **Why merge + derive in tests:** patches alone do not prove the user lands on the right screen after an event.
 */
import { describe, expect, it, vi } from "vitest";
import {
  applyConnectionTransition,
  type ConnectionFlowSnapshot,
  computeShowProviderSelection,
  deriveConnectionScreen,
  getEffectiveRunMode,
  getResetConnectionWizardToHostingStepPatch,
  isProviderConfirmDisabled,
  mergeConnectionSnapshot,
  resolveConnectionUiSpec,
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
        "hosting (cloudOnly steady path → grid)",
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
        "providerGrid (cloud-hosted runtime still chooses a provider)",
        baseSnap({
          onboardingRunMode: "cloud",
          onboardingCloudProvider: "elizacloud",
        }),
        "providerGrid",
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

    it("wizard reset patch lands on hosting after a cloud-hosted selection", () => {
      const stuck = baseSnap({
        onboardingRunMode: "cloud",
        onboardingCloudProvider: "elizacloud",
      });
      expect(deriveConnectionScreen(stuck)).toBe("providerGrid");
      const after = mergeConnectionSnapshot(
        stuck,
        getResetConnectionWizardToHostingStepPatch(),
      );
      expect(deriveConnectionScreen(after)).toBe("hosting");
      expect(getResetConnectionWizardToHostingStepPatch()).not.toHaveProperty(
        "onboardingCloudApiKey",
      );
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

    it("hides hosting local card only for cloudOnly builds", () => {
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
    it("getEffectiveRunMode maps cloudOnly + empty run to local", () => {
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
          baseSnap({
            onboardingRunMode: "cloud",
            onboardingCloudProvider: "elizacloud",
          }),
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

    it("selecting Eliza Cloud keeps its key in the dedicated cloud field", () => {
      const s0 = baseSnap({
        onboardingRunMode: "local",
        onboardingDetectedProviders: [
          { id: "elizacloud", apiKey: "ck-test" },
        ] as ConnectionFlowSnapshot["onboardingDetectedProviders"],
      });
      const r = applyConnectionTransition(s0, {
        type: "selectProvider",
        providerId: "elizacloud",
      });
      expect(r?.kind).toBe("patch");
      if (r?.kind !== "patch") return;
      expect(r.patch.onboardingCloudApiKey).toBe("ck-test");
      expect(r.patch.onboardingApiKey).toBe("");
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

    it("all known event types are handled (no null for valid events)", () => {
      const validEvents = [
        { type: "selectLocalHosting" as const },
        { type: "selectRemoteHosting" as const },
        { type: "selectElizaCloudHosting" as const },
        { type: "backElizaCloudPreProvider" as const },
        { type: "clearProvider" as const },
        { type: "setElizaCloudTab" as const, tab: "apikey" as const },
        { type: "setSubscriptionTab" as const, tab: "oauth" as const },
        {
          type: "selectProvider" as const,
          providerId: "openai",
        },
      ];
      for (const event of validEvents) {
        const r = applyConnectionTransition(baseSnap(), event);
        expect(r).not.toBeNull();
      }
    });

    it("unknown event type returns null via exhaustive default", () => {
      const s0 = baseSnap();
      const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
      // Force an unknown event type to exercise the default branch
      const r = applyConnectionTransition(s0, {
        type: "totally_unknown",
      } as never);
      expect(r).toBeNull();
      expect(spy).toHaveBeenCalledWith(
        "[connection-flow] Unhandled connection event:",
        "totally_unknown",
      );
      spy.mockRestore();
    });
  });

  describe("isProviderConfirmDisabled", () => {
    const defaults = {
      provider: "",
      apiKey: "",
      elizaCloudTab: "login" as const,
      elizaCloudConnected: false,
      subscriptionTab: "token" as const,
    };

    it("disabled when no provider selected", () => {
      expect(isProviderConfirmDisabled(defaults)).toBe(true);
    });

    it("elizacloud: disabled when login tab and not connected", () => {
      expect(
        isProviderConfirmDisabled({
          ...defaults,
          provider: "elizacloud",
          elizaCloudTab: "login",
          elizaCloudConnected: false,
        }),
      ).toBe(true);
    });

    it("elizacloud: enabled when login tab and connected", () => {
      expect(
        isProviderConfirmDisabled({
          ...defaults,
          provider: "elizacloud",
          elizaCloudTab: "login",
          elizaCloudConnected: true,
        }),
      ).toBe(false);
    });

    it("elizacloud: disabled when apikey tab and empty key", () => {
      expect(
        isProviderConfirmDisabled({
          ...defaults,
          provider: "elizacloud",
          elizaCloudTab: "apikey",
          apiKey: "  ",
        }),
      ).toBe(true);
    });

    it("elizacloud: enabled when apikey tab and key provided", () => {
      expect(
        isProviderConfirmDisabled({
          ...defaults,
          provider: "elizacloud",
          elizaCloudTab: "apikey",
          apiKey: "ec-test-key",
        }),
      ).toBe(false);
    });

    it("anthropic-subscription: disabled when token tab and empty key", () => {
      expect(
        isProviderConfirmDisabled({
          ...defaults,
          provider: "anthropic-subscription",
          subscriptionTab: "token",
          apiKey: "",
        }),
      ).toBe(true);
    });

    it("anthropic-subscription: enabled when token tab and key provided", () => {
      expect(
        isProviderConfirmDisabled({
          ...defaults,
          provider: "anthropic-subscription",
          subscriptionTab: "token",
          apiKey: "sk-ant-oat01-test",
        }),
      ).toBe(false);
    });

    it("anthropic-subscription: enabled on oauth tab regardless of key", () => {
      expect(
        isProviderConfirmDisabled({
          ...defaults,
          provider: "anthropic-subscription",
          subscriptionTab: "oauth",
          apiKey: "",
        }),
      ).toBe(false);
    });

    it("ollama: enabled without API key", () => {
      expect(
        isProviderConfirmDisabled({ ...defaults, provider: "ollama" }),
      ).toBe(false);
    });

    it("pi-ai: enabled without API key", () => {
      expect(
        isProviderConfirmDisabled({ ...defaults, provider: "pi-ai" }),
      ).toBe(false);
    });

    it.each([
      "openai",
      "anthropic",
      "openrouter",
      "gemini",
      "grok",
      "groq",
      "deepseek",
      "mistral",
      "together",
      "zai",
    ])("%s: disabled when API key empty", (providerId) => {
      expect(
        isProviderConfirmDisabled({
          ...defaults,
          provider: providerId,
          apiKey: "",
        }),
      ).toBe(true);
    });

    it.each([
      "openai",
      "anthropic",
      "openrouter",
      "gemini",
      "grok",
      "groq",
      "deepseek",
      "mistral",
      "together",
      "zai",
    ])("%s: enabled when API key provided", (providerId) => {
      expect(
        isProviderConfirmDisabled({
          ...defaults,
          provider: providerId,
          apiKey: "sk-test-key-12345",
        }),
      ).toBe(false);
    });
  });
});
