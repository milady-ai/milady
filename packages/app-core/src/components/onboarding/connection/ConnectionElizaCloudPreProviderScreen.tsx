import { Button, Input } from "@miladyai/ui";
import type { ChangeEvent } from "react";
import { useBranding } from "../../../config";
import type { ConnectionEvent } from "../../../onboarding/connection-flow";
import { useApp } from "../../../state";
import { openExternalUrl } from "../../../utils";
import { OnboardingTabs } from "../OnboardingTabs";
import {
  OnboardingField,
  OnboardingStatusBanner,
  onboardingCenteredStackClassName,
  onboardingDetailStackClassName,
  onboardingHelperTextClassName,
  onboardingInputClassName,
} from "../onboarding-form-primitives";
import {
  OnboardingStepHeader,
  onboardingFooterClass,
  onboardingPrimaryActionClass,
  onboardingPrimaryActionTextShadowStyle,
  onboardingSecondaryActionClass,
  onboardingSecondaryActionTextShadowStyle,
  spawnOnboardingRipple,
} from "../onboarding-step-chrome";
import { useAdvanceOnboardingWhenElizaCloudOAuthConnected } from "./useAdvanceOnboardingWhenElizaCloudOAuthConnected";

export function ConnectionElizaCloudPreProviderScreen({
  dispatch,
}: {
  dispatch: (event: ConnectionEvent) => void;
}) {
  const branding = useBranding();
  const {
    t,
    onboardingApiKey,
    onboardingElizaCloudTab,
    onboardingRunMode,
    onboardingCloudProvider,
    elizaCloudConnected,
    elizaCloudLoginBusy,
    elizaCloudLoginError,
    handleCloudLogin,
    handleOnboardingNext,
    setState,
  } = useApp();

  const elizaCloudReady =
    elizaCloudConnected ||
    (onboardingRunMode === "cloud" &&
      onboardingCloudProvider === "elizacloud" &&
      onboardingApiKey.trim().length > 0);

  useAdvanceOnboardingWhenElizaCloudOAuthConnected({
    active: true,
    elizaCloudConnected,
    elizaCloudTab: onboardingElizaCloudTab,
    handleOnboardingNext,
  });

  const handleApiKeyChange = (e: ChangeEvent<HTMLInputElement>) => {
    setState("onboardingApiKey", e.target.value);
  };

  return (
    <>
      <OnboardingStepHeader eyebrow="Eliza Cloud" />

      <div className="w-full text-left">
        <OnboardingTabs
          tabs={[
            { id: "login" as const, label: t("onboarding.login") },
            { id: "apikey" as const, label: t("onboarding.apiKey") },
          ]}
          active={onboardingElizaCloudTab}
          onChange={(tab) => dispatch({ type: "setElizaCloudTab", tab })}
        />

        {onboardingElizaCloudTab === "login" ? (
          <div className={onboardingCenteredStackClassName}>
            {elizaCloudConnected ? (
              <OnboardingStatusBanner tone="success">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <title>{t("onboarding.connected")}</title>
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                {t("onboarding.connected")}
              </OnboardingStatusBanner>
            ) : (
              <Button
                type="button"
                className={onboardingPrimaryActionClass}
                style={onboardingPrimaryActionTextShadowStyle}
                onClick={(e) => {
                  spawnOnboardingRipple(e.currentTarget, {
                    x: e.clientX,
                    y: e.clientY,
                  });
                  handleCloudLogin();
                }}
                disabled={elizaCloudLoginBusy}
              >
                {elizaCloudLoginBusy
                  ? t("onboarding.connecting")
                  : t("onboarding.connectAccount")}
              </Button>
            )}
            {elizaCloudLoginError &&
              (() => {
                const urlMatch = elizaCloudLoginError.match(
                  /^Open this link to log in: (.+)$/,
                );
                if (urlMatch) {
                  return (
                    <OnboardingStatusBanner
                      tone="neutral"
                      action={
                        <Button
                          variant="ghost"
                          type="button"
                          className="rounded-md px-2 py-1 text-[11px] text-[var(--onboarding-text-faint)] transition-colors duration-300 hover:text-[var(--onboarding-link)]"
                          onClick={() => openExternalUrl(urlMatch[1])}
                        >
                          Open login page in browser
                        </Button>
                      }
                    >
                      Open the login page in your browser to continue.
                    </OnboardingStatusBanner>
                  );
                }
                return (
                  <OnboardingStatusBanner tone="error" live="assertive">
                    {elizaCloudLoginError}
                  </OnboardingStatusBanner>
                );
              })()}
            {elizaCloudLoginError ? (
              <button
                type="button"
                className="text-xs text-[var(--onboarding-link)] underline mt-1 cursor-pointer bg-transparent border-none font-inherit hover:text-[var(--onboarding-text-strong)] transition-colors duration-200"
                onClick={() => openExternalUrl(branding.bugReportUrl)}
              >
                {t("onboarding.reportIssue")}
              </button>
            ) : null}
            <p className={`${onboardingHelperTextClassName} text-center`}>
              {t("onboarding.freeCredits")}
            </p>
            <p className="text-xs text-[var(--onboarding-text-subtle)] text-center leading-relaxed">
              {t("onboarding.cloudProviderBehaviorHint")}
            </p>
          </div>
        ) : (
          <div className={onboardingDetailStackClassName}>
            <OnboardingField
              align="center"
              controlId="elizacloud-apikey-pre"
              label={t("onboarding.apiKey")}
              description={
                <>
                  {t("onboarding.useExistingKey")}{" "}
                  <a
                    href="https://elizacloud.ai/dashboard/settings"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--onboarding-link)] underline underline-offset-2 transition-colors duration-200 hover:text-[var(--onboarding-text-strong)]"
                  >
                    {t("onboarding.getOneHere")}
                  </a>
                </>
              }
            >
              {({ describedBy, invalid }) => (
                <Input
                  id="elizacloud-apikey-pre"
                  type="password"
                  aria-describedby={describedBy}
                  aria-invalid={invalid}
                  className={`${onboardingInputClassName} text-center`}
                  placeholder="ck-..."
                  value={onboardingApiKey}
                  onChange={handleApiKeyChange}
                />
              )}
            </OnboardingField>
          </div>
        )}
      </div>

      <div className={onboardingFooterClass}>
        <Button
          variant="ghost"
          className={onboardingSecondaryActionClass}
          style={onboardingSecondaryActionTextShadowStyle}
          onClick={() => dispatch({ type: "backElizaCloudPreProvider" })}
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
            void handleOnboardingNext();
          }}
          disabled={!elizaCloudReady}
          type="button"
        >
          {t("onboarding.confirm")}
        </Button>
      </div>
      <p className="mt-3 text-center text-xs leading-relaxed text-[var(--onboarding-text-subtle)]">
        {t("onboarding.restartAfterProviderChangeHint")}
      </p>
    </>
  );
}
