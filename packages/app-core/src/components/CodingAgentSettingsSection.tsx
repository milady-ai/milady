import {
  Button,
  SaveFooter,
  Select,
  SelectContent,
  SelectItem,
  SelectValue,
  SettingsControls,
} from "@miladyai/ui";
import { useCallback, useEffect, useState } from "react";
import type { AgentPreflightResult } from "../api";
import { client } from "../api";
import { useTimeout } from "../hooks";
import { useApp } from "../state";

type AgentTab = "claude" | "gemini" | "codex" | "aider";
type AiderProvider = "anthropic" | "openai" | "google";
type ApprovalPreset = "readonly" | "standard" | "permissive" | "autonomous";
type AgentSelectionStrategy = "fixed" | "ranked";

const AGENT_TABS: AgentTab[] = ["claude", "gemini", "codex", "aider"];

const APPROVAL_PRESETS: {
  value: ApprovalPreset;
  labelKey: string;
  descKey: string;
}[] = [
  {
    value: "readonly",
    labelKey: "codingagentsettingssection.PresetReadOnly",
    descKey: "codingagentsettingssection.PresetReadOnlyDesc",
  },
  {
    value: "standard",
    labelKey: "mediasettingssection.Standard",
    descKey: "codingagentsettingssection.PresetStandardDesc",
  },
  {
    value: "permissive",
    labelKey: "codingagentsettingssection.PresetPermissive",
    descKey: "codingagentsettingssection.PresetPermissiveDesc",
  },
  {
    value: "autonomous",
    labelKey: "codingagentsettingssection.PresetAutonomous",
    descKey: "codingagentsettingssection.PresetAutonomousDesc",
  },
];

interface ModelOption {
  value: string;
  label: string;
}

const AGENT_PROVIDER_MAP: Record<AgentTab, string> = {
  claude: "anthropic",
  gemini: "google-genai",
  codex: "openai",
  aider: "anthropic",
};

const AIDER_PROVIDER_MAP: Record<AiderProvider, string> = {
  anthropic: "anthropic",
  openai: "openai",
  google: "google-genai",
};

const FALLBACK_MODELS: Record<string, ModelOption[]> = {
  anthropic: [
    { value: "claude-opus-4-6", label: "Claude Opus 4.6" },
    { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
    { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
  ],
  "google-genai": [
    { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
    { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  ],
  openai: [
    { value: "o3", label: "o3" },
    { value: "o4-mini", label: "o4-mini" },
    { value: "gpt-4o", label: "GPT-4o" },
  ],
};

const AGENT_LABELS: Record<AgentTab, string> = {
  claude: "Claude",
  gemini: "Gemini",
  codex: "Codex",
  aider: "Aider",
};

/** Map full adapter names from the preflight API to short tab keys. */
export const ADAPTER_NAME_TO_TAB: Record<string, AgentTab> = {
  "claude code": "claude",
  "google gemini": "gemini",
  "openai codex": "codex",
  aider: "aider",
  claude: "claude",
  gemini: "gemini",
  codex: "codex",
};

const ENV_PREFIX: Record<AgentTab, string> = {
  claude: "PARALLAX_CLAUDE",
  gemini: "PARALLAX_GEMINI",
  codex: "PARALLAX_CODEX",
  aider: "PARALLAX_AIDER",
};

/**
 * Text input that uses local state while typing and only syncs on blur/enter.
 * `initial` is only read on mount — safe because the parent guards rendering
 * behind `if (loading) return …`, so `initial` is always the loaded value.
 */
function CodingDirInput({
  initial,
  onCommit,
}: { initial: string; onCommit: (val: string) => void }) {
  const [val, setVal] = useState(initial);
  return (
    <SettingsControls.Input
      className="w-full"
      variant="compact"
      type="text"
      placeholder="~/Projects"
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={() => onCommit(val)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onCommit(val);
      }}
    />
  );
}

export function CodingAgentSettingsSection() {
  const { setTimeout } = useTimeout();
  const { t } = useApp();

  const [activeTab, setActiveTab] = useState<AgentTab>("claude");
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<Record<string, string>>({});
  const [providerModels, setProviderModels] = useState<
    Record<string, ModelOption[]>
  >({});
  const [preflightLoaded, setPreflightLoaded] = useState(false);
  const [preflightByAgent, setPreflightByAgent] = useState<
    Partial<Record<AgentTab, AgentPreflightResult>>
  >({});

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const [cfg, anthropicRes, googleRes, openaiRes, preflightRes] =
          await Promise.all([
            client.getConfig(),
            client.fetchModels("anthropic", false).catch(() => null),
            client.fetchModels("google-genai", false).catch(() => null),
            client.fetchModels("openai", false).catch(() => null),
            fetch("/api/coding-agents/preflight")
              .then((response) => (response.ok ? response.json() : null))
              .catch(() => null),
          ]);

        const env = (cfg.env ?? {}) as Record<string, string>;
        const loaded: Record<string, string> = {};
        for (const agent of ["CLAUDE", "GEMINI", "CODEX", "AIDER"] as const) {
          const prefix = `PARALLAX_${agent}`;
          if (env[`${prefix}_MODEL_POWERFUL`]) {
            loaded[`${prefix}_MODEL_POWERFUL`] =
              env[`${prefix}_MODEL_POWERFUL`];
          }
          if (env[`${prefix}_MODEL_FAST`]) {
            loaded[`${prefix}_MODEL_FAST`] = env[`${prefix}_MODEL_FAST`];
          }
        }
        if (env.PARALLAX_AIDER_PROVIDER) {
          loaded.PARALLAX_AIDER_PROVIDER = env.PARALLAX_AIDER_PROVIDER;
        }
        if (env.PARALLAX_DEFAULT_APPROVAL_PRESET) {
          loaded.PARALLAX_DEFAULT_APPROVAL_PRESET =
            env.PARALLAX_DEFAULT_APPROVAL_PRESET;
        }
        if (env.PARALLAX_AGENT_SELECTION_STRATEGY) {
          loaded.PARALLAX_AGENT_SELECTION_STRATEGY =
            env.PARALLAX_AGENT_SELECTION_STRATEGY;
        }
        if (env.PARALLAX_DEFAULT_AGENT_TYPE) {
          loaded.PARALLAX_DEFAULT_AGENT_TYPE = env.PARALLAX_DEFAULT_AGENT_TYPE;
        }
        if (env.PARALLAX_SCRATCH_RETENTION) {
          loaded.PARALLAX_SCRATCH_RETENTION = env.PARALLAX_SCRATCH_RETENTION;
        }
        if (env.PARALLAX_CODING_DIRECTORY) {
          loaded.PARALLAX_CODING_DIRECTORY = env.PARALLAX_CODING_DIRECTORY;
        }
        setPrefs(loaded);

        const models: Record<string, ModelOption[]> = {};
        for (const [providerId, response] of [
          ["anthropic", anthropicRes],
          ["google-genai", googleRes],
          ["openai", openaiRes],
        ] as const) {
          if (
            response?.models &&
            Array.isArray(response.models) &&
            response.models.length > 0
          ) {
            const chatModels = (
              response.models as Array<{
                id: string;
                name: string;
                category: string;
              }>
            )
              .filter((model) => model.category === "chat")
              .map((model) => ({
                value: model.id,
                label: model.name || model.id,
              }));
            if (chatModels.length > 0) {
              models[providerId] = chatModels;
            }
          }
        }
        setProviderModels(models);

        if (Array.isArray(preflightRes)) {
          const mapped: Partial<Record<AgentTab, AgentPreflightResult>> = {};
          for (const item of preflightRes as AgentPreflightResult[]) {
            const raw = item.adapter?.toLowerCase();
            const key = raw ? ADAPTER_NAME_TO_TAB[raw] : undefined;
            if (key) {
              mapped[key] = item;
            }
          }
          setPreflightByAgent(mapped);
          setPreflightLoaded(true);
        }
      } catch {
        // Fall back to built-in defaults when config or model fetches fail.
      }
      setLoading(false);
    })();
  }, []);

  const installedAgents = AGENT_TABS.filter(
    (agent) => preflightByAgent[agent]?.installed === true,
  );
  const availableAgents =
    preflightLoaded && installedAgents.length > 0
      ? installedAgents
      : AGENT_TABS;

  const getInstallState = (
    agent: AgentTab,
  ): "installed" | "missing" | "unknown" => {
    if (!preflightLoaded) {
      return "unknown";
    }
    return preflightByAgent[agent]?.installed ? "installed" : "missing";
  };

  useEffect(() => {
    if (availableAgents.length === 0) {
      return;
    }
    if (!availableAgents.includes(activeTab)) {
      setActiveTab(availableAgents[0]);
    }
  }, [activeTab, availableAgents]);

  const setPref = useCallback((key: string, value: string) => {
    setPrefs((previous) => ({ ...previous, [key]: value }));
    setDirty(true);
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const envPatch: Record<string, string> = {};
      for (const [key, value] of Object.entries(prefs)) {
        if (value != null) {
          envPatch[key] = value;
        }
      }
      await client.updateConfig({ env: envPatch });
      setDirty(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Failed to save");
    }
    setSaving(false);
  }, [prefs, setTimeout]);

  const getProviderId = (
    tab: AgentTab,
    aiderProvider: AiderProvider,
  ): string =>
    tab === "aider"
      ? AIDER_PROVIDER_MAP[aiderProvider]
      : AGENT_PROVIDER_MAP[tab];

  const getModelOptions = (providerId: string): ModelOption[] =>
    providerModels[providerId] ?? FALLBACK_MODELS[providerId] ?? [];

  if (loading) {
    return (
      <div className="py-4 text-center text-[var(--muted)] text-xs">
        {t("codingagentsettingssection.LoadingCodingAgent")}
      </div>
    );
  }

  const prefix = ENV_PREFIX[activeTab];
  const aiderProvider = (prefs.PARALLAX_AIDER_PROVIDER ||
    "anthropic") as AiderProvider;
  const providerId = getProviderId(activeTab, aiderProvider);
  const modelOptions = getModelOptions(providerId);
  const powerfulValue = prefs[`${prefix}_MODEL_POWERFUL`] ?? "";
  const fastValue = prefs[`${prefix}_MODEL_FAST`] ?? "";
  const isDynamic = Boolean(providerModels[providerId]);
  const approvalPreset = (prefs.PARALLAX_DEFAULT_APPROVAL_PRESET ||
    "permissive") as ApprovalPreset;
  const selectionStrategy = (prefs.PARALLAX_AGENT_SELECTION_STRATEGY ||
    "fixed") as AgentSelectionStrategy;
  const defaultAgentType = (prefs.PARALLAX_DEFAULT_AGENT_TYPE ||
    "claude") as AgentTab;
  const effectiveDefaultAgentType = availableAgents.includes(defaultAgentType)
    ? defaultAgentType
    : availableAgents[0];

  if (preflightLoaded && installedAgents.length === 0) {
    return (
      <div className="flex flex-col gap-2 text-xs">
        <div className="text-[var(--muted)]">
          {t("codingagentsettingssection.NoSupportedCLIs")}
        </div>
        <div className="flex flex-col gap-1 text-[11px] text-[var(--muted)]">
          {AGENT_TABS.map((agent) => {
            const preflight = preflightByAgent[agent];
            return (
              <div key={agent}>
                <span className="font-semibold">{AGENT_LABELS[agent]}:</span>{" "}
                {preflight?.installCommand
                  ? `${t("codingagentsettingssection.InstallWith", {
                      defaultValue: "Install with",
                    })} ${preflight.installCommand}`
                  : ""}
                {preflight?.docsUrl ? ` (${preflight.docsUrl})` : ""}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <SettingsControls.Field>
        <SettingsControls.FieldLabel>
          {t("codingagentsettingssection.AgentSelectionStra")}
        </SettingsControls.FieldLabel>
        <Select
          value={selectionStrategy}
          onValueChange={(value) =>
            setPref("PARALLAX_AGENT_SELECTION_STRATEGY", value)
          }
        >
          <SettingsControls.SelectTrigger variant="compact">
            <SelectValue />
          </SettingsControls.SelectTrigger>
          <SelectContent>
            <SelectItem value="fixed">
              {t("codingagentsettingssection.Fixed")}
            </SelectItem>
            <SelectItem value="ranked">
              {t("codingagentsettingssection.RankedAutoSelect")}
            </SelectItem>
          </SelectContent>
        </Select>
        <SettingsControls.FieldDescription className="mt-1.5">
          {selectionStrategy === "fixed"
            ? t("codingagentsettingssection.AgentUsedWhenNoEStrategyFixed")
            : t("codingagentsettingssection.AgentUsedWhenNoEStrategyRanked")}
        </SettingsControls.FieldDescription>
      </SettingsControls.Field>

      {selectionStrategy === "fixed" && (
        <SettingsControls.Field>
          <SettingsControls.FieldLabel>
            {t("codingagentsettingssection.DefaultAgentType")}
          </SettingsControls.FieldLabel>
          <Select
            value={effectiveDefaultAgentType}
            onValueChange={(value) =>
              setPref("PARALLAX_DEFAULT_AGENT_TYPE", value)
            }
          >
            <SettingsControls.SelectTrigger variant="compact">
              <SelectValue />
            </SettingsControls.SelectTrigger>
            <SelectContent>
              {availableAgents.map((agent) => (
                <SelectItem key={agent} value={agent}>
                  {AGENT_LABELS[agent]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <SettingsControls.FieldDescription>
            {t("codingagentsettingssection.AgentUsedWhenNoE")}
          </SettingsControls.FieldDescription>
        </SettingsControls.Field>
      )}

      <SettingsControls.Field>
        <SettingsControls.FieldLabel>
          {t("codingagentsettingssection.DefaultPermissionL")}
        </SettingsControls.FieldLabel>
        <Select
          value={approvalPreset}
          onValueChange={(value) =>
            setPref("PARALLAX_DEFAULT_APPROVAL_PRESET", value)
          }
        >
          <SettingsControls.SelectTrigger variant="compact">
            <SelectValue />
          </SettingsControls.SelectTrigger>
          <SelectContent>
            {APPROVAL_PRESETS.map((preset) => (
              <SelectItem key={preset.value} value={preset.value}>
                {t(preset.labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <SettingsControls.FieldDescription className="mt-1.5">
          {APPROVAL_PRESETS.find((preset) => preset.value === approvalPreset)
            ?.descKey
            ? t(
                APPROVAL_PRESETS.find(
                  (preset) => preset.value === approvalPreset,
                )?.descKey ?? "",
              )
            : ""}
          {t("codingagentsettingssection.AppliesToAllNewlySpawned")}
        </SettingsControls.FieldDescription>
      </SettingsControls.Field>

      <SettingsControls.Field>
        <SettingsControls.FieldLabel>
          {t("codingagentsettingssection.ScratchRetention", {
            defaultValue: "Scratch Retention",
          })}
        </SettingsControls.FieldLabel>
        <Select
          value={prefs.PARALLAX_SCRATCH_RETENTION || "pending_decision"}
          onValueChange={(value) => {
            // Skip if user re-selects the visual default that was never stored
            if (!prefs.PARALLAX_SCRATCH_RETENTION && value === "pending_decision")
              return;
            setPref("PARALLAX_SCRATCH_RETENTION", value);
          }}
        >
          <SettingsControls.SelectTrigger variant="compact">
            <SelectValue />
          </SettingsControls.SelectTrigger>
          <SelectContent>
            <SelectItem value="ephemeral">
              {t("codingagentsettingssection.RetentionEphemeral", {
                defaultValue: "Auto-delete",
              })}
            </SelectItem>
            <SelectItem value="pending_decision">
              {t("codingagentsettingssection.RetentionAskMe", {
                defaultValue: "Ask me (default)",
              })}
            </SelectItem>
            <SelectItem value="persistent">
              {t("codingagentsettingssection.RetentionAlwaysKeep", {
                defaultValue: "Always keep",
              })}
            </SelectItem>
          </SelectContent>
        </Select>
        <SettingsControls.FieldDescription>
          {t("codingagentsettingssection.ScratchRetentionDesc", {
            defaultValue:
              "What happens to scratch workspace code when a task finishes.",
          })}
        </SettingsControls.FieldDescription>
      </SettingsControls.Field>

      <SettingsControls.Field>
        <SettingsControls.FieldLabel>
          {t("codingagentsettingssection.CodingDirectory", {
            defaultValue: "Coding Directory",
          })}
        </SettingsControls.FieldLabel>
        <CodingDirInput
          initial={prefs.PARALLAX_CODING_DIRECTORY || ""}
          onCommit={(val) => setPref("PARALLAX_CODING_DIRECTORY", val)}
        />
        <SettingsControls.FieldDescription>
          {t("codingagentsettingssection.CodingDirectoryDesc", {
            defaultValue:
              "Where scratch task code is saved. Leave empty for default (~/.milady/workspaces/).",
          })}
        </SettingsControls.FieldDescription>
      </SettingsControls.Field>

      <SettingsControls.SegmentedGroup>
        {availableAgents.map((agent) => {
          const active = activeTab === agent;
          const installState = getInstallState(agent);
          return (
            <Button
              key={agent}
              variant={active ? "default" : "ghost"}
              size="sm"
              className={`flex-1 h-9 rounded-lg border border-transparent px-3 py-2 text-xs font-semibold ${
                active
                  ? "bg-accent text-accent-fg shadow-sm"
                  : "text-muted hover:bg-bg-hover hover:text-txt"
              }`}
              onClick={() => setActiveTab(agent)}
            >
              <span className="inline-flex items-center gap-1.5">
                <span>{AGENT_LABELS[agent]}</span>
                {installState === "installed" && (
                  <span className="text-[10px] font-medium opacity-80">
                    {t("codingagentsettingssection.Installed")}
                  </span>
                )}
                {installState === "unknown" && (
                  <span className="text-[10px] font-medium opacity-70">
                    {t("codingagentsettingssection.Unknown")}
                  </span>
                )}
              </span>
            </Button>
          );
        })}
      </SettingsControls.SegmentedGroup>

      {preflightLoaded && (
        <SettingsControls.MutedText className="mt-1.5">
          {t("codingagentsettingssection.Availability")}{" "}
          {AGENT_TABS.map((agent) => {
            const installState = getInstallState(agent);
            const label =
              installState === "installed"
                ? t("codingagentsettingssection.Installed")
                : installState === "missing"
                  ? t("codingagentsettingssection.NotInstalled")
                  : t("codingagentsettingssection.Unknown");
            return `${AGENT_LABELS[agent]}: ${label}`;
          }).join(" · ")}
        </SettingsControls.MutedText>
      )}

      {activeTab === "aider" && (
        <SettingsControls.Field>
          <SettingsControls.FieldLabel>
            {t("codingagentsettingssection.Provider")}
          </SettingsControls.FieldLabel>
          <Select
            value={aiderProvider}
            onValueChange={(value) => setPref("PARALLAX_AIDER_PROVIDER", value)}
          >
            <SettingsControls.SelectTrigger variant="compact">
              <SelectValue />
            </SettingsControls.SelectTrigger>
            <SelectContent>
              <SelectItem value="anthropic">
                {t("codingagentsettingssection.Anthropic")}
              </SelectItem>
              <SelectItem value="openai">
                {t("codingagentsettingssection.OpenAI")}
              </SelectItem>
              <SelectItem value="google">
                {t("codingagentsettingssection.Google")}
              </SelectItem>
            </SelectContent>
          </Select>
        </SettingsControls.Field>
      )}

      <div className="flex gap-3">
        <SettingsControls.Field className="flex-1">
          <SettingsControls.FieldLabel>
            {t("codingagentsettingssection.PowerfulModel")}
          </SettingsControls.FieldLabel>
          <Select
            value={powerfulValue}
            onValueChange={(value) =>
              setPref(`${prefix}_MODEL_POWERFUL`, value)
            }
          >
            <SettingsControls.SelectTrigger variant="compact">
              <SelectValue
                placeholder={t("codingagentsettingssection.Default")}
              />
            </SettingsControls.SelectTrigger>
            <SelectContent>
              <SelectItem value="__default__">
                {t("codingagentsettingssection.Default")}
              </SelectItem>
              {modelOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsControls.Field>
        <SettingsControls.Field className="flex-1">
          <SettingsControls.FieldLabel>
            {t("codingagentsettingssection.FastModel")}
          </SettingsControls.FieldLabel>
          <Select
            value={fastValue}
            onValueChange={(value) => setPref(`${prefix}_MODEL_FAST`, value)}
          >
            <SettingsControls.SelectTrigger variant="compact">
              <SelectValue
                placeholder={t("codingagentsettingssection.Default")}
              />
            </SettingsControls.SelectTrigger>
            <SelectContent>
              <SelectItem value="__default__">
                {t("codingagentsettingssection.Default")}
              </SelectItem>
              {modelOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsControls.Field>
      </div>

      <SettingsControls.MutedText className="mt-1.5">
        {isDynamic
          ? t("codingagentsettingssection.ModelsFetched")
          : t("codingagentsettingssection.UsingFallback")}
      </SettingsControls.MutedText>

      <SaveFooter
        dirty={dirty}
        saving={saving}
        saveError={saveError}
        saveSuccess={saveSuccess}
        onSave={() => void handleSave()}
      />
    </div>
  );
}
