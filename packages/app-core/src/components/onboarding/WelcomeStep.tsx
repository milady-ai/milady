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
      <div className="text-xs tracking-[0.3em] uppercase text-[rgba(240,238,250,0.62)] font-semibold text-center mb-0" style={{ textShadow: '0 2px 10px rgba(3,5,10,0.55)' }}>
        {t("onboarding.welcomeTitle", appNameInterpolationVars(branding))}
      </div>
      <div className="onboarding-divider">
        <div className="w-1.5 h-1.5 bg-[rgba(240,185,11,0.4)] rotate-45 shrink-0" />
      </div>
      <p className="text-sm text-[rgba(240,238,250,0.62)] text-center leading-relaxed mt-3" style={{ textShadow: '0 2px 10px rgba(3,5,10,0.45)' }}>
        {onboardingExistingInstallDetected
          ? t("onboarding.existingSetupDesc")
          : t("onboarding.welcomeDesc")}
      </p>
      <div className="flex justify-between items-center gap-6 mt-[18px] pt-3.5 border-t border-white/[0.08]">
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
