import { Button, ConnectionStatus } from "@miladyai/ui";
import { useApp } from "../../state";

export type CloudSourceMode = "cloud" | "own-key";

export function CloudSourceModeToggle({
  mode,
  onChange,
  cloudLabel = "Eliza Cloud",
  ownKeyLabel = "Own API Key",
}: {
  mode: CloudSourceMode;
  onChange: (mode: CloudSourceMode) => void;
  cloudLabel?: string;
  ownKeyLabel?: string;
}) {
  const resolvedCloudLabel = cloudLabel;
  return (
    <div className="inline-flex overflow-hidden rounded-lg bg-[var(--bg-muted)] shadow-sm">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
          mode === "cloud"
            ? "bg-[var(--accent)] text-[var(--accent-foreground)] hover:bg-[var(--accent)]/90 hover:text-[var(--accent-foreground)]"
            : "bg-transparent text-[var(--muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
        }`}
        onClick={() => onChange("cloud")}
      >
        {resolvedCloudLabel}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
          mode === "own-key"
            ? "bg-[var(--accent)] text-[var(--accent-foreground)] hover:bg-[var(--accent)]/90 hover:text-[var(--accent-foreground)]"
            : "bg-transparent text-[var(--muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
        }`}
        onClick={() => onChange("own-key")}
      >
        {ownKeyLabel}
      </Button>
    </div>
  );
}

export function CloudConnectionStatus({
  connected,
  connectedText,
  disconnectedText,
}: {
  connected: boolean;
  connectedText?: string;
  disconnectedText: string;
}) {
  const { t } = useApp();
  const resolvedConnectedText = connectedText ?? "Connected to Eliza Cloud";
  return (
    <div
      className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-bg-muted/90 px-3 py-2.5"
      role="status"
      aria-live="polite"
    >
      <ConnectionStatus
        state={connected ? "connected" : "disconnected"}
        label={connected ? resolvedConnectedText : disconnectedText}
        className="border-0 bg-transparent px-0 py-0 shadow-none"
      />
      <span
        className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${
          connected
            ? "border-ok/30 bg-ok-subtle text-txt"
            : "border-warn/35 bg-warn-subtle text-txt"
        }`}
      >
        {connected ? t("appsview.Active") : t("cloudsourcecontrols.Offline")}
      </span>
    </div>
  );
}
