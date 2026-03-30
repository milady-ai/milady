import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CloudApiClient,
  StewardTxRecord,
  StewardTxStatus,
} from "../../lib/cloud-api";

const STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: "", label: "ALL" },
  { value: "signed", label: "SIGNED" },
  { value: "pending", label: "PENDING" },
  { value: "confirmed", label: "CONFIRMED" },
  { value: "failed", label: "FAILED" },
  { value: "rejected", label: "DENIED" },
];

const STATUS_COLORS: Record<string, { text: string; bg: string }> = {
  signed: { text: "text-status-running", bg: "bg-status-running" },
  confirmed: { text: "text-status-running", bg: "bg-status-running" },
  broadcast: { text: "text-blue-400", bg: "bg-blue-500" },
  approved: { text: "text-status-running", bg: "bg-status-running" },
  pending: { text: "text-brand", bg: "bg-brand" },
  failed: { text: "text-status-stopped", bg: "bg-status-stopped" },
  rejected: { text: "text-status-stopped", bg: "bg-status-stopped" },
};

const PAGE_SIZE = 20;

// Chain ID → explorer base URL
const EXPLORER_URLS: Record<number, string> = {
  8453: "https://basescan.org/tx/",
  84532: "https://sepolia.basescan.org/tx/",
  56: "https://bscscan.com/tx/",
  97: "https://testnet.bscscan.com/tx/",
  1: "https://etherscan.io/tx/",
};

function getExplorerUrl(txHash: string, chainId?: number): string {
  const base = EXPLORER_URLS[chainId ?? 8453] ?? EXPLORER_URLS[8453];
  return `${base}${txHash}`;
}

function truncateAddress(addr: string): string {
  if (!addr || addr.length < 12) return addr || "—";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function formatTxDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
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

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API not available
    }
  }, [text]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      title="Copy address"
      className="ml-1 text-text-subtle hover:text-text-light transition-colors"
    >
      {copied ? (
        <svg
          aria-hidden="true"
          className="w-3 h-3 text-status-running"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M5 13l4 4L19 7"
          />
        </svg>
      ) : (
        <svg
          aria-hidden="true"
          className="w-3 h-3"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
          />
        </svg>
      )}
    </button>
  );
}

interface TransactionHistoryProps {
  client: CloudApiClient;
}

export function TransactionHistory({ client }: TransactionHistoryProps) {
  const [records, setRecords] = useState<StewardTxRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [offset, setOffset] = useState(0);
  const mountedRef = useRef(true);

  const fetchRecords = useCallback(
    async (newOffset: number, append: boolean) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);

      try {
        const result = await client.getStewardTxRecords({
          status: statusFilter || undefined,
          limit: PAGE_SIZE,
          offset: newOffset,
        });
        if (!mountedRef.current) return;
        if (append) {
          setRecords((prev) => [...prev, ...result.records]);
        } else {
          setRecords(result.records);
        }
        setTotal(result.total);
        setOffset(newOffset);
      } catch (err) {
        if (!mountedRef.current) return;
        const msg =
          err instanceof Error ? err.message : "Failed to load transactions";
        if (msg.includes("503") || msg.includes("not configured")) {
          setError(
            "Steward is not configured for this agent. Transaction history requires a connected Steward instance.",
          );
        } else {
          setError(msg);
        }
      } finally {
        if (mountedRef.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [client, statusFilter],
  );

  useEffect(() => {
    mountedRef.current = true;
    fetchRecords(0, false);
    return () => {
      mountedRef.current = false;
    };
  }, [fetchRecords]);

  const handleLoadMore = useCallback(() => {
    fetchRecords(offset + PAGE_SIZE, true);
  }, [fetchRecords, offset]);

  const hasMore = records.length < total;

  return (
    <div className="animate-[fade-up_0.4s_ease-out_both]">
      {/* Filter bar */}
      <div className="flex items-center gap-2 mb-4 overflow-x-auto">
        <span className="font-mono text-[9px] tracking-[0.15em] text-text-subtle shrink-0">
          FILTER:
        </span>
        {STATUS_FILTERS.map((f) => (
          <button
            type="button"
            key={f.value}
            onClick={() => setStatusFilter(f.value)}
            className={`shrink-0 px-3 py-1.5 font-mono text-[10px] tracking-wide border transition-colors
              ${
                statusFilter === f.value
                  ? "text-brand border-brand/30 bg-brand/5"
                  : "text-text-muted border-border hover:text-text-light hover:border-border"
              }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="border border-border bg-surface overflow-hidden">
        {/* Header */}
        <div className="hidden sm:grid grid-cols-[140px_1fr_1fr_100px_1fr] gap-px bg-border">
          {["DATE", "TO", "AMOUNT", "STATUS", "TX HASH"].map((h) => (
            <div
              key={h}
              className="bg-dark-secondary px-3 py-2 font-mono text-[9px] tracking-[0.15em] text-text-subtle"
            >
              {h}
            </div>
          ))}
        </div>

        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="w-4 h-4 rounded-full border-2 border-brand/30 border-t-brand animate-spin" />
            <span className="ml-3 font-mono text-xs text-text-muted">
              Loading transactions…
            </span>
          </div>
        )}

        {/* Error state */}
        {!loading && error && (
          <div className="p-6 text-center">
            <p className="font-mono text-xs text-status-stopped mb-2">
              {error}
            </p>
            <button
              type="button"
              onClick={() => fetchRecords(0, false)}
              className="font-mono text-[11px] text-brand hover:text-brand-hover transition-colors"
            >
              RETRY
            </button>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && records.length === 0 && (
          <div className="p-8 text-center">
            <div className="w-10 h-10 mx-auto mb-3 bg-surface-elevated border border-border flex items-center justify-center">
              <svg
                aria-hidden="true"
                className="w-5 h-5 text-text-subtle"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                />
              </svg>
            </div>
            <p className="font-mono text-sm text-text-light mb-1">
              NO TRANSACTIONS
            </p>
            <p className="font-mono text-xs text-text-muted">
              {statusFilter
                ? `No transactions with status "${statusFilter}"`
                : "No transaction history found for this agent"}
            </p>
          </div>
        )}

        {/* Records */}
        {!loading &&
          records.map((tx, i) => {
            const status = tx.status as StewardTxStatus;
            const colors = STATUS_COLORS[status] ?? STATUS_COLORS.signed;
            const toAddr = tx.request?.to;
            const value = tx.request?.value;
            const chainId = tx.request?.chainId;
            return (
              <div
                key={tx.id || `tx-${i}`}
                className="grid grid-cols-1 sm:grid-cols-[140px_1fr_1fr_100px_1fr] gap-px bg-border border-t border-border first:border-t-0"
              >
                {/* Date */}
                <div className="bg-surface px-3 py-2.5">
                  <span className="sm:hidden font-mono text-[9px] text-text-subtle tracking-wider mr-2">
                    DATE:
                  </span>
                  <span className="font-mono text-[11px] text-text-light tabular-nums">
                    {formatTxDate(tx.createdAt)}
                  </span>
                </div>

                {/* To address */}
                <div className="bg-surface px-3 py-2.5 flex items-center">
                  <span className="sm:hidden font-mono text-[9px] text-text-subtle tracking-wider mr-2">
                    TO:
                  </span>
                  {toAddr ? (
                    <span className="flex items-center">
                      <span className="font-mono text-[11px] text-text-light">
                        {truncateAddress(toAddr)}
                      </span>
                      <CopyButton text={toAddr} />
                    </span>
                  ) : (
                    <span className="font-mono text-[11px] text-text-muted">
                      —
                    </span>
                  )}
                </div>

                {/* Amount */}
                <div className="bg-surface px-3 py-2.5">
                  <span className="sm:hidden font-mono text-[9px] text-text-subtle tracking-wider mr-2">
                    AMOUNT:
                  </span>
                  <span className="font-mono text-[11px] text-text-light tabular-nums">
                    {formatValue(value ?? "0")}
                  </span>
                </div>

                {/* Status */}
                <div className="bg-surface px-3 py-2.5">
                  <span className="sm:hidden font-mono text-[9px] text-text-subtle tracking-wider mr-2">
                    STATUS:
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${colors.bg}`} />
                    <span
                      className={`font-mono text-[10px] tracking-wide ${colors.text}`}
                    >
                      {status.toUpperCase()}
                    </span>
                  </span>
                </div>

                {/* Tx Hash */}
                <div className="bg-surface px-3 py-2.5">
                  <span className="sm:hidden font-mono text-[9px] text-text-subtle tracking-wider mr-2">
                    HASH:
                  </span>
                  {tx.txHash ? (
                    <a
                      href={getExplorerUrl(tx.txHash, chainId)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-[11px] text-brand hover:text-brand-hover transition-colors inline-flex items-center gap-1"
                    >
                      {truncateAddress(tx.txHash)}
                      <svg
                        aria-hidden="true"
                        className="w-3 h-3"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25"
                        />
                      </svg>
                    </a>
                  ) : (
                    <span className="font-mono text-[11px] text-text-muted">
                      —
                    </span>
                  )}
                </div>
              </div>
            );
          })}

        {/* Load more */}
        {!loading && hasMore && (
          <div className="p-3 bg-dark-secondary border-t border-border text-center">
            <button
              type="button"
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="inline-flex items-center gap-2 px-4 py-2 font-mono text-[11px] tracking-wide
                text-brand hover:text-brand-hover border border-brand/20 hover:border-brand/40
                transition-colors disabled:opacity-40"
            >
              {loadingMore ? (
                <>
                  <div className="w-3 h-3 rounded-full border border-brand/30 border-t-brand animate-spin" />
                  LOADING…
                </>
              ) : (
                <>
                  LOAD MORE
                  <span className="text-text-subtle">
                    ({records.length}/{total})
                  </span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
