/**
 * Shared UI primitives for wallet dashboard.
 */
import { CheckIcon, CopyIcon, ExternalLinkIcon, WalletIcon } from "./icons";

// ── SectionHeader ───────────────────────────────────────────────────────

export function SectionHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-3">
      <h3 className="font-mono text-[10px] tracking-wider text-text-subtle font-semibold">
        {title}
      </h3>
      <div className="flex-1 h-px bg-border-subtle" />
    </div>
  );
}

// ── ChainBadge ──────────────────────────────────────────────────────────

export function ChainBadge({ chain, color }: { chain: string; color: string }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 font-mono text-[10px] tracking-wide border ${color}`}
    >
      {chain}
    </span>
  );
}

// ── AddressRow ──────────────────────────────────────────────────────────

export function AddressRow({
  label,
  address,
  field,
  copiedField,
  onCopy,
  explorerUrl,
}: {
  label: string;
  address: string;
  field: string;
  copiedField: string | null;
  onCopy: (text: string, field: string) => void;
  explorerUrl: string | null;
}) {
  return (
    <div className="border border-border bg-surface p-4">
      <dt className="font-mono text-[10px] tracking-wider text-text-subtle mb-2">
        {label}
      </dt>
      <dd className="flex items-center gap-2 flex-wrap">
        <code className="font-mono text-xs text-text-light bg-dark-secondary px-2 py-1 border border-border-subtle break-all">
          {address}
        </code>
        <button
          type="button"
          onClick={() => onCopy(address, field)}
          className={`shrink-0 p-1.5 border transition-all duration-150 ${
            copiedField === field
              ? "border-status-running/30 bg-status-running/10 text-status-running"
              : "border-border text-text-muted hover:text-text-light hover:border-text-muted"
          }`}
          title="Copy address"
        >
          {copiedField === field ? <CheckIcon /> : <CopyIcon />}
        </button>
        {explorerUrl && (
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 p-1.5 border border-border text-text-muted hover:text-brand hover:border-brand/30 transition-all duration-150"
            title="View on explorer"
          >
            <ExternalLinkIcon />
          </a>
        )}
      </dd>
    </div>
  );
}

// ── WalletsSkeleton ─────────────────────────────────────────────────────

export function WalletsSkeleton() {
  return (
    <div className="space-y-4 animate-[fade-up_0.4s_ease-out_both]">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="border border-border bg-surface p-4"
          style={{ animationDelay: `${i * 60}ms` }}
        >
          <div className="h-3 w-20 bg-surface-elevated animate-[shimmer_1.8s_ease-in-out_infinite] bg-[linear-gradient(90deg,var(--color-surface)_0%,var(--color-surface-elevated)_40%,var(--color-surface)_80%)] bg-[length:200%_100%] mb-3" />
          <div className="h-5 w-48 bg-surface-elevated animate-[shimmer_1.8s_ease-in-out_infinite] bg-[linear-gradient(90deg,var(--color-surface)_0%,var(--color-surface-elevated)_40%,var(--color-surface)_80%)] bg-[length:200%_100%]" />
        </div>
      ))}
    </div>
  );
}

// ── NoWalletState ───────────────────────────────────────────────────────

export function NoWalletState() {
  return (
    <div className="border border-border bg-surface p-8 text-center">
      <div className="w-12 h-12 mx-auto mb-4 border border-border-subtle bg-dark-secondary/30 flex items-center justify-center">
        <WalletIcon className="w-6 h-6 text-text-muted" />
      </div>
      <h3 className="font-mono text-sm text-text-light mb-2">
        NO WALLET CONFIGURED
      </h3>
      <p className="font-mono text-xs text-text-muted max-w-sm mx-auto leading-relaxed">
        This agent doesn&apos;t have a wallet set up yet. Configure wallet keys
        in the agent settings or connect a Steward instance to enable on-chain
        capabilities.
      </p>
    </div>
  );
}
