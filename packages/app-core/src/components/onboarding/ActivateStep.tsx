import { useApp } from "@miladyai/app-core/state";
import { useBranding } from "../../config/branding";

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
      <div className="onboarding-section-title">
        {t("onboarding.readyTitle")}
      </div>
      <div className="onboarding-divider">
        <div className="onboarding-divider-diamond" />
      </div>
      <div className="onboarding-question">
        {t("onboarding.companionReady", {
          name: onboardingName || branding.appName,
        })}
      </div>
      <p className="onboarding-desc">{t("onboarding.allConfigured")}</p>
      <div className="onboarding-panel-footer">
        <button
          className="onboarding-back-link"
          onClick={() => handleOnboardingBack()}
          type="button"
        >
          {t("onboarding.back")}
        </button>
        <button
          className="onboarding-confirm-btn"
          onClick={() => handleOnboardingNext()}
          type="button"
          disabled={onboardingRestarting}
        >
          {onboardingRestarting ? (
            <div className="onboarding-spinner" style={{ margin: "auto" }} />
          ) : (
            t("onboarding.enter")
          )}
        </button>
      </div>
    </>
  );
}
