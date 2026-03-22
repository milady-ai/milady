import type { ConnectionEvent } from "../../../onboarding/connection-flow";
import { appNameInterpolationVars, useBranding } from "../../../config";
import { useApp } from "../../../state";

export function ConnectionHostingScreen({
  showHostingLocalCard,
  dispatch,
}: {
  showHostingLocalCard: boolean;
  dispatch: (event: ConnectionEvent) => void;
}) {
  const branding = useBranding();
  const { t, handleOnboardingBack } = useApp();

  return (
    <>
      <div className="onboarding-section-title">
        {t("onboarding.hostingTitle")}
      </div>
      <div className="onboarding-divider">
        <div className="onboarding-divider-diamond" />
      </div>
      <div className="onboarding-question">
        {t("onboarding.hostingQuestion", appNameInterpolationVars(branding))}
      </div>
      <div className="onboarding-provider-grid">
        {showHostingLocalCard && (
          <button
            type="button"
            className="onboarding-provider-card onboarding-provider-card--recommended"
            onClick={() => dispatch({ type: "selectLocalHosting" })}
          >
            <div style={{ flex: 1 }}>
              <div className="onboarding-provider-name">
                {t("onboarding.hostingLocal")}
              </div>
              <div className="onboarding-provider-desc">
                {t("onboarding.hostingLocalDesc")}
              </div>
            </div>
            <span className="onboarding-provider-badge">
              {t("onboarding.recommended") ?? "Recommended"}
            </span>
          </button>
        )}
        <button
          type="button"
          className="onboarding-provider-card"
          onClick={() => dispatch({ type: "selectRemoteHosting" })}
        >
          <div style={{ flex: 1 }}>
            <div className="onboarding-provider-name">
              {t("onboarding.hostingRemote")}
            </div>
            <div className="onboarding-provider-desc">
              {t("onboarding.hostingRemoteDesc")}
            </div>
          </div>
        </button>
        <button
          type="button"
          className="onboarding-provider-card"
          onClick={() => dispatch({ type: "selectElizaCloudHosting" })}
        >
          <div style={{ flex: 1 }}>
            <div className="onboarding-provider-name">{t("header.Cloud")}</div>
            <div className="onboarding-provider-desc">
              {t("onboarding.hostingElizaCloudDesc")}
            </div>
          </div>
        </button>
      </div>
      <div className="onboarding-panel-footer">
        <button
          className="onboarding-back-link"
          onClick={handleOnboardingBack}
          type="button"
        >
          {t("onboarding.back")}
        </button>
        <span />
      </div>
    </>
  );
}
