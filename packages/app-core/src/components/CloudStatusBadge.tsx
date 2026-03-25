import { Button } from "@miladyai/ui";
import { CircleDollarSign } from "lucide-react";
import type { CSSProperties } from "react";

const CLOUD_STATUS_BUTTON_STYLE = {
  clipPath: "none",
  WebkitClipPath: "none",
  touchAction: "manipulation",
} as const;

type CloudHeaderStatusKind =
  | "error"
  | "warning"
  | "low-credits"
  | "regular-credits";

interface ResolveCloudStatusBadgeStateArgs {
  connected: boolean;
  credits: number | null;
  creditsLow: boolean;
  creditsCritical: boolean;
  authRejected: boolean;
  creditsError?: string | null;
  t: (key: string) => string;
}

interface CloudStatusBadgeState {
  kind: CloudHeaderStatusKind;
  text: string;
  title: string;
}

export interface CloudStatusBadgeProps {
  connected: boolean;
  credits: number | null;
  creditsLow: boolean;
  creditsCritical: boolean;
  authRejected: boolean;
  creditsError?: string | null;
  compactOnMobile?: boolean;
  t: (key: string) => string;
  onClick: () => void;
  dataTestId?: string;
}

function trimTrailingZeroes(value: string): string {
  return value.replace(/\.0+$|(\.\d*[1-9])0+$/, "$1");
}

export function formatCompactCloudCredits(balance: number): string {
  const absoluteBalance = Math.abs(balance);
  const sign = balance < 0 ? "-" : "";

  if (absoluteBalance >= 1_000_000) {
    return `${sign}$${trimTrailingZeroes((absoluteBalance / 1_000_000).toFixed(1))}m`;
  }

  if (absoluteBalance >= 1_000) {
    return `${sign}$${trimTrailingZeroes((absoluteBalance / 1_000).toFixed(1))}k`;
  }

  if (absoluteBalance >= 100) {
    return `${sign}$${absoluteBalance.toFixed(0)}`;
  }

  if (absoluteBalance >= 10) {
    return `${sign}$${trimTrailingZeroes(absoluteBalance.toFixed(1))}`;
  }

  return `${sign}$${trimTrailingZeroes(absoluteBalance.toFixed(2))}`;
}

export function resolveCloudStatusBadgeState(
  args: ResolveCloudStatusBadgeStateArgs,
): CloudStatusBadgeState | null {
  const {
    connected,
    credits,
    creditsLow,
    creditsCritical,
    authRejected,
    creditsError,
    t,
  } = args;

  if (!connected) {
    return null;
  }

  if (authRejected) {
    return {
      kind: "error",
      text: t("logsview.Error"),
      title: t("header.elizaCloudAuthRejected"),
    };
  }

  if (typeof creditsError === "string" && creditsError.trim()) {
    return {
      kind: "warning",
      text: t("logsview.Warn"),
      title: creditsError.trim(),
    };
  }

  if (typeof credits === "number") {
    const formattedBalance = formatCompactCloudCredits(credits);
    const isLowCredits = creditsCritical || creditsLow;
    return {
      kind: isLowCredits ? "low-credits" : "regular-credits",
      text: formattedBalance,
      title: `${t("header.CloudCreditsBalanc")}: ${formattedBalance}`,
    };
  }

  return {
    kind: "warning",
    text: t("logsview.Warn"),
    title: t("header.CloudCreditsBalanc"),
  };
}

function resolveCloudStatusToneStyle(
  kind: CloudHeaderStatusKind,
): CSSProperties {
  const toneVar =
    kind === "regular-credits"
      ? "var(--ok)"
      : kind === "error"
        ? "var(--danger)"
        : "var(--warn)";

  return {
    borderColor: `color-mix(in srgb, ${toneVar} 34%, var(--border))`,
    background: `color-mix(in srgb, ${toneVar} 12%, var(--card))`,
    color: `color-mix(in srgb, var(--text-strong) 78%, ${toneVar} 22%)`,
  };
}

export function CloudStatusBadge(props: CloudStatusBadgeProps) {
  const {
    connected,
    credits,
    creditsLow,
    creditsCritical,
    authRejected,
    creditsError,
    compactOnMobile = false,
    t,
    onClick,
    dataTestId,
  } = props;

  const status = resolveCloudStatusBadgeState({
    connected,
    credits,
    creditsLow,
    creditsCritical,
    authRejected,
    creditsError,
    t,
  });

  if (!status) {
    return null;
  }

  const toneStyle = resolveCloudStatusToneStyle(status.kind);

  return (
    <Button
      variant="outline"
      data-testid={dataTestId}
      data-status={status.kind}
      className={`h-11 min-h-[44px] shrink-0 gap-1.5 rounded-xl px-2.5 text-[11px] font-mono no-underline shadow-sm transition-all duration-200 hover:border-[color:color-mix(in_srgb,var(--accent)_40%,var(--border))] hover:bg-[color:color-mix(in_srgb,var(--accent)_16%,var(--card))] hover:text-[color:color-mix(in_srgb,var(--text-strong)_84%,var(--accent)_16%)] hover:shadow-sm sm:text-xs ${compactOnMobile ? "max-[380px]:w-11 max-[380px]:justify-center max-[380px]:px-0" : ""}`}
      aria-label={status.title}
      title={status.title}
      onClick={onClick}
      style={{ ...CLOUD_STATUS_BUTTON_STYLE, ...toneStyle }}
    >
      <CircleDollarSign className="pointer-events-none h-3.5 w-3.5 shrink-0" />
      <span
        className={`pointer-events-none leading-none ${compactOnMobile ? "max-[380px]:hidden" : ""}`}
      >
        {status.text}
      </span>
    </Button>
  );
}
