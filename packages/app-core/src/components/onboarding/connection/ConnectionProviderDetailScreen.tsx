import { ONBOARDING_PROVIDER_CATALOG } from "@elizaos/agent/contracts/onboarding";
import type {
  OpenRouterModelOption,
  PiAiModelOption,
  ProviderOption,
} from "../../../api";
import { client } from "../../../api";
import { useBranding } from "../../../config";
import type { ChangeEvent } from "react";
import { useState } from "react";
import { useAdvanceOnboardingWhenElizaCloudOAuthConnected } from "./useAdvanceOnboardingWhenElizaCloudOAuthConnected";
import type { ConnectionEvent } from "../../../onboarding/connection-flow";
import { getProviderLogo } from "../../../providers";
import { useApp } from "../../../state";
import { openExternalUrl } from "../../../utils";

function formatRequestError(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}

const providerOverrides: Record<
  string,
  { name: string; description?: string }
> = {
  elizacloud: {
    name: "Eliza Cloud",
    description: "LLMs, RPCs & more included",
  },
  "anthropic-subscription": {
    name: "Claude Sub",
    description: "Pro/Max subscription",
  },
  "openai-subscription": {
    name: "ChatGPT Sub",
    description: "Plus/Pro subscription",
  },
  anthropic: { name: "Anthropic", description: "Claude API key" },
  openai: { name: "OpenAI", description: "GPT API key" },
  openrouter: { name: "OpenRouter", description: "Multi-model API" },
  gemini: { name: "Gemini", description: "Google AI" },
  grok: { name: "xAI (Grok)" },
  groq: { name: "Groq", description: "Fast inference" },
  deepseek: { name: "DeepSeek" },
  "pi-ai": { name: "Pi Credentials", description: "Local auth" },
};

export function ConnectionProviderDetailScreen({
  dispatch,
}: {
  dispatch: (event: ConnectionEvent) => void;
}) {
  const {
    onboardingOptions,
    onboardingProvider,
    onboardingSubscriptionTab,
    onboardingApiKey,
    onboardingPrimaryModel,
    onboardingElizaCloudTab,
    onboardingOpenRouterModel,
    elizaCloudConnected,
    elizaCloudLoginBusy,
    elizaCloudLoginError,
    handleCloudLogin,
    handleOnboardingNext,
    setState,
    t,
  } = useApp();

  const branding = useBranding();

  const [openaiOAuthStarted, setOpenaiOAuthStarted] = useState(false);
  const [openaiCallbackUrl, setOpenaiCallbackUrl] = useState("");
  const [openaiConnected, setOpenaiConnected] = useState(false);
  const [openaiError, setOpenaiError] = useState("");

  const [anthropicOAuthStarted, setAnthropicOAuthStarted] = useState(false);
  const [anthropicCode, setAnthropicCode] = useState("");
  const [anthropicConnected, setAnthropicConnected] = useState(false);
  const [anthropicError, setAnthropicError] = useState("");

  const [apiKeyFormatWarning, setApiKeyFormatWarning] = useState("");

  const catalogProviders: ProviderOption[] = (
    onboardingOptions?.providers as ProviderOption[] | undefined
  )?.length
    ? (onboardingOptions!.providers as ProviderOption[])
    : ([...ONBOARDING_PROVIDER_CATALOG] as unknown as ProviderOption[]);
  const customProviders = branding.customProviders ?? [];
  const catalogIds = new Set(catalogProviders.map((p: ProviderOption) => p.id));
  const providers = [
    ...catalogProviders,
    ...customProviders.filter((cp) => !catalogIds.has(cp.id as never)),
  ] as ProviderOption[];
  const customLogoMap = new Map(
    customProviders
      .filter((cp) => cp.logoDark || cp.logoLight)
      .map((cp) => [cp.id, { logoDark: cp.logoDark, logoLight: cp.logoLight }]),
  );
  const getCustomLogo = (id: string) => customLogoMap.get(id);

  const getProviderDisplay = (provider: ProviderOption) => {
    const override = providerOverrides[provider.id];
    return {
      name: override?.name ?? provider.name,
      description: override?.description ?? provider.description,
    };
  };

  const selectedProvider = providers.find(
    (p: ProviderOption) => p.id === onboardingProvider,
  );
  const selectedDisplay = selectedProvider
    ? getProviderDisplay(selectedProvider)
    : { name: onboardingProvider, description: "" };

  const piAiModels = onboardingOptions?.piAiModels ?? [];
  const piAiDefaultModel = onboardingOptions?.piAiDefaultModel ?? "";
  const normalizedPrimaryModel = onboardingPrimaryModel.trim();
  const hasKnownPiAiModel = piAiModels.some(
    (model: PiAiModelOption) => model.id === normalizedPrimaryModel,
  );
  const piAiSelectValue =
    normalizedPrimaryModel.length === 0
      ? ""
      : hasKnownPiAiModel
        ? normalizedPrimaryModel
        : "__custom__";

  const validateApiKeyFormat = (key: string, providerId: string): string => {
    if (!key || key.trim().length === 0) return "";
    const trimmed = key.trim();
    if (providerId === "openai" && !trimmed.startsWith("sk-")) {
      return t("onboarding.keyFormatWarning");
    }
    if (providerId === "anthropic" && !trimmed.startsWith("sk-ant-")) {
      return t("onboarding.keyFormatWarning");
    }
    if (trimmed.length < 20) {
      return t("onboarding.keyFormatWarning");
    }
    return "";
  };

  const handleApiKeyChange = (e: ChangeEvent<HTMLInputElement>) => {
    const newKey = e.target.value;
    setState("onboardingApiKey", newKey);
    setApiKeyFormatWarning(validateApiKeyFormat(newKey, onboardingProvider));
  };

  const handleOpenRouterModelSelect = (modelId: string) => {
    setState("onboardingOpenRouterModel", modelId);
  };

  const handleAnthropicStart = async () => {
    setAnthropicError("");
    try {
      const { authUrl } = await client.startAnthropicLogin();
      if (authUrl) {
        await openExternalUrl(authUrl);
        setAnthropicOAuthStarted(true);
        return;
      }
      setAnthropicError("Failed to get auth URL");
    } catch (err) {
      setAnthropicError(`Failed to start login: ${formatRequestError(err)}`);
    }
  };

  const handleAnthropicExchange = async () => {
    setAnthropicError("");
    try {
      const result = await client.exchangeAnthropicCode(anthropicCode);
      if (result.success) {
        setAnthropicConnected(true);
        return;
      }
      setAnthropicError(result.error ?? "Exchange failed");
    } catch (err) {
      setAnthropicError(`Exchange failed: ${formatRequestError(err)}`);
    }
  };

  const handleOpenAIStart = async () => {
    try {
      const { authUrl } = await client.startOpenAILogin();
      if (authUrl) {
        await openExternalUrl(authUrl);
        setOpenaiOAuthStarted(true);
        return;
      }
      setOpenaiError("No auth URL returned from login");
    } catch (err) {
      setOpenaiError(`Failed to start login: ${formatRequestError(err)}`);
    }
  };

  const handleOpenAIExchange = async () => {
    setOpenaiError("");
    try {
      const data = await client.exchangeOpenAICode(openaiCallbackUrl);
      if (data.success) {
        setOpenaiOAuthStarted(false);
        setOpenaiCallbackUrl("");
        setOpenaiConnected(true);
        setState("onboardingProvider", "openai-subscription");
        return;
      }
      const msg = data.error ?? "Exchange failed";
      setOpenaiError(
        msg.includes("No active flow")
          ? t("onboarding.loginSessionExpired")
          : msg,
      );
    } catch (_err) {
      setOpenaiError(t("onboarding.networkError"));
    }
  };

  const clearProvider = () => dispatch({ type: "clearProvider" });

  useAdvanceOnboardingWhenElizaCloudOAuthConnected({
    active: onboardingProvider === "elizacloud",
    elizaCloudConnected,
    elizaCloudTab: onboardingElizaCloudTab,
    handleOnboardingNext,
  });

  const isConfirmDisabled =
    onboardingProvider === "elizacloud" &&
    ((onboardingElizaCloudTab === "login" && !elizaCloudConnected) ||
      (onboardingElizaCloudTab === "apikey" && !onboardingApiKey.trim()));

  return (
    <>
      <div className="onboarding-section-title">
        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            justifyContent: "center",
          }}
        >
          {selectedProvider && (
            <img
              src={getProviderLogo(
                selectedProvider.id,
                false,
                getCustomLogo(selectedProvider.id),
              )}
              alt={selectedDisplay.name}
              className="onboarding-provider-icon"
              style={{ width: "1.5rem", height: "1.5rem" }}
            />
          )}
          {selectedDisplay.name}
        </span>
      </div>
      <div className="onboarding-divider">
        <div className="onboarding-divider-diamond" />
      </div>

      {onboardingProvider === "elizacloud" && (
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
              onClick={() =>
                dispatch({ type: "setElizaCloudTab", tab: "login" })
              }
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
                htmlFor="elizacloud-apikey-detail"
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
                id="elizacloud-apikey-detail"
                type="password"
                className="onboarding-input"
                placeholder="ec-..."
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
      )}

      {onboardingProvider === "anthropic-subscription" && (
        <div style={{ textAlign: "left", width: "100%" }}>
          <div
            style={{
              display: "flex",
              gap: "1rem",
              borderBottom: "1px solid var(--border)",
              marginBottom: "0.75rem",
            }}
          >
            <button
              type="button"
              style={{
                fontSize: "0.875rem",
                paddingBottom: "0.5rem",
                background: "none",
                border: "none",
                borderBottom:
                  onboardingSubscriptionTab === "token"
                    ? "2px solid #f0b90b"
                    : "2px solid transparent",
                color:
                  onboardingSubscriptionTab === "token"
                    ? "#f0b90b"
                    : "var(--muted)",
                cursor: "pointer",
              }}
              onClick={() =>
                dispatch({ type: "setSubscriptionTab", tab: "token" })
              }
            >
              {t("onboarding.setupToken")}
            </button>
            <button
              type="button"
              style={{
                fontSize: "0.875rem",
                paddingBottom: "0.5rem",
                background: "none",
                border: "none",
                borderBottom:
                  onboardingSubscriptionTab === "oauth"
                    ? "2px solid #f0b90b"
                    : "2px solid transparent",
                color:
                  onboardingSubscriptionTab === "oauth"
                    ? "#f0b90b"
                    : "var(--muted)",
                cursor: "pointer",
              }}
              onClick={() =>
                dispatch({ type: "setSubscriptionTab", tab: "oauth" })
              }
            >
              {t("onboarding.oauthLogin")}
            </button>
          </div>

          {onboardingSubscriptionTab === "token" ? (
            <>
              <span
                style={{
                  fontSize: "0.8125rem",
                  fontWeight: "bold",
                  display: "block",
                  marginBottom: "0.5rem",
                  color: "var(--text)",
                }}
              >
                {t("onboarding.enterSetupToken")}
              </span>
              <input
                type="password"
                className="onboarding-input"
                value={onboardingApiKey}
                onChange={handleApiKeyChange}
                placeholder="sk-ant-oat01-..."
              />
              <p
                className="onboarding-desc"
                style={{ whiteSpace: "pre-line", textAlign: "left" }}
              >
                {t("onboarding.setupTokenInstructions")}
              </p>
            </>
          ) : anthropicConnected ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "0.75rem",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.75rem 1.5rem",
                  border: "1px solid var(--ok-muted)",
                  background: "var(--ok-subtle)",
                  color: "var(--ok)",
                  fontSize: "0.875rem",
                  fontWeight: "500",
                  width: "100%",
                  maxWidth: "20rem",
                  justifyContent: "center",
                }}
              >
                <svg
                  width="18"
                  height="18"
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
                {t("onboarding.connectedToClaude")}
              </div>
              <p className="onboarding-desc" style={{ textAlign: "center" }}>
                {t("onboarding.claudeSubscriptionReady")}
              </p>
            </div>
          ) : !anthropicOAuthStarted ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "0.75rem",
              }}
            >
              <button
                type="button"
                className="onboarding-confirm-btn"
                onClick={() => void handleAnthropicStart()}
              >
                {t("onboarding.loginWithAnthropic")}
              </button>
              <p className="onboarding-desc" style={{ textAlign: "center" }}>
                {t("onboarding.requiresClaudeSub")}
              </p>
              {anthropicError && (
                <p style={{ fontSize: "0.75rem", color: "var(--danger)" }}>
                  {anthropicError}
                </p>
              )}
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "0.75rem",
              }}
            >
              <p
                style={{
                  fontSize: "0.875rem",
                  textAlign: "center",
                  color: "var(--text)",
                }}
              >
                {t("onboarding.authCodeInstructions")
                  .split("\n")
                  .map((line, i) => (
                    <span key={line + String(i)}>
                      {line}
                      {i === 0 && <br />}
                    </span>
                  ))}
              </p>
              <input
                type="text"
                className="onboarding-input"
                placeholder={t("onboarding.pasteAuthCode")}
                value={anthropicCode}
                onChange={(e) => setAnthropicCode(e.target.value)}
                style={{ textAlign: "center" }}
              />
              {anthropicError && (
                <p style={{ fontSize: "0.75rem", color: "var(--danger)" }}>
                  {anthropicError}
                </p>
              )}
              <button
                type="button"
                className="onboarding-confirm-btn"
                disabled={!anthropicCode}
                onClick={() => void handleAnthropicExchange()}
              >
                {t("onboarding.connect")}
              </button>
            </div>
          )}
        </div>
      )}

      {onboardingProvider === "openai-subscription" && (
        <div style={{ width: "100%" }}>
          {openaiConnected ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "0.75rem",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.75rem 1.5rem",
                  border: "1px solid var(--ok-muted)",
                  background: "var(--ok-subtle)",
                  color: "var(--ok)",
                  fontSize: "0.875rem",
                  fontWeight: "500",
                  width: "100%",
                  maxWidth: "20rem",
                  justifyContent: "center",
                }}
              >
                <svg
                  width="18"
                  height="18"
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
                {t("onboarding.connectedToChatGPT")}
              </div>
              <p className="onboarding-desc" style={{ textAlign: "center" }}>
                {t("onboarding.chatgptSubscriptionReady")}
              </p>
            </div>
          ) : !openaiOAuthStarted ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "0.75rem",
              }}
            >
              <button
                type="button"
                className="onboarding-confirm-btn"
                onClick={() => void handleOpenAIStart()}
              >
                {t("onboarding.loginWithOpenAI")}
              </button>
              <p className="onboarding-desc" style={{ textAlign: "center" }}>
                {t("onboarding.requiresChatGPTSub")}
              </p>
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.75rem",
              }}
            >
              <div
                style={{
                  padding: "0.75rem",
                  border: "1px solid var(--border)",
                  background: "var(--bg-hover)",
                  fontSize: "0.875rem",
                  borderRadius: "0.25rem",
                }}
              >
                <p
                  style={{
                    fontWeight: "500",
                    marginBottom: "0.25rem",
                    color: "var(--text)",
                  }}
                >
                  {t("onboarding.almostThere")}
                </p>
                <p
                  className="onboarding-desc"
                  style={{ lineHeight: "1.5", textAlign: "left" }}
                >
                  {t("onboarding.redirectInstructions")}{" "}
                  <code
                    style={{
                      background: "var(--bg-hover)",
                      padding: "0 0.25rem",
                      fontSize: "0.75rem",
                    }}
                  >
                    localhost:1455
                  </code>
                  {t("onboarding.copyEntireUrl")}
                </p>
              </div>
              <input
                type="text"
                className="onboarding-input"
                placeholder="http://localhost:1455/..."
                value={openaiCallbackUrl}
                onChange={(e) => {
                  setOpenaiCallbackUrl(e.target.value);
                  setOpenaiError("");
                }}
              />
              {openaiError && (
                <p style={{ fontSize: "0.75rem", color: "var(--danger)" }}>
                  {openaiError}
                </p>
              )}
              <div
                style={{
                  display: "flex",
                  gap: "0.5rem",
                  justifyContent: "center",
                }}
              >
                <button
                  type="button"
                  className="onboarding-confirm-btn"
                  disabled={!openaiCallbackUrl}
                  onClick={() => void handleOpenAIExchange()}
                >
                  {t("onboarding.completeLogin")}
                </button>
                <button
                  type="button"
                  className="onboarding-back-link"
                  onClick={() => {
                    setOpenaiOAuthStarted(false);
                    setOpenaiCallbackUrl("");
                  }}
                >
                  {t("onboarding.startOver")}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {onboardingProvider &&
        onboardingProvider !== "anthropic-subscription" &&
        onboardingProvider !== "openai-subscription" &&
        onboardingProvider !== "elizacloud" &&
        onboardingProvider !== "ollama" &&
        onboardingProvider !== "pi-ai" && (
          <div style={{ textAlign: "left", width: "100%" }}>
            <span
              style={{
                fontSize: "0.8125rem",
                fontWeight: "bold",
                display: "block",
                marginBottom: "0.5rem",
                color: "var(--text)",
              }}
            >
              {t("onboarding.apiKey")}
            </span>
            <input
              type="password"
              className="onboarding-input"
              value={onboardingApiKey}
              onChange={handleApiKeyChange}
              placeholder={t("onboarding.enterApiKey")}
            />
            {apiKeyFormatWarning && (
              <p
                style={{
                  fontSize: "0.75rem",
                  color: "var(--danger)",
                  marginTop: "0.5rem",
                }}
              >
                {apiKeyFormatWarning}
              </p>
            )}
          </div>
        )}

      {onboardingProvider === "ollama" && (
        <p className="onboarding-desc">{t("onboarding.ollamaNoConfig")}</p>
      )}

      {onboardingProvider === "pi-ai" && (
        <div style={{ textAlign: "left", width: "100%" }}>
          <span
            style={{
              fontSize: "0.8125rem",
              fontWeight: "bold",
              display: "block",
              marginBottom: "0.5rem",
              color: "var(--text)",
            }}
          >
            {t("onboarding.primaryModelOptional")}
          </span>
          {piAiModels.length > 0 ? (
            <>
              <select
                value={piAiSelectValue}
                onChange={(e) => {
                  const next = e.target.value;
                  if (next === "__custom__") {
                    if (piAiSelectValue !== "__custom__") {
                      setState("onboardingPrimaryModel", "");
                    }
                    return;
                  }
                  setState("onboardingPrimaryModel", next);
                }}
                className="onboarding-input"
              >
                <option value="">
                  {t("onboarding.useDefaultModel")}
                  {piAiDefaultModel ? ` (${piAiDefaultModel})` : ""}
                </option>
                {piAiModels.map((model: PiAiModelOption) => (
                  <option key={model.id} value={model.id}>
                    {model.name} ({model.provider})
                  </option>
                ))}
                <option value="__custom__">
                  {t("onboarding.customModel")}
                </option>
              </select>
              {piAiSelectValue === "__custom__" && (
                <input
                  type="text"
                  className="onboarding-input"
                  value={onboardingPrimaryModel}
                  onChange={(e) =>
                    setState("onboardingPrimaryModel", e.target.value)
                  }
                  placeholder="provider/model (e.g. anthropic/claude-3.5-sonnet)"
                  style={{ marginTop: "0.5rem" }}
                />
              )}
            </>
          ) : (
            <input
              type="text"
              className="onboarding-input"
              value={onboardingPrimaryModel}
              onChange={(e) =>
                setState("onboardingPrimaryModel", e.target.value)
              }
              placeholder="provider/model (e.g. anthropic/claude-3.5-sonnet)"
            />
          )}
          <p className="onboarding-desc" style={{ textAlign: "left" }}>
            {t("onboarding.piCredentialsHint")}
            {piAiModels.length > 0
              ? t("onboarding.piDropdownHint")
              : t("onboarding.piManualHint")}
          </p>
        </div>
      )}

      {onboardingProvider === "openrouter" &&
        onboardingApiKey.trim() &&
        onboardingOptions?.openrouterModels && (
          <div style={{ marginTop: "1rem", textAlign: "left", width: "100%" }}>
            <span
              style={{
                fontSize: "0.8125rem",
                fontWeight: "bold",
                display: "block",
                marginBottom: "0.5rem",
                color: "var(--text)",
              }}
            >
              {t("onboarding.selectModel")}
            </span>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
              }}
            >
              {onboardingOptions?.openrouterModels?.map(
                (model: OpenRouterModelOption) => (
                  <button
                    type="button"
                    key={model.id}
                    className={`onboarding-provider-card${onboardingOpenRouterModel === model.id ? " onboarding-provider-card--selected" : ""}`}
                    onClick={() => handleOpenRouterModelSelect(model.id)}
                    style={{ width: "100%" }}
                  >
                    <div>
                      <div className="onboarding-provider-name">
                        {model.name}
                      </div>
                      {model.description && (
                        <div className="onboarding-provider-desc">
                          {model.description}
                        </div>
                      )}
                    </div>
                  </button>
                ),
              )}
            </div>
          </div>
        )}

      <div className="onboarding-panel-footer">
        <button
          className="onboarding-back-link"
          onClick={clearProvider}
          type="button"
        >
          {t("onboarding.back")}
        </button>
        <button
          className="onboarding-confirm-btn"
          disabled={isConfirmDisabled}
          onClick={() => handleOnboardingNext()}
          type="button"
        >
          {t("onboarding.confirm")}
        </button>
      </div>
    </>
  );
}
