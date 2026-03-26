/**
 * Config page — agent-level configuration.
 *
 * Sections:
 *   1. Wallet & RPC providers
 *   2. Secrets (modal)
 */

import {
  WALLET_RPC_PROVIDER_OPTIONS,
  type WalletRpcSelections,
} from "@miladyai/shared/contracts/wallet";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Switch,
} from "@miladyai/ui";
import { useCallback, useEffect, useState } from "react";
import { client } from "../api";
import {
  ConfigRenderer,
  defaultRegistry,
  type JsonSchemaObject,
} from "../config";
import { useApp } from "../state";
import type { ConfigUiHint } from "../types";
import {
  buildWalletRpcUpdateRequest,
  resolveInitialWalletRpcSelections,
} from "../wallet-rpc";
import { SecretsView } from "./SecretsView";

type RpcProviderOption<T extends string> = {
  id: T;
  label: string;
};

type TranslateOptions = Record<string, unknown>;

type TranslateFn = (key: string, options?: TranslateOptions) => string;

type RpcFieldDefinition = {
  configKey: string;
  label: string;
  isSet: boolean;
};

type RpcFieldGroup = ReadonlyArray<RpcFieldDefinition>;

type RpcSectionConfigMap = Record<string, RpcFieldGroup>;

const EVM_RPC_OPTIONS = WALLET_RPC_PROVIDER_OPTIONS.evm;
const BSC_RPC_OPTIONS = WALLET_RPC_PROVIDER_OPTIONS.bsc;
const SOLANA_RPC_OPTIONS = WALLET_RPC_PROVIDER_OPTIONS.solana;

type CloudRpcStatusProps = {
  connected: boolean;
  credits: number | null;
  creditsLow: boolean;
  creditsCritical: boolean;
  topUpUrl: string | null;
  loginBusy: boolean;
  onLogin: () => void;
};

function CloudRpcStatus({
  connected,
  credits,
  creditsLow,
  creditsCritical,
  loginBusy,
  onLogin,
}: CloudRpcStatusProps) {
  const { t, setState, setTab } = useApp();
  if (connected) {
    return (
      <div className="flex items-center gap-2 text-xs">
        <span className="inline-block w-2 h-2 rounded-full bg-ok" />
        <span className="font-semibold">
          {t("configpageview.ConnectedToElizaCloud", {
            defaultValue: "Connected to Eliza Cloud",
          })}
        </span>
        {credits !== null && (
          <span className="text-muted ml-auto">
            {t("configpageview.Credits")}{" "}
            <span
              className={
                creditsCritical
                  ? "text-danger font-bold"
                  : creditsLow
                    ? "rounded-md bg-warn-subtle px-1.5 py-0.5 text-txt font-bold"
                    : ""
              }
            >
              ${credits.toFixed(2)}
            </span>
            <Button
              variant="link"
              size="sm"
              onClick={() => {
                setState("cloudDashboardView", "billing");
                setTab("settings");
              }}
              className="ml-1.5 text-[10px] h-auto p-0"
            >
              {t("configpageview.TopUp")}
            </Button>
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 text-xs">
        <span className="inline-block w-2 h-2 rounded-full bg-muted" />
        <span className="text-muted">
          {t("configpageview.RequiresElizaCloud", {
            defaultValue: "Requires Eliza Cloud",
          })}
        </span>
      </div>
      <Button
        variant="default"
        size="sm"
        className="text-xs font-bold"
        onClick={() => void onLogin()}
        disabled={loginBusy}
      >
        {loginBusy
          ? t("configpageview.Connecting", { defaultValue: "Connecting..." })
          : t("configpageview.LogIn", { defaultValue: "Log in" })}
      </Button>
    </div>
  );
}

function buildRpcRendererConfig(
  t: TranslateFn,
  selectedProvider: string,
  providerConfigs: RpcSectionConfigMap,
  rpcFieldValues: Record<string, string>,
) {
  const fields = providerConfigs[selectedProvider];
  if (!fields?.length) return null;

  const props: {
    schema: JsonSchemaObject;
    hints: Record<string, ConfigUiHint>;
    values: Record<string, unknown>;
    setKeys: Set<string>;
  } = {
    schema: {
      type: "object",
      properties: {},
      required: [],
    },
    hints: {},
    values: {},
    setKeys: new Set<string>(),
  };

  for (const field of fields) {
    props.schema.properties[field.configKey] = {
      type: "string",
      description: field.label,
    };
    props.hints[field.configKey] = {
      label: field.label,
      sensitive: true,
      placeholder: field.isSet
        ? t("configpageview.ApiKeySetPlaceholder", {
            defaultValue: "Already set — leave blank to keep",
          })
        : t("configpageview.ApiKeyPlaceholder", {
            defaultValue: "Enter API key",
          }),
      width: "full",
    };
    if (rpcFieldValues[field.configKey] !== undefined) {
      props.values[field.configKey] = rpcFieldValues[field.configKey];
    }
    if (field.isSet) {
      props.setKeys.add(field.configKey);
    }
  }

  return props;
}

type RpcSectionCloudProps = CloudRpcStatusProps;

type RpcSectionProps<T extends string> = {
  title: string;
  description: string;
  options: readonly RpcProviderOption<T>[];
  selectedProvider: T;
  onSelect: (provider: T) => void;
  providerConfigs: RpcSectionConfigMap;
  rpcFieldValues: Record<string, string>;
  onRpcFieldChange: (key: string, value: unknown) => void;
  cloud: RpcSectionCloudProps;
  containerClassName: string;
  t: TranslateFn;
};

function RpcConfigSection<T extends string>({
  title,
  description,
  options,
  selectedProvider,
  onSelect,
  providerConfigs,
  rpcFieldValues,
  onRpcFieldChange,
  cloud,
  containerClassName,
  t,
}: RpcSectionProps<T>) {
  const rpcConfig = buildRpcRendererConfig(
    t,
    selectedProvider,
    providerConfigs,
    rpcFieldValues,
  );

  return (
    <div>
      <div className="text-xs font-bold mb-1">{title}</div>
      <div className="text-[11px] text-muted mb-2">{description}</div>

      {renderRpcProviderButtons(
        options,
        selectedProvider,
        onSelect,
        containerClassName,
        (key: string) => {
          // hack to get t function without breaking hook rules
          return key === "providerswitcher.elizaCloud"
            ? t("providerswitcher.elizaCloud", { defaultValue: "Eliza Cloud" })
            : key;
        },
      )}

      <div className="mt-3">
        {selectedProvider === "eliza-cloud" ? (
          <CloudRpcStatus
            connected={cloud.connected}
            credits={cloud.credits}
            creditsLow={cloud.creditsLow}
            creditsCritical={cloud.creditsCritical}
            topUpUrl={cloud.topUpUrl}
            loginBusy={cloud.loginBusy}
            onLogin={() => void cloud.onLogin()}
          />
        ) : rpcConfig ? (
          <ConfigRenderer
            schema={rpcConfig.schema}
            hints={rpcConfig.hints}
            values={rpcConfig.values}
            setKeys={rpcConfig.setKeys}
            registry={defaultRegistry}
            onChange={onRpcFieldChange}
          />
        ) : null}
      </div>
    </div>
  );
}

function renderRpcProviderButtons<T extends string>(
  options: readonly RpcProviderOption<T>[],
  selectedProvider: T,
  onSelect: (provider: T) => void,
  containerClassName: string,
  tFallback?: (key: string) => string,
) {
  return (
    <div className={containerClassName}>
      {options.map((provider) => {
        const active = selectedProvider === provider.id;
        return (
          <Button
            variant={active ? "default" : "outline"}
            key={provider.id}
            className={`flex min-h-[44px] items-center justify-center rounded-lg px-3 py-2 text-center text-xs font-semibold leading-tight shadow-sm ${
              active
                ? ""
                : "border-border bg-card text-txt hover:border-accent hover:bg-bg-hover"
            }`}
            onClick={() => onSelect(provider.id)}
          >
            <div className="leading-tight">
              {provider.id === "eliza-cloud" && tFallback
                ? tFallback("providerswitcher.elizaCloud")
                : provider.label}
            </div>
          </Button>
        );
      })}
    </div>
  );
}

/* ── Cloud services toggle section ───────────────────────────────────── */

type CloudServiceKey = "inference" | "rpc" | "media" | "tts" | "embeddings";

const CLOUD_SERVICE_DEFS: {
  key: CloudServiceKey;
  label: string;
  description: string;
}[] = [
  {
    key: "inference",
    label: "Model Inference",
    description: `Use Eliza Cloud for LLM calls. Turn off to use your own API keys (Anthropic, OpenAI, etc.)`,
  },
  {
    key: "rpc",
    label: "Blockchain RPC",
    description: `Use Eliza Cloud RPC endpoints for EVM, BSC, and Solana`,
  },
  {
    key: "media",
    label: "Media Generation",
    description: `Use Eliza Cloud for image, video, audio, and vision`,
  },
  {
    key: "tts",
    label: "Text-to-Speech",
    description: `Use Eliza Cloud for TTS voice synthesis`,
  },
  {
    key: "embeddings",
    label: "Embeddings",
    description: `Use Eliza Cloud for text embedding generation`,
  },
];

/* ToggleSwitch — thin wrapper around shared Switch for Cloud Services */

function CloudServicesSection() {
  const { t } = useApp();
  const [services, setServices] = useState<Record<CloudServiceKey, boolean>>({
    inference: true,
    rpc: true,
    media: true,
    tts: true,
    embeddings: true,
  });
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [needsRestart, setNeedsRestart] = useState(false);

  useEffect(() => {
    let cancelled = false;
    client
      .getConfig()
      .then((cfg) => {
        if (cancelled) return;
        const cloud = cfg.cloud as
          | { services?: Record<string, boolean> }
          | undefined;
        if (cloud?.services) {
          setServices((prev) => ({
            ...prev,
            ...Object.fromEntries(
              Object.entries(cloud.services ?? {}).filter(
                ([, v]) => typeof v === "boolean",
              ),
            ),
          }));
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, []);

  const handleToggle = useCallback(
    async (key: CloudServiceKey) => {
      const newValue = !services[key];
      const updated = { ...services, [key]: newValue };
      setServices(updated);
      setSaving(true);
      const inferenceMode = updated.inference ? "cloud" : "byok";
      try {
        await client.updateConfig({
          cloud: { services: updated, inferenceMode },
        });
        setNeedsRestart(true);
      } catch (err) {
        setServices(services);
        console.error("[config] Failed to save cloud services:", err);
      } finally {
        setSaving(false);
      }
    },
    [services],
  );

  if (!loaded) return null;

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-semibold">
          {t("configpageview.CloudServices", {
            defaultValue: "Cloud Services",
          })}
        </div>
        {needsRestart && (
          <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full border border-accent/30 bg-accent/8 text-accent">
            {t("configpageview.RestartRequired", {
              defaultValue: "Restart required",
            })}
          </span>
        )}
      </div>
      <p className="text-xs text-muted mb-4 leading-snug">
        {t("configpageview.CloudServicesDesc", {
          defaultValue:
            "Choose which services to use from Eliza Cloud. Disable inference to use your own API keys instead.",
        })}
      </p>
      <div className="flex flex-col gap-2">
        {CLOUD_SERVICE_DEFS.map(({ key, label, description }) => (
          <div
            key={key}
            className={`flex items-center justify-between p-3 border border-border rounded-lg transition-colors ${
              services[key] ? "bg-accent/5" : ""
            }`}
          >
            <div className="flex-1 min-w-0 mr-4">
              <div
                id={`cloud-service-${key}`}
                className="text-[13px] font-medium text-txt"
              >
                {label}
              </div>
              <div className="text-[11px] text-muted mt-0.5">{description}</div>
            </div>
            <Switch
              checked={services[key]}
              disabled={saving}
              onCheckedChange={() => void handleToggle(key)}
              aria-labelledby={`cloud-service-${key}`}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── ConfigPageView ──────────────────────────────────────────────────── */

export function ConfigPageView({ embedded = false }: { embedded?: boolean }) {
  const {
    t,
    elizaCloudConnected,
    elizaCloudCredits,
    elizaCloudCreditsLow,
    elizaCloudCreditsCritical,
    elizaCloudAuthRejected,
    elizaCloudTopUpUrl,
    elizaCloudLoginBusy,
    walletConfig,
    walletApiKeySaving,
    handleWalletApiKeySave,
    handleCloudLogin,
  } = useApp();

  const [secretsOpen, setSecretsOpen] = useState(false);

  /* ── Mode: "cloud" or "custom" ─────────────────────────────────────── */
  const allCloud =
    elizaCloudConnected ||
    resolveInitialWalletRpcSelections(walletConfig).evm === "eliza-cloud";
  const [rpcMode, setRpcMode] = useState<"cloud" | "custom">(
    allCloud ? "cloud" : "custom",
  );

  /* ── RPC provider field values ─────────────────────────────────────── */
  const [rpcFieldValues, setRpcFieldValues] = useState<Record<string, string>>(
    {},
  );

  const handleRpcFieldChange = useCallback((key: string, value: unknown) => {
    setRpcFieldValues((prev) => ({ ...prev, [key]: String(value ?? "") }));
  }, []);

  /* ── RPC provider selection state ──────────────────────────────────── */
  const initialRpc = resolveInitialWalletRpcSelections(walletConfig);
  const [selectedEvmRpc, setSelectedEvmRpc] = useState<
    WalletRpcSelections["evm"]
  >(initialRpc.evm);
  const [selectedBscRpc, setSelectedBscRpc] = useState<
    WalletRpcSelections["bsc"]
  >(initialRpc.bsc);
  const [selectedSolanaRpc, setSelectedSolanaRpc] = useState<
    WalletRpcSelections["solana"]
  >(initialRpc.solana);
  const [selectedWalletNetwork, setSelectedWalletNetwork] = useState<
    "mainnet" | "testnet"
  >(walletConfig?.walletNetwork === "testnet" ? "testnet" : "mainnet");

  useEffect(() => {
    const selections = resolveInitialWalletRpcSelections(walletConfig);
    setSelectedEvmRpc(selections.evm);
    setSelectedBscRpc(selections.bsc);
    setSelectedSolanaRpc(selections.solana);
    setSelectedWalletNetwork(
      walletConfig?.walletNetwork === "testnet" ? "testnet" : "mainnet",
    );
  }, [walletConfig]);

  /* When switching to cloud mode, set all providers to eliza-cloud */
  const handleModeChange = useCallback((mode: "cloud" | "custom") => {
    setRpcMode(mode);
    if (mode === "cloud") {
      setSelectedEvmRpc("eliza-cloud" as WalletRpcSelections["evm"]);
      setSelectedBscRpc("eliza-cloud" as WalletRpcSelections["bsc"]);
      setSelectedSolanaRpc("eliza-cloud" as WalletRpcSelections["solana"]);
    }
  }, []);

  const handleWalletSaveAll = useCallback(() => {
    const config = buildWalletRpcUpdateRequest({
      walletConfig,
      rpcFieldValues,
      selectedProviders: {
        evm: selectedEvmRpc,
        bsc: selectedBscRpc,
        solana: selectedSolanaRpc,
      },
      selectedNetwork: selectedWalletNetwork,
    });
    void handleWalletApiKeySave(config);
  }, [
    handleWalletApiKeySave,
    rpcFieldValues,
    selectedBscRpc,
    selectedEvmRpc,
    selectedWalletNetwork,
    selectedSolanaRpc,
    walletConfig,
  ]);

  const evmRpcConfigs: RpcSectionConfigMap = {
    alchemy: [
      {
        configKey: "ALCHEMY_API_KEY",
        label: "Alchemy API Key",
        isSet: walletConfig?.alchemyKeySet ?? false,
      },
    ],
    infura: [
      {
        configKey: "INFURA_API_KEY",
        label: "Infura API Key",
        isSet: walletConfig?.infuraKeySet ?? false,
      },
    ],
    ankr: [
      {
        configKey: "ANKR_API_KEY",
        label: "Ankr API Key",
        isSet: walletConfig?.ankrKeySet ?? false,
      },
    ],
  };

  const bscRpcConfigs: RpcSectionConfigMap = {
    alchemy: [
      {
        configKey: "ALCHEMY_API_KEY",
        label: "Alchemy API Key",
        isSet: walletConfig?.alchemyKeySet ?? false,
      },
    ],
    ankr: [
      {
        configKey: "ANKR_API_KEY",
        label: "Ankr API Key",
        isSet: walletConfig?.ankrKeySet ?? false,
      },
    ],
    nodereal: [
      {
        configKey: "NODEREAL_BSC_RPC_URL",
        label: "NodeReal BSC RPC URL",
        isSet: walletConfig?.nodeRealBscRpcSet ?? false,
      },
    ],
    quicknode: [
      {
        configKey: "QUICKNODE_BSC_RPC_URL",
        label: "QuickNode BSC RPC URL",
        isSet: walletConfig?.quickNodeBscRpcSet ?? false,
      },
    ],
  };

  const solanaRpcConfigs: RpcSectionConfigMap = {
    "helius-birdeye": [
      {
        configKey: "HELIUS_API_KEY",
        label: "Helius API Key",
        isSet: walletConfig?.heliusKeySet ?? false,
      },
      {
        configKey: "BIRDEYE_API_KEY",
        label: "Birdeye API Key",
        isSet: walletConfig?.birdeyeKeySet ?? false,
      },
    ],
  };

  const cloudStatusProps = {
    connected: elizaCloudConnected,
    credits: elizaCloudCredits,
    creditsLow: elizaCloudCreditsLow,
    creditsCritical: elizaCloudCreditsCritical,
    topUpUrl: elizaCloudTopUpUrl,
    loginBusy: elizaCloudLoginBusy,
    onLogin: () => void handleCloudLogin(),
  };

  const legacyRpcChains = walletConfig?.legacyCustomChains ?? [];
  const legacyRpcWarning =
    legacyRpcChains.length > 0
      ? `Legacy raw RPC is still active for ${legacyRpcChains.join(", ")}. Re-save a supported provider selection to migrate fully.`
      : null;

  /* Filter out eliza-cloud from per-chain options in custom mode */
  const filterCloudOption = <T extends string>(
    options: readonly RpcProviderOption<T>[],
  ) => options.filter((o) => o.id !== "eliza-cloud");

  return (
    <div>
      {!embedded && (
        <>
          <h2 className="text-lg font-bold mb-1">
            {t("configpageview.Config")}
          </h2>
          <p className="text-[13px] text-muted mb-5">
            {t("configpageview.WalletProvidersAnd")}
          </p>
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          MODE SELECTOR: Eliza Cloud vs Custom RPC
          ═══════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
        <Button
          variant="ghost"
          onClick={() => handleModeChange("cloud")}
          className={`relative flex flex-col items-start gap-1.5 rounded-xl border-2 p-4 text-left transition-all h-auto !whitespace-normal ${
            rpcMode === "cloud"
              ? "border-accent bg-accent/8 shadow-[0_0_20px_rgba(var(--accent-rgb),0.1)]"
              : "border-border/40 bg-card/30 opacity-50 grayscale hover:opacity-70 hover:grayscale-0"
          }`}
        >
          <div className="flex items-center gap-2">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={rpcMode === "cloud" ? "text-accent" : "text-muted"}
            >
              <title>Eliza Cloud managed RPC</title>
              <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
            </svg>
            <span className="text-sm font-bold">Eliza Cloud</span>
          </div>
          <span className="text-[11px] text-muted leading-snug">
            Managed RPC for all chains. No API keys needed.
          </span>
          {rpcMode === "cloud" && (
            <span className="absolute top-3 right-3 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-accent-fg">
              {"\u2713"}
            </span>
          )}
        </Button>

        <Button
          variant="ghost"
          onClick={() => handleModeChange("custom")}
          className={`relative flex flex-col items-start gap-1.5 rounded-xl border-2 p-4 text-left transition-all h-auto !whitespace-normal ${
            rpcMode === "custom"
              ? "border-accent bg-accent/8 shadow-[0_0_20px_rgba(var(--accent-rgb),0.1)]"
              : "border-border/40 bg-card/30 opacity-50 grayscale hover:opacity-70 hover:grayscale-0"
          }`}
        >
          <div className="flex items-center gap-2">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={rpcMode === "custom" ? "text-accent" : "text-muted"}
            >
              <title>Custom RPC configuration</title>
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
            </svg>
            <span className="text-sm font-bold">Custom RPC</span>
          </div>
          <span className="text-[11px] text-muted leading-snug">
            Bring your own API keys. Configure per chain.
          </span>
          {rpcMode === "custom" && (
            <span className="absolute top-3 right-3 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-accent-fg">
              ✓
            </span>
          )}
        </Button>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          CLOUD MODE
          ═══════════════════════════════════════════════════════════════ */}
      <div className="mb-5 rounded-lg border border-border p-3">
        <div className="text-xs font-bold mb-1">Wallet Network</div>
        <div className="text-[11px] text-muted mb-2">
          Choose Mainnet for live funds or Testnet for practice.
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button
            variant={selectedWalletNetwork === "mainnet" ? "default" : "outline"}
            className="min-h-[40px] px-3 text-xs font-semibold"
            onClick={() => setSelectedWalletNetwork("mainnet")}
          >
            Mainnet
          </Button>
          <Button
            variant={selectedWalletNetwork === "testnet" ? "default" : "outline"}
            className="min-h-[40px] px-3 text-xs font-semibold"
            onClick={() => setSelectedWalletNetwork("testnet")}
          >
            Testnet
          </Button>
        </div>
      </div>

      {rpcMode === "cloud" && (
        <div>
          {elizaCloudConnected ? (
            <>
              <div className="flex items-center gap-2.5 mb-4 p-3 rounded-lg bg-accent/5 border border-accent/15">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${elizaCloudAuthRejected ? "bg-danger" : "bg-ok"}`}
                />
                <span className="text-[13px] font-semibold text-txt">
                  {elizaCloudAuthRejected
                    ? "Eliza Cloud key invalid"
                    : "Connected to Eliza Cloud"}
                </span>
                {(elizaCloudCredits !== null || elizaCloudAuthRejected) && (
                  <span className="text-xs text-muted ml-auto flex items-center gap-1.5">
                    <span
                      className={
                        elizaCloudAuthRejected || elizaCloudCreditsCritical
                          ? "text-danger font-bold"
                          : elizaCloudCreditsLow
                            ? "text-warn font-bold"
                            : "text-txt font-semibold"
                      }
                    >
                      {elizaCloudAuthRejected
                        ? "Fix in Cloud settings"
                        : elizaCloudCredits !== null
                          ? `$${elizaCloudCredits.toFixed(2)}`
                          : ""}
                    </span>
                    {elizaCloudTopUpUrl && !elizaCloudAuthRejected && (
                      <a
                        href={elizaCloudTopUpUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-accent underline underline-offset-2"
                      >
                        Top up
                      </a>
                    )}
                  </span>
                )}
              </div>

              <div className="space-y-2">
                {[
                  { label: "EVM", desc: "Ethereum, Base, Arbitrum" },
                  { label: "BSC", desc: "BNB Smart Chain" },
                  { label: "Solana", desc: "Solana mainnet" },
                ].map((chain) => (
                  <div
                    key={chain.label}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-bg/50"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-ok shrink-0" />
                    <span className="text-xs font-semibold text-txt">
                      {chain.label}
                    </span>
                    <span className="text-[11px] text-muted">{chain.desc}</span>
                    <span className="text-[10px] text-accent ml-auto font-medium">
                      Eliza Cloud
                    </span>
                  </div>
                ))}
              </div>

              <CloudServicesSection />
            </>
          ) : (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <svg
                width="40"
                height="40"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-muted"
              >
                <title>Eliza Cloud login required</title>
                <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
              </svg>
              <div>
                <p className="text-sm font-semibold text-txt mb-1">
                  Connect to Eliza Cloud
                </p>
                <p className="text-xs text-muted max-w-sm">
                  Get managed RPC endpoints for EVM, BSC, and Solana with no API
                  keys required.
                </p>
              </div>
              <Button
                variant="default"
                size="sm"
                className="text-xs font-bold"
                onClick={() => void handleCloudLogin()}
                disabled={elizaCloudLoginBusy}
              >
                {elizaCloudLoginBusy
                  ? "Connecting..."
                  : "Log in to Eliza Cloud"}
              </Button>
            </div>
          )}

          <div className="flex justify-end mt-4">
            <Button
              variant="default"
              size="sm"
              className="text-[11px]"
              onClick={handleWalletSaveAll}
              disabled={walletApiKeySaving}
            >
              {walletApiKeySaving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          CUSTOM RPC MODE
          ═══════════════════════════════════════════════════════════════ */}
      {rpcMode === "custom" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="font-bold text-sm">Custom RPC Providers</div>
            <Button
              variant="outline"
              className="min-h-[2.625rem] px-4 rounded-[calc(var(--radius-lg)+2px)] flex items-center gap-1.5 text-[12px] text-muted hover:text-txt"
              onClick={() => setSecretsOpen(true)}
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <title>Secrets</title>
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              Secrets
            </Button>
          </div>

          <div className="space-y-5">
            <RpcConfigSection
              title="EVM"
              description="Ethereum, Base, Arbitrum"
              options={filterCloudOption(EVM_RPC_OPTIONS)}
              selectedProvider={
                selectedEvmRpc === "eliza-cloud"
                  ? (EVM_RPC_OPTIONS.find((o) => o.id !== "eliza-cloud")?.id ??
                    selectedEvmRpc)
                  : selectedEvmRpc
              }
              onSelect={setSelectedEvmRpc}
              providerConfigs={evmRpcConfigs}
              rpcFieldValues={rpcFieldValues}
              onRpcFieldChange={handleRpcFieldChange}
              cloud={cloudStatusProps}
              containerClassName="flex flex-wrap gap-1.5"
              t={t}
            />
            <hr className="border-border" />
            <RpcConfigSection
              title="BSC"
              description="BNB Smart Chain"
              options={filterCloudOption(BSC_RPC_OPTIONS)}
              selectedProvider={
                selectedBscRpc === "eliza-cloud"
                  ? (BSC_RPC_OPTIONS.find((o) => o.id !== "eliza-cloud")?.id ??
                    selectedBscRpc)
                  : selectedBscRpc
              }
              onSelect={setSelectedBscRpc}
              providerConfigs={bscRpcConfigs}
              rpcFieldValues={rpcFieldValues}
              onRpcFieldChange={handleRpcFieldChange}
              cloud={cloudStatusProps}
              containerClassName="flex flex-wrap gap-1.5"
              t={t}
            />
            <hr className="border-border" />
            <RpcConfigSection
              title="Solana"
              description="Solana mainnet"
              options={filterCloudOption(SOLANA_RPC_OPTIONS)}
              selectedProvider={
                selectedSolanaRpc === "eliza-cloud"
                  ? (SOLANA_RPC_OPTIONS.find((o) => o.id !== "eliza-cloud")
                      ?.id ?? selectedSolanaRpc)
                  : selectedSolanaRpc
              }
              onSelect={setSelectedSolanaRpc}
              providerConfigs={solanaRpcConfigs}
              rpcFieldValues={rpcFieldValues}
              onRpcFieldChange={handleRpcFieldChange}
              cloud={cloudStatusProps}
              containerClassName="flex flex-wrap gap-1.5"
              t={t}
            />
          </div>

          {legacyRpcWarning && (
            <div className="mt-4 rounded-lg border border-warn bg-warn-subtle px-3 py-2 text-[11px] text-txt">
              {legacyRpcWarning}
            </div>
          )}

          <div className="flex justify-end mt-4">
            <Button
              variant="default"
              size="sm"
              className="text-[11px]"
              onClick={handleWalletSaveAll}
              disabled={walletApiKeySaving}
            >
              {walletApiKeySaving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      )}

      {/* ── Secrets modal ── */}
      <Dialog open={secretsOpen} onOpenChange={setSecretsOpen}>
        <DialogContent
          showCloseButton={false}
          className="w-[min(100%-2rem,42rem)] max-h-[min(88vh,48rem)] overflow-hidden rounded-2xl border border-border/70 bg-card/96 p-0 shadow-2xl"
        >
          <div className="flex max-h-[min(88vh,48rem)] flex-col">
            <DialogHeader className="flex flex-row items-center justify-between border-b border-border/70 px-5 py-4">
              <div className="flex items-center gap-2">
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-accent"
                >
                  <title>{t("configpageview.SecretsVault")}</title>
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <DialogTitle className="text-sm font-bold">
                  {t("configpageview.SecretsVault1")}
                </DialogTitle>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="text-muted hover:text-txt text-lg leading-none"
                onClick={() => setSecretsOpen(false)}
                aria-label={t("common.close")}
              >
                {t("bugreportmodal.Times")}
              </Button>
            </DialogHeader>
            <div className="flex-1 min-h-0 overflow-y-auto p-5">
              <SecretsView />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
