import type { ChangeEvent } from "react";
import type { ConnectionEvent } from "../../../onboarding/connection-flow";
import { useApp } from "../../../state";
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
      <div className="onboarding-section-title">Eliza Cloud</div>
      <div className="onboarding-divider">
        <div className="onboarding-divider-diamond" />
      </div>

      <div style={{ width: "100%", textAlign: "left" }}>
        <div
          style={{
            display: "flex",
            gap: "1rem",
            borderBottom: "1px solid var(--border)",
            marginBottom: "1rem",
          }}
        >
          <button
            type="button"
            style={{
              fontSize: "0.875rem",
              paddingBottom: "0.5rem",
              color:
                onboardingElizaCloudTab === "login"
                  ? "#f0b90b"
                  : "var(--muted)",
              background: "none",
              border: "none",
              borderBottom:
                onboardingElizaCloudTab === "login"
                  ? "2px solid #f0b90b"
                  : "2px solid transparent",
              cursor: "pointer",
            }}
            onClick={() => dispatch({ type: "setElizaCloudTab", tab: "login" })}
          >
            {t("onboarding.login")}
          </button>
          <button
            type="button"
            style={{
              fontSize: "0.875rem",
              paddingBottom: "0.5rem",
              borderBottom:
                onboardingElizaCloudTab === "apikey"
                  ? "2px solid #f0b90b"
                  : "2px solid transparent",
              color:
                onboardingElizaCloudTab === "apikey"
                  ? "#f0b90b"
                  : "var(--muted)",
              background: "none",
              border: "none",
              cursor: "pointer",
            }}
            onClick={() =>
              dispatch({ type: "setElizaCloudTab", tab: "apikey" })
            }
          >
            {t("onboarding.apiKey")}
          </button>
        </div>

        {onboardingElizaCloudTab === "login" ? (
          <div style={{ textAlign: "center" }}>
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
              <button
                type="button"
                className="onboarding-confirm-btn"
                onClick={handleCloudLogin}
                disabled={elizaCloudLoginBusy}
              >
                {elizaCloudLoginBusy
                  ? t("onboarding.connecting")
                  : t("onboarding.connectAccount")}
              </button>
            )}
            {elizaCloudLoginError &&
              (() => {
                const urlMatch = elizaCloudLoginError.match(
                  /^Open this link to log in: (.+)$/,
                );
                if (urlMatch) {
                  return (
                    <p
                      style={{
                        fontSize: "0.8125rem",
                        marginTop: "0.5rem",
                        color: "var(--text)",
                      }}
                    >
                      Open this link to log in:{" "}
                      <a
                        href={urlMatch[1]}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          color: "var(--text)",
                          textDecoration: "underline",
                        }}
                      >
                        Click here
                      </a>
                    </p>
                  );
                }
                return (
                  <p
                    style={{
                      color: "var(--danger)",
                      fontSize: "0.8125rem",
                      marginTop: "0.5rem",
                    }}
                  >
                    {elizaCloudLoginError}
                  </p>
                );
              })()}
            <p className="onboarding-desc">{t("onboarding.freeCredits")}</p>
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
            <input
              id="elizacloud-apikey-pre"
              type="password"
              className="onboarding-input"
              placeholder="ck-..."
              value={onboardingApiKey}
              onChange={handleApiKeyChange}
            />
            <p className="onboarding-desc">
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

      <div className="onboarding-panel-footer">
        <button
          className="onboarding-back-link"
          onClick={() => dispatch({ type: "backElizaCloudPreProvider" })}
          type="button"
        >
          {t("onboarding.back")}
        </button>
        <button
          className="onboarding-confirm-btn"
          onClick={() => void handleOnboardingNext()}
          disabled={!elizaCloudReady}
          type="button"
        >
          {t("onboarding.confirm")}
        </button>
      </div>
    </>
  );
}
