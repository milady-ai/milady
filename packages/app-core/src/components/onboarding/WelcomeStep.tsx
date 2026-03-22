import {
  appNameInterpolationVars,
  useBranding,
} from "@miladyai/app-core/config";
import { useApp } from "@miladyai/app-core/state";

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
    // Default to Chen (blue-haired anime character) — character selection
    // happens after onboarding completes.
    setState("onboardingStyle", "Let's get to work!");
    setState("onboardingName", "Chen");
    setState("selectedVrmIndex", 1);
    // WHY goToOnboardingStep: syncs Flamina guide in advanced mode; persisted
    // step still goes through the same setter as the rest of onboarding.
    goToOnboardingStep("hosting");
  };

  const handleUseExistingSetup = () => {
    setState("onboardingStep", "hosting");
  };

  return (
    <>
      <div className="onboarding-section-title">
        {t("onboarding.welcomeTitle", appNameInterpolationVars(branding))}
      </div>
      <div className="onboarding-divider">
        <div className="onboarding-divider-diamond" />
      </div>
      <p className="onboarding-desc">
        {onboardingExistingInstallDetected
          ? t("onboarding.existingSetupDesc")
          : t("onboarding.welcomeDesc")}
      </p>
      <div className="onboarding-panel-footer">
        {onboardingExistingInstallDetected ? (
          <button
            className="onboarding-back-link"
            onClick={handleGetStarted}
            type="button"
          >
            {t("onboarding.customSetup")}
          </button>
        ) : (
          <button
            className="onboarding-back-link"
            onClick={() => handleOnboardingUseLocalBackend()}
            type="button"
          >
            {t("onboarding.checkExistingSetup")}
          </button>
        )}
        <button
          className="onboarding-confirm-btn"
          onClick={
            onboardingExistingInstallDetected
              ? handleUseExistingSetup
              : handleGetStarted
          }
          type="button"
        >
          {onboardingExistingInstallDetected
            ? t("onboarding.useExistingSetup")
            : t("onboarding.getStarted")}
        </button>
      </div>
    </>
  );
}
