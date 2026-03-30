/**
 * PolicyControls — transaction policy management UI for Steward wallets.
 *
 * Sub-components live in ./policy-controls/ to keep each file under 500 LOC.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CloudApiClient,
  StewardPolicyRule,
  StewardPolicyType,
} from "../../lib/cloud-api";
import { PolicyCard } from "./policy-controls/PolicyCard";
import {
  generatePolicyId,
  getDefaultConfig,
  POLICY_TYPE_META,
} from "./policy-controls/types";

// ── Component ───────────────────────────────────────────────────────────

interface PolicyControlsProps {
  client: CloudApiClient;
}

export function PolicyControls({ client }: PolicyControlsProps) {
  const [policies, setPolicies] = useState<StewardPolicyRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [dirty, setDirty] = useState(false);
  const mountedRef = useRef(true);

  const fetchPolicies = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await client.getStewardPolicies();
      if (!mountedRef.current) return;
      setPolicies(Array.isArray(result) ? result : []);
      setDirty(false);
    } catch (err) {
      if (!mountedRef.current) return;
      const msg =
        err instanceof Error ? err.message : "Failed to load policies";
      if (msg.includes("503") || msg.includes("not configured")) {
        setError(
          "Steward is not configured for this agent. Configure STEWARD_API_URL and STEWARD_AGENT_ID in agent settings.",
        );
      } else {
        setError(msg);
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    mountedRef.current = true;
    fetchPolicies();
    return () => {
      mountedRef.current = false;
    };
  }, [fetchPolicies]);

  const handleToggle = useCallback((index: number) => {
    setPolicies((prev) =>
      prev.map((p, i) => (i === index ? { ...p, enabled: !p.enabled } : p)),
    );
    setDirty(true);
  }, []);

  const handleConfigChange = useCallback(
    (index: number, key: string, value: unknown) => {
      setPolicies((prev) =>
        prev.map((p, i) =>
          i === index ? { ...p, config: { ...p.config, [key]: value } } : p,
        ),
      );
      setDirty(true);
    },
    [],
  );

  const handleAddPolicy = useCallback((type: StewardPolicyType) => {
    const newPolicy: StewardPolicyRule = {
      id: generatePolicyId(type),
      type,
      enabled: true,
      config: getDefaultConfig(type),
    };
    setPolicies((prev) => [...prev, newPolicy]);
    setDirty(true);
  }, []);

  const handleRemovePolicy = useCallback((index: number) => {
    setPolicies((prev) => prev.filter((_, i) => i !== index));
    setDirty(true);
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      await client.setStewardPolicies(policies);
      if (!mountedRef.current) return;
      setDirty(false);
      setSaveSuccess(true);
      setTimeout(() => {
        if (mountedRef.current) setSaveSuccess(false);
      }, 3000);
    } catch (err) {
      if (!mountedRef.current) return;
      setSaveError(
        err instanceof Error ? err.message : "Failed to save policies",
      );
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  }, [client, policies]);

  // Loading state
  if (loading) {
    return (
      <div className="animate-[fade-up_0.4s_ease-out_both]">
        <div className="border border-border bg-surface p-8 flex items-center justify-center">
          <div className="w-4 h-4 rounded-full border-2 border-brand/30 border-t-brand animate-spin" />
          <span className="ml-3 font-mono text-xs text-text-muted">
            Loading policies…
          </span>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="animate-[fade-up_0.4s_ease-out_both]">
        <div className="border border-status-stopped/20 bg-status-stopped/5 p-6 text-center">
          <div className="w-10 h-10 mx-auto mb-3 bg-status-stopped/10 border border-status-stopped/20 flex items-center justify-center">
            <svg
              aria-hidden="true"
              className="w-5 h-5 text-status-stopped"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
              />
            </svg>
          </div>
          <p className="font-mono text-xs text-status-stopped mb-3">{error}</p>
          <button
            type="button"
            onClick={fetchPolicies}
            className="font-mono text-[11px] text-brand hover:text-brand-hover transition-colors"
          >
            RETRY
          </button>
        </div>
      </div>
    );
  }

  const existingTypes = new Set(policies.map((p) => p.type));
  const availableTypes = (
    Object.keys(POLICY_TYPE_META) as StewardPolicyType[]
  ).filter((t) => !existingTypes.has(t));

  return (
    <div className="animate-[fade-up_0.4s_ease-out_both] space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="font-mono text-[10px] tracking-wider text-text-subtle font-semibold">
            TRANSACTION POLICIES
          </h3>
          <div className="flex-1 h-px bg-border-subtle" />
        </div>
        <div className="flex items-center gap-2">
          {dirty && (
            <span className="font-mono text-[9px] text-brand animate-[status-pulse_2s_ease-in-out_infinite]">
              UNSAVED CHANGES
            </span>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty || saving}
            className={`flex items-center gap-2 px-4 py-2 font-mono text-[11px] tracking-wide border transition-colors
              ${
                dirty
                  ? "text-brand border-brand/30 bg-brand/8 hover:bg-brand/15"
                  : "text-text-subtle border-border bg-surface opacity-50 cursor-not-allowed"
              } disabled:opacity-40`}
          >
            {saving ? (
              <div className="w-3 h-3 rounded-full border border-brand/30 border-t-brand animate-spin" />
            ) : saveSuccess ? (
              <svg
                aria-hidden="true"
                className="w-3.5 h-3.5 text-status-running"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            ) : null}
            {saveSuccess ? "SAVED" : "SAVE POLICIES"}
          </button>
        </div>
      </div>

      {/* Save error */}
      {saveError && (
        <div className="px-3 py-2 border border-status-stopped/20 bg-status-stopped/5">
          <p className="font-mono text-[11px] text-status-stopped">
            {saveError}
          </p>
        </div>
      )}

      {/* Policy list */}
      {policies.length === 0 ? (
        <div className="border border-border bg-surface p-8 text-center">
          <div className="w-10 h-10 mx-auto mb-3 bg-surface-elevated border border-border flex items-center justify-center">
            <span className="text-xl">🛡️</span>
          </div>
          <p className="font-mono text-sm text-text-light mb-1">NO POLICIES</p>
          <p className="font-mono text-xs text-text-muted mb-4">
            Add transaction policies to control how your agent spends funds.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {policies.map((policy, index) => (
            <PolicyCard
              key={policy.id}
              policy={policy}
              onToggle={() => handleToggle(index)}
              onConfigChange={(key, value) =>
                handleConfigChange(index, key, value)
              }
              onRemove={() => handleRemovePolicy(index)}
            />
          ))}
        </div>
      )}

      {/* Add policy */}
      {availableTypes.length > 0 && (
        <div className="border border-dashed border-border bg-surface/50 p-4">
          <p className="font-mono text-[9px] tracking-wider text-text-subtle mb-3">
            ADD POLICY
          </p>
          <div className="flex flex-wrap gap-2">
            {availableTypes.map((type) => {
              const meta = POLICY_TYPE_META[type];
              return (
                <button
                  type="button"
                  key={type}
                  onClick={() => handleAddPolicy(type)}
                  className="flex items-center gap-2 px-3 py-2 font-mono text-[10px] tracking-wide
                    text-text-muted border border-border hover:text-text-light hover:border-text-muted
                    transition-colors"
                >
                  <span>{meta.icon}</span>
                  {meta.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
