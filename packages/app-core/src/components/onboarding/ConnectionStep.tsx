/**
 * Connection wizard step — **shell only**.
 *
 * Why this file stays thin: `connection-flow.ts` cannot call `setState` or `useApp`. This component builds a
 * {@link ConnectionFlowSnapshot}, runs `applyConnectionTransition`, applies patches, and mounts `ConnectionUiRoot`.
 * Why `useEffect` for `forceCloudBootstrap`: same patch as tests — one implementation for native/cloud-only auto-advance.
 *
 * @see ../../onboarding/connection-flow.ts
 * @see ./connection/README.md
 */
import { ONBOARDING_PROVIDER_CATALOG } from "@elizaos/agent/contracts/onboarding";
import type { ProviderOption } from "@miladyai/app-core/api";
import { useBranding } from "@miladyai/app-core/config";
import { isNative } from "@miladyai/app-core/platform";
import type { AppState } from "../../state/types";
import {
  applyConnectionTransition,
  CONNECTION_RECOMMENDED_PROVIDER_IDS,
  resolveConnectionUiSpec,
  type ConnectionEvent,
  type ConnectionFlowSnapshot,
  type ConnectionStatePatch,
} from "../../onboarding/connection-flow";
import { useApp } from "../../state";
import { useCallback, useEffect, useMemo } from "react";
import { ConnectionProviderDetailScreen } from "./connection/ConnectionProviderDetailScreen";
import {
  ConnectionUiRoot,
  type ConnectionUiSharedProps,
} from "./connection/ConnectionUiRoot";

const recommendedIds = new Set<string>(CONNECTION_RECOMMENDED_PROVIDER_IDS);

const providerOverrides: Record<
  string,
  { name: string; description?: string }
> = {
  elizacloud: {
    name: "Eliza Cloud",
    description: "LLMs, RPCs & more included",
  },
  "anthropic-subscription": {
    name: "Claude Sub",
    description: "Pro/Max subscription",
  },
  "openai-subscription": {
    name: "ChatGPT Sub",
    description: "Plus/Pro subscription",
  },
  anthropic: { name: "Anthropic", description: "Claude API key" },
  openai: { name: "OpenAI", description: "GPT API key" },
  openrouter: { name: "OpenRouter", description: "Multi-model API" },
  gemini: { name: "Gemini", description: "Google AI" },
  grok: { name: "xAI (Grok)" },
  groq: { name: "Groq", description: "Fast inference" },
  deepseek: { name: "DeepSeek" },
  "pi-ai": { name: "Pi Credentials", description: "Local auth" },
};

function applyOnboardingPatch(
  patch: ConnectionStatePatch,
  setState: <K extends keyof AppState>(key: K, value: AppState[K]) => void,
): void {
  if (patch.onboardingRunMode !== undefined) {
    setState("onboardingRunMode", patch.onboardingRunMode);
  }
  if (patch.onboardingCloudProvider !== undefined) {
    setState("onboardingCloudProvider", patch.onboardingCloudProvider);
  }
  if (patch.onboardingProvider !== undefined) {
    setState("onboardingProvider", patch.onboardingProvider);
  }
  if (patch.onboardingApiKey !== undefined) {
    setState("onboardingApiKey", patch.onboardingApiKey);
  }
  if (patch.onboardingPrimaryModel !== undefined) {
    setState("onboardingPrimaryModel", patch.onboardingPrimaryModel);
  }
  if (patch.onboardingRemoteError !== undefined) {
    setState("onboardingRemoteError", patch.onboardingRemoteError);
  }
  if (patch.onboardingRemoteConnecting !== undefined) {
    setState("onboardingRemoteConnecting", patch.onboardingRemoteConnecting);
  }
  if (patch.onboardingSubscriptionTab !== undefined) {
    setState("onboardingSubscriptionTab", patch.onboardingSubscriptionTab);
  }
  if (patch.onboardingElizaCloudTab !== undefined) {
    setState("onboardingElizaCloudTab", patch.onboardingElizaCloudTab);
  }
}

export function ConnectionStep() {
  const {
    onboardingOptions,
    onboardingRunMode,
    onboardingCloudProvider,
    onboardingProvider,
    onboardingSubscriptionTab,
    onboardingElizaCloudTab,
    onboardingDetectedProviders,
    onboardingRemoteConnected,
    handleOnboardingUseLocalBackend,
    setState,
  } = useApp();

  const branding = useBranding();
  const cloudOnly = Boolean(branding.cloudOnly);
  const forceCloud = isNative || cloudOnly;

  const catalogProviders: ProviderOption[] = (
    onboardingOptions?.providers as ProviderOption[] | undefined
  )?.length
    ? (onboardingOptions!.providers as ProviderOption[])
    : ([...ONBOARDING_PROVIDER_CATALOG] as unknown as ProviderOption[]);
  const customProviders = branding.customProviders ?? [];
  const catalogIds = new Set(catalogProviders.map((p: ProviderOption) => p.id));
  const providers = [
    ...catalogProviders,
    ...customProviders.filter((cp) => !catalogIds.has(cp.id as never)),
  ] as ProviderOption[];
  const customLogoMap = new Map(
    customProviders
      .filter((cp) => cp.logoDark || cp.logoLight)
      .map((cp) => [cp.id, { logoDark: cp.logoDark, logoLight: cp.logoLight }]),
  );
  const getCustomLogo = (id: string) => customLogoMap.get(id);

  const getProviderDisplay = (provider: ProviderOption) => {
    const override = providerOverrides[provider.id];
    return {
      name: override?.name ?? provider.name,
      description: override?.description ?? provider.description,
    };
  };

  const availableProviders = providers;
  const recommendedProviders = availableProviders.filter((p: ProviderOption) =>
    recommendedIds.has(p.id),
  );
  const otherProviders = availableProviders.filter(
    (p: ProviderOption) => !recommendedIds.has(p.id),
  );
  const sortedProviders = [...recommendedProviders, ...otherProviders];

  const detectedByProviderId = new Map(
    (onboardingDetectedProviders ?? []).map((d) => [d.id, d]),
  );

  const getDetectedLabel = (providerId: string): string | null => {
    const d = detectedByProviderId.get(providerId);
    if (!d) return null;
    if (d.source === "codex-auth") return "Detected from Codex";
    if (d.source === "claude-credentials") return "Detected from Claude Code";
    if (d.source === "keychain") return "Detected from Keychain";
    if (d.source === "env") return "Detected from env";
    return "Auto-detected";
  };

  const connectionSnapshot: ConnectionFlowSnapshot = useMemo(
    () => ({
      onboardingRunMode,
      onboardingCloudProvider,
      onboardingProvider,
      onboardingRemoteConnected,
      onboardingElizaCloudTab,
      onboardingSubscriptionTab,
      forceCloud,
      isNative,
      cloudOnly,
      onboardingDetectedProviders: onboardingDetectedProviders ?? [],
    }),
    [
      onboardingRunMode,
      onboardingCloudProvider,
      onboardingProvider,
      onboardingRemoteConnected,
      onboardingElizaCloudTab,
      onboardingSubscriptionTab,
      forceCloud,
      cloudOnly,
      onboardingDetectedProviders,
    ],
  );

  const spec = useMemo(
    () => resolveConnectionUiSpec(connectionSnapshot),
    [connectionSnapshot],
  );

  const dispatchConnection = useCallback(
    (event: ConnectionEvent) => {
      const result = applyConnectionTransition(connectionSnapshot, event);
      if (!result) return;
      if (result.kind === "effect") {
        if (result.effect === "useLocalBackend") {
          void handleOnboardingUseLocalBackend();
        }
        return;
      }
      applyOnboardingPatch(result.patch, setState);
    },
    [connectionSnapshot, handleOnboardingUseLocalBackend, setState],
  );

  useEffect(() => {
    if (!forceCloud || onboardingRunMode) return;
    const snap: ConnectionFlowSnapshot = {
      onboardingRunMode,
      onboardingCloudProvider,
      onboardingProvider,
      onboardingRemoteConnected,
      onboardingElizaCloudTab,
      onboardingSubscriptionTab,
      forceCloud,
      isNative,
      cloudOnly,
      onboardingDetectedProviders: onboardingDetectedProviders ?? [],
    };
    const result = applyConnectionTransition(snap, {
      type: "forceCloudBootstrap",
    });
    if (result?.kind === "patch") {
      applyOnboardingPatch(result.patch, setState);
    }
  }, [
    forceCloud,
    onboardingRunMode,
    onboardingCloudProvider,
    onboardingProvider,
    onboardingRemoteConnected,
    onboardingElizaCloudTab,
    onboardingSubscriptionTab,
    cloudOnly,
    onboardingDetectedProviders,
    setState,
  ]);

  const shared: ConnectionUiSharedProps = {
    dispatch: dispatchConnection,
    onTransitionEffect: (effect) => {
      if (effect === "useLocalBackend") {
        void handleOnboardingUseLocalBackend();
      }
    },
    sortedProviders,
    getProviderDisplay,
    getCustomLogo,
    getDetectedLabel,
  };

  return (
    <ConnectionUiRoot
      spec={spec}
      shared={shared}
      providerDetail={
        <ConnectionProviderDetailScreen dispatch={dispatchConnection} />
      }
    />
  );
}
