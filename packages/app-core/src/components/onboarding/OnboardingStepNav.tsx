/**
 * Left-rail step list for the onboarding wizard.
 * WHY getOnboardingNavMetas from flow.ts: sidebar order and labels must match
 * the same track as handleOnboardingNext/Back. WHY buttons only for completed
 * steps: backward-only jumps—forward jumps would bypass finish/login validation
 * (enforced in AppContext via canRevertOnboardingTo).
 */
import { useApp } from "@miladyai/app-core/state";
import { Button } from "@miladyai/ui";
import type { CSSProperties } from "react";
import { useBranding } from "../../config/branding";
import { getOnboardingNavMetas } from "../../onboarding/flow";

export function OnboardingStepNav() {
  const { onboardingStep, handleOnboardingJumpToStep, t } = useApp();
  const branding = useBranding();

  const isCloudOnly = !!branding.cloudOnly;
  const activeSteps = getOnboardingNavMetas(onboardingStep, isCloudOnly);

  const currentIndex = activeSteps.findIndex((s) => s.id === onboardingStep);
  const connectorCount = Math.max(activeSteps.length - 1, 1);
  const connectorHeight =
    currentIndex <= 0
      ? "0px"
      : `calc((100% - 52px) * ${Math.min(currentIndex, connectorCount)} / ${connectorCount})`;

  return (
    <div className="absolute left-0 top-0 bottom-0 z-10 flex min-h-0 w-full max-w-[18.75rem] flex-col justify-center py-[clamp(1rem,5vh,3rem)] pl-[clamp(1rem,4vw,2.5rem)] pr-0 max-lg:max-w-[16rem] max-lg:pl-6 max-md:relative max-md:max-w-none max-md:items-stretch max-md:px-4 max-md:-mb-12 max-md:pb-1 max-md:pt-1">
      <div className="w-full relative isolate rounded-[28px] border border-[var(--onboarding-nav-border,rgba(201,204,209,0.12))] bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.012)_26%,transparent_52%),linear-gradient(180deg,rgba(11,14,20,0.18),rgba(11,14,20,0.04)),var(--onboarding-panel-bg)] ring-1 ring-white/6 px-[26px] py-[30px] shadow-[var(--onboarding-nav-shadow,0_16px_40px_rgba(0,0,0,0.24))] backdrop-blur-[30px] backdrop-saturate-[1.18] before:pointer-events-none before:absolute before:inset-[1px] before:rounded-[calc(28px-1px)] before:bg-[linear-gradient(180deg,rgba(255,255,255,0.025),transparent_22%)] before:content-[''] max-md:max-w-[calc(100vw-32px)] max-md:overflow-x-auto max-md:rounded-[22px] max-md:before:rounded-[calc(22px-1px)] max-md:px-2.5 max-md:py-2">
        <ul
          aria-label={t("onboarding.stepNavigation")}
          style={
            {
              "--tw-after-height": connectorHeight,
            } as CSSProperties
          }
          {...{
            className: `onboarding-step-list relative flex flex-col max-md:min-w-max max-md:flex-row max-md:items-center max-md:justify-between max-md:gap-2 before:absolute before:bottom-[26px] before:left-[7px] before:top-[26px] before:w-[1px] before:bg-gradient-to-b before:from-[rgba(255,255,255,0.08)] before:via-[rgba(255,255,255,0.14)] before:to-[rgba(255,255,255,0.06)] before:z-0 after:absolute after:left-[7px] after:top-[26px] after:z-0 after:h-[var(--tw-after-height)] after:w-[1px] after:bg-gradient-to-b after:from-accent/70 after:to-accent/18 after:transition-all after:duration-[800ms] after:ease-[cubic-bezier(0.25,0.46,0.45,0.94)] max-md:before:hidden max-md:after:hidden`,
          }}
        >
          {activeSteps.map((step, i) => {
            const isDone = i < currentIndex;
            const isActive = i === currentIndex;
            const isClickable = isDone;

            const stateClass = isDone
              ? "onboarding-step-item--done"
              : isActive
                ? "onboarding-step-item--active"
                : "";
            const rowClass = `onboarding-step-item ${stateClass} relative group flex min-h-[44px] w-full items-center gap-[18px] py-[15px] pr-2 max-lg:gap-4 max-md:h-11 max-md:w-11 max-md:min-w-[44px] max-md:justify-center max-md:rounded-[14px] max-md:border max-md:px-0 max-md:py-0 ${isDone ? "max-md:border-[rgba(240,185,11,0.2)] max-md:bg-[rgba(240,185,11,0.06)]" : isActive ? "max-md:border-[rgba(240,185,11,0.38)] max-md:bg-[rgba(240,185,11,0.12)]" : "max-md:border-[rgba(255,255,255,0.08)] max-md:bg-[rgba(255,255,255,0.02)]"} ${isClickable ? "onboarding-step-item--clickable m-0 h-auto cursor-pointer justify-start rounded-none border-none bg-transparent px-0 text-left text-inherit hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(242,210,122,0.78)] focus-visible:ring-offset-2 focus-visible:ring-offset-[rgba(8,10,14,0.92)] max-md:hover:border-[rgba(240,185,11,0.3)] max-md:hover:bg-[rgba(240,185,11,0.1)]" : "pointer-events-none max-md:pointer-events-auto"}`;

            // Dot classes
            let dotClass =
              "onboarding-step-dot w-[14px] h-[14px] border border-[var(--onboarding-nav-card-border,rgba(201,204,209,0.18))] rotate-45 shrink-0 relative z-10 bg-[var(--onboarding-nav-card-bg,rgba(30,31,35,0.88))] transition-all duration-500 ease-[cubic-bezier(0.25,0.46,0.45,0.94)]";
            if (isDone) {
              dotClass +=
                " !bg-[var(--onboarding-accent-bg,rgba(207,175,90,0.22))] !border-[var(--onboarding-accent-border-hover,rgba(242,210,122,0.4))]";
            } else if (isActive) {
              dotClass +=
                " !bg-accent !border-[rgba(255,248,220,0.9)] shadow-[0_0_12px_rgba(240,185,11,0.5)] animate-[onboarding-dot-pulse_2s_ease-in-out_infinite]";
            }

            // Name classes
            let nameClass =
              "onboarding-step-name text-[15px] tracking-[0.08em] font-medium drop-shadow-[0_1px_6px_rgba(3,5,10,0.42)] transition-all duration-500";
            if (isDone) {
              nameClass +=
                " text-[var(--onboarding-nav-link,rgba(207,175,90,0.85))] group-hover:text-[var(--onboarding-nav-link-hover,#f2d27a)]";
            } else if (isActive) {
              nameClass +=
                " text-[var(--onboarding-nav-text-primary,#e8e8ec)] font-semibold";
            } else {
              nameClass += " text-[var(--onboarding-nav-text-subtle,#a1a1aa)]";
            }

            // Subtitle classes
            let subClass =
              "onboarding-step-sub text-[13px] tracking-[0.05em] drop-shadow-[0_1px_6px_rgba(3,5,10,0.3)] transition-all duration-500";
            if (isDone) {
              subClass +=
                " text-[var(--onboarding-nav-text-subtle,#a1a1aa)] group-hover:text-[var(--onboarding-nav-text-primary,#e8e8ec)]";
            } else if (isActive) {
              subClass += " text-accent";
            } else {
              subClass += " text-[var(--onboarding-nav-text-faint,#6b6b78)]";
            }

            if (isClickable) {
              return (
                <li key={step.id} className="list-none max-md:shrink-0">
                  <Button
                    variant="ghost"
                    type="button"
                    className={rowClass}
                    title={t(step.name)}
                    aria-label={`${t(step.name)} — ${t("onboarding.stepLabel", { current: i + 1, total: activeSteps.length })} (${t("onboarding.completed")})`}
                    onClick={() => handleOnboardingJumpToStep(step.id)}
                  >
                    <div className={dotClass} aria-hidden="true" />
                    <div className="flex flex-col gap-0.5 max-md:hidden">
                      <span className={nameClass}>{t(step.name)}</span>
                      <span className={subClass}>{t(step.subtitle)}</span>
                    </div>
                  </Button>
                </li>
              );
            }

            return (
              <li
                key={step.id}
                className={`${rowClass} list-none max-md:shrink-0`}
                title={t(step.name)}
                aria-label={`${t(step.name)} — ${t("onboarding.stepLabel", { current: i + 1, total: activeSteps.length })}`}
                {...(isActive ? { "aria-current": "step" as const } : {})}
              >
                <div className={dotClass} aria-hidden="true" />
                <div className="flex flex-col gap-0.5 max-md:hidden">
                  <span className={nameClass}>{t(step.name)}</span>
                  <span className={subClass}>{t(step.subtitle)}</span>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
