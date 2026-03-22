import type {
  ConnectionEffect,
  ConnectionEvent,
} from "../../../onboarding/connection-flow";
import { appNameInterpolationVars, useBranding } from "../../../config";
import { useApp } from "../../../state";

export function ConnectionRemoteBackendScreen({
  dispatch,
  onTransitionEffect,
}: {
  dispatch: (event: ConnectionEvent) => void;
  onTransitionEffect: (effect: ConnectionEffect) => void;
}) {
  const branding = useBranding();
  const {
    t,
    onboardingRemoteApiBase,
    onboardingRemoteToken,
    onboardingRemoteConnecting,
    onboardingRemoteError,
    onboardingRemoteConnected,
    handleOnboardingRemoteConnect,
    setState,
  } = useApp();

  return (
    <>
      <div className="onboarding-section-title">
        {t("onboarding.remoteTitle", appNameInterpolationVars(branding))}
      </div>
      <div className="onboarding-divider">
        <div className="onboarding-divider-diamond" />
      </div>
      <div
        style={{
          width: "100%",
          textAlign: "left",
          display: "flex",
          flexDirection: "column",
          gap: "0.875rem",
        }}
      >
        <div>
          <label
            htmlFor="remote-api-base"
            style={{
              display: "block",
              fontSize: "0.875rem",
              marginBottom: "0.375rem",
              color: "var(--muted)",
            }}
          >
            {t("onboarding.remoteAddress")}
          </label>
          <input
            id="remote-api-base"
            type="text"
            className="onboarding-input"
            placeholder={t("onboarding.remoteAddressPlaceholder")}
            value={onboardingRemoteApiBase}
            onChange={(e) =>
              setState("onboardingRemoteApiBase", e.target.value)
            }
          />
        </div>

        <div>
          <label
            htmlFor="remote-api-token"
            style={{
              display: "block",
              fontSize: "0.875rem",
              marginBottom: "0.375rem",
              color: "var(--muted)",
            }}
          >
            {t("onboarding.remoteAccessKey")}
          </label>
          <input
            id="remote-api-token"
            type="password"
            className="onboarding-input"
            placeholder={t("onboarding.remoteAccessKeyPlaceholder")}
            value={onboardingRemoteToken}
            onChange={(e) => setState("onboardingRemoteToken", e.target.value)}
          />
        </div>

        {onboardingRemoteError && (
          <p
            style={{
              color: "var(--danger)",
              fontSize: "0.8125rem",
            }}
          >
            {onboardingRemoteError}
          </p>
        )}
      </div>
      <div className="onboarding-panel-footer">
        <button
          className="onboarding-back-link"
          onClick={() => {
            if (onboardingRemoteConnected) {
              onTransitionEffect("useLocalBackend");
              return;
            }
            dispatch({ type: "backRemoteOrGrid" });
          }}
          type="button"
        >
          {t("onboarding.back")}
        </button>
        <button
          className="onboarding-confirm-btn"
          onClick={() => void handleOnboardingRemoteConnect()}
          disabled={onboardingRemoteConnecting}
          type="button"
        >
          {onboardingRemoteConnecting
            ? t("onboarding.connecting")
            : t("onboarding.remoteConnect")}
        </button>
      </div>
    </>
  );
}
