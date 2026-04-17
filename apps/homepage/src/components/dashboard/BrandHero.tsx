export interface BrandHeroProps {
  isLocalReady: boolean;
  isLocalProbing: boolean;
  onOpenLocal: () => void;
  onAttachRemote: () => void;
}

export function BrandHero({
  isLocalReady,
  isLocalProbing,
  onOpenLocal,
  onAttachRemote,
}: BrandHeroProps) {
  const primaryLabel = isLocalReady
    ? "open local"
    : isLocalProbing
      ? "looking for local\u2026"
      : "install milady";
  const primaryHint = isLocalReady
    ? "local \u00b7 running"
    : isLocalProbing
      ? "probing localhost"
      : "no local runtime";

  return (
    <section className="relative isolate overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-20 -top-24 h-[320px] w-[320px] opacity-[0.16] blur-3xl sm:-right-32 sm:-top-28 sm:h-[420px] sm:w-[420px] sm:opacity-[0.18] md:-right-40 md:h-[520px] md:w-[520px] md:opacity-[0.22]"
        style={{
          background:
            "radial-gradient(circle at center, rgba(240,185,11,0.12) 0%, transparent 72%)",
        }}
      />

      <div className="relative max-w-[56ch]">
        <h1 className="text-[30px] font-semibold leading-[1.08] tracking-[-0.025em] text-white/95 sm:text-[40px] md:text-[48px] lg:text-[56px]">
          your agents, in one place.
        </h1>

        <div className="mt-5 flex flex-wrap items-center gap-2.5 sm:mt-6 sm:gap-3">
          {isLocalReady ? (
            <button
              type="button"
              onClick={onOpenLocal}
              aria-label="Open local Milady runtime"
              className="group inline-flex min-h-[44px] items-center gap-2 rounded-md px-4 py-2.5 text-[13px] font-semibold text-black shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_10px_24px_-10px_rgba(240,185,11,0.55)] transition duration-200 active:translate-y-0 active:scale-[0.98] sm:px-5 sm:py-3 [@media(hover:hover)]:hover:-translate-y-0.5"
              style={{ background: "var(--gold-gradient-primary)" }}
            >
              <span>{primaryLabel}</span>
              <span
                aria-hidden="true"
                className="transition group-hover:translate-x-0.5"
              >
                →
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenLocal}
              aria-label={
                isLocalProbing
                  ? "Probing for local Milady"
                  : "No local runtime detected. Open install instructions."
              }
              className="group inline-flex min-h-[44px] items-center gap-2 rounded-md border border-white/12 bg-white/[0.04] px-4 py-2.5 text-[13px] font-medium text-white transition duration-200 hover:border-brand/40 hover:bg-white/[0.06] active:translate-y-0 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 sm:px-5 sm:py-3 [@media(hover:hover)]:hover:-translate-y-0.5"
            >
              {isLocalProbing ? (
                <span
                  aria-hidden="true"
                  className="h-2 w-2 animate-pulse rounded-full bg-brand/80"
                />
              ) : null}
              <span>{primaryLabel}</span>
              <span
                aria-hidden="true"
                className="text-white/45 transition group-hover:translate-x-0.5 group-hover:text-white"
              >
                →
              </span>
            </button>
          )}
          <button
            type="button"
            onClick={onAttachRemote}
            className="inline-flex min-h-[44px] items-center rounded-md border border-border bg-white/[0.04] px-4 py-2.5 text-[13px] font-medium text-white/85 transition duration-200 hover:border-white/25 hover:bg-white/[0.06] hover:text-white active:translate-y-0 active:scale-[0.98] sm:px-5 sm:py-3 [@media(hover:hover)]:hover:-translate-y-0.5"
          >
            attach remote
          </button>
          {isLocalProbing ? (
            <span
              aria-live="polite"
              className="font-mono text-[11px] lowercase tracking-[0.06em] text-white/45"
            >
              {primaryHint}
            </span>
          ) : null}
        </div>
      </div>
    </section>
  );
}
