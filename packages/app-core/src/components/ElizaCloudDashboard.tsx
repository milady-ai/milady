import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  SectionCard,
} from "@miladyai/ui";
import {
  AlertCircle,
  CircleDollarSign,
  CreditCard,
  ExternalLink,
  LayoutDashboard,
  Loader2,
  Plus,
  RefreshCw,
  Server,
  Shield,
  Terminal,
  Trash2,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import {
  type CloudBillingCheckoutResponse,
  type CloudBillingSettings,
  type CloudBillingSummary,
  type CloudCompatAgent,
  client,
} from "../api";
import { useApp } from "../state";
import { Switch } from "./ui-switch";
import { openExternalUrl } from "../utils";
import { StripeEmbeddedCheckout } from "./StripeEmbeddedCheckout";

const ELIZA_CLOUD_LOGIN_URL =
  "https://www.elizacloud.ai/login?returnTo=%2Fdashboard%2Feliza";
const ELIZA_CLOUD_INSTANCES_URL = "https://www.elizacloud.ai/dashboard/eliza";
const BILLING_PRESET_AMOUNTS = [10, 25, 100];

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  running: {
    label: "Running",
    className: "bg-ok/10 text-ok border-ok/20",
  },
  queued: {
    label: "Queued",
    className: "bg-warn/10 text-warn border-warn/20",
  },
  provisioning: {
    label: "Provisioning",
    className: "bg-accent/10 text-txt border-accent/20",
  },
  stopped: {
    label: "Stopped",
    className: "bg-muted/10 text-muted border-border/40",
  },
  failed: {
    label: "Failed",
    className: "bg-danger/10 text-danger border-danger/20",
  },
};

function AgentStatusBadge({ status }: { status: string }) {
  const badge = STATUS_BADGE[status] ?? STATUS_BADGE.stopped;
  return (
    <span
      className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border ${badge?.className}`}
    >
      {badge?.label}
    </span>
  );
}

function CloudAgentCard({
  agent,
  onDelete,
  deleting,
  launching,
  onLaunch,
  onSelect,
}: {
  agent: CloudCompatAgent;
  onDelete: (id: string) => void;
  deleting: boolean;
  launching: boolean;
  onLaunch: (id: string) => void;
  onSelect?: (id: string) => void;
}) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: cannot use button due to nested buttons
    <div
      className="rounded-2xl border border-border/50 bg-bg/30 p-5 flex flex-col justify-between gap-4 hover:border-accent/30 transition-all duration-200 cursor-pointer"
      onClick={() => onSelect?.(agent.agent_id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect?.(agent.agent_id);
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <Server className="w-4 h-4 text-txt shrink-0" />
          <span className="font-bold text-sm text-txt-strong truncate max-w-[140px]">
            {agent.agent_name || "Unnamed Agent"}
          </span>
        </div>
        <AgentStatusBadge status={agent.status} />
      </div>

      <div className="text-[11px] text-muted space-y-1">
        <div className="flex justify-between">
          <span>Node</span>
          <span className="font-mono text-txt-strong/70">
            {agent.node_id?.slice(0, 8) ?? "—"}
          </span>
        </div>
        <div className="flex justify-between">
          <span>Created</span>
          <span className="text-txt-strong/70">
            {new Date(agent.created_at).toLocaleDateString()}
          </span>
        </div>
      </div>

      <div className="flex gap-2 mt-1">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 rounded-xl h-8 text-xs border-border/40"
          onClick={(event) => {
            event.stopPropagation();
            onLaunch(agent.agent_id);
          }}
          disabled={launching}
        >
          {launching ? (
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
          ) : (
            <ExternalLink className="w-3 h-3 mr-1" />
          )}
          Open
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="settings-icon-button rounded-xl h-8 text-xs border-danger/30 text-danger hover:bg-danger/10"
          onClick={(event) => {
            event.stopPropagation();
            onDelete(agent.agent_id);
          }}
          disabled={deleting || launching}
        >
          {deleting ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Trash2 className="w-3 h-3" />
          )}
        </Button>
      </div>
    </div>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function unwrapBillingData<T extends Record<string, unknown>>(value: T): T {
  if (isRecord(value.data)) {
    return value.data as T;
  }
  return value;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function normalizeBillingSummary(
  raw: CloudBillingSummary,
): CloudBillingSummary {
  const source = unwrapBillingData(raw);
  return {
    ...raw,
    ...source,
    balance:
      readNumber(source.balance) ??
      readNumber((source as Record<string, unknown>).creditBalance) ??
      null,
    currency:
      readString(source.currency) ??
      readString((source as Record<string, unknown>).balanceCurrency),
    topUpUrl:
      readString(source.topUpUrl) ??
      readString((source as Record<string, unknown>).billingUrl),
    embeddedCheckoutEnabled:
      readBoolean(source.embeddedCheckoutEnabled) ??
      readBoolean((source as Record<string, unknown>).embedded),
    hostedCheckoutEnabled:
      readBoolean(source.hostedCheckoutEnabled) ??
      readBoolean((source as Record<string, unknown>).hosted),
    cryptoEnabled:
      readBoolean(source.cryptoEnabled) ??
      readBoolean((source as Record<string, unknown>).crypto),
    low: readBoolean(source.low),
    critical: readBoolean(source.critical),
  };
}

function normalizeBillingSettings(
  raw: CloudBillingSettings,
): CloudBillingSettings {
  const source = unwrapBillingData(raw);
  return {
    ...raw,
    ...source,
    settings: isRecord(source.settings) ? source.settings : raw.settings,
  };
}

function getBillingAutoTopUp(
  settings: CloudBillingSettings | null,
): Record<string, unknown> {
  const rawSettings = isRecord(settings?.settings) ? settings.settings : null;
  return isRecord(rawSettings?.autoTopUp) ? rawSettings.autoTopUp : {};
}

function getBillingLimits(
  settings: CloudBillingSettings | null,
): Record<string, unknown> {
  const rawSettings = isRecord(settings?.settings) ? settings.settings : null;
  return isRecord(rawSettings?.limits) ? rawSettings.limits : {};
}

function resolveCheckoutUrl(
  response: CloudBillingCheckoutResponse,
): string | null {
  return (
    readString(response.checkoutUrl) ??
    readString(response.url) ??
    readString((response as Record<string, unknown>).hostedUrl) ??
    null
  );
}

interface AutoTopUpFormState {
  amount: string;
  dirty: boolean;
  enabled: boolean;
  sourceKey: string;
  threshold: string;
}

type AutoTopUpFormAction =
  | { type: "hydrate"; next: AutoTopUpFormState; force?: boolean }
  | { type: "setAmount"; value: string }
  | { type: "setEnabled"; value: boolean }
  | { type: "setThreshold"; value: string };

function buildAutoTopUpFormState(
  billingSummary: CloudBillingSummary | null,
  billingSettings: CloudBillingSettings | null,
): AutoTopUpFormState {
  const autoTopUp = getBillingAutoTopUp(billingSettings);
  const minimumTopUp =
    readNumber(
      (billingSummary as Record<string, unknown> | null)?.minimumTopUp,
    ) ?? 1;
  const enabled = readBoolean(autoTopUp.enabled) ?? false;
  const amount = String(readNumber(autoTopUp.amount) ?? minimumTopUp);
  const threshold = String(readNumber(autoTopUp.threshold) ?? 5);
  return {
    amount,
    dirty: false,
    enabled,
    sourceKey: JSON.stringify([enabled, amount, threshold]),
    threshold,
  };
}

function autoTopUpFormReducer(
  state: AutoTopUpFormState,
  action: AutoTopUpFormAction,
): AutoTopUpFormState {
  switch (action.type) {
    case "hydrate":
      if (!action.force && state.dirty) {
        return state;
      }
      if (state.sourceKey === action.next.sourceKey && !state.dirty) {
        return state;
      }
      return action.next;
    case "setAmount":
      return { ...state, amount: action.value, dirty: true };
    case "setEnabled":
      return { ...state, enabled: action.value, dirty: true };
    case "setThreshold":
      return { ...state, threshold: action.value, dirty: true };
    default:
      return state;
  }
}

export function CloudDashboard() {
  const {
    t,
    elizaCloudConnected,
    elizaCloudCredits,
    elizaCloudCreditsLow,
    elizaCloudCreditsCritical,
    elizaCloudTopUpUrl,
    elizaCloudUserId,
    cloudDashboardView,
    elizaCloudLoginBusy,
    handleCloudLogin,
    handleCloudDisconnect,
    elizaCloudDisconnecting: cloudDisconnecting,
    loadDropStatus,
    walletAddresses,
    walletBalances,
    retryStartup,
    setActionNotice,
    setState,
    setTab,
  } = useApp();

  const [refreshing, setRefreshing] = useState(false);
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [billingSummary, setBillingSummary] =
    useState<CloudBillingSummary | null>(null);
  const [billingSettings, setBillingSettings] =
    useState<CloudBillingSettings | null>(null);
  const [billingAmount, setBillingAmount] = useState("25");
  const [autoTopUpForm, dispatchAutoTopUpForm] = useReducer(
    autoTopUpFormReducer,
    buildAutoTopUpFormState(null, null),
  );
  const [billingSettingsBusy, setBillingSettingsBusy] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutSession, setCheckoutSession] =
    useState<CloudBillingCheckoutResponse | null>(null);
  const [checkoutDialogOpen, setCheckoutDialogOpen] = useState(false);
  const [cryptoBusy, setCryptoBusy] = useState(false);
  const [cryptoQuote, setCryptoQuote] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [cryptoPayBusy, setCryptoPayBusy] = useState(false);
  const [cryptoPayResult, setCryptoPayResult] = useState<string | null>(null);
  const [cloudAgents, setCloudAgents] = useState<CloudCompatAgent[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [agentsError, setAgentsError] = useState<string | null>(null);
  const [deletingAgentId, setDeletingAgentId] = useState<string | null>(null);
  const [launchingAgentId, setLaunchingAgentId] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const selectedAgent = cloudAgents.find((a) => a.agent_id === selectedAgentId);
  const [showDeployForm, setShowDeployForm] = useState(false);
  const [deployAgentName, setDeployAgentName] = useState("");
  const [deploying, setDeploying] = useState(false);
  const mountedRef = useRef(true);
  const autoTopUpEnabled = autoTopUpForm.enabled;
  const autoTopUpAmount = autoTopUpForm.amount;
  const autoTopUpThreshold = autoTopUpForm.threshold;

  const fetchCloudAgents = useCallback(async () => {
    setAgentsLoading(true);
    setAgentsError(null);
    try {
      const data = await client.getCloudCompatAgents();
      if (!mountedRef.current) return;
      setCloudAgents(Array.isArray(data.data) ? data.data : []);
    } catch (err) {
      if (!mountedRef.current) return;
      setAgentsError(
        err instanceof Error ? err.message : "Failed to load cloud agents",
      );
      setCloudAgents([]);
    } finally {
      if (mountedRef.current) setAgentsLoading(false);
    }
  }, []);

  const fetchBillingData = useCallback(async () => {
    setBillingLoading(true);
    setBillingError(null);
    try {
      const [summaryResponse, settingsResponse] = await Promise.all([
        client.getCloudBillingSummary().catch((err) => ({ __error: err })),
        client.getCloudBillingSettings().catch((err) => ({
          __error: err,
        })),
      ]);

      if (!mountedRef.current) return;

      if (isRecord(summaryResponse) && "__error" in summaryResponse) {
        const err = summaryResponse.__error;
        throw err instanceof Error
          ? err
          : new Error("Billing summary unavailable.");
      }

      setBillingSummary(normalizeBillingSummary(summaryResponse));

      if (isRecord(settingsResponse) && !("__error" in settingsResponse)) {
        setBillingSettings(normalizeBillingSettings(settingsResponse));
      } else {
        setBillingSettings(null);
      }
    } catch (err) {
      if (!mountedRef.current) return;
      setBillingSummary(null);
      setBillingSettings(null);
      setBillingError(
        err instanceof Error ? err.message : "Failed to load billing data.",
      );
    } finally {
      if (mountedRef.current) {
        setBillingLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    dispatchAutoTopUpForm({
      type: "hydrate",
      next: buildAutoTopUpFormState(billingSummary, billingSettings),
    });
  }, [billingSettings, billingSummary]);

  const handleDeleteAgent = useCallback(
    async (agentId: string) => {
      setDeletingAgentId(agentId);
      try {
        const data = await client.deleteCloudCompatAgent(agentId);
        if (data.success) {
          setCloudAgents((prev) => prev.filter((a) => a.agent_id !== agentId));
        }
      } catch {
        // Silently fail — user can retry
      } finally {
        setDeletingAgentId(null);
        if (selectedAgentId === agentId) setSelectedAgentId(null);
      }
    },
    [selectedAgentId],
  );

  const handleDeployAgent = useCallback(async () => {
    if (!deployAgentName.trim()) return;
    setDeploying(true);
    try {
      const response = await client.createCloudCompatAgent({
        agentName: deployAgentName.trim(),
      });
      if (response.success) {
        await fetchCloudAgents();
        setShowDeployForm(false);
        setDeployAgentName("");
      }
    } catch {
      // Intentionally swallow for now
    } finally {
      setDeploying(false);
    }
  }, [deployAgentName, fetchCloudAgents]);

  const handleLaunchAgent = useCallback(
    async (agentId: string) => {
      setLaunchingAgentId(agentId);
      try {
        const response = await client.launchCloudCompatAgent(agentId);
        if (!response.success || !response.data?.connection?.apiBase) {
          throw new Error("Eliza Cloud did not return a launch connection.");
        }

        const { connection } = response.data;
        client.setBaseUrl(connection.apiBase);
        client.setToken(connection.token);
        setState("startupError", null);
        setState("onboardingRunMode", "cloud");
        setState("onboardingCloudProvider", "elizacloud");
        setState("onboardingRemoteApiBase", connection.apiBase);
        setState("onboardingRemoteToken", connection.token);
        setState("onboardingRemoteError", null);
        setState("onboardingRemoteConnecting", false);
        setState("onboardingRemoteConnected", false);
        setActionNotice(
          "Opened managed Eliza Cloud instance.",
          "success",
          3000,
        );
        setTab("chat");
        retryStartup();
      } catch (err) {
        setActionNotice(
          err instanceof Error
            ? err.message
            : "Failed to open Eliza Cloud instance.",
          "error",
          4200,
        );
      } finally {
        if (mountedRef.current) {
          setLaunchingAgentId(null);
        }
      }
    },
    [retryStartup, setActionNotice, setState, setTab],
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      loadDropStatus(),
      fetchCloudAgents(),
      fetchBillingData(),
    ]);
    setTimeout(() => setRefreshing(false), 600);
  }, [fetchBillingData, fetchCloudAgents, loadDropStatus]);

  const handleSaveBillingSettings = useCallback(async () => {
    const limits = getBillingLimits(billingSettings);
    const amount = Number(autoTopUpAmount);
    const threshold = Number(autoTopUpThreshold);
    const minAmount = readNumber(limits.minAmount) ?? 1;
    const maxAmount = readNumber(limits.maxAmount) ?? 1000;
    const minThreshold = readNumber(limits.minThreshold) ?? 0;
    const maxThreshold = readNumber(limits.maxThreshold) ?? 1000;
    const hasPaymentMethod =
      readBoolean(getBillingAutoTopUp(billingSettings).hasPaymentMethod) ??
      readBoolean(
        (billingSummary as Record<string, unknown> | null)?.hasPaymentMethod,
      ) ??
      false;

    if (!Number.isFinite(amount) || amount < minAmount || amount > maxAmount) {
      setActionNotice(
        `Auto top-up amount must be between $${minAmount} and $${maxAmount}.`,
        "error",
        3600,
      );
      return;
    }

    if (
      !Number.isFinite(threshold) ||
      threshold < minThreshold ||
      threshold > maxThreshold
    ) {
      setActionNotice(
        `Auto top-up threshold must be between $${minThreshold} and $${maxThreshold}.`,
        "error",
        3600,
      );
      return;
    }

    if (autoTopUpEnabled && !hasPaymentMethod) {
      setActionNotice(
        "Save a payment method through card checkout before enabling auto top-up.",
        "info",
        4200,
      );
      return;
    }

    setBillingSettingsBusy(true);
    try {
      const response = await client.updateCloudBillingSettings({
        autoTopUp: {
          enabled: autoTopUpEnabled,
          amount,
          threshold,
        },
      });
      if (!mountedRef.current) return;
      const normalizedSettings = normalizeBillingSettings(response);
      setBillingSettings(normalizedSettings);
      dispatchAutoTopUpForm({
        type: "hydrate",
        next: buildAutoTopUpFormState(billingSummary, normalizedSettings),
        force: true,
      });
      await fetchBillingData();
      setActionNotice("Billing settings updated.", "success", 3200);
    } catch (err) {
      setActionNotice(
        err instanceof Error
          ? err.message
          : "Failed to update billing settings.",
        "error",
        4200,
      );
    } finally {
      if (mountedRef.current) {
        setBillingSettingsBusy(false);
      }
    }
  }, [
    autoTopUpAmount,
    autoTopUpEnabled,
    autoTopUpThreshold,
    billingSettings,
    billingSummary,
    fetchBillingData,
    setActionNotice,
  ]);

  const handleStartCheckout = useCallback(async () => {
    const minimumTopUp =
      readNumber(
        (billingSummary as Record<string, unknown> | null)?.minimumTopUp,
      ) ?? 1;
    const amountUsd = Number(billingAmount);
    if (!Number.isFinite(amountUsd) || amountUsd < minimumTopUp) {
      setActionNotice(
        `Enter a top-up amount of at least $${minimumTopUp}.`,
        "error",
        3200,
      );
      return;
    }

    setCheckoutBusy(true);
    try {
      const response = await client.createCloudBillingCheckout({
        amountUsd,
        mode: billingSummary?.embeddedCheckoutEnabled ? "embedded" : "hosted",
      });

      const clientSecret = readString(response.clientSecret);
      const publishableKey = readString(response.publishableKey);
      if (clientSecret && publishableKey) {
        setCheckoutSession(response);
        setCheckoutDialogOpen(true);
        return;
      }

      const checkoutUrl = resolveCheckoutUrl(response);
      if (checkoutUrl) {
        await openExternalUrl(checkoutUrl);
        return;
      }

      throw new Error(
        readString(response.message) ??
          "Eliza Cloud did not return a checkout session.",
      );
    } catch (err) {
      setActionNotice(
        err instanceof Error ? err.message : "Failed to start checkout.",
        "error",
        4200,
      );
    } finally {
      setCheckoutBusy(false);
    }
  }, [billingAmount, billingSummary, setActionNotice]);

  const handleCreateCryptoQuote = useCallback(async () => {
    const minimumTopUp =
      readNumber(
        (billingSummary as Record<string, unknown> | null)?.minimumTopUp,
      ) ?? 1;
    const amountUsd = Number(billingAmount);
    if (!Number.isFinite(amountUsd) || amountUsd < minimumTopUp) {
      setActionNotice(
        `Enter a top-up amount of at least $${minimumTopUp}.`,
        "error",
        3200,
      );
      return;
    }

    setCryptoBusy(true);
    setCryptoPayResult(null);
    try {
      const response = await client.createCloudBillingCryptoQuote({
        amountUsd,
        walletAddress:
          walletAddresses?.evmAddress ??
          walletAddresses?.solanaAddress ??
          undefined,
      });
      setCryptoQuote(response as Record<string, unknown>);
    } catch (err) {
      setCryptoQuote(null);
      setActionNotice(
        err instanceof Error ? err.message : "Failed to request crypto quote.",
        "error",
        4200,
      );
    } finally {
      setCryptoBusy(false);
    }
  }, [billingAmount, billingSummary, setActionNotice, walletAddresses]);

  const handlePayCryptoFromAgentWallet = useCallback(async () => {
    if (!cryptoQuote) return;

    const network = readString(cryptoQuote.network)?.toLowerCase();
    const payToAddress =
      readString(cryptoQuote.payToAddress) ??
      readString((cryptoQuote as Record<string, unknown>).address);
    const amount = readString(cryptoQuote.amount);
    const currency = readString(cryptoQuote.currency) ?? "USDC";
    const tokenAddress = readString(cryptoQuote.tokenAddress);

    if (!network || network !== "bsc") {
      setActionNotice(
        "Agent-wallet payment is currently wired for BSC quotes only.",
        "info",
        4200,
      );
      return;
    }

    if (!payToAddress || !amount) {
      setActionNotice(
        "Crypto quote is missing transfer details.",
        "error",
        4200,
      );
      return;
    }

    setCryptoPayBusy(true);
    try {
      const result = await client.executeBscTransfer({
        toAddress: payToAddress,
        amount,
        assetSymbol: currency,
        tokenAddress: tokenAddress ?? undefined,
        confirm: true,
      });

      if (result.executed && result.execution?.hash) {
        setCryptoPayResult(
          `Submitted ${currency} payment: ${result.execution.hash}`,
        );
        setActionNotice(
          "Crypto payment submitted from the agent wallet.",
          "success",
        );
      } else if (result.requiresUserSignature) {
        setCryptoPayResult(
          "Cloud returned an unsigned payment request. Sign it from the wallet flow to complete payment.",
        );
        setActionNotice(
          "This wallet requires user-sign mode for crypto payment.",
          "info",
          4200,
        );
      }
    } catch (err) {
      setCryptoPayResult(null);
      setActionNotice(
        err instanceof Error ? err.message : "Crypto payment failed.",
        "error",
        4200,
      );
    } finally {
      setCryptoPayBusy(false);
    }
  }, [cryptoQuote, setActionNotice]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (elizaCloudConnected) {
      void loadDropStatus();
      void fetchCloudAgents();
      void fetchBillingData();
    }
  }, [fetchBillingData, fetchCloudAgents, loadDropStatus, elizaCloudConnected]);

  const summaryCritical =
    billingSummary?.critical ?? elizaCloudCreditsCritical ?? false;
  const summaryLow = billingSummary?.low ?? elizaCloudCreditsLow ?? false;
  const creditStatusColor = summaryCritical
    ? "text-danger"
    : summaryLow
      ? "text-warn"
      : "text-ok";
  const activeView = cloudDashboardView;
  const cloudBalance = billingSummary?.balance ?? elizaCloudCredits ?? 0;
  const cloudCurrency = billingSummary?.currency ?? "USD";
  const fallbackBillingUrl =
    billingSummary?.topUpUrl ?? elizaCloudTopUpUrl ?? null;
  const minimumTopUp =
    readNumber(
      (billingSummary as Record<string, unknown> | null)?.minimumTopUp,
    ) ?? 1;
  const billingAutoTopUp = getBillingAutoTopUp(billingSettings);
  const billingLimits = getBillingLimits(billingSettings);
  const autoTopUpHasPaymentMethod =
    readBoolean(billingAutoTopUp.hasPaymentMethod) ??
    readBoolean(
      (billingSummary as Record<string, unknown> | null)?.hasPaymentMethod,
    ) ??
    false;
  const autoTopUpMinAmount =
    readNumber(billingLimits.minAmount) ?? minimumTopUp;
  const autoTopUpMaxAmount = readNumber(billingLimits.maxAmount) ?? 1000;
  const autoTopUpMinThreshold = readNumber(billingLimits.minThreshold) ?? 0;
  const autoTopUpMaxThreshold = readNumber(billingLimits.maxThreshold) ?? 1000;
  const creditStatusTone = summaryCritical
    ? t("elizaclouddashboard.CreditsCritical")
    : summaryLow
      ? t("elizaclouddashboard.CreditsLow")
      : t("elizaclouddashboard.CreditsHealthy");
  const hasAgentWallet = Boolean(
    walletAddresses?.evmAddress || walletAddresses?.solanaAddress,
  );
  const hasWalletFunds = Boolean(
    walletBalances?.evm?.chains.some(
      (chain) =>
        Number(chain.nativeBalance) > 0 ||
        chain.tokens.some((token) => Number(token.balance) > 0),
    ) ||
      ((walletBalances?.solana &&
        (Number(walletBalances.solana.solBalance) > 0 ||
          walletBalances.solana.tokens.some(
            (token) => Number(token.balance) > 0,
          ))) ??
        false),
  );

  if (!elizaCloudConnected) {
    return (
      <div className="flex flex-col items-center justify-center max-w-md mx-auto px-4 py-8 text-center animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="w-12 h-12 rounded-2xl bg-accent/10 flex items-center justify-center mb-5 border border-accent/20">
          <Zap className="w-6 h-6 text-txt" />
        </div>
        <p className="text-sm text-muted mb-6 leading-relaxed">
          {t("elizaclouddashboard.ScaleYourAgents")}
        </p>
        <Button
          variant="default"
          size="sm"
          className="rounded-xl px-8 py-3 text-sm font-semibold shadow-md shadow-accent/15 hover:shadow-accent/30 hover:-translate-y-0.5 transition-all duration-300"
          onClick={handleCloudLogin}
          disabled={elizaCloudLoginBusy}
        >
          {elizaCloudLoginBusy ? (
            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Zap className="w-4 h-4 mr-2" />
          )}
          {elizaCloudLoginBusy
            ? t("onboarding.connecting")
            : t("elizaclouddashboard.ConnectElizaCloud")}
        </Button>
        <p className="mt-4 text-xs text-muted/60">
          {t("elizaclouddashboard.NewToElizaCloud")}{" "}
          <a
            href={ELIZA_CLOUD_LOGIN_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-txt underline hover:text-txt-hover transition-colors"
          >
            {t("elizaclouddashboard.LearnMore")}
          </a>
        </p>
      </div>
    );
  }

  return (
    <div className="custom-scrollbar p-4 lg:p-6 space-y-4 max-w-7xl mx-auto animate-in fade-in duration-500">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-txt-strong tracking-tight">
            {t("elizaclouddashboard.CloudDashboard")}
          </h2>
          <span className="text-xs text-muted">·</span>
          <span className="text-xs text-muted">
            {t("elizaclouddashboard.ManageInstance")}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-0.5 rounded-lg border border-border/50 bg-bg/50 p-0.5">
            <button
              type="button"
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                activeView === "billing"
                  ? "bg-accent text-accent-fg"
                  : "text-muted hover:text-txt"
              }`}
              onClick={() => setState("cloudDashboardView", "billing")}
            >
              <CircleDollarSign className="w-3.5 h-3.5" />
              Billing
            </button>
            <button
              type="button"
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                activeView === "agents"
                  ? "bg-accent text-accent-fg"
                  : "text-muted hover:text-txt"
              }`}
              onClick={() => setState("cloudDashboardView", "agents")}
            >
              <Server className="w-3.5 h-3.5" />
              Agents
            </button>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="rounded-lg border-border/50 h-8 text-xs"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw
              className={`w-3.5 h-3.5 mr-1.5 ${refreshing ? "animate-spin" : ""}`}
            />
            {t("common.refresh")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="rounded-lg border-danger/30 text-danger hover:bg-danger/10 h-8 text-xs"
            onClick={handleCloudDisconnect}
            disabled={cloudDisconnecting}
          >
            {cloudDisconnecting
              ? t("providerswitcher.disconnecting")
              : t("providerswitcher.disconnect")}
          </Button>
        </div>
      </div>

      {activeView === "billing" ? (
        <div className="max-w-3xl mx-auto space-y-0">
          {/* ── Balance bar ───────────────────────────────────────── */}
          <div className="flex items-center justify-between py-4">
            <div className="flex items-baseline gap-3">
              <span
                className={`text-3xl font-bold tracking-tight ${creditStatusColor}`}
              >
                {cloudCurrency === "USD" ? "$" : `${cloudCurrency} `}
                {cloudBalance.toFixed(2)}
              </span>
              <span className="text-sm text-muted">credits</span>
              {billingLoading && (
                <Loader2 className="h-4 w-4 animate-spin text-muted" />
              )}
            </div>
            <span
              className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                summaryCritical
                  ? "border-danger/30 bg-danger/10 text-danger"
                  : summaryLow
                    ? "border-warn/30 bg-warn/10 text-warn"
                    : "border-ok/30 bg-ok/10 text-ok"
              }`}
            >
              {creditStatusTone}
            </span>
          </div>

          {billingError && (
            <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger mb-4">
              {billingError}
            </div>
          )}

          <hr className="border-border/40" />

          {/* ── Top Up ────────────────────────────────────────────── */}
          <div className="py-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-txt-strong">
                {t("elizaclouddashboard.TopUpCredits")}
              </h3>
              {fallbackBillingUrl ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted hover:text-txt h-auto p-0"
                  onClick={() => void openExternalUrl(fallbackBillingUrl)}
                >
                  <ExternalLink className="mr-1.5 h-3 w-3" />
                  {t("elizaclouddashboard.OpenBrowserBilling")}
                </Button>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Card payment */}
              <div className="rounded-xl border border-border/50 bg-bg/30 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <CreditCard className="h-4 w-4 text-muted" />
                  <span className="text-xs font-semibold">
                    {t("elizaclouddashboard.PayWithCard")}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {BILLING_PRESET_AMOUNTS.map((amount) => (
                    <button
                      key={amount}
                      type="button"
                      className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                        billingAmount === String(amount)
                          ? "border-accent bg-accent text-accent-fg"
                          : "border-border/50 bg-bg/30 text-txt hover:border-accent/40"
                      }`}
                      onClick={() => setBillingAmount(String(amount))}
                    >
                      ${amount}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    id="cloud-billing-amount"
                    type="number"
                    min={String(minimumTopUp)}
                    step="1"
                    value={billingAmount}
                    onChange={(e) => setBillingAmount(e.target.value)}
                    className="rounded-lg bg-bg text-sm h-9 flex-1"
                    placeholder={`Min $${minimumTopUp.toFixed(2)}`}
                  />
                  <Button
                    variant="default"
                    className="rounded-lg font-semibold h-9 px-4"
                    disabled={checkoutBusy || billingLoading}
                    onClick={() => void handleStartCheckout()}
                  >
                    {checkoutBusy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Pay"
                    )}
                  </Button>
                </div>
              </div>

              {/* Crypto payment */}
              <div className="rounded-xl border border-border/50 bg-bg/30 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Wallet className="h-4 w-4 text-muted" />
                  <span className="text-xs font-semibold">
                    {t("elizaclouddashboard.PayWithCrypto")}
                  </span>
                </div>
                <p className="text-[11px] text-muted mb-3">
                  {hasAgentWallet
                    ? hasWalletFunds
                      ? t("elizaclouddashboard.AgentWalletFunded")
                      : t("elizaclouddashboard.AgentWalletDetected")
                    : t("elizaclouddashboard.NoAgentWalletDetected")}
                </p>
                {cryptoQuote ? (
                  <div className="space-y-2">
                    <div className="text-xs">
                      <span className="font-semibold text-txt-strong">
                        {readString(cryptoQuote.currency) ?? "USDC"}{" "}
                        {readString(cryptoQuote.amount) ?? "0"}
                      </span>{" "}
                      <span className="text-muted">
                        on {readString(cryptoQuote.network) ?? "—"}
                      </span>
                    </div>
                    {readString(cryptoQuote.payToAddress) && (
                      <code className="block rounded-lg border border-border/40 bg-bg/30 px-2 py-1.5 text-[10px] text-txt-strong break-all">
                        {readString(cryptoQuote.payToAddress)}
                      </code>
                    )}
                    <div className="flex gap-2">
                      {readString(cryptoQuote.paymentLinkUrl) && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-lg text-xs h-8 flex-1"
                          onClick={() =>
                            void openExternalUrl(
                              readString(cryptoQuote.paymentLinkUrl) ?? "",
                            )
                          }
                        >
                          <ExternalLink className="mr-1 h-3 w-3" />
                          Hosted
                        </Button>
                      )}
                      <Button
                        variant="default"
                        size="sm"
                        className="rounded-lg text-xs h-8 flex-1"
                        disabled={
                          cryptoPayBusy ||
                          !hasAgentWallet ||
                          !hasWalletFunds ||
                          readString(cryptoQuote.network)?.toLowerCase() !==
                            "bsc" ||
                          !readString(cryptoQuote.payToAddress) ||
                          !readString(cryptoQuote.amount)
                        }
                        onClick={() => void handlePayCryptoFromAgentWallet()}
                      >
                        {cryptoPayBusy ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          "Pay from wallet"
                        )}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    className="w-full rounded-lg h-9"
                    disabled={cryptoBusy || billingLoading}
                    onClick={() => void handleCreateCryptoQuote()}
                  >
                    {cryptoBusy ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    {t("elizaclouddashboard.PayWithCrypto")}
                  </Button>
                )}
                {cryptoPayResult && (
                  <div className="mt-2 rounded-lg border border-ok/30 bg-ok/10 px-3 py-2 text-xs text-ok">
                    {cryptoPayResult}
                  </div>
                )}
              </div>
            </div>
          </div>

          <hr className="border-border/40" />

          {/* ── Auto Top-Up ───────────────────────────────────────── */}
          <div className="py-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold text-txt-strong">
                  {t("elizaclouddashboard.AutoTopUp")}
                </h3>
                <p className="text-[11px] text-muted mt-0.5">
                  {autoTopUpHasPaymentMethod
                    ? t("elizaclouddashboard.AutoTopUpPaymentReady")
                    : t("elizaclouddashboard.AutoTopUpNeedsPaymentMethod")}
                </p>
              </div>
              <Switch
                checked={autoTopUpEnabled}
                onChange={(v) =>
                  dispatchAutoTopUpForm({ type: "setEnabled", value: v })
                }
                aria-label={t("elizaclouddashboard.ToggleAutoTopUp")}
              />
            </div>
            <div className="flex items-end gap-3">
              <div className="flex-1 space-y-1">
                <label
                  htmlFor="cloud-auto-topup-threshold"
                  className="text-[11px] text-muted"
                >
                  Refill when below
                </label>
                <Input
                  id="cloud-auto-topup-threshold"
                  type="number"
                  min={String(autoTopUpMinThreshold)}
                  max={String(autoTopUpMaxThreshold)}
                  step="1"
                  value={autoTopUpThreshold}
                  onChange={(e) =>
                    dispatchAutoTopUpForm({
                      type: "setThreshold",
                      value: e.target.value,
                    })
                  }
                  className="rounded-lg bg-bg h-9"
                />
              </div>
              <div className="flex-1 space-y-1">
                <label
                  htmlFor="cloud-auto-topup-amount"
                  className="text-[11px] text-muted"
                >
                  Top-up amount
                </label>
                <Input
                  id="cloud-auto-topup-amount"
                  type="number"
                  min={String(autoTopUpMinAmount)}
                  max={String(autoTopUpMaxAmount)}
                  step="1"
                  value={autoTopUpAmount}
                  onChange={(e) =>
                    dispatchAutoTopUpForm({
                      type: "setAmount",
                      value: e.target.value,
                    })
                  }
                  className="rounded-lg bg-bg h-9"
                />
              </div>
              <Button
                variant="outline"
                className="rounded-lg h-9 px-4"
                disabled={
                  billingSettingsBusy || billingLoading || !autoTopUpForm.dirty
                }
                onClick={() => void handleSaveBillingSettings()}
              >
                {billingSettingsBusy ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : null}
                Save
              </Button>
            </div>
          </div>

          <hr className="border-border/40" />

          {/* ── Account ───────────────────────────────────────────── */}
          <div className="py-5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-ok shrink-0" />
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-ok/10 text-ok font-bold uppercase tracking-wider border border-ok/20">
                  {t("elizaclouddashboard.Secure")}
                </span>
              </div>
              <code className="text-[11px] text-muted break-all font-mono truncate">
                {elizaCloudUserId || t("elizaclouddashboard.NotAvailable")}
              </code>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted hover:text-txt h-auto p-0 shrink-0"
              onClick={() => void openExternalUrl(ELIZA_CLOUD_INSTANCES_URL)}
            >
              {t("elizaclouddashboard.AdvancedDashboard")}
              <ExternalLink className="w-3 h-3 ml-1.5" />
            </Button>
          </div>
        </div>
      ) : (
        <div className="max-w-3xl mx-auto space-y-0">
          {/* ── Error ─────────────────────────────────────────── */}
          {agentsError && (
            <div className="flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger mb-3">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              {agentsError}
            </div>
          )}

          {/* ── Account bar ───────────────────────────────────── */}
          <div className="flex items-center justify-between py-3 text-xs">
            <div className="flex items-center gap-3">
              <code className="text-muted font-mono truncate max-w-[200px]">
                {elizaCloudUserId || t("elizaclouddashboard.NotAvailable")}
              </code>
            </div>
            <div className="flex items-center gap-3">
              <span className={`font-semibold ${creditStatusColor}`}>
                ${cloudBalance.toFixed(2)}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted hover:text-txt h-auto p-0"
                onClick={() => setState("cloudDashboardView", "billing")}
              >
                <CircleDollarSign className="mr-1 h-3 w-3" />
                Billing
              </Button>
            </div>
          </div>

          <hr className="border-border/40" />

          {/* ── Agent list ────────────────────────────────────── */}
          <div className="py-4">
            {agentsLoading && cloudAgents.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 text-muted animate-spin" />
              </div>
            ) : (
              <div className="space-y-2">
                {cloudAgents.map((agent) => (
                  <CloudAgentCard
                    key={agent.agent_id}
                    agent={agent}
                    onDelete={handleDeleteAgent}
                    deleting={deletingAgentId === agent.agent_id}
                    launching={launchingAgentId === agent.agent_id}
                    onLaunch={handleLaunchAgent}
                    onSelect={(id) => setSelectedAgentId(id)}
                  />
                ))}

                {showDeployForm ? (
                  <div className="flex items-center gap-2 py-2">
                    <Input
                      placeholder={t("elizaclouddashboard.AgentName")}
                      value={deployAgentName}
                      onChange={(e) => setDeployAgentName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void handleDeployAgent();
                        if (e.key === "Escape") setShowDeployForm(false);
                      }}
                      disabled={deploying}
                      className="h-8 rounded-lg bg-bg text-xs flex-1"
                    />
                    <Button
                      size="sm"
                      className="h-8 rounded-lg text-xs"
                      onClick={handleDeployAgent}
                      disabled={deploying || !deployAgentName.trim()}
                    >
                      {deploying ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        t("elizaclouddashboard.Deploy")
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 rounded-lg text-xs text-muted"
                      onClick={() => setShowDeployForm(false)}
                      disabled={deploying}
                    >
                      {t("common.cancel")}
                    </Button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="flex items-center gap-2 w-full py-3 text-xs text-muted hover:text-txt transition-colors"
                    onClick={() => setShowDeployForm(true)}
                  >
                    <Plus className="w-4 h-4" />
                    {t("elizaclouddashboard.DeployNewAgent")}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* ── Agent detail ──────────────────────────────────── */}
          {selectedAgentId && selectedAgent && (
            <>
              <hr className="border-border/40" />
              <AgentDetailSidebar
                agent={selectedAgent}
                onClose={() => setSelectedAgentId(null)}
              />
            </>
          )}
        </div>
      )}

      <Dialog
        open={checkoutDialogOpen}
        onOpenChange={(open) => {
          setCheckoutDialogOpen(open);
          if (!open) {
            void fetchBillingData();
          }
        }}
      >
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{t("elizaclouddashboard.PayWithCard")}</DialogTitle>
          </DialogHeader>
          {checkoutSession?.clientSecret && checkoutSession.publishableKey ? (
            <StripeEmbeddedCheckout
              publishableKey={checkoutSession.publishableKey}
              clientSecret={checkoutSession.clientSecret}
            />
          ) : (
            <div className="rounded-2xl border border-border/40 bg-bg/25 px-4 py-5 text-sm text-muted">
              {t("elizaclouddashboard.CheckoutProviderNote")}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface StatusDetail {
  status?: string;
  databaseStatus?: string;
  lastHeartbeat?: string | number | Date | null;
}

function AgentDetailSidebar({
  agent,
  onClose,
}: {
  agent: CloudCompatAgent | undefined;
  onClose: () => void;
}) {
  const { t } = useApp();
  const [logs, setLogs] = useState<string>("");
  const [statusDetail, setStatusDetail] = useState<StatusDetail | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!agent) return;
    let mounted = true;

    const fetchDetails = async () => {
      try {
        const [statusRes, logsRes] = await Promise.all([
          client.getCloudCompatAgentStatus(agent.agent_id),
          client.getCloudCompatAgentLogs(agent.agent_id, 100),
        ]);

        if (!mounted) return;
        setStatusDetail(statusRes.data);
        setLogs(typeof logsRes.data === "string" ? logsRes.data : "");
      } catch {
        // Silently retry next tick
      }
    };

    void fetchDetails();
    const intId = setInterval(fetchDetails, 5000);
    return () => {
      mounted = false;
      clearInterval(intId);
    };
  }, [agent]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: rerun when logs update
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);

  if (!agent) return null;

  return (
    <div className="space-y-4 animate-in slide-in-from-right-8 duration-300">
      <SectionCard
        title={t("elizaclouddashboard.agentDetails")}
        className="border-accent/40 bg-accent/5 backdrop-blur-xl rounded-3xl shadow-sm relative overflow-hidden"
      >
        <button
          type="button"
          className="absolute top-4 right-4 p-1 rounded-full hover:bg-bg/50 transition-colors text-muted hover:text-txt-strong"
          onClick={onClose}
        >
          <X className="w-5 h-5" />
        </button>

        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 rounded-xl bg-bg/40 border border-border/40">
              <span className="text-[10px] text-muted uppercase font-bold tracking-wider mb-1 block">
                Status
              </span>
              <AgentStatusBadge status={statusDetail?.status || agent.status} />
            </div>
            <div className="p-3 rounded-xl bg-bg/40 border border-border/40">
              <span className="text-[10px] text-muted uppercase font-bold tracking-wider mb-1 block">
                DB Status
              </span>
              <span className="text-xs font-mono">
                {statusDetail?.databaseStatus || agent.database_status || "—"}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-bg/40 border border-border/40 col-span-2">
              <span className="text-[10px] text-muted uppercase font-bold tracking-wider mb-1 block">
                Heartbeat
              </span>
              <span className="text-xs font-mono">
                {statusDetail?.lastHeartbeat
                  ? new Date(statusDetail.lastHeartbeat).toLocaleString()
                  : agent.last_heartbeat_at
                    ? new Date(agent.last_heartbeat_at).toLocaleString()
                    : "No heartbeat yet"}
              </span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-bg/80 border border-border/40">
            <span className="text-[10px] text-muted uppercase font-bold tracking-wider mb-2 flex items-center gap-2">
              <Terminal className="w-3 h-3" /> Live Logs
            </span>
            <div className="h-64 overflow-y-auto custom-scrollbar bg-black/50 rounded-lg p-3 border border-border/20">
              <pre className="text-[10px] font-mono text-txt-strong/80 whitespace-pre-wrap break-all">
                {logs || "No logs available. Deploying..."}
                <div ref={logsEndRef} />
              </pre>
            </div>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
