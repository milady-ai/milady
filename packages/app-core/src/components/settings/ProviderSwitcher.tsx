/**
 * ProviderSwitcher — Provider grid, cloud settings, and switching logic.
 *
 * Extracted from SettingsView.tsx for decomposition (P2 §10).
 * Composes SubscriptionStatus and ApiKeyConfig sub-components.
 */

import { resolveServiceRoutingInConfig } from "@miladyai/shared/contracts/onboarding";
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@miladyai/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { client, type OnboardingOptions, type PluginParamDef } from "../../api";
import {
  ConfigRenderer,
  defaultRegistry,
  type JsonSchemaObject,
} from "../../config";
import { useBranding } from "../../config/branding";
import { useTimeout } from "../../hooks";
import {
  getOnboardingProviderOption,
  isSubscriptionProviderSelectionId,
  SUBSCRIPTION_PROVIDER_SELECTIONS,
  type SubscriptionProviderSelectionId,
} from "../../providers";
import { useApp } from "../../state";
import type { ConfigUiHint } from "../../types";
import { openExternalUrl } from "../../utils";
import { ApiKeyConfig } from "./ApiKeyConfig";
import { SubscriptionStatus } from "./SubscriptionStatus";

const SUBSCRIPTION_PROVIDER_LABEL_FALLBACKS: Record<
  SubscriptionProviderSelectionId,
  string
> = {
  "anthropic-subscription": "Claude Subscription",
  "openai-subscription": "ChatGPT Subscription",
};

interface PluginInfo {
  id: string;
  name: string;
  category: string;
  enabled: boolean;
  configured: boolean;
  parameters: PluginParamDef[];
  configUiHints?: Record<string, ConfigUiHint>;
}

function normalizeAiProviderPluginId(value: string): string {
  return value
    .toLowerCase()
    .replace(/^@[^/]+\//, "")
    .replace(/^plugin-/, "");
}

interface ProviderSwitcherProps {
  elizaCloudEnabled?: boolean;
  elizaCloudConnected?: boolean;
  elizaCloudCredits?: number | null;
  elizaCloudCreditsLow?: boolean;
  elizaCloudCreditsCritical?: boolean;
  elizaCloudTopUpUrl?: string;
  elizaCloudUserId?: string | null;
  elizaCloudLoginBusy?: boolean;
  elizaCloudLoginError?: string | null;
  cloudDisconnecting?: boolean;
  plugins?: PluginInfo[];
  pluginSaving?: Set<string>;
  pluginSaveSuccess?: Set<string>;
  loadPlugins?: () => Promise<void>;
  handlePluginToggle?: (pluginId: string, enabled: boolean) => Promise<void>;
  handlePluginConfigSave?: (
    pluginId: string,
    values: Record<string, unknown>,
  ) => void | Promise<void>;
  handleCloudLogin?: () => Promise<void>;
  handleCloudDisconnect?: () => Promise<void>;
  setState?: (key: string, value: unknown) => void;
  setTab?: (tab: string) => void;
}

function getSubscriptionProviderLabel(
  provider: {
    id: SubscriptionProviderSelectionId;
    labelKey: string;
  },
  t: (key: string) => string,
): string {
  const translated = t(provider.labelKey);
  if (translated !== provider.labelKey) {
    return translated;
  }

  return SUBSCRIPTION_PROVIDER_LABEL_FALLBACKS[provider.id] ?? provider.id;
}

export function ProviderSwitcher(props: ProviderSwitcherProps = {}) {
  const { setTimeout } = useTimeout();
  const app = useApp();
  const branding = useBranding();
  const t = app.t;
  const elizaCloudConnected =
    props.elizaCloudConnected ?? Boolean(app.elizaCloudConnected);
  const elizaCloudCredits = props.elizaCloudCredits ?? app.elizaCloudCredits;
  const elizaCloudCreditsLow =
    props.elizaCloudCreditsLow ?? Boolean(app.elizaCloudCreditsLow);
  const elizaCloudCreditsCritical =
    props.elizaCloudCreditsCritical ?? Boolean(app.elizaCloudCreditsCritical);
  const elizaCloudUserId =
    props.elizaCloudUserId ??
    (typeof app.elizaCloudUserId === "string" ? app.elizaCloudUserId : null);
  const elizaCloudLoginBusy =
    props.elizaCloudLoginBusy ?? Boolean(app.elizaCloudLoginBusy);
  const elizaCloudLoginError =
    props.elizaCloudLoginError ??
    (typeof app.elizaCloudLoginError === "string"
      ? app.elizaCloudLoginError
      : null);
  const cloudDisconnecting =
    props.cloudDisconnecting ?? Boolean(app.elizaCloudDisconnecting);
  const plugins = Array.isArray(props.plugins)
    ? props.plugins
    : Array.isArray(app.plugins)
      ? app.plugins
      : [];
  const pluginSaving =
    props.pluginSaving ??
    (app.pluginSaving instanceof Set ? app.pluginSaving : new Set<string>());
  const pluginSaveSuccess =
    props.pluginSaveSuccess ??
    (app.pluginSaveSuccess instanceof Set
      ? app.pluginSaveSuccess
      : new Set<string>());
  const loadPlugins = props.loadPlugins ?? app.loadPlugins;
  const handlePluginConfigSave =
    props.handlePluginConfigSave ?? app.handlePluginConfigSave;
  const handleCloudLogin = props.handleCloudLogin ?? app.handleCloudLogin;
  const handleCloudDisconnect =
    props.handleCloudDisconnect ?? app.handleCloudDisconnect;
  const setState = props.setState ?? app.setState;
  const setTab = props.setTab ?? app.setTab;
  /* ── Model selection state ─────────────────────────────────────── */
  const [modelOptions, setModelOptions] = useState<
    OnboardingOptions["models"] | null
  >(null);
  const [currentSmallModel, setCurrentSmallModel] = useState("");
  const [currentLargeModel, setCurrentLargeModel] = useState("");
  const [modelSaving, setModelSaving] = useState(false);
  const [modelSaveSuccess, setModelSaveSuccess] = useState(false);

  /* ── Subscription state ────────────────────────────────────────── */
  const [subscriptionStatus, setSubscriptionStatus] = useState<
    Array<{
      provider: string;
      configured: boolean;
      valid: boolean;
      expiresAt: number | null;
    }>
  >([]);
  const [anthropicConnected, setAnthropicConnected] = useState(false);
  const [openaiConnected, setOpenaiConnected] = useState(false);

  /* ── pi-ai state ──────────────────────────────────────────────── */
  const [piAiModelSpec, setPiAiModelSpec] = useState("");
  const [piAiModelOptions, setPiAiModelOptions] = useState<
    OnboardingOptions["piAiModels"]
  >([]);
  const [piAiDefaultModelSpec, setPiAiDefaultModelSpec] = useState("");
  const [piAiSaving, setPiAiSaving] = useState(false);
  const [piAiSaveSuccess, setPiAiSaveSuccess] = useState(false);

  const syncSelectionFromConfig = useCallback(
    (cfg: Record<string, unknown>) => {
      const llmText = resolveServiceRoutingInConfig(cfg)?.llmText;
      const providerId = getOnboardingProviderOption(llmText?.backend)?.id;
      const nextSelectedId =
        llmText?.transport === "cloud-proxy" && providerId === "elizacloud"
          ? "__cloud__"
          : llmText?.transport === "direct"
            ? (providerId ?? null)
            : llmText?.transport === "remote" && providerId
              ? providerId
              : null;

      if (!hasManualSelection.current) {
        setSelectedProviderId(nextSelectedId);
      }
      const piAiSelected =
        llmText?.transport === "direct" && providerId === "pi-ai";
      if (piAiSelected) {
        setPiAiModelSpec(llmText.primaryModel ?? "");
      }
    },
    [],
  );

  const loadSubscriptionStatus = useCallback(async () => {
    try {
      const res = await client.getSubscriptionStatus();
      setSubscriptionStatus(res.providers ?? []);
    } catch (err) {
      console.warn("[eliza] Failed to load subscription status", err);
    }
  }, []);

  useEffect(() => {
    void loadSubscriptionStatus();
    void (async () => {
      try {
        const opts = await client.getOnboardingOptions();
        setModelOptions(opts.models);
        setPiAiModelOptions(opts.piAiModels ?? []);
        setPiAiDefaultModelSpec(
          typeof opts.piAiDefaultModel === "string"
            ? opts.piAiDefaultModel
            : "",
        );
      } catch (err) {
        console.warn("[eliza] Failed to load onboarding options", err);
      }
      try {
        const cfg = await client.getConfig();
        const models = cfg.models as Record<string, string> | undefined;
        const llmText = resolveServiceRoutingInConfig(
          cfg as Record<string, unknown>,
        )?.llmText;
        const providerId = getOnboardingProviderOption(llmText?.backend)?.id;
        const elizaCloudEnabledCfg =
          llmText?.transport === "cloud-proxy" && providerId === "elizacloud";
        const defaultSmall = "moonshotai/kimi-k2-turbo";
        const defaultLarge = "moonshotai/kimi-k2-0905";

        // Environment variables — needed both for model fallback and pi-ai
        const env = cfg.env as Record<string, unknown> | undefined;
        const vars = (env?.vars as Record<string, unknown> | undefined) ?? {};

        // Fall back to SMALL_MODEL / LARGE_MODEL env vars when cfg.models
        // is empty.  Local providers (e.g. Ollama) store the active model
        // names as env vars rather than in cfg.models.
        const envSmall =
          typeof vars.SMALL_MODEL === "string" ? vars.SMALL_MODEL : "";
        const envLarge =
          typeof vars.LARGE_MODEL === "string" ? vars.LARGE_MODEL : "";
        setCurrentSmallModel(
          models?.small ||
            envSmall ||
            (elizaCloudEnabledCfg ? defaultSmall : ""),
        );
        setCurrentLargeModel(
          models?.large ||
            envLarge ||
            (elizaCloudEnabledCfg ? defaultLarge : ""),
        );
        syncSelectionFromConfig(cfg as Record<string, unknown>);
        if (!(llmText?.transport === "direct" && providerId === "pi-ai")) {
          setPiAiModelSpec("");
        }
      } catch (err) {
        console.warn("[eliza] Failed to load config", err);
      }
    })();
  }, [loadSubscriptionStatus, syncSelectionFromConfig]);

  useEffect(() => {
    const anthStatus = subscriptionStatus.find(
      (s) => s.provider === "anthropic-subscription",
    );
    const oaiStatus = subscriptionStatus.find(
      (s) =>
        s.provider === "openai-subscription" || s.provider === "openai-codex",
    );
    setAnthropicConnected(Boolean(anthStatus?.configured && anthStatus?.valid));
    setOpenaiConnected(Boolean(oaiStatus?.configured && oaiStatus?.valid));
  }, [subscriptionStatus]);

  /* ── Derived ──────────────────────────────────────────────────── */
  const allAiProviders = useMemo(
    () =>
      [...plugins.filter((p) => p.category === "ai-provider")].sort(
        (left, right) => {
          const leftCatalog = getOnboardingProviderOption(
            normalizeAiProviderPluginId(left.id),
          );
          const rightCatalog = getOnboardingProviderOption(
            normalizeAiProviderPluginId(right.id),
          );
          if (leftCatalog && rightCatalog) {
            return leftCatalog.order - rightCatalog.order;
          }
          if (leftCatalog) return -1;
          if (rightCatalog) return 1;
          return left.name.localeCompare(right.name);
        },
      ),
    [plugins],
  );
  const availableProviderIds = useMemo(
    () =>
      new Set(
        allAiProviders.map(
          (provider) =>
            getOnboardingProviderOption(
              normalizeAiProviderPluginId(provider.id),
            )?.id ?? normalizeAiProviderPluginId(provider.id),
        ),
      ),
    [allAiProviders],
  );

  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(
    null,
  );
  const hasManualSelection = useRef(false);

  const resolvedSelectedId = useMemo(
    () =>
      selectedProviderId === "__cloud__"
        ? "__cloud__"
        : selectedProviderId === "pi-ai"
          ? "pi-ai"
          : selectedProviderId &&
              (availableProviderIds.has(selectedProviderId) ||
                isSubscriptionProviderSelectionId(selectedProviderId))
            ? selectedProviderId
            : null,
    [availableProviderIds, selectedProviderId],
  );

  const selectedProvider = useMemo(() => {
    if (
      !resolvedSelectedId ||
      resolvedSelectedId === "__cloud__" ||
      resolvedSelectedId === "pi-ai" ||
      isSubscriptionProviderSelectionId(resolvedSelectedId)
    ) {
      return null;
    }

    return (
      allAiProviders.find(
        (provider) =>
          (getOnboardingProviderOption(normalizeAiProviderPluginId(provider.id))
            ?.id ?? normalizeAiProviderPluginId(provider.id)) ===
          resolvedSelectedId,
      ) ?? null
    );
  }, [allAiProviders, resolvedSelectedId]);

  /* ── Handlers ─────────────────────────────────────────────────── */
  const handleSwitchProvider = useCallback(
    async (newId: string) => {
      hasManualSelection.current = true;
      setSelectedProviderId(newId);
      const target =
        allAiProviders.find(
          (provider) =>
            (getOnboardingProviderOption(
              normalizeAiProviderPluginId(provider.id),
            )?.id ?? normalizeAiProviderPluginId(provider.id)) === newId,
        ) ?? null;
      const providerId =
        getOnboardingProviderOption(
          normalizeAiProviderPluginId(target?.id ?? newId),
        )?.id ?? newId;

      try {
        await client.switchProvider(providerId);
      } catch (err) {
        console.warn("[eliza] Provider switch failed", err);
      }
    },
    [allAiProviders],
  );

  const handleSelectSubscription = useCallback(
    async (providerId: SubscriptionProviderSelectionId) => {
      hasManualSelection.current = true;
      setSelectedProviderId(providerId);

      try {
        await client.switchProvider(providerId);
      } catch (err) {
        console.warn("[eliza] Provider switch failed", err);
      }
    },
    [],
  );

  const handleSelectCloud = useCallback(async () => {
    hasManualSelection.current = true;
    setSelectedProviderId("__cloud__");
    try {
      await client.switchProvider("elizacloud");
    } catch (err) {
      console.warn("[eliza] Failed to select cloud provider", err);
    }
  }, []);

  const handlePiAiSave = useCallback(async () => {
    setPiAiSaving(true);
    setPiAiSaveSuccess(false);
    try {
      const primaryModel = piAiModelSpec.trim() || undefined;
      await client.switchProvider("pi-ai", undefined, primaryModel);
      setPiAiSaveSuccess(true);
      setTimeout(() => setPiAiSaveSuccess(false), 2000);
    } catch (err) {
      console.warn("[eliza] Failed to enable pi-ai", err);
    } finally {
      setPiAiSaving(false);
    }
  }, [piAiModelSpec, setTimeout]);

  const handleSelectPiAi = useCallback(async () => {
    hasManualSelection.current = true;
    setSelectedProviderId("pi-ai");
    await handlePiAiSave();
  }, [handlePiAiSave]);

  const normalizedPiAiModelSpec = piAiModelSpec.trim();
  const hasKnownPiAiModel = (piAiModelOptions ?? []).some(
    (model) => model.id === normalizedPiAiModelSpec,
  );
  const piAiModelSelectValue =
    normalizedPiAiModelSpec.length === 0
      ? "__default__"
      : hasKnownPiAiModel
        ? normalizedPiAiModelSpec
        : "__custom__";

  /* ── Render ───────────────────────────────────────────────────── */
  const totalCols =
    allAiProviders.length + 2 + SUBSCRIPTION_PROVIDER_SELECTIONS.length;
  const isCloudSelected = resolvedSelectedId === "__cloud__";
  const isPiAiSelected = resolvedSelectedId === "pi-ai";
  const isSubscriptionSelected =
    isSubscriptionProviderSelectionId(resolvedSelectedId);
  const providerChoices = [
    {
      id: "__cloud__",
      label: t("providerswitcher.elizaCloud"),
      disabled: false,
    },
    { id: "pi-ai", label: t("providerswitcher.piAi"), disabled: false },
    ...SUBSCRIPTION_PROVIDER_SELECTIONS.map((provider) => ({
      id: provider.id,
      label: getSubscriptionProviderLabel(provider, t),
      disabled: false,
    })),
    ...allAiProviders.map((provider) => ({
      id:
        getOnboardingProviderOption(normalizeAiProviderPluginId(provider.id))
          ?.id ?? normalizeAiProviderPluginId(provider.id),
      label:
        getOnboardingProviderOption(normalizeAiProviderPluginId(provider.id))
          ?.name ?? provider.name,
      disabled: false,
    })),
  ];

  if (totalCols === 0) {
    return (
      <div className="p-4 border border-[var(--warning)] bg-[var(--card)]">
        <div className="text-xs text-[var(--warning)]">
          {t("providerswitcher.noAiProvidersAvailable")}{" "}
          <Button
            variant="link"
            size="sm"
            className="min-h-[auto] px-0 text-txt underline p-0 h-auto"
            onClick={() => {
              setTab("plugins");
            }}
          >
            {t("runtimeview.Plugins")}
          </Button>{" "}
          {t("providerswitcher.page")}
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Provider dropdown - works for all screen sizes */}
      <div className="mb-3">
        <label
          htmlFor="provider-switcher-select"
          className="block text-xs font-semibold mb-1.5 text-[var(--muted)]"
        >
          {t("providerswitcher.selectAIProvider")}
        </label>
        <Select
          value={resolvedSelectedId ?? "__cloud__"}
          onValueChange={(nextId) => {
            if (nextId === "__cloud__") {
              void handleSelectCloud();
              return;
            }
            if (nextId === "pi-ai") {
              void handleSelectPiAi();
              return;
            }
            if (isSubscriptionProviderSelectionId(nextId)) {
              void handleSelectSubscription(nextId);
              return;
            }
            void handleSwitchProvider(nextId);
          }}
        >
          <SelectTrigger
            id="provider-switcher-select"
            className="w-full px-3 py-2.5 border border-[var(--border)] bg-[var(--card)] text-[13px] rounded-lg transition-all duration-200 focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20 focus:outline-none hover:border-[var(--border-hover)]"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {providerChoices.map((choice) => (
              <SelectItem
                key={choice.id}
                value={choice.id}
                disabled={choice.disabled}
              >
                {choice.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[11px] text-[var(--muted)] mt-1.5">
          {t("providerswitcher.chooseYourPreferredProvider")}
        </p>
        <p className="text-[11px] text-[var(--muted)] mt-1">
          {t("providerswitcher.cloudInferenceToggleHint")}
        </p>
      </div>

      {/* Cloud settings */}
      {isCloudSelected && (
        <div className="mt-4 pt-4 border-t border-[var(--border)]">
          {elizaCloudConnected ? (
            <div>
              <div className="flex justify-between items-center mb-3">
                <div className="flex items-center gap-2">
                  <span className="inline-block w-2 h-2 rounded-full bg-[var(--ok)]" />
                  <span className="text-xs font-semibold">
                    {t("providerswitcher.loggedIntoElizaCloud")}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="!mt-0"
                  onClick={() => void handleCloudDisconnect()}
                  disabled={cloudDisconnecting}
                >
                  {cloudDisconnecting
                    ? t("providerswitcher.disconnecting")
                    : t("providerswitcher.disconnect")}
                </Button>
              </div>

              <div className="text-xs mb-4">
                {elizaCloudUserId && (
                  <span className="text-[var(--muted)] mr-3">
                    <code className="font-[var(--mono)] text-[11px]">
                      {elizaCloudUserId}
                    </code>
                  </span>
                )}
                {elizaCloudCredits !== null && (
                  <span>
                    <span className="text-[var(--muted)]">
                      {t("configpageview.Credits")}
                    </span>{" "}
                    <span
                      className={
                        elizaCloudCreditsCritical
                          ? "text-[var(--danger)] font-bold"
                          : elizaCloudCreditsLow
                            ? "rounded-md bg-[var(--warn-subtle)] px-1.5 py-0.5 text-[var(--text)] font-bold"
                            : ""
                      }
                    >
                      ${elizaCloudCredits.toFixed(2)}
                    </span>
                    <Button
                      variant="link"
                      size="sm"
                      type="button"
                      onClick={() => {
                        setState("cloudDashboardView", "billing");
                        setTab("settings");
                      }}
                      className="ml-2 bg-transparent border-0 p-0 cursor-pointer text-[11px] text-[var(--text)] underline decoration-[var(--accent)] underline-offset-2 hover:opacity-80 h-auto min-h-0"
                    >
                      {t("configpageview.TopUp")}
                    </Button>
                  </span>
                )}
              </div>

              {modelOptions &&
                (() => {
                  const modelSchema = {
                    type: "object" as const,
                    properties: {
                      small: {
                        type: "string",
                        enum: modelOptions.small.map((m) => m.id),
                        description: t(
                          "providerswitcher.smallModelDescription",
                        ),
                      },
                      large: {
                        type: "string",
                        enum: modelOptions.large.map((m) => m.id),
                        description: t(
                          "providerswitcher.largeModelDescription",
                        ),
                      },
                    },
                    required: [] as string[],
                  };
                  const modelHints: Record<string, ConfigUiHint> = {
                    small: {
                      label: t("providerswitcher.smallModelLabel"),
                      width: "half",
                      options: modelOptions.small.map((m) => ({
                        value: m.id,
                        label: m.name,
                        description: `${m.provider} — ${m.description}`,
                      })),
                    },
                    large: {
                      label: t("providerswitcher.largeModelLabel"),
                      width: "half",
                      options: modelOptions.large.map((m) => ({
                        value: m.id,
                        label: m.name,
                        description: `${m.provider} — ${m.description}`,
                      })),
                    },
                  };
                  const modelValues: Record<string, unknown> = {};
                  const modelSetKeys = new Set<string>();
                  if (currentSmallModel) {
                    modelValues.small = currentSmallModel;
                    modelSetKeys.add("small");
                  }
                  if (currentLargeModel) {
                    modelValues.large = currentLargeModel;
                    modelSetKeys.add("large");
                  }

                  return (
                    <ConfigRenderer
                      schema={modelSchema as JsonSchemaObject}
                      hints={modelHints}
                      values={modelValues}
                      setKeys={modelSetKeys}
                      registry={defaultRegistry}
                      onChange={(key, value) => {
                        const val = String(value);
                        const nextSmall =
                          key === "small" ? val : currentSmallModel;
                        const nextLarge =
                          key === "large" ? val : currentLargeModel;
                        if (key === "small") setCurrentSmallModel(val);
                        if (key === "large") setCurrentLargeModel(val);
                        const updated = { small: nextSmall, large: nextLarge };
                        void (async () => {
                          setModelSaving(true);
                          try {
                            await client.updateConfig({ models: updated });
                            setModelSaveSuccess(true);
                            setTimeout(() => setModelSaveSuccess(false), 2000);
                            await client.restartAgent();
                          } catch (err) {
                            console.warn(
                              "[eliza] Failed to save cloud model config",
                              err,
                            );
                          }
                          setModelSaving(false);
                        })();
                      }}
                    />
                  );
                })()}

              <div className="flex items-center justify-end gap-2 mt-3">
                {modelSaving && (
                  <span className="text-[11px] text-[var(--muted)]">
                    {t("providerswitcher.savingRestarting")}
                  </span>
                )}
                {modelSaveSuccess && (
                  <span className="text-[11px] text-[var(--ok)]">
                    {t("providerswitcher.savedRestartingAgent")}
                  </span>
                )}
              </div>
              <p className="mt-2 text-[11px] text-[var(--muted)]">
                {t("providerswitcher.restartRequiredHint")}
              </p>
            </div>
          ) : (
            <div>
              {elizaCloudLoginBusy ? (
                <div className="text-xs text-[var(--muted)]">
                  {t("providerswitcher.waitingForBrowser")}
                </div>
              ) : (
                <>
                  {elizaCloudLoginError && (
                    <div className="text-xs text-[var(--danger)] mb-2">
                      {elizaCloudLoginError}
                    </div>
                  )}
                  {elizaCloudLoginError && (
                    <Button
                      variant="link"
                      size="sm"
                      type="button"
                      className="!mt-0 !px-0 text-[11px]"
                      onClick={() => openExternalUrl(branding.bugReportUrl)}
                    >
                      {t("providerswitcher.reportIssueWithTemplate")}
                    </Button>
                  )}
                  <Button
                    variant="default"
                    size="sm"
                    className="!mt-0 font-bold"
                    onClick={() => void handleCloudLogin()}
                  >
                    {t("providerswitcher.logInToElizaCloud")}
                  </Button>
                  <div className="text-[11px] text-[var(--muted)] mt-1.5">
                    {t("providerswitcher.opensABrowserWindow")}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Subscription provider settings */}
      {isSubscriptionSelected && (
        <SubscriptionStatus
          resolvedSelectedId={resolvedSelectedId}
          subscriptionStatus={subscriptionStatus}
          anthropicConnected={anthropicConnected}
          setAnthropicConnected={setAnthropicConnected}
          openaiConnected={openaiConnected}
          setOpenaiConnected={setOpenaiConnected}
          handleSelectSubscription={handleSelectSubscription}
          loadSubscriptionStatus={loadSubscriptionStatus}
        />
      )}

      {/* pi-ai settings */}
      {!isCloudSelected && isPiAiSelected && (
        <div className="mt-4 pt-4 border-t border-[var(--border)]">
          <div className="text-xs font-semibold mb-2">
            {t("providerswitcher.piSettings")}
          </div>
          <div className="text-[11px] text-[var(--muted)] mb-2">
            {t("onboarding.piCredentialsHint")}
          </div>
          <label
            htmlFor="pi-ai-model-override"
            className="block text-[11px] text-[var(--muted)] mb-1"
          >
            {t("providerswitcher.primaryModelOverride")}
          </label>

          {piAiModelOptions && piAiModelOptions.length > 0 ? (
            <>
              <Select
                value={piAiModelSelectValue}
                onValueChange={(next) => {
                  if (next === "__default__") {
                    setPiAiModelSpec("");
                    return;
                  }
                  if (next === "__custom__") {
                    if (piAiModelSelectValue !== "__custom__") {
                      setPiAiModelSpec("");
                    }
                    return;
                  }
                  setPiAiModelSpec(next);
                }}
              >
                <SelectTrigger
                  id="pi-ai-model-override"
                  className="w-full px-2.5 py-[8px] border border-[var(--border)] bg-[var(--card)] text-[13px] transition-colors focus:border-[var(--accent)] focus:outline-none"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__default__">
                    {t("providerswitcher.usePiDefaultModel")}
                    {piAiDefaultModelSpec ? ` (${piAiDefaultModelSpec})` : ""}
                  </SelectItem>
                  {piAiModelOptions.map((model) => (
                    <SelectItem key={model.id} value={model.id}>
                      {model.name} ({model.provider})
                    </SelectItem>
                  ))}
                  <SelectItem value="__custom__">
                    {t("providerswitcher.customModelSpec")}
                  </SelectItem>
                </SelectContent>
              </Select>

              {piAiModelSelectValue === "__custom__" && (
                <Input
                  type="text"
                  value={piAiModelSpec}
                  onChange={(e) => setPiAiModelSpec(e.target.value)}
                  placeholder={t("providerswitcher.providerModelPlaceholder")}
                  className="mt-2 bg-card text-[13px]"
                />
              )}
            </>
          ) : (
            <Input
              id="pi-ai-model-override"
              type="text"
              value={piAiModelSpec}
              onChange={(e) => setPiAiModelSpec(e.target.value)}
              placeholder={t("providerswitcher.providerModelPlaceholder")}
              className="bg-card text-[13px]"
            />
          )}
          <div className="flex items-center justify-end gap-2 mt-3">
            {piAiSaving && (
              <span className="text-[11px] text-[var(--muted)]">
                {t("providerswitcher.savingRestarting")}
              </span>
            )}
            {piAiSaveSuccess && (
              <span className="text-[11px] text-[var(--ok)]">
                {t("providerswitcher.savedRestartingAgent")}
              </span>
            )}
            <Button
              variant="default"
              size="sm"
              className="!mt-0"
              onClick={() => void handlePiAiSave()}
              disabled={piAiSaving}
            >
              {piAiSaving ? t("apikeyconfig.saving") : t("apikeyconfig.save")}
            </Button>
          </div>
        </div>
      )}

      {/* Local provider settings (API keys) */}
      {!isCloudSelected && (
        <ApiKeyConfig
          selectedProvider={selectedProvider}
          pluginSaving={pluginSaving}
          pluginSaveSuccess={pluginSaveSuccess}
          handlePluginConfigSave={handlePluginConfigSave}
          loadPlugins={loadPlugins}
        />
      )}
    </>
  );
}
