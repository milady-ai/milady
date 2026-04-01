/**
 * Onboarding callbacks — extracted from AppContext.
 *
 * Holds all the callback functions for the onboarding flow:
 * completeOnboarding, runOnboardingChatHandoff, handleOnboardingFinish,
 * advanceOnboarding / handleOnboardingNext, revertOnboarding /
 * handleOnboardingBack, handleOnboardingJumpToStep, goToOnboardingStep,
 * applyResetConnectionWizardToHostingStep, handleCloudOnboardingFinish,
 * handleOnboardingUseLocalBackend, handleOnboardingRemoteConnect,
 * and applyDetectedProviders.
 */

import { getDefaultStylePreset } from "@miladyai/shared/onboarding-presets";
import { type RefObject, useCallback } from "react";
import { MiladyClient } from "../api";
import { invokeDesktopBridgeRequest, scanProviderCredentials } from "../bridge";
import { getBootConfig } from "../config/boot-config";
import type { UiLanguage } from "../i18n";
import type { Tab } from "../navigation";
import { getResetConnectionWizardToHostingStepPatch } from "../onboarding/connection-flow";
import {
  canRevertOnboardingTo,
  getFlaminaTopicForOnboardingStep,
  resolveOnboardingNextStep,
  resolveOnboardingPreviousStep,
} from "../onboarding/flow";
import { buildOnboardingConnectionConfig } from "../onboarding-config";
import {
  clearPersistedOnboardingStep,
  deriveOnboardingResumeConnection,
  type OnboardingNextOptions,
  savePersistedConnectionMode,
} from "./internal";
import { deriveDetectedProviderPrefill } from "./onboarding-bootstrap";
import type { OnboardingStateHook } from "./useOnboardingState";
import type { AppState, OnboardingStep } from "./types";
import { buildWalletRpcUpdateRequest } from "../wallet-rpc";
import { PREMADE_VOICES } from "../voice/types";
import type { StylePreset } from "../api";

// ── Helpers copied from AppContext (module-level, no React deps) ──────────

function isPrivateNetworkHost(host: string): boolean {
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return true;
  }
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}$/.test(host)) {
    return true;
  }
  return false;
}

function normalizeRemoteApiBaseInput(rawValue: string): string {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    throw new Error("Enter a backend address.");
  }
  const hasScheme = /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(trimmed);
  const hostGuess = trimmed.replace(/^[a-zA-Z][a-zA-Z\d+.-]*:\/\//, "");
  const guessedHost = hostGuess.split("/")[0]?.replace(/:\d+$/, "") ?? "";
  const defaultProtocol = isPrivateNetworkHost(guessedHost) ? "http" : "https";
  const candidate = hasScheme ? trimmed : `${defaultProtocol}://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error("Enter a valid backend address.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Remote backends must use http:// or https://.");
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/+$/, "");
}

function resolveSelectedOnboardingStyle(args: {
  styles: readonly StylePreset[] | undefined;
  onboardingStyle: string;
  selectedVrmIndex: number;
  uiLanguage: UiLanguage;
}): StylePreset {
  const styles = args.styles ?? [];
  return (
    styles.find((style) => style.id === args.onboardingStyle) ??
    styles.find(
      (style) =>
        typeof style.avatarIndex === "number" &&
        style.avatarIndex === args.selectedVrmIndex,
    ) ??
    styles[0] ??
    getDefaultStylePreset(args.uiLanguage)
  );
}

async function persistOnboardingStyleVoice(
  style: StylePreset | undefined,
  clientRef: MiladyClient,
): Promise<void> {
  const voicePresetId = style?.voicePresetId?.trim();
  if (!voicePresetId) {
    return;
  }
  const presetVoice = PREMADE_VOICES.find(
    (voice) => voice.id === voicePresetId,
  );
  if (!presetVoice) {
    return;
  }
  await clientRef.updateConfig({
    messages: {
      tts: {
        provider: "elevenlabs",
        elevenlabs: {
          voiceId: presetVoice.voiceId,
        },
      },
    },
  });
}

// ── Hook deps ─────────────────────────────────────────────────────────────

export interface OnboardingCallbacksDeps {
  /** Full result of useOnboardingState — state + all dispatch helpers. */
  onboarding: OnboardingStateHook;

  /**
   * Compat setter functions that already wrap onboarding.setField / dispatch.
   * Passed in from AppContext so we don't duplicate them here.
   */
  setOnboardingStep: (step: OnboardingStep) => void;
  setOnboardingMode: (v: AppState["onboardingMode"]) => void;
  setOnboardingActiveGuide: (v: string | null) => void;
  addDeferredOnboardingTask: (task: string) => void;
  setOnboardingDetectedProviders: (
    v: AppState["onboardingDetectedProviders"],
  ) => void;
  setOnboardingRunMode: (v: "local" | "cloud" | "") => void;
  setOnboardingCloudProvider: (v: string) => void;
  setOnboardingProvider: (v: string) => void;
  setOnboardingApiKey: (v: string) => void;
  setOnboardingPrimaryModel: (v: string) => void;
  setOnboardingRemoteApiBase: (v: string) => void;
  setOnboardingRemoteToken: (v: string) => void;
  setOnboardingRemoteConnecting: (v: boolean) => void;
  setOnboardingRemoteError: (v: string | null) => void;
  setOnboardingRemoteConnected: (v: boolean) => void;
  setPostOnboardingChecklistDismissed: (v: boolean) => void;

  /** Lifecycle / global */
  setOnboardingComplete: (v: boolean) => void;
  coordinatorOnboardingCompleteRef: RefObject<(() => void) | null>;
  initialTabSetRef: RefObject<boolean>;
  setTab: (tab: Tab) => void;
  defaultLandingTab: Tab;
  loadCharacter: () => Promise<void>;
  uiLanguage: UiLanguage;
  selectedVrmIndex: number;
  walletConfig: AppState["walletConfig"];
  elizaCloudConnected: boolean;
  setActionNotice: (
    text: string,
    tone?: "info" | "success" | "error",
    ttlMs?: number,
  ) => void;
  retryStartup: () => void;
  forceLocalBootstrapRef: RefObject<boolean>;
  client: MiladyClient;
}

// ── Hook ──────────────────────────────────────────────────────────────────

export function useOnboardingCallbacks(deps: OnboardingCallbacksDeps) {
  const {
    onboarding,
    setOnboardingStep,
    setOnboardingMode: _setOnboardingMode,
    setOnboardingActiveGuide,
    addDeferredOnboardingTask,
    setOnboardingDetectedProviders,
    setOnboardingRunMode,
    setOnboardingCloudProvider,
    setOnboardingProvider,
    setOnboardingApiKey,
    setOnboardingPrimaryModel: _setOnboardingPrimaryModel,
    setOnboardingRemoteApiBase,
    setOnboardingRemoteToken,
    setOnboardingRemoteConnecting,
    setOnboardingRemoteError,
    setOnboardingRemoteConnected,
    setPostOnboardingChecklistDismissed,
    setOnboardingComplete,
    coordinatorOnboardingCompleteRef,
    initialTabSetRef,
    setTab,
    defaultLandingTab,
    loadCharacter,
    uiLanguage,
    selectedVrmIndex,
    walletConfig,
    elizaCloudConnected,
    setActionNotice,
    retryStartup,
    forceLocalBootstrapRef,
    client,
  } = deps;

  // Destructure state fields we need from the onboarding hook
  const {
    state: {
      step: onboardingStep,
      mode: onboardingMode,
      options: onboardingOptions,
      name: onboardingName,
      style: onboardingStyle,
      runMode: onboardingRunMode,
      cloudProvider: onboardingCloudProvider,
      provider: onboardingProvider,
      apiKey: onboardingApiKey,
      voiceProvider: onboardingVoiceProvider,
      voiceApiKey: onboardingVoiceApiKey,
      smallModel: onboardingSmallModel,
      largeModel: onboardingLargeModel,
      openRouterModel: onboardingOpenRouterModel,
      primaryModel: onboardingPrimaryModel,
      detectedProviders: onboardingDetectedProviders,
      remoteApiBase: onboardingRemoteApiBase,
      remoteToken: onboardingRemoteToken,
      remote: onboardingRemote,
      rpcSelections: onboardingRpcSelections,
      rpcKeys: onboardingRpcKeys,
    },
    resumeConnectionRef: onboardingResumeConnectionRef,
    completionCommittedRef: onboardingCompletionCommittedRef,
  } = onboarding;

  const onboardingRemoteConnecting = onboardingRemote.status === "connecting";

  // ── completeOnboarding ────────────────────────────────────────────

  const completeOnboarding = useCallback(() => {
    clearPersistedOnboardingStep();
    onboardingResumeConnectionRef.current = null;
    onboardingCompletionCommittedRef.current = true;
    _setOnboardingMode("basic");
    setOnboardingActiveGuide(null);
    setPostOnboardingChecklistDismissed(false);
    setOnboardingDetectedProviders(
      onboardingDetectedProviders.map((provider) => {
        const { apiKey: _, ...rest } = provider;
        return rest;
      }) as AppState["onboardingDetectedProviders"],
    );
    setOnboardingComplete(true);
    coordinatorOnboardingCompleteRef.current?.();
    initialTabSetRef.current = true;
    setTab(defaultLandingTab);
    void loadCharacter();
  }, [
    onboardingCompletionCommittedRef,
    onboardingDetectedProviders,
    onboardingResumeConnectionRef,
    setOnboardingActiveGuide,
    setOnboardingComplete,
    setOnboardingDetectedProviders,
    _setOnboardingMode,
    setPostOnboardingChecklistDismissed,
    setTab,
    defaultLandingTab,
    loadCharacter,
    coordinatorOnboardingCompleteRef,
    initialTabSetRef,
  ]);

  // ── runOnboardingChatHandoff ──────────────────────────────────────

  const runOnboardingChatHandoff = useCallback(async () => {
    if (!onboardingOptions) return;

    try {
      // Cloud fast-track: submit minimal config for elizacloud-hosted agent.
      const useCloudFastTrack =
        elizaCloudConnected &&
        !(
          onboardingRunMode === "local" &&
          onboardingProvider &&
          onboardingProvider !== "elizacloud"
        );

      if (useCloudFastTrack) {
        const style = resolveSelectedOnboardingStyle({
          styles: onboardingOptions.styles,
          onboardingStyle,
          selectedVrmIndex,
          uiLanguage,
        });
        const defaultName =
          style.name ?? getDefaultStylePreset(uiLanguage).name;

        await client.submitOnboarding({
          name: onboardingName || defaultName,
          bio: style?.bio ?? ["An autonomous AI agent."],
          systemPrompt:
            style?.system?.replace(
              /\{\{name\}\}/g,
              onboardingName || defaultName,
            ) ??
            `You are ${onboardingName || defaultName}, an autonomous AI agent powered by elizaOS.`,
          style: style?.style,
          adjectives: style?.adjectives,
          postExamples: style?.postExamples,
          messageExamples: style?.messageExamples,
          topics: style?.topics,
          avatarIndex: style?.avatarIndex ?? 1,
          language: uiLanguage,
          presetId: style?.id ?? "chen",
          runMode: "cloud",
          cloudProvider: "elizacloud",
          smallModel: "moonshotai/kimi-k2-turbo",
          largeModel: "moonshotai/kimi-k2-0905",
        } as unknown as Parameters<typeof client.submitOnboarding>[0]);
        try {
          await persistOnboardingStyleVoice(style, client);
        } catch (err) {
          console.warn(
            "[onboarding] Failed to persist cloud voice preset",
            err,
          );
        }

        completeOnboarding();
        return;
      }

      const style = resolveSelectedOnboardingStyle({
        styles: onboardingOptions.styles,
        onboardingStyle,
        selectedVrmIndex,
        uiLanguage,
      });

      const systemPrompt = style?.system
        ? style.system.replace(/\{\{name\}\}/g, onboardingName)
        : `You are ${onboardingName}, an autonomous AI agent powered by elizaOS. ${onboardingOptions.sharedStyleRules}`;

      let connection =
        buildOnboardingConnectionConfig({
          onboardingRunMode,
          onboardingCloudProvider,
          onboardingProvider,
          onboardingApiKey,
          onboardingVoiceProvider,
          onboardingVoiceApiKey,
          onboardingPrimaryModel,
          onboardingOpenRouterModel,
          onboardingRemoteConnected: onboardingRemote.status === "connected",
          onboardingRemoteApiBase,
          onboardingRemoteToken,
          onboardingSmallModel,
          onboardingLargeModel,
        }) ?? onboardingResumeConnectionRef.current;

      if (!connection) {
        try {
          const freshConfig = await client.getConfig();
          connection = deriveOnboardingResumeConnection(freshConfig);
          if (connection) {
            onboardingResumeConnectionRef.current = connection;
          }
        } catch {
          /* config fetch failed — fall through to the error below */
        }
      }

      if (!connection) {
        throw new Error(
          "Your connection settings could not be restored after restart.",
        );
      }

      const rpcSel = onboardingRpcSelections as Record<string, string>;
      const rpcK = onboardingRpcKeys as Record<string, string>;
      const nextWalletConfig = buildWalletRpcUpdateRequest({
        walletConfig,
        rpcFieldValues: rpcK,
        selectedProviders: {
          evm: rpcSel.evm,
          bsc: rpcSel.bsc,
          solana: rpcSel.solana,
        },
      });

      const isSandboxMode =
        onboardingRunMode === "cloud" &&
        onboardingCloudProvider === "elizacloud";
      const isLocalMode = onboardingRunMode === "local" || !onboardingRunMode;

      if (isSandboxMode) {
        const cloudApiBase =
          getBootConfig().cloudApiBase ?? "https://www.elizacloud.ai";
        const authToken = ((window as unknown as Record<string, unknown>)
          .__ELIZA_CLOUD_AUTH_TOKEN__ ?? "") as string;

        if (!authToken) {
          throw new Error(
            "Eliza Cloud authentication required. Please log in first.",
          );
        }

        await client.provisionCloudSandbox({
          cloudApiBase,
          authToken,
          name: onboardingName,
          bio: style?.bio ?? ["An autonomous AI agent."],
          onProgress: (status, detail) => {
            console.log(`[Sandbox] ${status}: ${detail ?? ""}`);
          },
        });

        client.setBaseUrl(cloudApiBase);
        client.setToken(authToken);
        savePersistedConnectionMode({
          runMode: "cloud",
          cloudApiBase,
          cloudAuthToken: authToken,
        });
      } else if (isLocalMode) {
        try {
          await invokeDesktopBridgeRequest({
            rpcMethod: "agentStart",
            ipcChannel: "agent:start",
          });
        } catch {
          try {
            const agentPluginId = "@miladyai/capacitor-agent";
            const { Agent } = await import(/* @vite-ignore */ agentPluginId);
            await Agent.start();
          } catch {
            /* dev mode where agent is already running */
          }
        }

        const localDeadline = Date.now() + 120_000;
        let pollMs = 1000;
        while (Date.now() < localDeadline) {
          try {
            await client.getAuthStatus();
            break;
          } catch {
            await new Promise((r) => setTimeout(r, pollMs));
            pollMs = Math.min(pollMs * 1.5, 5000);
          }
        }

        savePersistedConnectionMode({ runMode: "local" });
      } else if (
        onboardingRunMode === "cloud" &&
        onboardingCloudProvider === "remote"
      ) {
        savePersistedConnectionMode({
          runMode: "remote",
          remoteApiBase: onboardingRemoteApiBase,
          remoteAccessToken: onboardingRemoteToken || undefined,
        });
      }

      const sandboxMode = isSandboxMode ? "standard" : "off";
      await client.submitOnboarding({
        name: onboardingName,
        sandboxMode: sandboxMode as "off",
        bio: style?.bio ?? ["An autonomous AI agent."],
        systemPrompt,
        style: style?.style,
        adjectives: style?.adjectives,
        topics: style?.topics,
        postExamples: style?.postExamples,
        messageExamples: style?.messageExamples,
        avatarIndex: style?.avatarIndex ?? selectedVrmIndex,
        language: uiLanguage,
        presetId: (style?.id ?? onboardingStyle) || "chen",
        connection,
        walletConfig: nextWalletConfig,
      } as Parameters<typeof client.submitOnboarding>[0]);
      try {
        await persistOnboardingStyleVoice(style, client);
      } catch (err) {
        console.warn(
          "[onboarding] Failed to persist selected voice preset",
          err,
        );
      }

      completeOnboarding();
    } catch (err) {
      console.error("[onboarding] Failed to complete onboarding", err);
    }
  }, [
    onboardingOptions,
    onboardingStyle,
    onboardingName,
    onboardingRunMode,
    onboardingCloudProvider,
    onboardingSmallModel,
    onboardingLargeModel,
    onboardingProvider,
    onboardingApiKey,
    onboardingRemoteApiBase,
    onboardingRemote,
    onboardingRemoteToken,
    onboardingOpenRouterModel,
    onboardingPrimaryModel,
    onboardingVoiceProvider,
    onboardingVoiceApiKey,
    selectedVrmIndex,
    uiLanguage,
    onboardingRpcSelections,
    onboardingRpcKeys,
    walletConfig,
    onboardingResumeConnectionRef,
    elizaCloudConnected,
    completeOnboarding,
    client,
  ]);

  // ── handleOnboardingFinish ────────────────────────────────────────

  const handleOnboardingFinish = useCallback(async () => {
    await runOnboardingChatHandoff();
  }, [runOnboardingChatHandoff]);

  // ── goToOnboardingStep ───────────────────────────────────────────

  const goToOnboardingStep = useCallback(
    (step: OnboardingStep) => {
      setOnboardingStep(step);
      setOnboardingActiveGuide(
        onboardingMode === "advanced"
          ? getFlaminaTopicForOnboardingStep(step)
          : null,
      );
    },
    [onboardingMode, setOnboardingStep, setOnboardingActiveGuide],
  );

  // ── applyResetConnectionWizardToHostingStep ───────────────────────

  const applyResetConnectionWizardToHostingStep = useCallback(() => {
    const patch = getResetConnectionWizardToHostingStepPatch();
    if (patch.onboardingRunMode !== undefined) {
      setOnboardingRunMode(patch.onboardingRunMode);
    }
    if (patch.onboardingCloudProvider !== undefined) {
      setOnboardingCloudProvider(patch.onboardingCloudProvider);
    }
    if (patch.onboardingProvider !== undefined) {
      setOnboardingProvider(patch.onboardingProvider);
    }
    if (patch.onboardingApiKey !== undefined) {
      setOnboardingApiKey(patch.onboardingApiKey);
    }
    if (patch.onboardingPrimaryModel !== undefined) {
      _setOnboardingPrimaryModel(patch.onboardingPrimaryModel);
    }
    if (patch.onboardingRemoteError !== undefined) {
      setOnboardingRemoteError(patch.onboardingRemoteError);
    }
    if (patch.onboardingRemoteConnecting !== undefined) {
      setOnboardingRemoteConnecting(patch.onboardingRemoteConnecting);
    }
  }, [
    setOnboardingApiKey,
    setOnboardingCloudProvider,
    _setOnboardingPrimaryModel,
    setOnboardingProvider,
    setOnboardingRemoteConnecting,
    setOnboardingRemoteError,
    setOnboardingRunMode,
  ]);

  // ── advanceOnboarding / handleOnboardingNext ─────────────────────

  const advanceOnboarding = useCallback(
    async (options?: OnboardingNextOptions) => {
      if (
        onboardingStep === "providers" &&
        onboardingRunMode === "local" &&
        !onboardingProvider
      ) {
        const detectedProvider = onboardingDetectedProviders[0];
        const fallbackProvider =
          detectedProvider?.id ??
          onboardingOptions?.providers?.find(
            (provider) => provider.id !== "elizacloud",
          )?.id ??
          "";
        if (fallbackProvider) {
          setOnboardingProvider(fallbackProvider);
          // Only auto-fill API key if it's a real (unmasked) value.
          // Keys from the credential scanner are masked ("****xxxx") for
          // IPC security — the server re-scans natively when persisting.
          // OAuth providers don't need the key field at all.
          if (
            detectedProvider?.id === fallbackProvider &&
            detectedProvider.apiKey &&
            !detectedProvider.apiKey.startsWith("****") &&
            detectedProvider.authMode !== "oauth"
          ) {
            setOnboardingApiKey(detectedProvider.apiKey);
          }
        }
      }

      if (onboardingStep === "launch") {
        await handleOnboardingFinish();
        return;
      }

      if (onboardingStep === "permissions") {
        if (options?.allowPermissionBypass) {
          if (options.skipTask) addDeferredOnboardingTask(options.skipTask);
          // Don't finish yet — advance to the next step
        }
      }

      let nextStep = resolveOnboardingNextStep(onboardingStep);

      // Skip voice provider selection if they set up Eliza Cloud
      if (
        nextStep === "voice" &&
        onboardingRunMode === "cloud" &&
        onboardingCloudProvider === "elizacloud"
      ) {
        nextStep = resolveOnboardingNextStep(nextStep);
      }

      if (nextStep) {
        if (nextStep === "hosting") {
          applyResetConnectionWizardToHostingStep();
        }
        setOnboardingStep(nextStep);
        setOnboardingActiveGuide(
          onboardingMode === "advanced"
            ? getFlaminaTopicForOnboardingStep(nextStep)
            : null,
        );
      }
    },
    [
      addDeferredOnboardingTask,
      applyResetConnectionWizardToHostingStep,
      handleOnboardingFinish,
      onboardingDetectedProviders,
      onboardingMode,
      onboardingOptions?.providers,
      onboardingProvider,
      onboardingRunMode,
      onboardingStep,
      setOnboardingStep,
      setOnboardingActiveGuide,
      setOnboardingApiKey,
      setOnboardingProvider,
      onboardingCloudProvider,
    ],
  );

  const handleOnboardingNext = useCallback(
    async (options?: OnboardingNextOptions) => advanceOnboarding(options),
    [advanceOnboarding],
  );

  // ── revertOnboarding / handleOnboardingBack ──────────────────────

  const revertOnboarding = useCallback(() => {
    let previousStep = resolveOnboardingPreviousStep(onboardingStep);

    // Skip voice provider selection if they set up Eliza Cloud
    if (
      previousStep === "voice" &&
      onboardingRunMode === "cloud" &&
      onboardingCloudProvider === "elizacloud"
    ) {
      previousStep = resolveOnboardingPreviousStep(previousStep);
    }

    if (!previousStep) return;
    if (previousStep === "hosting") {
      applyResetConnectionWizardToHostingStep();
    }
    setOnboardingStep(previousStep);
    setOnboardingActiveGuide(
      onboardingMode === "advanced"
        ? getFlaminaTopicForOnboardingStep(previousStep)
        : null,
    );
  }, [
    applyResetConnectionWizardToHostingStep,
    onboardingMode,
    onboardingStep,
    setOnboardingActiveGuide,
    onboardingRunMode,
    onboardingCloudProvider,
    setOnboardingStep,
  ]);

  const handleOnboardingBack = revertOnboarding;

  // ── handleOnboardingJumpToStep ───────────────────────────────────

  const handleOnboardingJumpToStep = useCallback(
    (target: OnboardingStep) => {
      if (!canRevertOnboardingTo({ current: onboardingStep, target })) return;
      if (target === "hosting") {
        applyResetConnectionWizardToHostingStep();
      }
      setOnboardingStep(target);
      setOnboardingActiveGuide(
        onboardingMode === "advanced"
          ? getFlaminaTopicForOnboardingStep(target)
          : null,
      );
    },
    [
      applyResetConnectionWizardToHostingStep,
      onboardingMode,
      onboardingStep,
      setOnboardingStep,
      setOnboardingActiveGuide,
    ],
  );

  // ── handleOnboardingUseLocalBackend ──────────────────────────────

  const handleOnboardingUseLocalBackend = useCallback(() => {
    forceLocalBootstrapRef.current = true;
    client.setBaseUrl(null);
    client.setToken(null);
    setOnboardingRemoteConnecting(false);
    setOnboardingRemoteError(null);
    setOnboardingRemoteConnected(false);
    setOnboardingRemoteApiBase("");
    setOnboardingRemoteToken("");
    setOnboardingCloudProvider("");
    setOnboardingRunMode("");
    setActionNotice(
      "Checking this device for an existing Eliza setup...",
      "info",
      3200,
    );
    retryStartup();
  }, [
    retryStartup,
    setActionNotice,
    forceLocalBootstrapRef,
    setOnboardingCloudProvider,
    setOnboardingRemoteApiBase,
    setOnboardingRemoteConnected,
    setOnboardingRemoteConnecting,
    setOnboardingRemoteError,
    setOnboardingRemoteToken,
    setOnboardingRunMode,
    client,
  ]);

  // ── handleOnboardingRemoteConnect ────────────────────────────────

  const handleOnboardingRemoteConnect = useCallback(async () => {
    if (onboardingRemoteConnecting) return;
    let normalizedBase = "";
    try {
      normalizedBase = normalizeRemoteApiBaseInput(onboardingRemoteApiBase);
    } catch (err) {
      setOnboardingRemoteError(
        err instanceof Error ? err.message : "Enter a valid backend address.",
      );
      return;
    }

    const accessKey = onboardingRemoteToken.trim();
    const probe = new MiladyClient(normalizedBase, accessKey || undefined);
    setOnboardingRemoteConnecting(true);
    setOnboardingRemoteError(null);
    try {
      const auth = await probe.getAuthStatus();
      if (auth.required && !accessKey) {
        throw new Error("This backend requires an access key.");
      }
      await probe.getOnboardingStatus();
      client.setBaseUrl(normalizedBase);
      client.setToken(accessKey || null);
      setOnboardingRunMode("cloud");
      setOnboardingCloudProvider("remote");
      setOnboardingRemoteApiBase(normalizedBase);
      setOnboardingRemoteToken(accessKey);
      setOnboardingRemoteConnected(true);
      setActionNotice("Connected to remote Milady backend.", "success", 4200);
      retryStartup();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to reach remote backend.";
      const normalizedMessage =
        /401|unauthorized|forbidden/i.test(message) && accessKey
          ? "Access key rejected. Check the address and try again."
          : message;
      setOnboardingRemoteError(normalizedMessage);
    } finally {
      setOnboardingRemoteConnecting(false);
    }
  }, [
    onboardingRemoteApiBase,
    onboardingRemoteConnecting,
    onboardingRemoteToken,
    retryStartup,
    setActionNotice,
    setOnboardingCloudProvider,
    setOnboardingRemoteApiBase,
    setOnboardingRemoteConnected,
    setOnboardingRemoteConnecting,
    setOnboardingRemoteError,
    setOnboardingRemoteToken,
    setOnboardingRunMode,
    client,
  ]);

  // ── handleCloudOnboardingFinish ──────────────────────────────────

  const handleCloudOnboardingFinish = useCallback(async () => {
    await runOnboardingChatHandoff();
  }, [runOnboardingChatHandoff]);

  // ── applyDetectedProviders ───────────────────────────────────────

  const applyDetectedProviders = useCallback(
    (detected: Awaited<ReturnType<typeof scanProviderCredentials>>) => {
      setOnboardingDetectedProviders(
        detected as typeof detected &
          AppState["onboardingDetectedProviders"],
      );
      const prefill = deriveDetectedProviderPrefill(detected);
      if (!prefill) {
        return;
      }

      // Keep users on provider choice first: detection should inform and
      // annotate options, not auto-route into a specific provider detail view.
      // We only nudge run mode so the provider grid is available.
      setOnboardingRunMode(prefill.runMode);
    },
    [setOnboardingDetectedProviders, setOnboardingRunMode],
  );

  return {
    completeOnboarding,
    runOnboardingChatHandoff,
    handleOnboardingFinish,
    goToOnboardingStep,
    applyResetConnectionWizardToHostingStep,
    advanceOnboarding,
    handleOnboardingNext,
    revertOnboarding,
    handleOnboardingBack,
    handleOnboardingJumpToStep,
    handleOnboardingUseLocalBackend,
    handleOnboardingRemoteConnect,
    handleCloudOnboardingFinish,
    applyDetectedProviders,
  };
}
