import { useApp } from "@miladyai/app-core/state";
import { useEffect, useRef } from "react";

export function CloudLoginStep() {
  const {
    onboardingStep,
    elizaCloudConnected,
    elizaCloudLoginBusy,
    elizaCloudLoginError,
    handleCloudLogin,
    handleOnboardingNext,
    handleOnboardingBack,
    t,
  } = useApp();

  // Auto-advance when cloud login succeeds — guarded to only fire once
  // and only while we're still on the cloudLogin step.
  const advancedRef = useRef(false);
  useEffect(() => {
    if (
      elizaCloudConnected &&
      onboardingStep === "providers" &&
      !advancedRef.current
    ) {
      advancedRef.current = true;
      void handleOnboardingNext();
    }
  }, [elizaCloudConnected, onboardingStep, handleOnboardingNext]);

  return (
    <>
      <div className="text-xs tracking-[0.3em] uppercase text-[rgba(240,238,250,0.62)] font-semibold text-center mb-0" style={{ textShadow: '0 2px 10px rgba(3,5,10,0.55)' }}>
        {t("onboarding.cloudLoginTitle")}
      </div>
      <div className="onboarding-divider">
        <div className="w-1.5 h-1.5 bg-[rgba(240,185,11,0.4)] rotate-45 shrink-0" />
      </div>
      <p className="text-sm text-[rgba(240,238,250,0.62)] text-center leading-relaxed mt-3" style={{ textShadow: '0 2px 10px rgba(3,5,10,0.45)' }}>{t("onboarding.cloudLoginDesc")}</p>

      {elizaCloudConnected ? (
        <p className="text-sm text-[var(--ok)] text-center leading-relaxed mt-3" style={{ textShadow: '0 2px 10px rgba(3,5,10,0.45)' }}>
          {t("onboarding.cloudLoginConnected")}
        </p>
      ) : elizaCloudLoginBusy ? (
        <div className="flex items-center gap-2 text-sm text-[rgba(240,238,250,0.62)] text-center leading-relaxed mt-3" style={{ textShadow: '0 2px 10px rgba(3,5,10,0.45)' }}>
          <span className="animate-spin inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full" />
          {t("onboarding.cloudLoginBusy")}
        </div>
      ) : (
        <>
          {elizaCloudLoginError && (
            <p className="text-sm text-[var(--danger)] text-center leading-relaxed mt-3 !mb-2" style={{ textShadow: '0 2px 10px rgba(3,5,10,0.45)' }}>
              {elizaCloudLoginError}
            </p>
          )}
          <button
            className="onboarding-confirm-btn"
            onClick={() => void handleCloudLogin()}
            type="button"
          >
            {elizaCloudLoginError
              ? t("onboarding.cloudLoginRetry")
              : t("onboarding.cloudLoginBtn")}
          </button>
        </>
      )}

      <div className="flex justify-between items-center gap-6 mt-[18px] pt-3.5 border-t border-white/[0.08]">
        <button
          className="onboarding-back-link"
          onClick={() => handleOnboardingBack()}
          type="button"
        >
          {t("onboarding.back")}
        </button>
      </div>
    </>
  );
}
