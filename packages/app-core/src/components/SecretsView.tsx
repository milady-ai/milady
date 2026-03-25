/**
 * Secrets Vault — user-curated view of API keys and credentials.
 *
 * Only shows secrets the user has explicitly added to their vault (persisted in
 * localStorage) plus any that are already set in the environment. Users browse
 * available secrets from plugins and pick which ones to manage here.
 */

import { Button, Input } from "@miladyai/ui";
import { ChevronDown } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { SecretInfo } from "../api";
import { client } from "../api";
import { useApp } from "../state";

/* ── Constants ──────────────────────────────────────────────────────── */

const STORAGE_KEY = "eliza:secrets-vault-keys";

const CATEGORY_ORDER = [
  "ai-provider",
  "blockchain",
  "connector",
  "auth",
  "other",
] as const;

const CATEGORY_LABELS: Record<string, string> = {
  "ai-provider": "AI Providers",
  blockchain: "Blockchain",
  connector: "Connectors",
  auth: "Authentication",
  other: "Other",
};

type GroupedSecrets = {
  category: string;
  label: string;
  secrets: SecretInfo[];
};

const VAULT_PANEL_CLASSNAME =
  "rounded-2xl border border-border/50 bg-card/92 shadow-sm";
const SECTION_TOGGLE_CLASSNAME =
  "mb-3 h-auto w-full items-center gap-2 rounded-xl border border-transparent px-3 py-2 text-left hover:border-border/50 hover:bg-bg-hover";

function groupSecretsByCategory(secrets: SecretInfo[]): GroupedSecrets[] {
  const grouped = new Map<string, SecretInfo[]>();
  for (const secret of secrets) {
    const existing = grouped.get(secret.category);
    if (existing) {
      existing.push(secret);
    } else {
      grouped.set(secret.category, [secret]);
    }
  }

  return CATEGORY_ORDER.filter((category) => grouped.has(category)).map(
    (category) => ({
      category,
      label: CATEGORY_LABELS[category],
      secrets: grouped.get(category) ?? [],
    }),
  );
}

/* ── Persistence ────────────────────────────────────────────────────── */

function loadPinnedKeys(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch (err) {
    console.warn(
      "[SecretsView] Failed to load pinned keys from localStorage:",
      err,
    );
  }
  return new Set();
}

function savePinnedKeys(keys: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...keys]));
  } catch (err) {
    console.warn(
      "[SecretsView] Failed to save pinned keys to localStorage:",
      err,
    );
  }
}

/* ── Component ──────────────────────────────────────────────────────── */

export function SecretsView() {
  const { t } = useApp();
  const [allSecrets, setAllSecrets] = useState<SecretInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pinnedKeys, setPinnedKeys] = useState<Set<string>>(loadPinnedKeys);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [visible, setVisible] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await client.getSecrets();
      setAllSecrets(res.secrets);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load secrets");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Vault secrets = pinned by user OR already set in env
  const vaultSecrets = useMemo(() => {
    return allSecrets.filter((s) => pinnedKeys.has(s.key) || s.isSet);
  }, [allSecrets, pinnedKeys]);

  // Available secrets not in the vault (for the picker)
  const availableSecrets = useMemo(() => {
    const vaultKeys = new Set(vaultSecrets.map((s) => s.key));
    const available = allSecrets.filter((s) => !vaultKeys.has(s.key));
    if (!pickerSearch.trim()) return available;
    const q = pickerSearch.toLowerCase();
    return available.filter(
      (s) =>
        s.key.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.usedBy.some((u) => u.pluginName.toLowerCase().includes(q)),
    );
  }, [allSecrets, vaultSecrets, pickerSearch]);

  // Group vault secrets by category
  const grouped = useMemo(() => {
    return groupSecretsByCategory(vaultSecrets);
  }, [vaultSecrets]);

  const dirtyKeys = useMemo(() => {
    return Object.keys(draft).filter((k) => draft[k].trim() !== "");
  }, [draft]);

  const pinKey = (key: string) => {
    setPinnedKeys((prev) => {
      const next = new Set(prev);
      next.add(key);
      savePinnedKeys(next);
      return next;
    });
  };

  const unpinKey = (key: string) => {
    setPinnedKeys((prev) => {
      const next = new Set(prev);
      next.delete(key);
      savePinnedKeys(next);
      return next;
    });
    setDraft((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handleSave = async () => {
    if (dirtyKeys.length === 0) return;
    setSaving(true);
    setSaveResult(null);
    try {
      const payload: Record<string, string> = {};
      for (const key of dirtyKeys) payload[key] = draft[key];
      const res = await client.updateSecrets(payload);
      setSaveResult({
        ok: true,
        message: `Updated ${res.updated.length} secret${res.updated.length !== 1 ? "s" : ""}`,
      });
      setDraft({});
      await load();
    } catch (err) {
      setSaveResult({
        ok: false,
        message: err instanceof Error ? err.message : "Save failed",
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleCollapse = (cat: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const toggleVisible = (key: string) => {
    setVisible((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (loading) {
    return (
      <div
        className={`${VAULT_PANEL_CLASSNAME} py-8 text-center text-[13px] italic text-muted`}
      >
        {t("secretsview.LoadingSecrets")}
      </div>
    );
  }

  if (error) {
    return (
      <div className={`${VAULT_PANEL_CLASSNAME} px-4 py-8 text-center`}>
        <p className="mb-2 text-[13px] text-danger">{error}</p>
        <Button
          variant="outline"
          size="sm"
          className="h-8 px-3 text-[13px]"
          onClick={load}
        >
          {t("common.retry")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p className="m-0 max-w-2xl text-[13px] leading-6 text-muted">
          {t("secretsview.ManageAPIKeysAnd")}
        </p>
        <Button
          variant="default"
          size="sm"
          className="h-9 flex-shrink-0 px-3 text-[13px] shadow-sm"
          onClick={() => {
            setPickerOpen(true);
            setPickerSearch("");
          }}
        >
          {t("secretsview.AddSecret")}
        </Button>
      </div>

      {/* Picker modal */}
      {pickerOpen && (
        <SecretPicker
          available={availableSecrets}
          search={pickerSearch}
          onSearchChange={setPickerSearch}
          onAdd={(key) => {
            pinKey(key);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {/* Empty state */}
      {vaultSecrets.length === 0 && (
        <div
          className={`${VAULT_PANEL_CLASSNAME} border-dashed px-4 py-8 text-center text-[13px] italic text-muted`}
        >
          {t("secretsview.YourVaultIsEmpty")}
        </div>
      )}

      {/* Vault secrets grouped by category */}
      {grouped.map(({ category, label, secrets: catSecrets }) => (
        <section key={category} className="space-y-3">
          <Button
            variant="ghost"
            className={SECTION_TOGGLE_CLASSNAME}
            onClick={() => toggleCollapse(category)}
            aria-expanded={!collapsed.has(category)}
          >
            <ChevronDown
              className="h-3 w-3 select-none text-muted transition-transform"
              style={{
                transform: collapsed.has(category)
                  ? "rotate(-90deg)"
                  : "rotate(0deg)",
              }}
            />
            <span className="text-[14px] font-semibold text-txt">{label}</span>
            <span className="text-[12px] text-muted">
              ({catSecrets.length})
            </span>
          </Button>

          {!collapsed.has(category) && (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {catSecrets.map((secret) => (
                <SecretCard
                  key={secret.key}
                  secret={secret}
                  draftValue={draft[secret.key] ?? ""}
                  isVisible={visible.has(secret.key)}
                  isPinned={pinnedKeys.has(secret.key)}
                  onToggleVisible={() => toggleVisible(secret.key)}
                  onDraftChange={(val) =>
                    setDraft((prev) => ({ ...prev, [secret.key]: val }))
                  }
                  onRemove={() => unpinKey(secret.key)}
                />
              ))}
            </div>
          )}
        </section>
      ))}

      {/* Save bar */}
      {vaultSecrets.length > 0 && (
        <div
          className={`${VAULT_PANEL_CLASSNAME} flex flex-col gap-3 border-border/60 px-4 py-3 sm:flex-row sm:items-center`}
        >
          <Button
            variant="default"
            size="sm"
            className="h-9 px-4 text-[13px] font-medium shadow-sm transition-colors"
            disabled={dirtyKeys.length === 0 || saving}
            onClick={handleSave}
          >
            {saving
              ? "Saving..."
              : `Save${dirtyKeys.length > 0 ? ` (${dirtyKeys.length})` : ""}`}
          </Button>
          {saveResult && (
            <span
              className={`text-[13px] ${saveResult.ok ? "text-ok" : "text-danger"}`}
            >
              {saveResult.message}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Secret Picker ──────────────────────────────────────────────────── */

function SecretPicker({
  available,
  search,
  onSearchChange,
  onAdd,
  onClose,
}: {
  available: SecretInfo[];
  search: string;
  onSearchChange: (v: string) => void;
  onAdd: (key: string) => void;
  onClose: () => void;
}) {
  const { t } = useApp();
  // Group available by category
  const grouped = useMemo(() => {
    return groupSecretsByCategory(available);
  }, [available]);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-start justify-center bg-black/50 px-4 pt-10 backdrop-blur-sm sm:pt-20"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        }
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="flex max-h-[min(80vh,36rem)] w-full max-w-[min(35rem,100%)] flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/96 shadow-2xl">
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <span className="text-[14px] font-semibold text-txt">
            {t("secretsview.AddSecretsToVault")}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg text-[16px] text-muted hover:text-txt"
            onClick={onClose}
            aria-label={t("common.close")}
          >
            x
          </Button>
        </div>
        <Input
          type="text"
          className="h-12 w-full rounded-none border-0 border-b border-border/60 bg-transparent px-4 py-2.5 text-[13px] text-txt shadow-none focus-visible:ring-0 font-body"
          placeholder={t("secretsview.SearchByKeyDescr")}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
        <div className="flex-1 overflow-y-auto p-3">
          {available.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/60 py-6 text-center text-[13px] text-muted">
              {search
                ? "No matching secrets found."
                : "All available secrets are already in your vault."}
            </div>
          ) : (
            grouped.map(({ category, label, secrets }) => (
              <div key={category} className="mb-4 space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                  {label}
                </div>
                {secrets.map((s) => {
                  const enabledPlugins = s.usedBy.filter((u) => u.enabled);
                  const pluginList = s.usedBy
                    .map((u) => u.pluginName || u.pluginId)
                    .join(", ");
                  return (
                    <div
                      key={s.key}
                      className="flex items-start justify-between gap-3 rounded-xl border border-transparent px-3 py-2 hover:border-border/40 hover:bg-bg-hover"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="truncate text-[13px] font-mono text-txt">
                          {s.key}
                        </div>
                        <div
                          className="text-[11px] leading-5 text-muted"
                          title={pluginList}
                        >
                          {s.description}
                          {s.usedBy.length > 0 && (
                            <span className="ml-1">
                              —{" "}
                              {enabledPlugins.length > 0
                                ? `${enabledPlugins.length} active plugin${enabledPlugins.length !== 1 ? "s" : ""}`
                                : `${s.usedBy.length} plugin${s.usedBy.length !== 1 ? "s" : ""} (none active)`}
                            </span>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="default"
                        size="sm"
                        className="px-2.5 py-1 h-7 text-[12px] shadow-sm flex-shrink-0"
                        onClick={() => onAdd(s.key)}
                      >
                        {t("secretsview.Add")}
                      </Button>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Secret Card ────────────────────────────────────────────────────── */

function SecretCard({
  secret,
  draftValue,
  isVisible,
  isPinned,
  onToggleVisible,
  onDraftChange,
  onRemove,
}: {
  secret: SecretInfo;
  draftValue: string;
  isVisible: boolean;
  isPinned: boolean;
  onToggleVisible: () => void;
  onDraftChange: (val: string) => void;
  onRemove: () => void;
}) {
  const { t } = useApp();
  const enabledPlugins = secret.usedBy.filter((u) => u.enabled);
  const pluginList = secret.usedBy
    .map((u) => u.pluginName || u.pluginId)
    .join(", ");
  const hasDraft = draftValue.trim() !== "";

  // Only show "Required" if an enabled plugin actually requires it
  const showRequired = secret.required && enabledPlugins.length > 0;

  return (
    <div className={`${VAULT_PANEL_CLASSNAME} flex flex-col gap-3 p-4`}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="h-2 w-2 flex-shrink-0 rounded-full"
              style={{
                backgroundColor: secret.isSet ? "var(--ok)" : "var(--muted)",
              }}
            />
            <span className="truncate text-[13px] font-mono font-medium text-txt">
              {secret.key}
            </span>
          </div>
          <p className="mt-1 text-[12px] leading-snug text-muted">
            {secret.description}
          </p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-1.5">
          {showRequired && (
            <span className="rounded border border-danger/35 bg-danger/10 px-1.5 py-0.5 text-[10px] font-medium text-danger">
              {t("secretsview.Required")}
            </span>
          )}
          {/* Remove from vault — only if not set (set secrets always show) or if explicitly pinned */}
          {isPinned && !secret.isSet && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 rounded-md px-2 text-[11px] text-muted hover:bg-danger/10 hover:text-danger"
              onClick={onRemove}
              title={t("secretsview.RemoveFromVault")}
            >
              x
            </Button>
          )}
        </div>
      </div>

      {/* Used by */}
      <div
        className="break-words text-[11px] leading-5 text-muted"
        title={pluginList}
      >
        {enabledPlugins.length > 0
          ? `Used by ${enabledPlugins.length} active plugin${enabledPlugins.length !== 1 ? "s" : ""}: ${enabledPlugins.map((u) => u.pluginName || u.pluginId).join(", ")}`
          : `Available for: ${pluginList}`}
      </div>

      {/* Current value */}
      {secret.isSet && !hasDraft && (
        <div className="rounded-lg border border-border/50 bg-bg px-2 py-1 text-[12px] font-mono text-muted">
          {secret.maskedValue}
        </div>
      )}

      {/* Input */}
      <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
        <Input
          type={isVisible ? "text" : "password"}
          className="h-9 flex-1 border-border/60 bg-bg px-2.5 py-1.5 text-[13px] font-mono text-txt focus-visible:border-accent/50 focus-visible:ring-1 focus-visible:ring-accent/30"
          placeholder={
            secret.isSet ? "Enter new value to update" : "Enter value"
          }
          value={draftValue}
          onChange={(e) => onDraftChange(e.target.value)}
        />
        <Button
          variant="outline"
          size="sm"
          className="h-9 px-3 text-[12px] text-muted-strong shadow-sm hover:text-txt"
          onClick={onToggleVisible}
          title={isVisible ? "Hide" : "Show"}
        >
          {isVisible ? "Hide" : "Show"}
        </Button>
      </div>
    </div>
  );
}
