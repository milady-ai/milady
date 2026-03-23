import type { ProviderOption } from "../../../api";
import { appNameInterpolationVars, useBranding } from "../../../config";
import type {
  ConnectionEffect,
  ConnectionEvent,
} from "../../../onboarding/connection-flow";
import { CONNECTION_RECOMMENDED_PROVIDER_IDS } from "../../../onboarding/connection-flow";
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
      <div className="text-xs tracking-[0.3em] uppercase text-[rgba(240,238,250,0.62)] font-semibold text-center mb-0" style={{ textShadow: '0 2px 10px rgba(3,5,10,0.55)' }}>
        {t("onboarding.neuralLinkTitle")}
      </div>
      <div className="onboarding-divider">
        <div className="w-1.5 h-1.5 bg-[rgba(240,185,11,0.4)] rotate-45 shrink-0" />
      </div>
      {onboardingRemoteConnected && (
        <p className="text-sm text-[rgba(240,238,250,0.62)] text-center leading-relaxed mt-3" style={{ marginBottom: "1rem" }}>
          {t(
            "onboarding.remoteConnectedDesc",
            appNameInterpolationVars(branding),
          )}
        </p>
      )}
      <div className="text-xl font-light leading-[1.4] text-[rgba(240,238,250,0.95)] text-center mb-[18px]" style={{ textShadow: '0 2px 10px rgba(3,5,10,0.55)' }}>
        {t("onboarding.chooseProvider")}
      </div>
      <div
        className="flex flex-col gap-1.5 mb-4"
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}
      >
        {sortedProviders.map((p: ProviderOption) => {
          const display = getProviderDisplay(p);
          const isRecommended = recommendedIds.has(p.id);
          const detectedLabel = getDetectedLabel(p.id);
          return (
            <button
              type="button"
              key={p.id}
              className={`onboarding-provider-card${isRecommended ? " onboarding-provider-card--recommended" : ""}${detectedLabel ? " onboarding-provider-card--detected" : ""}`}
              style={{
                gridColumn: isRecommended ? "span 2" : "span 1",
                minWidth: 0,
              }}
              onClick={() =>
                dispatch({ type: "selectProvider", providerId: p.id })
              }
            >
              <img
                src={getProviderLogo(p.id, false, getCustomLogo(p.id))}
                alt={display.name}
                className="w-6 h-6 rounded-md object-contain shrink-0"
              />
              <div>
                <div className="text-xs text-[rgba(240,238,250,0.88)] leading-[1.3]" style={{ textShadow: '0 1px 8px rgba(3,5,10,0.6)' }}>{display.name}</div>
                {display.description && (
                  <div className="text-[10px] text-[rgba(240,238,250,0.58)] leading-[1.3] line-clamp-2" style={{ textShadow: '0 1px 8px rgba(3,5,10,0.5)' }}>
                    {display.description}
                  </div>
                )}
              </div>
              {detectedLabel && (
                <span className="text-[9px] tracking-[0.08em] uppercase bg-[rgba(34,197,94,0.2)] text-[rgba(34,197,94,0.94)] px-2 py-0.5 rounded-full font-semibold ml-auto shrink-0 whitespace-nowrap" style={{ textShadow: '0 1px 6px rgba(3,5,10,0.45)' }}>
                  {detectedLabel}
                </span>
              )}
              {isRecommended && !detectedLabel && (
                <span className="text-[9px] tracking-[0.08em] uppercase text-[rgba(240,238,250,0.94)] bg-[rgba(240,185,11,0.18)] px-2 py-0.5 rounded-full font-semibold ml-auto shrink-0 whitespace-nowrap" style={{ textShadow: '0 1px 6px rgba(3,5,10,0.45)' }}>
                  {t("onboarding.recommended") ?? "Recommended"}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="flex justify-between items-center gap-6 mt-[18px] pt-3.5 border-t border-white/[0.08]">
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
