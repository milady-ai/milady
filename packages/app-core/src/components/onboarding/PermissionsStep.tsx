import { PermissionsOnboardingSection } from "@miladyai/app-core/components";
import { useApp } from "@miladyai/app-core/state";

export function PermissionsStep() {
  const { handleOnboardingNext, handleOnboardingBack, t } = useApp();

  return (
    <>
      <div className="onboarding-section-title">
        {t("onboarding.systemAccessTitle")}
      </div>
      <div className="onboarding-divider">
        <div className="onboarding-divider-diamond" />
      </div>
      <PermissionsOnboardingSection
        onContinue={(options) => void handleOnboardingNext(options)}
        onBack={() => handleOnboardingBack()}
      />
    </>
  );
}
