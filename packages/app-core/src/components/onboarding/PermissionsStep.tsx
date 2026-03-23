import { PermissionsOnboardingSection } from "@miladyai/app-core/components";
import { useApp } from "@miladyai/app-core/state";

export function PermissionsStep() {
  const { handleOnboardingNext, handleOnboardingBack, t } = useApp();

  return (
    <>
      <div className="text-xs tracking-[0.3em] uppercase text-[rgba(240,238,250,0.62)] font-semibold text-center mb-0" style={{ textShadow: '0 2px 10px rgba(3,5,10,0.55)' }}>
        {t("onboarding.systemAccessTitle")}
      </div>
      <div className="onboarding-divider">
        <div className="w-1.5 h-1.5 bg-[rgba(240,185,11,0.4)] rotate-45 shrink-0" />
      </div>
      <PermissionsOnboardingSection
        onContinue={(options) => void handleOnboardingNext(options)}
        onBack={() => handleOnboardingBack()}
      />
    </>
  );
}
