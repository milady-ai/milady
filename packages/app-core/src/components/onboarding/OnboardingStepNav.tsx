/**
 * Left-rail step list for the onboarding wizard.
 * WHY getOnboardingNavMetas from flow.ts: sidebar order and labels must match
 * the same track as handleOnboardingNext/Back. WHY buttons only for completed
 * steps: backward-only jumps—forward jumps would bypass finish/login validation
 * (enforced in AppContext via canRevertOnboardingTo).
 */
import { useApp } from "@miladyai/app-core/state";
import { Button } from "@miladyai/ui";
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
      : `calc((100% - 34px) * ${Math.min(currentIndex, connectorCount)} / ${connectorCount})`;

  return (
    <div className="absolute left-0 top-0 bottom-0 z-10 flex flex-col justify-center py-[48px] pl-[40px] pr-0 max-md:relative max-md:items-center max-md:px-4 max-md:pt-4 max-md:pb-2">
      <div className="w-[248px] rounded-[28px] border border-[var(--onboarding-nav-border,rgba(201,204,209,0.12))] [background:var(--onboarding-nav-scrim,rgba(18,18,20,0.72))] px-[26px] py-[30px] shadow-[var(--onboarding-nav-shadow,0_16px_40px_rgba(0,0,0,0.24))] backdrop-blur-[22px] backdrop-saturate-[1.2] max-md:w-fit max-md:max-w-[calc(100vw-32px)] max-md:rounded-[22px] max-md:px-4 max-md:py-3">
        <ul
          aria-label={t("onboarding.stepNavigation")}
          style={
            {
              "--tw-after-height": connectorHeight,
            } as React.CSSProperties
          }
          {...{
            className: `relative flex flex-col max-md:flex-row max-md:items-center max-md:justify-center max-md:gap-5 before:absolute before:bottom-[17px] before:left-[4px] before:top-[17px] before:w-[2px] before:rounded-full before:bg-gradient-to-b before:from-[rgba(255,255,255,0.06)] before:via-[rgba(255,255,255,0.10)] before:to-[rgba(255,255,255,0.06)] before:z-0 after:absolute after:left-[4px] after:top-[17px] after:z-0 after:h-[var(--tw-after-height)] after:w-[2px] after:rounded-full after:bg-gradient-to-b after:from-accent/70 after:to-accent/18 after:transition-all after:duration-[800ms] after:ease-[cubic-bezier(0.25,0.46,0.45,0.94)] max-md:before:hidden max-md:after:hidden`,
          }}
        >
          {activeSteps.map((step, i) => {
            const isDone = i < currentIndex;
            const isActive = i === currentIndex;
            const isClickable = isDone;

            const rowClass = `relative group flex w-full items-center gap-[16px] py-[12px] max-md:w-auto max-md:gap-0 max-md:py-0 ${isClickable ? "m-0 h-auto cursor-pointer justify-start rounded-none border-none bg-transparent px-0 text-left text-inherit hover:bg-transparent focus-visible:outline-2 focus-visible:outline-accent/60 focus-visible:outline-offset-3" : ""}`;

            // Dot classes
            let dotClass =
              "w-[10px] h-[10px] rounded-full border border-[var(--onboarding-nav-card-border,rgba(201,204,209,0.24))] shrink-0 relative z-10 bg-[var(--onboarding-nav-card-bg,rgba(30,31,35,0.88))] transition-all duration-500 ease-[cubic-bezier(0.25,0.46,0.45,0.94)]";
            if (isDone) {
              dotClass +=
                " !bg-accent !border-accent";
            } else if (isActive) {
              dotClass +=
                " !w-[12px] !h-[12px] !bg-accent !border-[rgba(255,248,220,0.9)] shadow-[0_0_12px_rgba(240,185,11,0.5)] animate-[onboarding-dot-glow_2s_ease-in-out_infinite]";
            }

            // Name classes
            let nameClass =
              "text-[15px] tracking-[0.08em] font-medium drop-shadow-[0_2px_10px_rgba(3,5,10,0.65)] transition-all duration-500";
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
              "text-[13px] tracking-[0.05em] drop-shadow-[0_2px_10px_rgba(3,5,10,0.55)] transition-all duration-500";
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
                <li key={step.id} className="list-none">
                  <Button
                    variant="ghost"
                    type="button"
                    className={rowClass}
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
                className={`${rowClass} list-none`}
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
