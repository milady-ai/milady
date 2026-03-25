import { Button } from "@miladyai/ui";
import type { ProviderOption } from "../../../api";
import { appNameInterpolationVars, useBranding } from "../../../config";
import type {
  ConnectionEffect,
  ConnectionEvent,
} from "../../../onboarding/connection-flow";
import { CONNECTION_RECOMMENDED_PROVIDER_IDS } from "../../../onboarding/connection-flow";
import { getProviderLogo } from "../../../providers";
import { useApp } from "../../../state";
import {
  OnboardingStepHeader,
  onboardingBodyTextShadowStyle,
  onboardingFooterClass,
  onboardingSecondaryActionClass,
  onboardingSecondaryActionTextShadowStyle,
} from "../onboarding-step-chrome";

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
      <OnboardingStepHeader
        eyebrow={t("onboarding.neuralLinkTitle")}
        title={t("onboarding.chooseProvider")}
      />
      {onboardingRemoteConnected && (
        <p
          className="mx-auto mb-3 mt-1.5 max-w-[32ch] text-center text-[12px] leading-[1.35] text-[var(--onboarding-text-muted)]"
          style={onboardingBodyTextShadowStyle}
        >
          {t(
            "onboarding.remoteConnectedDesc",
            appNameInterpolationVars(branding),
          )}
        </p>
      )}
      <div className="mb-4 grid grid-cols-1 gap-1.5 min-[440px]:grid-cols-2">
        {sortedProviders.map((p: ProviderOption) => {
          const display = getProviderDisplay(p);
          const isRecommended = recommendedIds.has(p.id);
          const detectedLabel = getDetectedLabel(p.id);
          return (
            <Button
              type="button"
              key={p.id}
              className={`h-auto w-full min-w-0 justify-start overflow-hidden whitespace-normal rounded-[10px] border px-[10px] py-[8px] text-left transition-all duration-300 backdrop-blur-[18px] backdrop-saturate-[1.2] ${isRecommended ? "min-[440px]:col-span-2 border-[var(--onboarding-recommended-border)] bg-[var(--onboarding-recommended-bg)] hover:bg-[var(--onboarding-recommended-bg-hover)] hover:border-[var(--onboarding-recommended-border-strong)]" : "border-[var(--onboarding-card-border)] bg-[var(--onboarding-card-bg)] hover:bg-[var(--onboarding-card-bg-hover)] hover:border-[var(--onboarding-card-border-strong)]"}${detectedLabel ? " border-[rgba(34,197,94,0.4)] bg-[rgba(34,197,94,0.1)] hover:bg-[rgba(34,197,94,0.15)] hover:border-[rgba(34,197,94,0.5)]" : ""}`}
              onClick={() =>
                dispatch({ type: "selectProvider", providerId: p.id })
              }
            >
              <div className="flex min-h-[46px] w-full items-center gap-2">
                <img
                  src={getProviderLogo(p.id, true, getCustomLogo(p.id))}
                  alt={display.name}
                  className="h-[22px] w-[22px] shrink-0 rounded-md object-contain"
                />
                <div className="min-w-0 flex-1">
                  <div
                    className="truncate text-[11px] font-medium leading-[1.2] text-[var(--onboarding-text-primary)]"
                    style={{ textShadow: "0 1px 8px rgba(3,5,10,0.6)" }}
                  >
                    {display.name}
                  </div>
                  {display.description && (
                    <div
                      className="mt-0.5 truncate text-[9px] leading-[1.2] text-[var(--onboarding-text-subtle)]"
                      style={{ textShadow: "0 1px 8px rgba(3,5,10,0.5)" }}
                    >
                      {display.description}
                    </div>
                  )}
                </div>
                {detectedLabel && (
                  <span
                    className="ml-auto shrink-0 whitespace-nowrap rounded-full bg-[rgba(34,197,94,0.2)] px-1 py-0.5 text-[8px] font-semibold uppercase tracking-[0.08em] text-[rgba(34,197,94,0.94)]"
                    style={{ textShadow: "0 1px 6px rgba(3,5,10,0.45)" }}
                  >
                    {detectedLabel}
                  </span>
                )}
                {isRecommended && !detectedLabel && (
                  <span className="ml-auto shrink-0 whitespace-nowrap text-[8px] font-medium uppercase tracking-[0.12em] text-accent">
                    {t("onboarding.recommended") ?? "Recommended"}
                  </span>
                )}
              </div>
            </Button>
          );
        })}
      </div>
      <div className={`${onboardingFooterClass} pb-1`}>
        <Button
          variant="ghost"
          className={onboardingSecondaryActionClass}
          style={onboardingSecondaryActionTextShadowStyle}
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
        </Button>
        <span />
      </div>
    </>
  );
}
