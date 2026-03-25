import { Button } from "@miladyai/ui";
import { useCallback, useState } from "react";
import { isElectrobunRuntime } from "../bridge";
import { useApp } from "../state";

export function RestartBanner() {
  const {
    pendingRestart,
    pendingRestartReasons,
    restartBannerDismissed,
    dismissRestartBanner,
    triggerRestart,
    t,
  } = useApp();

  const [restarting, setRestarting] = useState(false);

  const handleRestart = useCallback(async () => {
    setRestarting(true);
    try {
      await triggerRestart();
    } finally {
      setRestarting(false);
    }
  }, [triggerRestart]);

  if (!pendingRestart || restartBannerDismissed) return null;

  const reasons = pendingRestartReasons;
  const text =
    reasons.length === 1
      ? `${reasons[0]} - restart to apply.`
      : reasons.length > 1
        ? `${reasons.length} changes pending - restart to apply.`
        : "Restart required to apply changes.";

  return (
    <div
      className="fixed left-0 right-0 z-[9998] flex items-center justify-between gap-3 px-4 py-2 text-[13px] font-medium shadow-lg"
      style={{
        top: isElectrobunRuntime() ? 40 : 0,
        background: "color-mix(in srgb, var(--accent) 15%, var(--bg) 85%)",
        borderBottom:
          "1px solid color-mix(in srgb, var(--accent) 30%, transparent)",
        display: "flex",
        color: "var(--text)",
      }}
    >
      <span className="truncate">{text}</span>
      <div className="flex items-center gap-2 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={dismissRestartBanner}
          className="rounded px-3 py-1 text-[12px] text-muted hover:bg-[var(--bg-hover)]"
        >
          {t("restartbanner.Later")}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleRestart}
          disabled={restarting}
          className="rounded px-3 py-1 text-[12px] font-semibold border-transparent"
          style={{
            background: "var(--accent)",
            color: "var(--accent-foreground)",
          }}
        >
          {restarting ? "Restarting..." : "Restart Now"}
        </Button>
      </div>
    </div>
  );
}
