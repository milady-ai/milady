/**
 * Milady's own startup splash.
 *
 * Supplied to the elizaOS `App` via the `startupShell` boot-config slot (see
 * apps/app/src/main.tsx). Pure-CSS velvet gradient background — no video, no
 * webfont on the critical path. The display font enhances the wordmark once
 * loaded; the system fallback paints immediately. Lightning-fast by design.
 *
 * Intentionally self-contained and hardcodes "Milady" — it IS Milady's
 * component, not the brandable upstream StartupScreen.
 */
export interface MiladyStartupShellProps {
  phase?: string;
  status?: string;
}

export function MiladyStartupShell({ phase, status }: MiladyStartupShellProps) {
  return (
    <div
      data-testid="milady-startup-shell"
      data-startup-phase={phase}
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="fixed inset-0 flex items-center justify-center overflow-hidden"
      style={{
        background:
          "radial-gradient(120% 80% at 50% 0%, #17171a 0%, #0a0a0b 55%, #08080a 100%)",
        color: "#ece7df",
        fontFamily:
          "var(--font-display, 'Arial Narrow', system-ui, sans-serif)",
      }}
    >
      <div className="relative z-10 flex w-full max-w-[24rem] flex-col items-center gap-5 px-6 text-center">
        <div className="flex items-center justify-center gap-3">
          <span
            aria-hidden="true"
            style={{
              width: 10,
              height: 10,
              borderRadius: 9999,
              background: "#c9b38c",
              boxShadow: "0 0 18px rgba(201,179,140,0.45)",
            }}
          />
          <span
            style={{
              fontSize: "2.5rem",
              fontWeight: 600,
              letterSpacing: "0.02em",
              lineHeight: 1,
            }}
          >
            Milady
          </span>
        </div>
        {status ? (
          <p
            className="min-h-5 text-sm animate-pulse motion-reduce:animate-none"
            style={{
              color: "rgba(236,231,223,0.7)",
              fontFamily: "var(--font-mono, ui-monospace, monospace)",
              textTransform: "uppercase",
              letterSpacing: "0.12em",
            }}
          >
            {status}
          </p>
        ) : null}
        <div className="flex w-full max-w-[18rem] flex-col gap-2" aria-hidden>
          <div
            className="h-2.5 w-full rounded-sm animate-pulse motion-reduce:animate-none"
            style={{ background: "rgba(201,179,140,0.18)" }}
          />
          <div
            className="h-2.5 w-3/4 self-center rounded-sm animate-pulse motion-reduce:animate-none"
            style={{ background: "rgba(201,179,140,0.12)" }}
          />
          <div
            className="h-2.5 w-1/2 self-center rounded-sm animate-pulse motion-reduce:animate-none"
            style={{ background: "rgba(201,179,140,0.08)" }}
          />
        </div>
      </div>
    </div>
  );
}
