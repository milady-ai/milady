import { Button } from "@miladyai/ui";
import { appNameInterpolationVars, useBranding } from "../../../config";
import type { ConnectionEvent } from "../../../onboarding/connection-flow";
import { useApp } from "../../../state";
import {
  OnboardingStepHeader,
  onboardingFooterClass,
  onboardingSecondaryActionClass,
  onboardingSecondaryActionTextShadowStyle,
} from "../onboarding-step-chrome";

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
      <OnboardingStepHeader
        eyebrow={t("onboarding.hostingTitle")}
        title={t(
          "onboarding.hostingQuestion",
          appNameInterpolationVars(branding),
        )}
      />
      <div className="flex flex-col gap-1.5 mb-4">
        {showHostingLocalCard && (
          <Button
            type="button"
            className="flex min-h-[48px] items-center justify-between gap-[10px] rounded-[10px] border border-[var(--onboarding-recommended-border)] bg-[var(--onboarding-recommended-bg)] px-[12px] py-[9px] text-left backdrop-blur-[18px] backdrop-saturate-[1.2] transition-all duration-300 hover:bg-[var(--onboarding-recommended-bg-hover)] hover:border-[var(--onboarding-recommended-border-strong)]"
            onClick={() => dispatch({ type: "selectLocalHosting" })}
          >
            <div className="min-w-0 flex-1">
              <div
                className="text-[11px] font-medium leading-[1.2] text-[var(--onboarding-text-primary)]"
                style={{ textShadow: "0 1px 8px rgba(3,5,10,0.6)" }}
              >
                {t("onboarding.hostingLocal")}
              </div>
              <div
                className="mt-0.5 line-clamp-1 text-[9px] leading-[1.2] text-[var(--onboarding-text-subtle)]"
                style={{ textShadow: "0 1px 8px rgba(3,5,10,0.5)" }}
              >
                {t("onboarding.hostingLocalDesc")}
              </div>
            </div>
            <span
              className="ml-auto shrink-0 whitespace-nowrap rounded-full bg-[var(--onboarding-accent-bg)] px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.08em] text-[var(--onboarding-accent-foreground)]"
              style={{ textShadow: "0 1px 6px rgba(3,5,10,0.45)" }}
            >
              {t("onboarding.recommended") ?? "Recommended"}
            </span>
          </Button>
        )}
        <Button
          variant="outline"
          type="button"
          className="flex min-h-[48px] items-center justify-between gap-[10px] rounded-[10px] border border-[var(--onboarding-card-border)] bg-[var(--onboarding-card-bg)] px-[12px] py-[9px] text-left backdrop-blur-[18px] backdrop-saturate-[1.2] transition-all duration-300 hover:bg-[var(--onboarding-card-bg-hover)] hover:border-[var(--onboarding-card-border-strong)]"
          onClick={() => dispatch({ type: "selectRemoteHosting" })}
        >
          <div className="min-w-0 flex-1">
            <div
              className="text-[11px] font-medium leading-[1.2] text-[var(--onboarding-text-primary)]"
              style={{ textShadow: "0 1px 8px rgba(3,5,10,0.6)" }}
            >
              {t("onboarding.hostingRemote")}
            </div>
            <div
              className="mt-0.5 line-clamp-1 text-[9px] leading-[1.2] text-[var(--onboarding-text-subtle)]"
              style={{ textShadow: "0 1px 8px rgba(3,5,10,0.5)" }}
            >
              {t("onboarding.hostingRemoteDesc")}
            </div>
          </div>
        </Button>
        <Button
          variant="outline"
          type="button"
          className="flex min-h-[48px] items-center justify-between gap-[10px] rounded-[10px] border border-[var(--onboarding-card-border)] bg-[var(--onboarding-card-bg)] px-[12px] py-[9px] text-left backdrop-blur-[18px] backdrop-saturate-[1.2] transition-all duration-300 hover:bg-[var(--onboarding-card-bg-hover)] hover:border-[var(--onboarding-card-border-strong)]"
          onClick={() => dispatch({ type: "selectElizaCloudHosting" })}
        >
          <div className="min-w-0 flex-1">
            <div
              className="text-[11px] font-medium leading-[1.2] text-[var(--onboarding-text-primary)]"
              style={{ textShadow: "0 1px 8px rgba(3,5,10,0.6)" }}
            >
              {t("header.Cloud")}
            </div>
            <div
              className="mt-0.5 line-clamp-1 text-[9px] leading-[1.2] text-[var(--onboarding-text-subtle)]"
              style={{ textShadow: "0 1px 8px rgba(3,5,10,0.5)" }}
            >
              {t("onboarding.hostingElizaCloudDesc")}
            </div>
          </div>
        </Button>
      </div>
      <div className={onboardingFooterClass}>
        <Button
          variant="ghost"
          className={onboardingSecondaryActionClass}
          style={onboardingSecondaryActionTextShadowStyle}
          onClick={handleOnboardingBack}
          type="button"
        >
          {t("onboarding.back")}
        </Button>
        <span />
      </div>
    </>
  );
}
