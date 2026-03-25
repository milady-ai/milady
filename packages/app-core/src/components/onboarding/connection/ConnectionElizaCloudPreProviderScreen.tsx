import { Button, Input } from "@miladyai/ui";
import type { ChangeEvent } from "react";
import type { ConnectionEvent } from "../../../onboarding/connection-flow";
import { useApp } from "../../../state";
import { openExternalUrl } from "../../../utils";
import { OnboardingTabs } from "../OnboardingTabs";
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
import { useAdvanceOnboardingWhenElizaCloudOAuthConnected } from "./useAdvanceOnboardingWhenElizaCloudOAuthConnected";

export function ConnectionElizaCloudPreProviderScreen({
  dispatch,
}: {
  dispatch: (event: ConnectionEvent) => void;
}) {
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

      <div style={{ width: "100%", textAlign: "left" }}>
        <OnboardingTabs
          tabs={[
            { id: "login" as const, label: t("onboarding.login") },
            { id: "apikey" as const, label: t("onboarding.apiKey") },
          ]}
          active={onboardingElizaCloudTab}
          onChange={(tab) => dispatch({ type: "setElizaCloudTab", tab })}
        />

        {onboardingElizaCloudTab === "login" ? (
          <div className="flex flex-col items-center gap-3 text-center">
            {elizaCloudConnected ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.625rem 1rem",
                  border: "1px solid var(--ok-muted)",
                  background: "var(--ok-subtle)",
                  color: "var(--ok)",
                  fontSize: "0.875rem",
                  borderRadius: "0.5rem",
                  justifyContent: "center",
                }}
              >
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
              </div>
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
                    <button
                      type="button"
                      className="text-sm text-[var(--onboarding-link)] underline mt-2 cursor-pointer bg-transparent border-none font-inherit hover:text-[var(--onboarding-text-strong)] transition-colors duration-200"
                      onClick={() => openExternalUrl(urlMatch[1])}
                    >
                      Open login page in browser
                    </button>
                  );
                }
                return (
                  <p
                    style={{
                      color: "var(--danger)",
                      fontSize: "0.8125rem",
                      marginTop: "0.5rem",
                      ...onboardingBodyTextShadowStyle,
                    }}
                  >
                    {elizaCloudLoginError}
                  </p>
                );
              })()}
            <p className="text-sm text-[var(--onboarding-text-muted)] text-center leading-relaxed mt-3">
              {t("onboarding.freeCredits")}
            </p>
          </div>
        ) : (
          <div>
            <label
              htmlFor="elizacloud-apikey-pre"
              style={{
                display: "block",
                fontSize: "0.875rem",
                marginBottom: "0.375rem",
                color: "var(--muted)",
              }}
            >
              {t("onboarding.apiKey")}
            </label>
            <Input
              id="elizacloud-apikey-pre"
              type="password"
              className="w-full px-[20px] py-[16px] bg-[var(--onboarding-card-bg)] border border-[var(--onboarding-card-border)] rounded-[6px] text-[var(--onboarding-text-primary)] font-inherit outline-none tracking-[0.03em] text-center transition-all duration-300 focus:border-[var(--onboarding-field-focus-border)] focus:shadow-[var(--onboarding-field-focus-shadow)] placeholder:text-[var(--onboarding-text-faint)]"
              placeholder="ck-..."
              value={onboardingApiKey}
              onChange={handleApiKeyChange}
            />
            <p className="text-sm text-[var(--onboarding-text-muted)] text-center leading-relaxed mt-3">
              {t("onboarding.useExistingKey")}{" "}
              <a
                href="https://elizacloud.ai/dashboard/settings"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--text)" }}
              >
                {t("onboarding.getOneHere")}
              </a>
            </p>
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
    </>
  );
}
