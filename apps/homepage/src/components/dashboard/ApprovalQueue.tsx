import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CloudApiClient,
  StewardPendingApproval,
  StewardPolicyResult,
} from "../../lib/cloud-api";

const POLL_INTERVAL_MS = 10_000;

function truncateAddress(addr: string): string {
  if (!addr || addr.length < 12) return addr || "—";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function formatValue(value: string): string {
  if (!value || value === "0") return "0 ETH";
  try {
    const wei = BigInt(value);
    const eth = Number(wei) / 1e18;
    if (eth === 0) return "0 ETH";
    if (eth < 0.0001) return "<0.0001 ETH";
    return `${eth.toFixed(4)} ETH`;
  } catch {
    return value;
  }
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

function PolicyTag({ policy }: { policy: StewardPolicyResult }) {
  const label = (policy.name || policy.policyId || "policy")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
  const passed = policy.status === "approved";
  return (
    <span
      title={policy.reason || (passed ? "Passed" : "Blocked")}
      className={`inline-flex items-center gap-1 px-2 py-0.5 font-mono text-[9px] tracking-wide border
        ${
          passed
            ? "text-status-running border-status-running/20 bg-status-running/5"
            : "text-status-stopped border-status-stopped/20 bg-status-stopped/5"
        }`}
    >
      <span
        className={`w-1 h-1 rounded-full ${passed ? "bg-status-running" : "bg-status-stopped"}`}
      />
      {label}
    </span>
  );
}

interface ApprovalQueueProps {
  client: CloudApiClient;
}

export function ApprovalQueue({ client }: ApprovalQueueProps) {
  const [pending, setPending] = useState<StewardPendingApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchPending = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      setError(null);
      try {
        const result = await client.getStewardPendingApprovals();
        if (!mountedRef.current) return;
        setPending(Array.isArray(result) ? result : []);
      } catch (err) {
        if (!mountedRef.current) return;
        const msg =
          err instanceof Error ? err.message : "Failed to load approvals";
        if (msg.includes("503") || msg.includes("not configured")) {
          setError(
            "Steward is not configured for this agent. Approval queue requires a connected Steward instance.",
          );
        } else {
          setError(msg);
        }
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    },
    [client],
  );

  useEffect(() => {
    mountedRef.current = true;
    fetchPending(false);

    // Poll every 10s
    intervalRef.current = setInterval(
      () => fetchPending(true),
      POLL_INTERVAL_MS,
    );

    return () => {
      mountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [fetchPending]);

  const handleAction = useCallback(
    async (txId: string, action: "approve" | "deny") => {
      setActionLoading(txId);
      setActionError(null);
      try {
        if (action === "approve") {
          await client.approveStewardTx(txId);
        } else {
          await client.denyStewardTx(txId);
        }
        // Remove from list optimistically
        setPending((prev) => prev.filter((p) => p.transaction.id !== txId));
      } catch (err) {
        setActionError(
          err instanceof Error
            ? err.message
            : `Failed to ${action} transaction`,
        );
      } finally {
        setActionLoading(null);
      }
    },
    [client],
  );

  return (
    <div className="animate-[fade-up_0.4s_ease-out_both]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[9px] tracking-[0.15em] text-text-subtle">
            PENDING APPROVALS
          </span>
          {pending.length > 0 && (
            <span className="flex items-center gap-1.5 px-2 py-0.5 bg-brand/10 border border-brand/20">
              <span className="w-1.5 h-1.5 rounded-full bg-brand animate-[status-pulse_2s_ease-in-out_infinite]" />
              <span className="font-mono text-[10px] text-brand font-medium">
                {pending.length}
              </span>
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => fetchPending(false)}
          disabled={loading}
          className="font-mono text-[10px] text-text-subtle hover:text-text-light transition-colors disabled:opacity-40"
        >
          ↻ REFRESH
        </button>
      </div>

      {/* Loading */}
      {loading && pending.length === 0 && (
        <div className="border border-border bg-surface p-8 flex items-center justify-center">
          <div className="w-4 h-4 rounded-full border-2 border-brand/30 border-t-brand animate-spin" />
          <span className="ml-3 font-mono text-xs text-text-muted">
            Checking approval queue…
          </span>
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="border border-status-stopped/20 bg-status-stopped/5 p-4 text-center">
          <p className="font-mono text-xs text-status-stopped mb-2">{error}</p>
          <button
            type="button"
            onClick={() => fetchPending(false)}
            className="font-mono text-[11px] text-brand hover:text-brand-hover transition-colors"
          >
            RETRY
          </button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && pending.length === 0 && (
        <div className="border border-border bg-surface p-8 text-center">
          <div className="w-10 h-10 mx-auto mb-3 bg-status-running/10 border border-status-running/20 flex items-center justify-center">
            <svg
              aria-hidden="true"
              className="w-5 h-5 text-status-running"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <p className="font-mono text-sm text-text-light mb-1">ALL CLEAR</p>
          <p className="font-mono text-xs text-text-muted">
            No transactions pending approval. Polling every 10s.
          </p>
        </div>
      )}

      {/* Action-level error */}
      {actionError && (
        <div className="mb-3 px-3 py-2 border border-status-stopped/20 bg-status-stopped/5">
          <p className="font-mono text-[11px] text-status-stopped">
            {actionError}
          </p>
        </div>
      )}

      {/* Pending items */}
      <div className="space-y-3">
        {pending.map((entry) => {
          const tx = entry.transaction;
          const txId = tx.id;
          const isProcessing = actionLoading === txId;
          const toAddr = tx.request?.to;
          const value = tx.request?.value;
          const chainId = tx.request?.chainId;
          return (
            <div
              key={entry.queueId}
              className="border border-brand/20 bg-surface overflow-hidden"
            >
              {/* Accent bar */}
              <div className="h-0.5 bg-brand animate-[status-pulse_2s_ease-in-out_infinite]" />

              <div className="p-4">
                {/* Top row: agent + timestamp */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-text-light font-medium">
                      {tx.agentId ? truncateAddress(tx.agentId) : "Agent"}
                    </span>
                  </div>
                  <span className="font-mono text-[10px] text-text-subtle tabular-nums">
                    {formatDate(entry.requestedAt || tx.createdAt)}
                  </span>
                </div>

                {/* Transaction details grid */}
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-px bg-border mb-3">
                  <div className="bg-dark-secondary/50 px-3 py-2">
                    <p className="font-mono text-[9px] tracking-wider text-text-subtle mb-0.5">
                      TO
                    </p>
                    <p className="font-mono text-xs text-text-light">
                      {truncateAddress(toAddr ?? "")}
                    </p>
                  </div>
                  <div className="bg-dark-secondary/50 px-3 py-2">
                    <p className="font-mono text-[9px] tracking-wider text-text-subtle mb-0.5">
                      AMOUNT
                    </p>
                    <p className="font-mono text-xs text-brand tabular-nums">
                      {formatValue(value ?? "0")}
                    </p>
                  </div>
                  {chainId && (
                    <div className="bg-dark-secondary/50 px-3 py-2">
                      <p className="font-mono text-[9px] tracking-wider text-text-subtle mb-0.5">
                        CHAIN
                      </p>
                      <p className="font-mono text-xs text-text-light">
                        {chainId === 8453
                          ? "BASE"
                          : chainId === 84532
                            ? "BASE SEPOLIA"
                            : chainId === 56
                              ? "BSC"
                              : `CHAIN ${chainId}`}
                      </p>
                    </div>
                  )}
                </div>

                {/* Policy results */}
                {tx.policyResults && tx.policyResults.length > 0 && (
                  <div className="mb-3">
                    <p className="font-mono text-[9px] tracking-wider text-text-subtle mb-1.5">
                      POLICY CHECK
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {tx.policyResults.map((pr: StewardPolicyResult) => (
                        <PolicyTag
                          key={`${pr.policyId || pr.name || "policy"}-${pr.status}`}
                          policy={pr}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex items-center gap-2 pt-3 border-t border-border">
                  <button
                    type="button"
                    onClick={() => handleAction(txId, "approve")}
                    disabled={isProcessing}
                    className="flex items-center gap-2 px-4 py-2.5 font-mono text-[11px] tracking-wide
                      bg-status-running/10 text-status-running border border-status-running/20
                      hover:bg-status-running/20 transition-colors disabled:opacity-40"
                  >
                    {isProcessing ? (
                      <div className="w-3 h-3 rounded-full border border-emerald-400/30 border-t-emerald-400 animate-spin" />
                    ) : (
                      <svg
                        aria-hidden="true"
                        className="w-3.5 h-3.5"
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
                    )}
                    APPROVE
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAction(txId, "deny")}
                    disabled={isProcessing}
                    className="flex items-center gap-2 px-4 py-2.5 font-mono text-[11px] tracking-wide
                      bg-status-stopped/10 text-status-stopped border border-status-stopped/20
                      hover:bg-status-stopped/20 transition-colors disabled:opacity-40"
                  >
                    {isProcessing ? (
                      <div className="w-3 h-3 rounded-full border border-red-400/30 border-t-red-400 animate-spin" />
                    ) : (
                      <svg
                        aria-hidden="true"
                        className="w-3.5 h-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    )}
                    DENY
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
