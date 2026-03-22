/**
 * Left-rail step list for the onboarding wizard.
 * WHY getOnboardingNavMetas from flow.ts: sidebar order and labels must match
 * the same track as handleOnboardingNext/Back. WHY buttons only for completed
 * steps: backward-only jumps—forward jumps would bypass finish/login validation
 * (enforced in AppContext via canRevertOnboardingTo).
 */
import { useApp } from "@miladyai/app-core/state";
import { useBranding } from "../../config/branding";
import { getOnboardingNavMetas } from "../../onboarding/flow";

export function OnboardingStepNav() {
  const { onboardingStep, handleOnboardingJumpToStep, t } = useApp();
  const branding = useBranding();

  const isCloudOnly = !!branding.cloudOnly;
  const activeSteps = getOnboardingNavMetas(onboardingStep, isCloudOnly);

  const currentIndex = activeSteps.findIndex((s) => s.id === onboardingStep);

  return (
    <div className="onboarding-left">
      <div className={`onboarding-step-list step-${Math.max(0, currentIndex)}`}>
        {activeSteps.map((step, i) => {
          let state = "";
          if (i < currentIndex) state = "onboarding-step-item--done";
          else if (i === currentIndex) state = "onboarding-step-item--active";

          const rowClass = `onboarding-step-item ${state}${
            i < currentIndex ? " onboarding-step-item--clickable" : ""
          }`;

          if (i < currentIndex) {
            return (
              <button
                key={step.id}
                type="button"
                className={rowClass}
                onClick={() => handleOnboardingJumpToStep(step.id)}
              >
                <div className="onboarding-step-dot" />
                <div className="onboarding-step-info">
                  <span className="onboarding-step-name">{t(step.name)}</span>
                  <span className="onboarding-step-sub">
                    {t(step.subtitle)}
                  </span>
                </div>
              </button>
            );
          }

          return (
            <div
              key={step.id}
              className={rowClass}
              {...(i === currentIndex
                ? { "aria-current": "step" as const }
                : {})}
            >
              <div className="onboarding-step-dot" />
              <div className="onboarding-step-info">
                <span className="onboarding-step-name">{t(step.name)}</span>
                <span className="onboarding-step-sub">{t(step.subtitle)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
