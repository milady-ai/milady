import { useApp } from "@miladyai/app-core/state";
import { Button } from "@miladyai/ui";
import { useBranding } from "../../config/branding";
import {
  OnboardingSecondaryActionButton,
  OnboardingStepHeader,
  onboardingFooterClass,
  onboardingPrimaryActionClass,
  onboardingPrimaryActionTextShadowStyle,
  spawnOnboardingRipple,
} from "./onboarding-step-chrome";

export function ActivateStep() {
  const branding = useBranding();
  const {
    onboardingName,
    handleOnboardingNext,
    handleOnboardingBack,
    t,
    onboardingRestarting,
  } = useApp();

  return (
    <>
      <OnboardingStepHeader
        eyebrow={t("onboarding.readyTitle")}
        title={t("onboarding.companionReady", {
          name: onboardingName || branding.appName,
        })}
        description={t("onboarding.allConfigured")}
      />
      <div className={onboardingFooterClass}>
        <OnboardingSecondaryActionButton
          onClick={() => handleOnboardingBack()}
          type="button"
        >
          {t("onboarding.back")}
        </OnboardingSecondaryActionButton>
        <Button
          className={onboardingPrimaryActionClass}
          data-testid="onboarding-activate-enter"
          style={onboardingPrimaryActionTextShadowStyle}
          onClick={(event?: React.MouseEvent<HTMLButtonElement>) => {
            spawnOnboardingRipple(
              event?.currentTarget ?? null,
              event
                ? {
                    x: event.clientX,
                    y: event.clientY,
                  }
                : undefined,
            );
            handleOnboardingNext();
          }}
          type="button"
          disabled={onboardingRestarting}
        >
          {onboardingRestarting ? (
            <div className="m-auto h-[18px] w-[18px] animate-spin rounded-full border-2 border-solid border-[color:var(--onboarding-text-faint)] border-t-[color:var(--onboarding-text-strong)]" />
          ) : (
            t("onboarding.enter")
          )}
        </Button>
      </div>
    </>
  );
}
