import type {
  ConnectionEffect,
  ConnectionEvent,
} from "../../../onboarding/connection-flow";
import { CONNECTION_RECOMMENDED_PROVIDER_IDS } from "../../../onboarding/connection-flow";
import type { ProviderOption } from "../../../api";
import { appNameInterpolationVars, useBranding } from "../../../config";
import { getProviderLogo } from "../../../providers";
import { useApp } from "../../../state";

const recommendedIds = new Set<string>(CONNECTION_RECOMMENDED_PROVIDER_IDS);

export function ConnectionProviderGridScreen({
  dispatch,
  onTransitionEffect,
  sortedProviders,
  getProviderDisplay,
  getCustomLogo,
  getDetectedLabel,
}: {
  dispatch: (event: ConnectionEvent) => void;
  onTransitionEffect: (effect: ConnectionEffect) => void;
  sortedProviders: ProviderOption[];
  getProviderDisplay: (provider: ProviderOption) => {
    name: string;
    description?: string;
  };
  getCustomLogo: (id: string) =>
    | {
        logoDark?: string;
        logoLight?: string;
      }
    | undefined;
  getDetectedLabel: (providerId: string) => string | null;
}) {
  const branding = useBranding();
  const { t, onboardingRemoteConnected } = useApp();

  return (
    <>
      <div className="onboarding-section-title">
        {t("onboarding.neuralLinkTitle")}
      </div>
      <div className="onboarding-divider">
        <div className="onboarding-divider-diamond" />
      </div>
      {onboardingRemoteConnected && (
        <p className="onboarding-desc" style={{ marginBottom: "1rem" }}>
          {t(
            "onboarding.remoteConnectedDesc",
            appNameInterpolationVars(branding),
          )}
        </p>
      )}
      <div className="onboarding-question">
        {t("onboarding.chooseProvider")}
      </div>
      <div className="onboarding-provider-grid">
        {sortedProviders.map((p: ProviderOption) => {
          const display = getProviderDisplay(p);
          const isRecommended = recommendedIds.has(p.id);
          const detectedLabel = getDetectedLabel(p.id);
          return (
            <button
              type="button"
              key={p.id}
              className={`onboarding-provider-card${isRecommended ? " onboarding-provider-card--recommended" : ""}${detectedLabel ? " onboarding-provider-card--detected" : ""}`}
              onClick={() =>
                dispatch({ type: "selectProvider", providerId: p.id })
              }
            >
              <img
                src={getProviderLogo(p.id, false, getCustomLogo(p.id))}
                alt={display.name}
                className="onboarding-provider-icon"
              />
              <div>
                <div className="onboarding-provider-name">{display.name}</div>
                {display.description && (
                  <div className="onboarding-provider-desc">
                    {display.description}
                  </div>
                )}
              </div>
              {detectedLabel && (
                <span className="onboarding-provider-badge onboarding-provider-badge--detected">
                  {detectedLabel}
                </span>
              )}
              {isRecommended && !detectedLabel && (
                <span className="onboarding-provider-badge">
                  {t("onboarding.recommended") ?? "Recommended"}
                </span>
              )}
            </button>
          );
        })}
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
        <span />
      </div>
    </>
  );
}
