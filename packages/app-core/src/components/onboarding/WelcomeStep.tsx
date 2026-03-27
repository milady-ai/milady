import {
  appNameInterpolationVars,
  useBranding,
} from "@miladyai/app-core/config";
import { useApp } from "@miladyai/app-core/state";
import { Button } from "@miladyai/ui";
import {
  OnboardingStepHeader,
  onboardingFooterClass,
  onboardingPrimaryActionClass,
  onboardingPrimaryActionTextShadowStyle,
  onboardingSecondaryActionClass,
  onboardingSecondaryActionTextShadowStyle,
  spawnOnboardingRipple,
} from "./onboarding-step-chrome";

/** First screen; enters the custom setup track at `connection`. */
export function WelcomeStep() {
  const branding = useBranding();
  const {
    onboardingExistingInstallDetected,
    handleOnboardingUseLocalBackend,
    setState,
    goToOnboardingStep,
    t,
  } = useApp();

  const handleGetStarted = () => {
    // Default to Chen (blue-haired anime character) — user picks their
    // character in the identity step (now the very next screen).
    setState("onboardingStyle", "chen");
    setState("onboardingName", "Chen");
    setState("selectedVrmIndex", 1);
    // WHY goToOnboardingStep: syncs Flamina guide in advanced mode; persisted
    // step still goes through the same setter as the rest of onboarding.
    goToOnboardingStep("identity");
  };

  const handleUseExistingSetup = () => {
    setState("onboardingStep", "identity");
  };

  return (
    <>
      <OnboardingStepHeader
        eyebrow={t(
          "onboarding.welcomeTitle",
          appNameInterpolationVars(branding),
        )}
        description={
          onboardingExistingInstallDetected
            ? t("onboarding.existingSetupDesc")
            : t("onboarding.welcomeDesc")
        }
        descriptionClassName="mt-1"
      />
      <div className={onboardingFooterClass}>
        {onboardingExistingInstallDetected ? (
          <Button
            variant="ghost"
            className={onboardingSecondaryActionClass}
            style={onboardingSecondaryActionTextShadowStyle}
            onClick={handleGetStarted}
            type="button"
          >
            {t("onboarding.customSetup")}
          </Button>
        ) : (
          <Button
            variant="ghost"
            className={onboardingSecondaryActionClass}
            style={onboardingSecondaryActionTextShadowStyle}
            onClick={() => handleOnboardingUseLocalBackend()}
            type="button"
          >
            {t("onboarding.checkExistingSetup")}
          </Button>
        )}
        <Button
          className={onboardingPrimaryActionClass}
          style={onboardingPrimaryActionTextShadowStyle}
          onClick={(e) => {
            spawnOnboardingRipple(e.currentTarget, {
              x: e.clientX,
              y: e.clientY,
            });

            if (onboardingExistingInstallDetected) {
              handleUseExistingSetup();
            } else {
              handleGetStarted();
            }
          }}
          type="button"
        >
          {onboardingExistingInstallDetected
            ? t("onboarding.useExistingSetup")
            : t("onboarding.getStarted")}
        </Button>
      </div>
    </>
  );
}
