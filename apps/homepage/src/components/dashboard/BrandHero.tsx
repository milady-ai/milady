import { useT } from "../../providers/I18nProvider";

export type CloudOpenState = "idle" | "preparing";

export interface BrandHeroProps {
  isLocalReady: boolean;
  isLocalProbing: boolean;
  cloudState: CloudOpenState;
  onOpenLocal: () => void;
  onOpenCloud: () => void;
  onCancelCloud: () => void;
  onAttachRemote: () => void;
}

export function BrandHero({
  isLocalReady,
  isLocalProbing,
  cloudState,
  onOpenLocal,
  onOpenCloud,
  onCancelCloud,
  onAttachRemote,
}: BrandHeroProps) {
  const t = useT();
  const cloudPreparing = cloudState === "preparing";
  const primaryLabel = isLocalReady
    ? t("homepage.hero.primary.openLocal", { defaultValue: "open local" })
    : isLocalProbing
      ? t("homepage.hero.primary.lookingForLocal", {
          defaultValue: "looking for local\u2026",
        })
      : t("homepage.hero.primary.installMilady", {
          defaultValue: "install milady",
        });
  const primaryHint = isLocalReady
    ? t("homepage.hero.hint.localRunning", {
        defaultValue: "local \u00b7 running",
      })
    : isLocalProbing
      ? t("homepage.hero.hint.probingLocalhost", {
          defaultValue: "probing localhost",
        })
      : t("homepage.hero.hint.noLocalRuntime", {
          defaultValue: "no local runtime",
        });

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
          {t("homepage.hero.title", {
            defaultValue: "your agents, in one place.",
          })}
        </h1>

        <div className="mt-5 flex flex-wrap items-center gap-2.5 sm:mt-6 sm:gap-3">
          {isLocalReady ? (
            <button
              type="button"
              onClick={onOpenLocal}
              aria-label={t("homepage.hero.aria.openLocalRuntime", {
                defaultValue: "Open local Milady runtime",
              })}
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
                  ? t("homepage.hero.aria.probingLocal", {
                      defaultValue: "Probing for local Milady",
                    })
                  : t("homepage.hero.aria.noLocalDetected", {
                      defaultValue:
                        "No local runtime detected. Open install instructions.",
                    })
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
            onClick={cloudPreparing ? onCancelCloud : onOpenCloud}
            aria-label={
              cloudPreparing
                ? t("homepage.hero.aria.cancelOpenCloud", {
                    defaultValue: "Cancel opening Milady in the cloud",
                  })
                : t("homepage.hero.aria.openInCloud", {
                    defaultValue: "Open Milady in the cloud",
                  })
            }
            className={
              cloudPreparing
                ? "group/cloud inline-flex min-h-[44px] items-center gap-2 rounded-md border border-brand/35 bg-brand/[0.04] px-4 py-2.5 text-[13px] font-semibold text-brand/75 transition duration-200 hover:border-brand/55 hover:bg-brand/[0.08] hover:text-brand active:translate-y-0 active:scale-[0.98] sm:px-5 sm:py-3 [@media(hover:hover)]:hover:-translate-y-0.5"
                : "group/cloud inline-flex min-h-[44px] items-center gap-2 rounded-md border border-brand/35 bg-brand/[0.08] px-4 py-2.5 text-[13px] font-semibold text-brand transition duration-200 hover:border-brand/60 hover:bg-brand/[0.12] active:translate-y-0 active:scale-[0.98] sm:px-5 sm:py-3 [@media(hover:hover)]:hover:-translate-y-0.5"
            }
          >
            {cloudPreparing ? (
              <span
                aria-hidden="true"
                className="h-2 w-2 animate-pulse rounded-full bg-brand"
              />
            ) : (
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                width="14"
                height="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M17.5 19a4.5 4.5 0 0 0 0-9 6 6 0 0 0-11.6-1.6A4 4 0 0 0 6 18h11.5z" />
              </svg>
            )}
            <span>
              {cloudPreparing
                ? t("homepage.hero.cloudButton.cancel", {
                    defaultValue: "cancel opening",
                  })
                : t("homepage.hero.cloudButton.open", {
                    defaultValue: "open in cloud",
                  })}
            </span>
            <span
              aria-hidden="true"
              className="transition group-hover/cloud:translate-x-0.5"
            >
              {cloudPreparing ? "×" : "↗"}
            </span>
          </button>
          <button
            type="button"
            onClick={onAttachRemote}
            className="inline-flex min-h-[44px] items-center rounded-md border border-border bg-white/[0.04] px-4 py-2.5 text-[13px] font-medium text-white/85 transition duration-200 hover:border-white/25 hover:bg-white/[0.06] hover:text-white active:translate-y-0 active:scale-[0.98] sm:px-5 sm:py-3 [@media(hover:hover)]:hover:-translate-y-0.5"
          >
            {t("homepage.hero.attachRemote", {
              defaultValue: "attach remote",
            })}
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
