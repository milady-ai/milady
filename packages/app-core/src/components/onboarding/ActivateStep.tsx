import { useApp } from "@miladyai/app-core/state";
import { Button } from "@miladyai/ui";
import { useBranding } from "../../config/branding";
import {
  OnboardingStepHeader,
  onboardingFooterClass,
  onboardingPrimaryActionClass,
  onboardingPrimaryActionTextShadowStyle,
  onboardingSecondaryActionClass,
  onboardingSecondaryActionTextShadowStyle,
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
        <Button
          variant="ghost"
          className={onboardingSecondaryActionClass}
          style={onboardingSecondaryActionTextShadowStyle}
          onClick={() => handleOnboardingBack()}
          type="button"
        >
          {t("onboarding.back")}
        </Button>
        <Button
          className={onboardingPrimaryActionClass}
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
