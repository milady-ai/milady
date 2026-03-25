import { Button, Input } from "@miladyai/ui";
import { appNameInterpolationVars, useBranding } from "../../../config";
import type {
  ConnectionEffect,
  ConnectionEvent,
} from "../../../onboarding/connection-flow";
import { useApp } from "../../../state";
import {
  OnboardingStepHeader,
  onboardingBodyTextShadowStyle,
  onboardingFooterClass,
  onboardingPrimaryActionClass,
  onboardingPrimaryActionTextShadowStyle,
  onboardingSecondaryActionClass,
  onboardingSecondaryActionTextShadowStyle,
  spawnOnboardingRipple,
} from "../onboarding-step-chrome";

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
      <OnboardingStepHeader
        eyebrow={t(
          "onboarding.remoteTitle",
          appNameInterpolationVars(branding),
        )}
      />
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
          <Input
            id="remote-api-base"
            type="text"
            className="w-full px-[20px] py-[16px] bg-[var(--onboarding-card-bg)] border border-[var(--onboarding-card-border)] rounded-[6px] text-[var(--onboarding-text-primary)] font-inherit outline-none tracking-[0.03em] text-center transition-all duration-300 focus:border-[var(--onboarding-field-focus-border)] focus:shadow-[var(--onboarding-field-focus-shadow)] placeholder:text-[var(--onboarding-text-faint)]"
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
          <Input
            id="remote-api-token"
            type="password"
            className="w-full px-[20px] py-[16px] bg-[var(--onboarding-card-bg)] border border-[var(--onboarding-card-border)] rounded-[6px] text-[var(--onboarding-text-primary)] font-inherit outline-none tracking-[0.03em] text-center transition-all duration-300 focus:border-[var(--onboarding-field-focus-border)] focus:shadow-[var(--onboarding-field-focus-shadow)] placeholder:text-[var(--onboarding-text-faint)]"
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
              ...onboardingBodyTextShadowStyle,
            }}
          >
            {onboardingRemoteError}
          </p>
        )}
      </div>
      <div className={onboardingFooterClass}>
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
        <Button
          className={onboardingPrimaryActionClass}
          style={onboardingPrimaryActionTextShadowStyle}
          onClick={(e) => {
            spawnOnboardingRipple(e.currentTarget, {
              x: e.clientX,
              y: e.clientY,
            });
            void handleOnboardingRemoteConnect();
          }}
          disabled={onboardingRemoteConnecting}
          type="button"
        >
          {onboardingRemoteConnecting
            ? t("onboarding.connecting")
            : t("onboarding.remoteConnect")}
        </Button>
      </div>
    </>
  );
}
