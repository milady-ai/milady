import { Button, Z_SYSTEM_BANNER } from "@miladyai/ui";
import { useEffect, useRef } from "react";
import { useApp } from "../../state";

const AUTO_DISMISS_MS = 20_000;

/**
 * Renders yellow warning banners for system-level warnings
 * broadcast via WebSocket `system-warning` events.
 */
export function SystemWarningBanner() {
  const { systemWarnings, dismissSystemWarning, backendConnection } = useApp();
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  useEffect(() => {
    if (!systemWarnings?.length) return;
    const timers = timersRef.current;
    for (const message of systemWarnings) {
      if (!timers.has(message)) {
        const timer = setTimeout(() => {
          timers.delete(message);
          dismissSystemWarning(message);
        }, AUTO_DISMISS_MS);
        timers.set(message, timer);
      }
    }
    for (const [msg, timer] of timers) {
      if (!systemWarnings.includes(msg)) {
        clearTimeout(timer);
        timers.delete(msg);
      }
    }
  }, [systemWarnings, dismissSystemWarning]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, []);

  if (!systemWarnings?.length) return null;

  const connectionBannerVisible =
    backendConnection?.state === "reconnecting" ||
    backendConnection?.state === "failed";
  const baseTop = connectionBannerVisible ? 36 : 0;

  return (
    <>
      {systemWarnings.map((message, index) => (
        <div
          key={message}
          role="alert"
          aria-live="assertive"
          className={`fixed left-0 right-0 z-[${Z_SYSTEM_BANNER}] flex items-center justify-between gap-3 bg-warn px-4 py-2 text-[13px] font-medium text-[color:var(--accent-foreground)] shadow-lg`}
          style={{ top: `${baseTop + index * 36}px` }}
        >
          <span className="truncate">{message}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => dismissSystemWarning(message)}
            className="shrink-0 rounded px-2 py-0.5 text-[12px] text-[color:var(--accent-foreground)]/80 hover:bg-black/10"
          >
            x
          </Button>
        </div>
      ))}
    </>
  );
}
