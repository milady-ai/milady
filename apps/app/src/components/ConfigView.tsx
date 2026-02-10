/**
 * Config view component — admin settings.
 *
 * Section order:
 *   1. Theme
 *   2. Model Provider  (onboarding-style provider selector)
 *   3. Model Provider Settings  (detailed plugin config)
 *   4. Wallet Providers & API Keys
 *   5. Connectors
 *   6. Software Updates
 *   7. Chrome Extension
 *   8. Agent Export / Import
 *   9. Danger Zone
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { useApp, THEMES } from "../AppContext";
import { client, type PluginParamDef, type OnboardingOptions } from "../api-client";
import { ConfigRenderer, defaultRegistry } from "./config-renderer";
import type { ConfigUiHint } from "../types";
import type { JsonSchemaObject } from "./config-catalog";

/* ── Modal shell ─────────────────────────────────────────────────────── */

function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md border border-[var(--border)] bg-[var(--card)] p-5 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <div className="font-bold text-sm">{title}</div>
          <button
            className="text-[var(--muted)] hover:text-[var(--txt)] text-lg leading-none px-1"
            onClick={onClose}
          >
            &times;
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ── Auto-detection helpers ────────────────────────────────────────── */

const ACRONYMS = new Set([
  "API", "URL", "ID", "SSH", "SSL", "HTTP", "HTTPS", "RPC",
  "NFT", "EVM", "TLS", "DNS", "IP", "JWT", "SDK", "LLM",
]);

function autoLabel(key: string, pluginId: string): string {
  const prefixes = [
    pluginId.toUpperCase().replace(/-/g, "_") + "_",
    pluginId.toUpperCase().replace(/-/g, "") + "_",
  ];
  let remainder = key;
  for (const prefix of prefixes) {
    if (key.startsWith(prefix) && key.length > prefix.length) {
      remainder = key.slice(prefix.length);
      break;
    }
  }
  return remainder
    .split("_")
    .map((w) => (ACRONYMS.has(w) ? w : w.charAt(0) + w.slice(1).toLowerCase()))
    .join(" ");
}

/* ── ConfigView ───────────────────────────────────────────────────────── */

export function ConfigView() {
  const {
    // Cloud
    cloudEnabled,
    cloudConnected,
    cloudCredits,
    cloudCreditsLow,
    cloudCreditsCritical,
    cloudTopUpUrl,
    cloudUserId,
    cloudLoginBusy,
    cloudLoginError,
    cloudDisconnecting,
    // Plugins
    plugins,
    pluginSaving,
    pluginSaveSuccess,
    // Theme
    currentTheme,
    // Updates
    updateStatus,
    updateLoading,
    updateChannelSaving: _updateChannelSaving,
    // Extension
    extensionStatus,
    extensionChecking,
    // Wallet
    walletConfig,
    walletApiKeySaving,
    walletExportVisible,
    walletExportData,
    // Export/Import
    exportBusy,
    exportPassword,
    exportIncludeLogs,
    exportError,
    exportSuccess,
    importBusy,
    importPassword,
    importFile,
    importError,
    importSuccess,
    // Actions
    loadPlugins,
    handlePluginToggle,
    setTheme,
    setTab,
    loadUpdateStatus,
    handleChannelChange,
    checkExtensionStatus,
    handleWalletApiKeySave,
    handlePluginConfigSave,
    handleAgentExport,
    handleAgentImport,
    handleCloudLogin,
    handleCloudDisconnect,
    handleReset,
    handleExportKeys,
    copyToClipboard,
    setState,
  } = useApp();

  /* ── Model selection state ─────────────────────────────────────────── */
  const [modelOptions, setModelOptions] = useState<OnboardingOptions["models"] | null>(null);
  const [currentSmallModel, setCurrentSmallModel] = useState("");
  const [currentLargeModel, setCurrentLargeModel] = useState("");
  const [modelSaving, setModelSaving] = useState(false);
  const [modelSaveSuccess, setModelSaveSuccess] = useState(false);

  useEffect(() => {
    void loadPlugins();
    void loadUpdateStatus();
    void checkExtensionStatus();

    /* Load model options and current model config */
    void (async () => {
      try {
        const opts = await client.getOnboardingOptions();
        setModelOptions(opts.models);
      } catch { /* ignore */ }
      try {
        const cfg = await client.getConfig();
        const models = cfg.models as Record<string, string> | undefined;
        const cloud = cfg.cloud as Record<string, unknown> | undefined;
        const cloudEnabled = cloud?.enabled === true;
        const defaultSmall = "moonshotai/kimi-k2-turbo";
        const defaultLarge = "moonshotai/kimi-k2-0905";
        setCurrentSmallModel(models?.small || (cloudEnabled ? defaultSmall : ""));
        setCurrentLargeModel(models?.large || (cloudEnabled ? defaultLarge : ""));
      } catch { /* ignore */ }
    })();
  }, [loadPlugins, loadUpdateStatus, checkExtensionStatus]);

  /* ── Derived ──────────────────────────────────────────────────────── */

  const allAiProviders = plugins.filter((p) => p.category === "ai-provider");
  const enabledAiProviders = allAiProviders.filter((p) => p.enabled);

  /* Track which provider is selected for showing settings inline.
   * Initialise to __cloud__ when cloud is the active model provider so the
   * selection survives component remounts (e.g. tab switches). */
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(
    () => (cloudEnabled ? "__cloud__" : null),
  );

  /* Keep in sync: when cloudEnabled changes (e.g. after onboarding or
   * disconnect), update the local selection if the user hasn't already
   * picked something manually. */
  const hasManualSelection = useRef(false);
  useEffect(() => {
    if (hasManualSelection.current) return;
    if (cloudEnabled && selectedProviderId !== "__cloud__") {
      setSelectedProviderId("__cloud__");
    }
  }, [cloudEnabled]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Resolve the actually-selected provider: accept __cloud__ or fall back to first enabled */
  const resolvedSelectedId =
    selectedProviderId === "__cloud__"
      ? "__cloud__"
      : selectedProviderId && allAiProviders.some((p) => p.id === selectedProviderId)
        ? selectedProviderId
        : enabledAiProviders[0]?.id ?? null;

  const selectedProvider = resolvedSelectedId && resolvedSelectedId !== "__cloud__"
    ? allAiProviders.find((p) => p.id === resolvedSelectedId) ?? null
    : null;

  /* Switch to a local provider: enable the new one, disable all others,
   * and turn off cloud mode so the runtime picks up the correct plugin. */
  const handleSwitchProvider = useCallback(
    async (newId: string) => {
      hasManualSelection.current = true;
      setSelectedProviderId(newId);
      const target = allAiProviders.find((p) => p.id === newId);
      if (!target) return;

      /* Turn off cloud mode when switching to a local provider */
      try {
        await client.updateConfig({ cloud: { enabled: false } });
      } catch { /* non-fatal */ }

      /* Enable the new provider if not already */
      if (!target.enabled) {
        await handlePluginToggle(newId, true);
      }

      /* Disable all other enabled ai-providers */
      for (const p of enabledAiProviders) {
        if (p.id !== newId) {
          await handlePluginToggle(p.id, false);
        }
      }
    },
    [allAiProviders, enabledAiProviders, handlePluginToggle],
  );

  /* Switch to Eliza Cloud: persist the selection to config and restart
   * the runtime so the cloud plugin loads with the saved API key.
   * Also ensures sensible model defaults are present in config. */
  const handleSelectCloud = useCallback(async () => {
    hasManualSelection.current = true;
    setSelectedProviderId("__cloud__");
    try {
      await client.updateConfig({
        cloud: { enabled: true },
        models: {
          small: currentSmallModel || "moonshotai/kimi-k2-turbo",
          large: currentLargeModel || "moonshotai/kimi-k2-0905",
        },
      });
      await client.restartAgent();
    } catch { /* non-fatal */ }
  }, [currentSmallModel, currentLargeModel]);

  const ext = extensionStatus;
  const relayOk = ext?.relayReachable === true;

  /* ── RPC provider field values (replaces DOM-based data-wallet-config) */
  const [rpcFieldValues, setRpcFieldValues] = useState<Record<string, string>>({});

  const handleRpcFieldChange = useCallback((key: string, value: unknown) => {
    setRpcFieldValues((prev) => ({ ...prev, [key]: String(value ?? "") }));
  }, []);

  /* ── Wallet key save (collects values from rpcFieldValues state) ── */
  const handleWalletSaveAll = useCallback(() => {
    const config: Record<string, string> = {};
    for (const [key, value] of Object.entries(rpcFieldValues)) {
      if (value) config[key] = value;
    }
    void handleWalletApiKeySave(config);
  }, [handleWalletApiKeySave, rpcFieldValues]);

  /* ── Messaging channels state ── */
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [channelsError, setChannelsError] = useState<string | null>(null);
  const [connectorValues, setConnectorValues] = useState<Record<string, Record<string, unknown>>>({});
  const [connectorStatus, setConnectorStatus] = useState<Record<string, { configured: boolean }>>({});
  const [connectorSaving, setConnectorSaving] = useState<Set<string>>(new Set());
  const [connectorFeedback, setConnectorFeedback] = useState<Record<string, { type: "success" | "error"; text: string } | null>>({});
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  // Map connector names to the plugin token parameter keys so we can
  // detect when a user configured the token via the Plugins page.
  const CONNECTOR_PLUGIN_TOKEN_KEYS: Record<string, string[]> = {
    telegram: ["TELEGRAM_BOT_TOKEN"],
    discord: ["DISCORD_BOT_TOKEN", "DISCORD_APPLICATION_ID"],
    whatsapp: ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID"],
  };

  const loadConnectors = useCallback(async () => {
    setChannelsLoading(true);
    setChannelsError(null);
    try {
      const { connectors } = await client.getConnectors();
      const status: Record<string, { configured: boolean }> = {};
      const values: Record<string, Record<string, unknown>> = {};
      for (const [name, cfg] of Object.entries(connectors ?? {})) {
        const cfgObj = cfg as Record<string, unknown>;
        const hasToken = Boolean(
          (cfgObj.botToken as string)?.trim() || (cfgObj.token as string)?.trim() || (cfgObj.apiKey as string)?.trim()
        );
        status[name] = { configured: hasToken };
        values[name] = {};
        // Don't populate sensitive values - user must re-enter them
      }
      // Also check if the corresponding plugin has its token params set
      // (user may have configured via Plugins page instead of Connectors)
      for (const [connName, tokenKeys] of Object.entries(CONNECTOR_PLUGIN_TOKEN_KEYS)) {
        if (status[connName]?.configured) continue; // already configured via connectors
        const plug = plugins.find((p) => p.id === connName);
        if (!plug?.parameters) continue;
        const hasPluginToken = tokenKeys.some((tk) =>
          plug.parameters?.some((param) => param.key === tk && param.isSet)
        );
        if (hasPluginToken) {
          status[connName] = { configured: true };
        }
      }
      setConnectorStatus(status);
      setConnectorValues(values);
    } catch (err) {
      setChannelsError(err instanceof Error ? err.message : "Failed to load connectors");
    }
    setChannelsLoading(false);
  }, [plugins]);

  const handleConnectorSave = useCallback(async (name: string) => {
    const vals = connectorValues[name];
    if (!vals || Object.values(vals).every((v) => !v || (typeof v === "string" && v.startsWith("••••")))) {
      setConnectorFeedback((prev) => ({ ...prev, [name]: { type: "error", text: "Enter credentials before saving." } }));
      return;
    }
    setConnectorSaving((prev) => new Set(prev).add(name));
    setConnectorFeedback((prev) => ({ ...prev, [name]: null }));
    try {
      await client.saveConnector(name, vals as Record<string, string>);
      setConnectorFeedback((prev) => ({ ...prev, [name]: { type: "success", text: `${name.charAt(0).toUpperCase() + name.slice(1)} connector saved. Restart agent to apply.` } }));
      await loadConnectors();
    } catch (err) {
      setConnectorFeedback((prev) => ({ ...prev, [name]: { type: "error", text: err instanceof Error ? err.message : `Failed to save ${name} connector.` } }));
    }
    setConnectorSaving((prev) => { const next = new Set(prev); next.delete(name); return next; });
  }, [connectorValues, loadConnectors]);

  const handleConnectorDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      await client.deleteConnector(deleteTarget);
      setConnectorStatus((prev) => ({ ...prev, [deleteTarget]: { configured: false } }));
      setConnectorValues((prev) => ({ ...prev, [deleteTarget]: {} }));
      setDeleteModalOpen(false);
      setConnectorFeedback((prev) => ({ ...prev, [deleteTarget]: { type: "success", text: `${deleteTarget.charAt(0).toUpperCase() + deleteTarget.slice(1)} connector deleted. Restart agent to apply.` } }));
      await loadConnectors();
    } catch (err) {
      setConnectorFeedback((prev) => ({ ...prev, [deleteTarget!]: { type: "error", text: err instanceof Error ? err.message : `Failed to delete ${deleteTarget} connector.` } }));
    }
    setDeleteBusy(false);
    setDeleteTarget(null);
  }, [deleteTarget, loadConnectors]);

  useEffect(() => {
    void loadConnectors();
  }, [loadConnectors]);

  /* ── RPC provider selection state ────────────────────────────────── */
  const [selectedEvmRpc, setSelectedEvmRpc] = useState<"eliza-cloud" | "alchemy" | "infura" | "ankr">("eliza-cloud");
  const [selectedSolanaRpc, setSelectedSolanaRpc] = useState<"eliza-cloud" | "helius-birdeye">("eliza-cloud");

  /* ── Export / Import modal state ─────────────────────────────────── */
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);

  const openExportModal = useCallback(() => {
    setState("exportPassword", "");
    setState("exportIncludeLogs", false);
    setState("exportError", null);
    setState("exportSuccess", null);
    setExportModalOpen(true);
  }, [setState]);

  const openImportModal = useCallback(() => {
    setState("importPassword", "");
    setState("importFile", null);
    setState("importError", null);
    setState("importSuccess", null);
    setImportModalOpen(true);
  }, [setState]);

  /* ── Plugin config local state for collecting field values ──────── */
  const [pluginFieldValues, setPluginFieldValues] = useState<Record<string, Record<string, string>>>({});

  const handlePluginFieldChange = useCallback(
    (pluginId: string, key: string, value: string) => {
      setPluginFieldValues((prev) => ({
        ...prev,
        [pluginId]: { ...(prev[pluginId] ?? {}), [key]: value },
      }));
    },
    [],
  );

  const handlePluginSave = useCallback(
    (pluginId: string) => {
      const values = pluginFieldValues[pluginId] ?? {};
      void handlePluginConfigSave(pluginId, values);
    },
    [pluginFieldValues, handlePluginConfigSave],
  );

  /* ── Connector definitions ────────────────────────────────────────── */
  const CONNECTORS: Array<{
    name: string;
    label: string;
    description: string;
    available: boolean;
    schema: JsonSchemaObject;
    hints: Record<string, ConfigUiHint>;
  }> = [
    {
      name: "telegram",
      label: "Telegram",
      description: "Connect via @BotFather bot token.",
      available: true,
      schema: {
        type: "object",
        properties: {
          botToken: { type: "string", description: "Bot token from @BotFather" },
        },
        required: ["botToken"],
      },
      hints: {
        botToken: { label: "Bot Token", type: "password", sensitive: true, placeholder: "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11" },
      },
    },
    {
      name: "discord",
      label: "Discord",
      description: "Discord bot integration.",
      available: true,
      schema: {
        type: "object",
        properties: {
          botToken: { type: "string", description: "Discord bot token" },
          applicationId: { type: "string", description: "Discord application ID" },
        },
        required: ["botToken"],
      },
      hints: {
        botToken: { label: "Bot Token", type: "password", sensitive: true, placeholder: "Your Discord bot token" },
        applicationId: { label: "Application ID", placeholder: "Discord application ID" },
      },
    },
    {
      name: "whatsapp",
      label: "WhatsApp",
      description: "WhatsApp Business API integration.",
      available: true,
      schema: {
        type: "object",
        properties: {
          phoneNumberId: { type: "string", description: "WhatsApp Business phone number ID" },
          accessToken: { type: "string", description: "Permanent access token from Meta" },
          verifyToken: { type: "string", description: "Webhook verification token (you choose this)" },
          businessAccountId: { type: "string", description: "WhatsApp Business Account ID" },
        },
        required: ["phoneNumberId", "accessToken"],
      },
      hints: {
        phoneNumberId: { label: "Phone Number ID", placeholder: "115234567890123456" },
        accessToken: { label: "Access Token", type: "password", sensitive: true, placeholder: "EAABs..." },
        verifyToken: { label: "Webhook Verify Token", placeholder: "my-verify-token-123" },
        businessAccountId: { label: "Business Account ID", placeholder: "102345678901234", advanced: true },
      },
    },
  ];

  return (
    <div>
      <h2 className="text-lg font-bold mb-5">Config</h2>

      {/* ═══════════════════════════════════════════════════════════════
          1. THEME
          ═══════════════════════════════════════════════════════════════ */}
      <div className="mt-6 p-4 border border-[var(--border)] bg-[var(--card)]">
        <div className="font-bold text-sm mb-2">Theme</div>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
          {THEMES.map((t) => (
            <button
              key={t.id}
              className={`theme-btn py-2 px-2 ${currentTheme === t.id ? "active" : ""}`}
              onClick={() => setTheme(t.id)}
            >
              <div className="text-xs font-bold text-[var(--text)] whitespace-nowrap text-center">
                {t.label}
              </div>
              <div className="text-[10px] text-[var(--muted)] mt-0.5 text-center whitespace-nowrap">
                {t.hint}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          3. MODEL PROVIDER  (onboarding-style selector)
          ═══════════════════════════════════════════════════════════════ */}
      <div className="mt-6 p-4 border border-[var(--border)] bg-[var(--card)]">
        <div className="font-bold text-sm mb-4">Model Provider</div>

        {/* Provider cards (cloud + local in one row) */}
        {(() => {
          const totalCols = allAiProviders.length + 1; /* +1 for Eliza Cloud, always shown */
          const isCloudSelected = resolvedSelectedId === "__cloud__";

          if (totalCols === 0) {
            return (
              <div className="p-4 border border-[var(--warning,#f39c12)] bg-[var(--card)]">
                <div className="text-xs text-[var(--warning,#f39c12)]">
                  No AI providers available. Install a provider plugin from the{" "}
                  <a
                    href="#"
                    className="text-[var(--accent)] underline"
                    onClick={(e: React.MouseEvent) => {
                      e.preventDefault();
                      setTab("features");
                    }}
                  >
                    Features
                  </a>{" "}
                  page.
                </div>
              </div>
            );
          }

          return (
            <>
              {/* Button row */}
              <div
                className="grid gap-1.5"
                style={{ gridTemplateColumns: `repeat(${totalCols}, 1fr)` }}
              >
                <button
                  className={`text-center px-2 py-2 border cursor-pointer transition-colors ${
                    isCloudSelected
                      ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-foreground)]"
                      : "border-[var(--border)] bg-[var(--card)] hover:border-[var(--accent)]"
                  }`}
                  onClick={() => void handleSelectCloud()}
                >
                  <div className={`text-xs font-bold whitespace-nowrap ${isCloudSelected ? "" : "text-[var(--text)]"}`}>
                    Eliza Cloud
                  </div>
                </button>
                {allAiProviders.map((provider) => {
                  const isSelected = !isCloudSelected && provider.id === resolvedSelectedId;
                  return (
                    <button
                      key={provider.id}
                      className={`text-center px-2 py-2 border cursor-pointer transition-colors ${
                        isSelected
                          ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-foreground)]"
                          : "border-[var(--border)] bg-[var(--card)] hover:border-[var(--accent)]"
                      }`}
                      onClick={() => void handleSwitchProvider(provider.id)}
                    >
                      <div className={`text-xs font-bold whitespace-nowrap ${isSelected ? "" : "text-[var(--text)]"}`}>
                        {provider.name}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* ── Eliza Cloud settings ──────────────────────────────── */}
              {isCloudSelected && (
                <div className="mt-4 pt-4 border-t border-[var(--border)]">
                  {cloudConnected ? (
                    <div>
                      <div className="flex justify-between items-center mb-3">
                        <div className="flex items-center gap-2">
                          <span className="inline-block w-2 h-2 rounded-full bg-[var(--ok,#16a34a)]" />
                          <span className="text-xs font-semibold">Logged into Eliza Cloud</span>
                        </div>
                        <button
                          className="btn text-xs py-[3px] px-3 !mt-0 !bg-transparent !border-[var(--border)] !text-[var(--muted)]"
                          onClick={() => void handleCloudDisconnect()}
                          disabled={cloudDisconnecting}
                        >
                          {cloudDisconnecting ? "Disconnecting..." : "Disconnect"}
                        </button>
                      </div>

                      <div className="text-xs mb-4">
                        {cloudUserId && (
                          <span className="text-[var(--muted)] mr-3">
                            <code className="font-[var(--mono)] text-[11px]">{cloudUserId}</code>
                          </span>
                        )}
                        {cloudCredits !== null && (
                          <span>
                            <span className="text-[var(--muted)]">Credits:</span>{" "}
                            <span
                              className={
                                cloudCreditsCritical
                                  ? "text-[var(--danger,#e74c3c)] font-bold"
                                  : cloudCreditsLow
                                    ? "text-[#b8860b] font-bold"
                                    : ""
                              }
                            >
                              ${cloudCredits.toFixed(2)}
                            </span>
                            <a
                              href={cloudTopUpUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[11px] ml-2 text-[var(--accent)]"
                            >
                              Top up
                            </a>
                          </span>
                        )}
                      </div>

                      {/* Cloud model selection */}
                      {modelOptions && (() => {
                        const modelSchema = {
                          type: "object" as const,
                          properties: {
                            small: {
                              type: "string",
                              enum: modelOptions.small.map((m) => m.id),
                              description: "Fast model for simple tasks",
                            },
                            large: {
                              type: "string",
                              enum: modelOptions.large.map((m) => m.id),
                              description: "Powerful model for complex reasoning",
                            },
                          },
                          required: [] as string[],
                        };
                        const modelHints: Record<string, ConfigUiHint> = {
                          small: { label: "Small Model", width: "half" },
                          large: { label: "Large Model", width: "half" },
                        };
                        const modelValues: Record<string, unknown> = {};
                        const modelSetKeys = new Set<string>();
                        if (currentSmallModel) { modelValues.small = currentSmallModel; modelSetKeys.add("small"); }
                        if (currentLargeModel) { modelValues.large = currentLargeModel; modelSetKeys.add("large"); }

                        return (
                          <ConfigRenderer
                            schema={modelSchema as JsonSchemaObject}
                            hints={modelHints}
                            values={modelValues}
                            setKeys={modelSetKeys}
                            registry={defaultRegistry}
                            onChange={(key, value) => {
                              const val = String(value);
                              if (key === "small") setCurrentSmallModel(val);
                              if (key === "large") setCurrentLargeModel(val);
                              // Auto-save + restart on model change
                              const updated = {
                                small: key === "small" ? val : currentSmallModel,
                                large: key === "large" ? val : currentLargeModel,
                              };
                              void (async () => {
                                setModelSaving(true);
                                try {
                                  await client.updateConfig({ models: updated });
                                  setModelSaveSuccess(true);
                                  setTimeout(() => setModelSaveSuccess(false), 2000);
                                  await client.restartAgent();
                                } catch { /* ignore */ }
                                setModelSaving(false);
                              })();
                            }}
                          />
                        );
                      })()}

                      <div className="flex items-center justify-end gap-2 mt-3">
                        {modelSaving && <span className="text-[11px] text-[var(--muted)]">Saving &amp; restarting...</span>}
                        {modelSaveSuccess && <span className="text-[11px] text-[var(--ok,#16a34a)]">Saved — restarting agent</span>}
                      </div>
                    </div>
                  ) : (
                    <div>
                      {cloudLoginBusy ? (
                        <div className="text-xs text-[var(--muted)]">
                          Waiting for browser authentication... A new tab should have opened.
                        </div>
                      ) : (
                        <>
                          {cloudLoginError && (
                            <div className="text-xs text-[var(--danger,#e74c3c)] mb-2">
                              {cloudLoginError}
                            </div>
                          )}
                          <button
                            className="btn text-xs py-[5px] px-3.5 font-bold !mt-0"
                            onClick={() => void handleCloudLogin()}
                          >
                            Log in to Eliza Cloud
                          </button>
                          <div className="text-[11px] text-[var(--muted)] mt-1.5">
                            Opens a browser window to authenticate.
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}


              {/* ── Local provider settings ──────────────────────────── */}
              {!isCloudSelected && selectedProvider && selectedProvider.parameters.length > 0 && (() => {
                const isSaving = pluginSaving.has(selectedProvider.id);
                const saveSuccess = pluginSaveSuccess.has(selectedProvider.id);
                const params = selectedProvider.parameters;
                const setCount = params.filter((p: PluginParamDef) => p.isSet).length;

                return (
                  <div className="mt-4 pt-4 border-t border-[var(--border)]">
                    <div className="flex justify-between items-center mb-3">
                      <div className="text-xs font-semibold">
                        {selectedProvider.name} Settings
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-[var(--muted)]">
                          {setCount}/{params.length} configured
                        </span>
                        <span
                          className="text-[11px] px-2 py-[3px] border"
                          style={{
                            borderColor: selectedProvider.configured ? "#2d8a4e" : "var(--warning,#f39c12)",
                            color: selectedProvider.configured ? "#2d8a4e" : "var(--warning,#f39c12)",
                          }}
                        >
                          {selectedProvider.configured ? "Configured" : "Needs Setup"}
                        </span>
                      </div>
                    </div>

                    {(() => {
                      const properties: Record<string, Record<string, unknown>> = {};
                      const required: string[] = [];
                      const hints: Record<string, ConfigUiHint> = {};
                      for (const p of params) {
                        const prop: Record<string, unknown> = {};
                        if (p.type === "boolean") prop.type = "boolean";
                        else if (p.type === "number") prop.type = "number";
                        else prop.type = "string";
                        if (p.description) prop.description = p.description;
                        if (p.default != null) prop.default = p.default;
                        if (p.options?.length) prop.enum = p.options;
                        const k = p.key.toUpperCase();
                        if (k.includes("URL") || k.includes("ENDPOINT")) prop.format = "uri";
                        properties[p.key] = prop;
                        if (p.required) required.push(p.key);
                        hints[p.key] = {
                          label: autoLabel(p.key, selectedProvider.id),
                          sensitive: p.sensitive ?? false,
                        };
                        if (p.description) hints[p.key].help = p.description;
                      }
                      const schema = { type: "object", properties, required } as JsonSchemaObject;
                      const values: Record<string, unknown> = {};
                      const setKeys = new Set<string>();
                      for (const p of params) {
                        const cv = pluginFieldValues[selectedProvider.id]?.[p.key];
                        if (cv !== undefined) { values[p.key] = cv; }
                        else if (p.isSet && !p.sensitive && p.currentValue != null) { values[p.key] = p.currentValue; }
                        if (p.isSet) setKeys.add(p.key);
                      }
                      return (
                        <ConfigRenderer
                          schema={schema}
                          hints={hints}
                          values={values}
                          setKeys={setKeys}
                          registry={defaultRegistry}
                          pluginId={selectedProvider.id}
                          onChange={(key, value) => handlePluginFieldChange(selectedProvider.id, key, String(value ?? ""))}
                        />
                      );
                    })()}

                    <div className="flex justify-end mt-3">
                      <button
                        className={`btn text-xs py-[5px] px-4 !mt-0 ${saveSuccess ? "!bg-[var(--ok,#16a34a)] !border-[var(--ok,#16a34a)]" : ""}`}
                        onClick={() => handlePluginSave(selectedProvider.id)}
                        disabled={isSaving}
                      >
                        {isSaving ? "Saving..." : saveSuccess ? "Saved" : "Save"}
                      </button>
                    </div>
                  </div>
                );
              })()}
            </>
          );
        })()}
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          5. RPC & DATA PROVIDERS
          ═══════════════════════════════════════════════════════════════ */}
      <div className="mt-6 p-4 border border-[var(--border)] bg-[var(--card)]">
        <div className="font-bold text-sm mb-4">RPC &amp; Data Providers</div>

        <div className="grid grid-cols-2 gap-6">
          {/* ── EVM ─────────────────────────────────────── */}
          <div>
            <div className="text-xs font-bold mb-1">EVM</div>
            <div className="text-[11px] text-[var(--muted)] mb-2">Ethereum, Base, Arbitrum, Optimism, Polygon</div>

            <div className="grid grid-cols-4 gap-1.5">
              {([
                { id: "eliza-cloud" as const, label: "Eliza Cloud" },
                { id: "alchemy" as const, label: "Alchemy" },
                { id: "infura" as const, label: "Infura" },
                { id: "ankr" as const, label: "Ankr" },
              ]).map((p) => {
                const active = selectedEvmRpc === p.id;
                return (
                  <button
                    key={p.id}
                    className={`text-center px-2 py-2 border cursor-pointer transition-colors ${
                      active
                        ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-foreground)]"
                        : "border-[var(--border)] bg-[var(--card)] hover:border-[var(--accent)]"
                    }`}
                    onClick={() => setSelectedEvmRpc(p.id)}
                  >
                    <div className={`text-xs font-bold whitespace-nowrap ${active ? "" : "text-[var(--text)]"}`}>
                      {p.label}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Inline settings for selected EVM provider via ConfigRenderer */}
            {selectedEvmRpc === "eliza-cloud" ? (
              <div className="mt-3">
                {cloudConnected ? (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="inline-block w-2 h-2 rounded-full bg-[var(--ok,#16a34a)]" />
                    <span className="font-semibold">Connected to Eliza Cloud</span>
                    {cloudCredits !== null && (
                      <span className="text-[var(--muted)] ml-auto">
                        Credits: <span className={cloudCreditsCritical ? "text-[var(--danger,#e74c3c)] font-bold" : cloudCreditsLow ? "text-[#b8860b] font-bold" : ""}>${cloudCredits.toFixed(2)}</span>
                        {cloudTopUpUrl && <a href={cloudTopUpUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] ml-1.5 text-[var(--accent)]">Top up</a>}
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="inline-block w-2 h-2 rounded-full bg-[var(--muted)]" />
                      <span className="text-[var(--muted)]">Requires Eliza Cloud connection</span>
                    </div>
                    <button
                      className="btn text-xs py-[3px] px-3 !mt-0 font-bold"
                      onClick={() => void handleCloudLogin()}
                      disabled={cloudLoginBusy}
                    >
                      {cloudLoginBusy ? "Connecting..." : "Log in"}
                    </button>
                  </div>
                )}
              </div>
            ) : (() => {
              const evmProviders: Record<"alchemy" | "infura" | "ankr", { configKey: string; label: string; isSet: boolean }> = {
                alchemy: { configKey: "ALCHEMY_API_KEY", label: "Alchemy API Key", isSet: walletConfig?.alchemyKeySet ?? false },
                infura: { configKey: "INFURA_API_KEY", label: "Infura API Key", isSet: walletConfig?.infuraKeySet ?? false },
                ankr: { configKey: "ANKR_API_KEY", label: "Ankr API Key", isSet: walletConfig?.ankrKeySet ?? false },
              };
              const p = evmProviders[selectedEvmRpc as "alchemy" | "infura" | "ankr"];
              if (!p) return null;
              const evmSchema: JsonSchemaObject = {
                type: "object",
                properties: { [p.configKey]: { type: "string", description: p.label } },
                required: [],
              };
              const evmHints: Record<string, ConfigUiHint> = {
                [p.configKey]: { label: p.label, sensitive: true, placeholder: p.isSet ? "Already set \u2014 leave blank to keep" : "Enter API key", width: "full" },
              };
              const evmValues: Record<string, unknown> = {};
              const evmSetKeys = new Set<string>();
              if (rpcFieldValues[p.configKey] !== undefined) evmValues[p.configKey] = rpcFieldValues[p.configKey];
              if (p.isSet) evmSetKeys.add(p.configKey);

              return (
                <div className="mt-3">
                  <ConfigRenderer
                    schema={evmSchema}
                    hints={evmHints}
                    values={evmValues}
                    setKeys={evmSetKeys}
                    registry={defaultRegistry}
                    onChange={handleRpcFieldChange}
                  />
                </div>
              );
            })()}
          </div>

          {/* ── Solana ──────────────────────────────────── */}
          <div>
            <div className="text-xs font-bold mb-1">Solana</div>
            <div className="text-[11px] text-[var(--muted)] mb-2">Solana mainnet tokens and NFTs</div>

            <div className="grid grid-cols-2 gap-1.5">
              {([
                { id: "eliza-cloud" as const, label: "Eliza Cloud" },
                { id: "helius-birdeye" as const, label: "Helius + Birdeye" },
              ]).map((p) => {
                const active = selectedSolanaRpc === p.id;
                return (
                  <button
                    key={p.id}
                    className={`text-center px-2 py-2 border cursor-pointer transition-colors ${
                      active
                        ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-foreground)]"
                        : "border-[var(--border)] bg-[var(--card)] hover:border-[var(--accent)]"
                    }`}
                    onClick={() => setSelectedSolanaRpc(p.id)}
                  >
                    <div className={`text-xs font-bold whitespace-nowrap ${active ? "" : "text-[var(--text)]"}`}>
                      {p.label}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Inline settings for selected Solana provider */}
            {selectedSolanaRpc === "eliza-cloud" ? (
              <div className="mt-3">
                {cloudConnected ? (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="inline-block w-2 h-2 rounded-full bg-[var(--ok,#16a34a)]" />
                    <span className="font-semibold">Connected to Eliza Cloud</span>
                    {cloudCredits !== null && (
                      <span className="text-[var(--muted)] ml-auto">
                        Credits: <span className={cloudCreditsCritical ? "text-[var(--danger,#e74c3c)] font-bold" : cloudCreditsLow ? "text-[#b8860b] font-bold" : ""}>${cloudCredits.toFixed(2)}</span>
                        {cloudTopUpUrl && <a href={cloudTopUpUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] ml-1.5 text-[var(--accent)]">Top up</a>}
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="inline-block w-2 h-2 rounded-full bg-[var(--muted)]" />
                      <span className="text-[var(--muted)]">Requires Eliza Cloud connection</span>
                    </div>
                    <button
                      className="btn text-xs py-[3px] px-3 !mt-0 font-bold"
                      onClick={() => void handleCloudLogin()}
                      disabled={cloudLoginBusy}
                    >
                      {cloudLoginBusy ? "Connecting..." : "Log in"}
                    </button>
                  </div>
                )}
              </div>
            ) : (() => {
              const solProviders: Record<string, { configKey: string; label: string; isSet: boolean }> = {
                helius: { configKey: "HELIUS_API_KEY", label: "Helius API Key", isSet: walletConfig?.heliusKeySet ?? false },
                birdeye: { configKey: "BIRDEYE_API_KEY", label: "Birdeye API Key", isSet: walletConfig?.birdeyeKeySet ?? false },
              };
              const solKeys = selectedSolanaRpc === "helius-birdeye" ? ["helius", "birdeye"] : [];
              const allSchemaProps: Record<string, Record<string, unknown>> = {};
              const allHints: Record<string, ConfigUiHint> = {};
              const allValues: Record<string, unknown> = {};
              const allSetKeys = new Set<string>();
              for (const sk of solKeys) {
                const p = solProviders[sk];
                if (!p) continue;
                allSchemaProps[p.configKey] = { type: "string", description: p.label };
                allHints[p.configKey] = { label: p.label, sensitive: true, placeholder: p.isSet ? "Already set \u2014 leave blank to keep" : "Enter API key", width: "full" };
                if (rpcFieldValues[p.configKey] !== undefined) allValues[p.configKey] = rpcFieldValues[p.configKey];
                if (p.isSet) allSetKeys.add(p.configKey);
              }
              const solSchema: JsonSchemaObject = { type: "object", properties: allSchemaProps, required: [] };
              return (
                <div className="mt-3">
                  <ConfigRenderer
                    schema={solSchema}
                    hints={allHints}
                    values={allValues}
                    setKeys={allSetKeys}
                    registry={defaultRegistry}
                    onChange={handleRpcFieldChange}
                  />
                </div>
              );
            })()}
          </div>
        </div>

        <div className="flex justify-end mt-4">
          <button
            className="btn text-[11px] py-1 px-3.5 !mt-0"
            onClick={handleWalletSaveAll}
            disabled={walletApiKeySaving}
          >
            {walletApiKeySaving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          6. MESSAGING CHANNELS
          ═══════════════════════════════════════════════════════════════ */}
      <div className="mt-6 p-4 border border-[var(--border)] bg-[var(--card)]">
        <div className="mb-4">
          <div className="font-bold text-sm">Connectors</div>
          <div className="text-xs text-[var(--muted)] mt-0.5">
            Configure how your agent connects to messaging platforms.
          </div>
        </div>

        {channelsError && <div className="mb-3 text-xs text-[var(--danger,#e74c3c)]">{channelsError}</div>}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {CONNECTORS.map((conn) => {
            const configured = connectorStatus[conn.name]?.configured;
            // Check if configured via plugin (not via connector config directly)
            const tokenKeys = CONNECTOR_PLUGIN_TOKEN_KEYS[conn.name];
            const plug = plugins.find((p) => p.id === conn.name);
            const viaPlugin = configured && tokenKeys && plug?.parameters?.some(
              (param) => tokenKeys.includes(param.key) && param.isSet
            ) && !connectorValues[conn.name]?.botToken;
            const saving = connectorSaving.has(conn.name);
            const fb = connectorFeedback[conn.name];

            if (!conn.available) {
              return (
                <div key={conn.name} className="px-3.5 py-3 border border-[var(--border)] bg-[var(--card)] opacity-50">
                  <div className="font-bold text-sm flex items-center gap-2">
                    {conn.label} <span className="text-[10px] border border-[var(--border)] px-2 py-0.5">Coming Soon</span>
                  </div>
                  <div className="text-[11px] text-[var(--muted)] mt-0.5">{conn.description}</div>
                </div>
              );
            }

            return (
              <div key={conn.name} className="px-3.5 py-3 border border-[var(--border)] bg-[var(--card)]">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-bold text-sm">{conn.label}</div>
                  <span
                    className={`text-[10px] px-2 py-0.5 border ${
                      configured
                        ? "border-[var(--ok,#16a34a)] text-[var(--ok,#16a34a)]"
                        : "border-[var(--border)] text-[var(--muted)]"
                    }`}
                  >
                    {configured ? (viaPlugin ? "Connected (via plugin)" : "Connected") : "Not configured"}
                  </span>
                </div>
                <div className="text-[11px] text-[var(--muted)] mt-0.5">{conn.description}</div>

                <div className="mt-3">
                  <ConfigRenderer
                    schema={conn.schema}
                    hints={conn.hints}
                    values={connectorValues[conn.name] ?? {}}
                    registry={defaultRegistry}
                    onChange={(key, value) => {
                      setConnectorValues((prev) => ({
                        ...prev,
                        [conn.name]: { ...(prev[conn.name] ?? {}), [key]: value },
                      }));
                    }}
                  />
                </div>

                {fb && (
                  <div className={`text-[11px] mt-2 ${fb.type === "error" ? "text-[var(--danger,#e74c3c)]" : "text-[var(--ok,#16a34a)]"}`}>
                    {fb.text}
                  </div>
                )}

                <div className="flex items-center gap-2 mt-3">
                  <button
                    className="btn text-xs py-[5px] px-3 !mt-0"
                    disabled={saving || channelsLoading}
                    onClick={() => void handleConnectorSave(conn.name)}
                  >
                    {saving ? "Saving..." : "Save"}
                  </button>
                  <button
                    className="btn text-xs py-[5px] px-3 !mt-0 !bg-transparent !border-[var(--border)] !text-[var(--danger,#e74c3c)]"
                    disabled={deleteBusy || !configured}
                    onClick={() => { setDeleteTarget(conn.name); setDeleteModalOpen(true); }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          7. SOFTWARE UPDATES
          ═══════════════════════════════════════════════════════════════ */}
      <div className="mt-6 p-4 border border-[var(--border)] bg-[var(--card)]">
        <div className="flex justify-between items-center mb-3">
          <div>
            <div className="font-bold text-sm">Software Updates</div>
            <div className="text-xs text-[var(--muted)] mt-0.5">
              {updateStatus ? <>Version {updateStatus.currentVersion}</> : <>Loading...</>}
            </div>
          </div>
          <button
            className="btn whitespace-nowrap !mt-0 text-xs py-1.5 px-3.5"
            disabled={updateLoading}
            onClick={() => void loadUpdateStatus(true)}
          >
            {updateLoading ? "Checking..." : "Check Now"}
          </button>
        </div>

        {updateStatus ? (
          <>
            {/* Channel selector — rendered via ConfigRenderer radio field */}
            <div className="mb-4">
              <ConfigRenderer
                schema={{
                  type: "object",
                  properties: {
                    channel: {
                      type: "string",
                      enum: ["stable", "beta", "nightly"],
                    },
                  },
                }}
                hints={{
                  channel: {
                    label: "Release Channel",
                    type: "radio",
                    width: "full",
                    options: [
                      { value: "stable", label: "Stable", description: "Recommended — production-ready releases" },
                      { value: "beta", label: "Beta", description: "Preview — early access to upcoming features" },
                      { value: "nightly", label: "Nightly", description: "Bleeding edge — latest development builds" },
                    ],
                  },
                }}
                values={{ channel: updateStatus.channel }}
                registry={defaultRegistry}
                onChange={(key, value) => {
                  if (key === "channel") void handleChannelChange(value as "stable" | "beta" | "nightly");
                }}
              />
            </div>

            {/* Update available banner */}
            {updateStatus.updateAvailable && updateStatus.latestVersion && (
              <div className="mt-3 py-2.5 px-3 border border-[var(--accent)] bg-[rgba(255,255,255,0.03)] rounded flex justify-between items-center">
                <div>
                  <div className="text-[13px] font-bold text-[var(--accent)]">Update available</div>
                  <div className="text-xs text-[var(--muted)]">
                    {updateStatus.currentVersion} &rarr; {updateStatus.latestVersion}
                  </div>
                </div>
                <div className="text-[11px] text-[var(--muted)] text-right">
                  Run{" "}
                  <code className="bg-[var(--bg-hover,rgba(255,255,255,0.05))] px-1.5 py-0.5 rounded-sm">
                    milaidy update
                  </code>
                </div>
              </div>
            )}

            {updateStatus.error && (
              <div className="mt-2 text-[11px] text-[var(--danger,#e74c3c)]">
                {updateStatus.error}
              </div>
            )}

            {updateStatus.lastCheckAt && (
              <div className="mt-2 text-[11px] text-[var(--muted)]">
                Last checked: {new Date(updateStatus.lastCheckAt).toLocaleString()}
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-3 text-[var(--muted)] text-xs">
            {updateLoading ? "Checking for updates..." : "Unable to load update status."}
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          8. CHROME EXTENSION
          ═══════════════════════════════════════════════════════════════ */}
      <div className="mt-6 p-4 border border-[var(--border)] bg-[var(--card)]">
        <div className="flex justify-between items-center mb-3">
          <div className="font-bold text-sm">Chrome Extension</div>
          <button
            className="btn whitespace-nowrap !mt-0 text-xs py-1.5 px-3.5"
            onClick={() => void checkExtensionStatus()}
            disabled={extensionChecking}
          >
            {extensionChecking ? "Checking..." : "Check Connection"}
          </button>
        </div>

        {ext && (
          <div className="p-3 border border-[var(--border)] bg-[var(--bg-muted)] mb-3">
            <div className="flex items-center gap-2 mb-2">
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{
                  background: relayOk ? "var(--ok, #16a34a)" : "var(--danger, #e74c3c)",
                }}
              />
              <span className="text-[13px] font-bold">
                Relay Server: {relayOk ? "Connected" : "Not Reachable"}
              </span>
            </div>
            <div className="text-xs text-[var(--muted)] font-[var(--mono)]">
              ws://127.0.0.1:{ext.relayPort}/extension
            </div>
            {!relayOk && (
              <div className="text-xs text-[var(--danger,#e74c3c)] mt-1.5">
                The browser relay server is not running. Start the agent with browser control
                enabled, then check again.
              </div>
            )}
          </div>
        )}

        <div className="mt-3">
          <div className="font-bold text-[13px] mb-2">Install Chrome Extension</div>
          <div className="text-xs text-[var(--muted)] leading-relaxed">
            <ol className="m-0 pl-5">
              <li className="mb-1.5">
                Open Chrome and navigate to{" "}
                <code className="text-[11px] px-1 border border-[var(--border)] bg-[var(--bg-muted)]">
                  chrome://extensions
                </code>
              </li>
              <li className="mb-1.5">
                Enable <strong>Developer mode</strong> (toggle in the top-right corner)
              </li>
              <li className="mb-1.5">
                Click <strong>&quot;Load unpacked&quot;</strong> and select the extension folder:
                {ext?.extensionPath ? (
                  <>
                    <br />
                    <code className="text-[11px] px-1.5 border border-[var(--border)] bg-[var(--bg-muted)] inline-block mt-1 break-all">
                      {ext.extensionPath}
                    </code>
                  </>
                ) : (
                  <>
                    <br />
                    <code className="text-[11px] px-1.5 border border-[var(--border)] bg-[var(--bg-muted)] inline-block mt-1">
                      apps/chrome-extension/
                    </code>
                    <span className="italic"> (relative to milaidy package root)</span>
                  </>
                )}
              </li>
              <li className="mb-1.5">Pin the extension icon in Chrome&apos;s toolbar</li>
              <li>
                Click the extension icon on any tab to attach/detach the Milaidy browser relay
              </li>
            </ol>
          </div>
        </div>

        {ext?.extensionPath && (
          <div className="mt-3 py-2 px-3 border border-[var(--border)] bg-[var(--bg-muted)] font-[var(--mono)] text-[11px] break-all">
            Extension path: {ext.extensionPath}
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          9. AGENT EXPORT / IMPORT
          ═══════════════════════════════════════════════════════════════ */}
      <div className="mt-6 p-4 border border-[var(--border)] bg-[var(--card)]">
        <div className="flex justify-between items-center">
          <div className="font-bold text-sm">Agent Export / Import</div>
          <div className="flex items-center gap-2">
            <button
              className="btn whitespace-nowrap !mt-0 text-xs py-1.5 px-3.5"
              onClick={openImportModal}
            >
              Import
            </button>
            <button
              className="btn whitespace-nowrap !mt-0 text-xs py-1.5 px-3.5"
              onClick={openExportModal}
            >
              Export
            </button>
          </div>
        </div>
      </div>

      <Modal open={deleteModalOpen} onClose={() => { setDeleteModalOpen(false); setDeleteTarget(null); }} title={`Delete ${deleteTarget ? deleteTarget.charAt(0).toUpperCase() + deleteTarget.slice(1) : ""} Channel`}>
        <div className="flex flex-col gap-3">
          <div className="text-xs text-[var(--muted)]">
            Remove the {deleteTarget} channel configuration? This will disconnect {deleteTarget} after restart.
          </div>
          <div className="flex justify-end gap-2">
            <button
              className="btn text-xs py-1.5 px-4 !mt-0 !bg-transparent !border-[var(--border)] !text-[var(--txt)]"
              onClick={() => { setDeleteModalOpen(false); setDeleteTarget(null); }}
              disabled={deleteBusy}
            >
              Cancel
            </button>
            <button
              className="btn text-xs py-1.5 px-4 !mt-0"
              style={{ background: "var(--danger, #e74c3c)", borderColor: "var(--danger, #e74c3c)" }}
              onClick={() => void handleConnectorDelete()}
              disabled={deleteBusy}
            >
              {deleteBusy ? "Deleting..." : "Delete"}
            </button>
          </div>
        </div>
      </Modal>

      {/* ─── Export Modal ─────────────────────────────────────────────── */}
      <Modal open={exportModalOpen} onClose={() => setExportModalOpen(false)} title="Export Agent">
        <div className="flex flex-col gap-3">
          <div className="text-xs text-[var(--muted)]">
            Your character, memories, chats, secrets, and relationships will be downloaded as a
            single file. Optionally set a password to encrypt the export.
          </div>
          <div className="flex flex-col gap-1">
            <label className="font-semibold text-xs">
              Encryption Password <span className="font-normal text-[var(--muted)]">(optional)</span>
            </label>
            <input
              type="password"
              placeholder="Leave blank to skip encryption"
              value={exportPassword}
              onChange={(e) => setState("exportPassword", e.target.value)}
              className="px-2.5 py-1.5 border border-[var(--border)] bg-[var(--card)] text-xs font-[var(--mono)] focus:border-[var(--accent)] focus:outline-none"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-[var(--muted)] cursor-pointer">
            <input
              type="checkbox"
              checked={exportIncludeLogs}
              onChange={(e) => setState("exportIncludeLogs", e.target.checked)}
            />
            Include logs in export
          </label>
          {exportError && (
            <div className="text-[11px] text-[var(--danger,#e74c3c)]">{exportError}</div>
          )}
          {exportSuccess && (
            <div className="text-[11px] text-[var(--ok,#16a34a)]">{exportSuccess}</div>
          )}
          <div className="flex justify-end gap-2 mt-1">
            <button
              className="btn text-xs py-1.5 px-4 !mt-0 !bg-transparent !border-[var(--border)] !text-[var(--txt)]"
              onClick={() => setExportModalOpen(false)}
            >
              Cancel
            </button>
            <button
              className="btn text-xs py-1.5 px-4 !mt-0"
              disabled={exportBusy || (exportPassword.length > 0 && exportPassword.length < 4)}
              onClick={() => void handleAgentExport()}
            >
              {exportBusy ? "Exporting..." : "Download Export"}
            </button>
          </div>
        </div>
      </Modal>

      {/* ─── Import Modal ─────────────────────────────────────────────── */}
      <Modal open={importModalOpen} onClose={() => setImportModalOpen(false)} title="Import Agent">
        <div className="flex flex-col gap-3">
          <div className="text-xs text-[var(--muted)]">
            Select an <code className="text-[11px]">.eliza-agent</code> export file. If it was
            encrypted, enter the password used during export.
          </div>
          <div className="flex flex-col gap-1">
            <label className="font-semibold text-xs">Export File</label>
            <input
              ref={importFileRef}
              type="file"
              accept=".eliza-agent"
              onChange={(e) => {
                setState("importFile", e.target.files?.[0] ?? null);
                setState("importError", null);
                setState("importSuccess", null);
              }}
              className="text-xs"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="font-semibold text-xs">
              Decryption Password <span className="font-normal text-[var(--muted)]">(optional)</span>
            </label>
            <input
              type="password"
              placeholder="Leave blank if export was not encrypted"
              value={importPassword}
              onChange={(e) => setState("importPassword", e.target.value)}
              className="px-2.5 py-1.5 border border-[var(--border)] bg-[var(--card)] text-xs font-[var(--mono)] focus:border-[var(--accent)] focus:outline-none"
            />
          </div>
          {importError && (
            <div className="text-[11px] text-[var(--danger,#e74c3c)]">{importError}</div>
          )}
          {importSuccess && (
            <div className="text-[11px] text-[var(--ok,#16a34a)]">{importSuccess}</div>
          )}
          <div className="flex justify-end gap-2 mt-1">
            <button
              className="btn text-xs py-1.5 px-4 !mt-0 !bg-transparent !border-[var(--border)] !text-[var(--txt)]"
              onClick={() => setImportModalOpen(false)}
            >
              Cancel
            </button>
            <button
              className="btn text-xs py-1.5 px-4 !mt-0"
              disabled={importBusy || !importFile || (importPassword.length > 0 && importPassword.length < 4)}
              onClick={() => void handleAgentImport()}
            >
              {importBusy ? "Importing..." : "Import Agent"}
            </button>
          </div>
        </div>
      </Modal>

      {/* ═══════════════════════════════════════════════════════════════
          10. DANGER ZONE
          ═══════════════════════════════════════════════════════════════ */}
      <div className="mt-12 pt-6 border-t border-[var(--border)]">
        <h2 className="text-lg font-bold text-[var(--danger,#e74c3c)]">Danger Zone</h2>
        <p className="text-[13px] text-[var(--muted)] mb-5">
          Irreversible actions. Proceed with caution.
        </p>

        {/* Export Private Keys */}
        <div className="border border-[var(--danger,#e74c3c)] p-4 mb-3">
          <div className="flex justify-between items-center">
            <div>
              <div className="font-bold text-sm">Export Private Keys</div>
              <div className="text-xs text-[var(--muted)] mt-0.5">
                Reveal your EVM and Solana private keys. Never share these with anyone.
              </div>
            </div>
            <button
              className="btn whitespace-nowrap !mt-0 text-xs py-1.5 px-4"
              style={{
                background: "var(--danger, #e74c3c)",
                borderColor: "var(--danger, #e74c3c)",
              }}
              onClick={() => void handleExportKeys()}
            >
              {walletExportVisible ? "Hide Keys" : "Export Keys"}
            </button>
          </div>
          {walletExportVisible && walletExportData && (
            <div className="mt-3 p-3 border border-[var(--danger,#e74c3c)] bg-[var(--bg-muted)] font-[var(--mono)] text-[11px] break-all leading-relaxed">
              {walletExportData.evm && (
                <div className="mb-2">
                  <strong>EVM Private Key</strong>{" "}
                  <span className="text-[var(--muted)]">({walletExportData.evm.address})</span>
                  <br />
                  <span>{walletExportData.evm.privateKey}</span>
                  <button
                    className="ml-2 px-1.5 py-0.5 border border-[var(--border)] bg-[var(--bg)] cursor-pointer text-[10px] font-[var(--mono)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                    onClick={() => void copyToClipboard(walletExportData.evm!.privateKey)}
                  >
                    copy
                  </button>
                </div>
              )}
              {walletExportData.solana && (
                <div>
                  <strong>Solana Private Key</strong>{" "}
                  <span className="text-[var(--muted)]">({walletExportData.solana.address})</span>
                  <br />
                  <span>{walletExportData.solana.privateKey}</span>
                  <button
                    className="ml-2 px-1.5 py-0.5 border border-[var(--border)] bg-[var(--bg)] cursor-pointer text-[10px] font-[var(--mono)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                    onClick={() => void copyToClipboard(walletExportData.solana!.privateKey)}
                  >
                    copy
                  </button>
                </div>
              )}
              {!walletExportData.evm && !walletExportData.solana && (
                <div className="text-[var(--muted)]">No wallet keys configured.</div>
              )}
            </div>
          )}
        </div>

        {/* Reset Agent */}
        <div className="border border-[var(--danger,#e74c3c)] p-4 flex justify-between items-center">
          <div>
            <div className="font-bold text-sm">Reset Agent</div>
            <div className="text-xs text-[var(--muted)] mt-0.5">
              Wipe all config, memory, and data. Returns to the onboarding wizard.
            </div>
          </div>
          <button
            className="btn whitespace-nowrap !mt-0 text-xs py-1.5 px-4"
            style={{
              background: "var(--danger, #e74c3c)",
              borderColor: "var(--danger, #e74c3c)",
            }}
            onClick={() => void handleReset()}
          >
            Reset Everything
          </button>
        </div>
      </div>
    </div>
  );
}
