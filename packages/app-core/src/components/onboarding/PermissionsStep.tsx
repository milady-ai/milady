import { PermissionsOnboardingSection } from "@miladyai/app-core/components";
import { useApp } from "@miladyai/app-core/state";
import { useTranslation } from "../../state/TranslationContext";

export function PermissionsStep() {
  const { t } = useTranslation();
  const { handleOnboardingNext, handleOnboardingBack } = useApp();

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
