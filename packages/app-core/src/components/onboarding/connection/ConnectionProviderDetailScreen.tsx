import { ONBOARDING_PROVIDER_CATALOG } from "@miladyai/shared/contracts/onboarding";
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@miladyai/ui";
import type { ChangeEvent } from "react";
import { useState } from "react";
import type {
  OpenRouterModelOption,
  PiAiModelOption,
  ProviderOption,
} from "../../../api";
import { client } from "../../../api";
import { useBranding } from "../../../config";
import {
  type ConnectionEvent,
  isProviderConfirmDisabled,
} from "../../../onboarding/connection-flow";
import { getProviderLogo } from "../../../providers";
import { useApp } from "../../../state";
import { openExternalUrl } from "../../../utils";
import { OnboardingTabs } from "../OnboardingTabs";
import { useAdvanceOnboardingWhenElizaCloudOAuthConnected } from "./useAdvanceOnboardingWhenElizaCloudOAuthConnected";

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
  openrouter: { name: "OpenRouter", description: "Many models" },
  gemini: { name: "Gemini", description: "Google AI" },
  grok: { name: "xAI (Grok)" },
  groq: { name: "Groq", description: "Fast inference" },
  deepseek: { name: "DeepSeek", description: "DeepSeek models" },
  mistral: { name: "Mistral", description: "Mistral models" },
  together: { name: "Together AI", description: "OSS models" },
  ollama: { name: "Ollama", description: "Local models" },
  zai: { name: "z.ai", description: "GLM models" },
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
    ? (onboardingOptions?.providers as ProviderOption[])
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
      ? "__default__"
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

  const isConfirmDisabled = isProviderConfirmDisabled({
    provider: onboardingProvider,
    apiKey: onboardingApiKey,
    elizaCloudTab: onboardingElizaCloudTab,
    elizaCloudConnected,
    subscriptionTab: onboardingSubscriptionTab,
  });

  return (
    <>
      <div
        className="text-xs tracking-[0.3em] uppercase text-[var(--onboarding-text-muted)] font-semibold text-center mb-0"
        style={{ textShadow: "0 2px 10px rgba(3,5,10,0.55)" }}
      >
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
              className="w-6 h-6 rounded-md object-contain shrink-0"
              style={{ width: "1.5rem", height: "1.5rem" }}
            />
          )}
          {selectedDisplay.name}
        </span>
      </div>
      <div className="flex items-center gap-[12px] my-[16px] before:content-[''] before:flex-1 before:h-[1px] before:bg-gradient-to-r before:from-transparent before:via-[var(--onboarding-divider)] before:to-transparent after:content-[''] after:flex-1 after:h-[1px] after:bg-gradient-to-r after:from-transparent after:via-[var(--onboarding-divider)] after:to-transparent">
        <div className="w-1.5 h-1.5 bg-[rgba(240,185,11,0.4)] rotate-45 shrink-0" />
      </div>

      {onboardingProvider === "elizacloud" && (
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
                  className="group relative inline-flex items-center justify-center gap-[8px] px-[32px] py-[12px] min-h-[44px] bg-[var(--onboarding-accent-bg)] border border-[var(--onboarding-accent-border)] rounded-[6px] text-[var(--onboarding-accent-foreground)] text-[11px] font-semibold tracking-[0.18em] uppercase cursor-pointer transition-all duration-300 font-inherit overflow-hidden hover:bg-[var(--onboarding-accent-bg-hover)] hover:border-[var(--onboarding-accent-border-hover)] disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ textShadow: "0 1px 6px rgba(3,5,10,0.55)" }}
                  onClick={handleCloudLogin}
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
                      aria-live="assertive"
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
              <p className="text-sm text-[var(--onboarding-text-muted)] text-center leading-relaxed mt-3">
                {t("onboarding.freeCredits")}
              </p>
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
              <Input
                id="elizacloud-apikey-detail"
                type="password"
                className="w-full px-[20px] py-[16px] bg-[var(--onboarding-card-bg)] border border-[var(--onboarding-card-border)] rounded-[6px] text-[var(--onboarding-text-primary)] font-inherit outline-none tracking-[0.03em] text-center transition-all duration-300 focus:border-[var(--onboarding-field-focus-border)] focus:shadow-[var(--onboarding-field-focus-shadow)] placeholder:text-[var(--onboarding-text-faint)]"
                placeholder="ec-..."
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
      )}

      {onboardingProvider === "anthropic-subscription" && (
        <div style={{ textAlign: "left", width: "100%" }}>
          <OnboardingTabs
            tabs={[
              { id: "token" as const, label: t("onboarding.setupToken") },
              { id: "oauth" as const, label: t("onboarding.oauthLogin") },
            ]}
            active={onboardingSubscriptionTab}
            onChange={(tab) => dispatch({ type: "setSubscriptionTab", tab })}
          />

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
              <Input
                type="password"
                className="w-full px-[20px] py-[16px] bg-[var(--onboarding-card-bg)] border border-[var(--onboarding-card-border)] rounded-[6px] text-[var(--onboarding-text-primary)] font-inherit outline-none tracking-[0.03em] text-center transition-all duration-300 focus:border-[var(--onboarding-field-focus-border)] focus:shadow-[var(--onboarding-field-focus-shadow)] placeholder:text-[var(--onboarding-text-faint)]"
                value={onboardingApiKey}
                onChange={handleApiKeyChange}
                placeholder="sk-ant-oat01-..."
              />
              <p
                className="text-sm text-[var(--onboarding-text-muted)] text-center leading-relaxed mt-3"
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
              <p
                className="text-sm text-[var(--onboarding-text-muted)] text-center leading-relaxed mt-3"
                style={{ textAlign: "center" }}
              >
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
              <Button
                type="button"
                className="group relative inline-flex items-center justify-center gap-[8px] px-[32px] py-[12px] min-h-[44px] bg-[var(--onboarding-accent-bg)] border border-[var(--onboarding-accent-border)] rounded-[6px] text-[var(--onboarding-accent-foreground)] text-[11px] font-semibold tracking-[0.18em] uppercase cursor-pointer transition-all duration-300 font-inherit overflow-hidden hover:bg-[var(--onboarding-accent-bg-hover)] hover:border-[var(--onboarding-accent-border-hover)] disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ textShadow: "0 1px 6px rgba(3,5,10,0.55)" }}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const circle = document.createElement("span");
                  const diameter = Math.max(rect.width, rect.height);
                  circle.style.width = circle.style.height = `${diameter}px`;
                  circle.style.left = `${e.clientX - rect.left - diameter / 2}px`;
                  circle.style.top = `${e.clientY - rect.top - diameter / 2}px`;
                  circle.className =
                    "absolute rounded-full bg-[var(--onboarding-ripple)] transform scale-0 animate-[onboarding-ripple-expand_0.6s_ease-out_forwards] pointer-events-none";
                  e.currentTarget.appendChild(circle);
                  setTimeout(() => circle.remove(), 600);
                  void handleAnthropicStart();
                }}
              >
                {t("onboarding.loginWithAnthropic")}
              </Button>
              <p
                className="text-sm text-[var(--onboarding-text-muted)] text-center leading-relaxed mt-3"
                style={{ textAlign: "center" }}
              >
                {t("onboarding.requiresClaudeSub")}
              </p>
              {anthropicError && (
                <p
                  aria-live="assertive"
                  style={{ fontSize: "0.75rem", color: "var(--danger)" }}
                >
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
              <Input
                type="text"
                className="w-full px-[20px] py-[16px] bg-[var(--onboarding-card-bg)] border border-[var(--onboarding-card-border)] rounded-[6px] text-[var(--onboarding-text-primary)] font-inherit outline-none tracking-[0.03em] text-center transition-all duration-300 focus:border-[var(--onboarding-field-focus-border)] focus:shadow-[var(--onboarding-field-focus-shadow)] placeholder:text-[var(--onboarding-text-faint)]"
                placeholder={t("onboarding.pasteAuthCode")}
                value={anthropicCode}
                onChange={(e) => setAnthropicCode(e.target.value)}
                style={{ textAlign: "center" }}
              />
              {anthropicError && (
                <p
                  aria-live="assertive"
                  style={{ fontSize: "0.75rem", color: "var(--danger)" }}
                >
                  {anthropicError}
                </p>
              )}
              <Button
                type="button"
                className="group relative inline-flex items-center justify-center gap-[8px] px-[32px] py-[12px] min-h-[44px] bg-[var(--onboarding-accent-bg)] border border-[var(--onboarding-accent-border)] rounded-[6px] text-[var(--onboarding-accent-foreground)] text-[11px] font-semibold tracking-[0.18em] uppercase cursor-pointer transition-all duration-300 font-inherit overflow-hidden hover:bg-[var(--onboarding-accent-bg-hover)] hover:border-[var(--onboarding-accent-border-hover)] disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ textShadow: "0 1px 6px rgba(3,5,10,0.55)" }}
                disabled={!anthropicCode}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const circle = document.createElement("span");
                  const diameter = Math.max(rect.width, rect.height);
                  circle.style.width = circle.style.height = `${diameter}px`;
                  circle.style.left = `${e.clientX - rect.left - diameter / 2}px`;
                  circle.style.top = `${e.clientY - rect.top - diameter / 2}px`;
                  circle.className =
                    "absolute rounded-full bg-[var(--onboarding-ripple)] transform scale-0 animate-[onboarding-ripple-expand_0.6s_ease-out_forwards] pointer-events-none";
                  e.currentTarget.appendChild(circle);
                  setTimeout(() => circle.remove(), 600);
                  void handleAnthropicExchange();
                }}
              >
                {t("onboarding.connect")}
              </Button>
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
              <p
                className="text-sm text-[var(--onboarding-text-muted)] text-center leading-relaxed mt-3"
                style={{ textAlign: "center" }}
              >
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
              <Button
                type="button"
                className="group relative inline-flex items-center justify-center gap-[8px] px-[32px] py-[12px] min-h-[44px] bg-[var(--onboarding-accent-bg)] border border-[var(--onboarding-accent-border)] rounded-[6px] text-[var(--onboarding-accent-foreground)] text-[11px] font-semibold tracking-[0.18em] uppercase cursor-pointer transition-all duration-300 font-inherit overflow-hidden hover:bg-[var(--onboarding-accent-bg-hover)] hover:border-[var(--onboarding-accent-border-hover)] disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ textShadow: "0 1px 6px rgba(3,5,10,0.55)" }}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const circle = document.createElement("span");
                  const diameter = Math.max(rect.width, rect.height);
                  circle.style.width = circle.style.height = `${diameter}px`;
                  circle.style.left = `${e.clientX - rect.left - diameter / 2}px`;
                  circle.style.top = `${e.clientY - rect.top - diameter / 2}px`;
                  circle.className =
                    "absolute rounded-full bg-[var(--onboarding-ripple)] transform scale-0 animate-[onboarding-ripple-expand_0.6s_ease-out_forwards] pointer-events-none";
                  e.currentTarget.appendChild(circle);
                  setTimeout(() => circle.remove(), 600);
                  void handleOpenAIStart();
                }}
              >
                {t("onboarding.loginWithOpenAI")}
              </Button>
              <p
                className="text-sm text-[var(--onboarding-text-muted)] text-center leading-relaxed mt-3"
                style={{ textAlign: "center" }}
              >
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
                  className="text-sm text-[var(--onboarding-text-muted)] text-center leading-relaxed mt-3"
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
              <Input
                type="text"
                className="w-full px-[20px] py-[16px] bg-[var(--onboarding-card-bg)] border border-[var(--onboarding-card-border)] rounded-[6px] text-[var(--onboarding-text-primary)] font-inherit outline-none tracking-[0.03em] text-center transition-all duration-300 focus:border-[var(--onboarding-field-focus-border)] focus:shadow-[var(--onboarding-field-focus-shadow)] placeholder:text-[var(--onboarding-text-faint)]"
                placeholder="http://localhost:1455/..."
                value={openaiCallbackUrl}
                onChange={(e) => {
                  setOpenaiCallbackUrl(e.target.value);
                  setOpenaiError("");
                }}
              />
              {openaiError && (
                <p
                  aria-live="assertive"
                  style={{ fontSize: "0.75rem", color: "var(--danger)" }}
                >
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
                <Button
                  type="button"
                  className="group relative inline-flex items-center justify-center gap-[8px] px-[32px] py-[12px] min-h-[44px] bg-[var(--onboarding-accent-bg)] border border-[var(--onboarding-accent-border)] rounded-[6px] text-[var(--onboarding-accent-foreground)] text-[11px] font-semibold tracking-[0.18em] uppercase cursor-pointer transition-all duration-300 font-inherit overflow-hidden hover:bg-[var(--onboarding-accent-bg-hover)] hover:border-[var(--onboarding-accent-border-hover)] disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ textShadow: "0 1px 6px rgba(3,5,10,0.55)" }}
                  disabled={!openaiCallbackUrl}
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const circle = document.createElement("span");
                    const diameter = Math.max(rect.width, rect.height);
                    circle.style.width = circle.style.height = `${diameter}px`;
                    circle.style.left = `${e.clientX - rect.left - diameter / 2}px`;
                    circle.style.top = `${e.clientY - rect.top - diameter / 2}px`;
                    circle.className =
                      "absolute rounded-full bg-[var(--onboarding-ripple)] transform scale-0 animate-[onboarding-ripple-expand_0.6s_ease-out_forwards] pointer-events-none";
                    e.currentTarget.appendChild(circle);
                    setTimeout(() => circle.remove(), 600);
                    void handleOpenAIExchange();
                  }}
                >
                  {t("onboarding.completeLogin")}
                </Button>
                <Button
                  variant="ghost"
                  type="button"
                  className="text-[10px] text-[var(--onboarding-text-muted)] tracking-[0.15em] uppercase cursor-pointer no-underline bg-none border-none font-inherit transition-colors duration-300 p-0 hover:text-[var(--onboarding-text-strong)]"
                  style={{ textShadow: "0 1px 8px rgba(3,5,10,0.45)" }}
                  onClick={() => {
                    setOpenaiOAuthStarted(false);
                    setOpenaiCallbackUrl("");
                  }}
                >
                  {t("onboarding.startOver")}
                </Button>
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
            <Input
              type="password"
              className="w-full px-[20px] py-[16px] bg-[var(--onboarding-card-bg)] border border-[var(--onboarding-card-border)] rounded-[6px] text-[var(--onboarding-text-primary)] font-inherit outline-none tracking-[0.03em] text-center transition-all duration-300 focus:border-[var(--onboarding-field-focus-border)] focus:shadow-[var(--onboarding-field-focus-shadow)] placeholder:text-[var(--onboarding-text-faint)]"
              value={onboardingApiKey}
              onChange={handleApiKeyChange}
              placeholder={t("onboarding.enterApiKey")}
            />
            {apiKeyFormatWarning && (
              <p
                aria-live="assertive"
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
        <p className="text-sm text-[var(--onboarding-text-muted)] text-center leading-relaxed mt-3">
          {t("onboarding.ollamaNoConfig")}
        </p>
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
              <Select
                value={piAiSelectValue}
                onValueChange={(next) => {
                  if (next === "__custom__") {
                    if (piAiSelectValue !== "__custom__") {
                      setState("onboardingPrimaryModel", "");
                    }
                    return;
                  }
                  setState(
                    "onboardingPrimaryModel",
                    next === "__default__" ? "" : next,
                  );
                }}
              >
                <SelectTrigger className="w-full px-[20px] py-[16px] bg-[var(--onboarding-card-bg)] border border-[var(--onboarding-card-border)] rounded-[6px] text-[var(--onboarding-text-primary)] font-inherit outline-none tracking-[0.03em] text-center transition-all duration-300 focus:border-[var(--onboarding-field-focus-border)] focus:shadow-[var(--onboarding-field-focus-shadow)] placeholder:text-[var(--onboarding-text-faint)]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__default__">
                    {t("onboarding.useDefaultModel")}
                    {piAiDefaultModel ? ` (${piAiDefaultModel})` : ""}
                  </SelectItem>
                  {piAiModels.map((model: PiAiModelOption) => (
                    <SelectItem key={model.id} value={model.id}>
                      {model.name} ({model.provider})
                    </SelectItem>
                  ))}
                  <SelectItem value="__custom__">
                    {t("onboarding.customModel")}
                  </SelectItem>
                </SelectContent>
              </Select>
              {piAiSelectValue === "__custom__" && (
                <Input
                  type="text"
                  className="w-full px-[20px] py-[16px] bg-[var(--onboarding-card-bg)] border border-[var(--onboarding-card-border)] rounded-[6px] text-[var(--onboarding-text-primary)] font-inherit outline-none tracking-[0.03em] text-center transition-all duration-300 focus:border-[var(--onboarding-field-focus-border)] focus:shadow-[var(--onboarding-field-focus-shadow)] placeholder:text-[var(--onboarding-text-faint)]"
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
            <Input
              type="text"
              className="w-full px-[20px] py-[16px] bg-[var(--onboarding-card-bg)] border border-[var(--onboarding-card-border)] rounded-[6px] text-[var(--onboarding-text-primary)] font-inherit outline-none tracking-[0.03em] text-center transition-all duration-300 focus:border-[var(--onboarding-field-focus-border)] focus:shadow-[var(--onboarding-field-focus-shadow)] placeholder:text-[var(--onboarding-text-faint)]"
              value={onboardingPrimaryModel}
              onChange={(e) =>
                setState("onboardingPrimaryModel", e.target.value)
              }
              placeholder="provider/model (e.g. anthropic/claude-3.5-sonnet)"
            />
          )}
          <p
            className="text-sm text-[var(--onboarding-text-muted)] text-center leading-relaxed mt-3"
            style={{ textAlign: "left" }}
          >
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
                  <Button
                    type="button"
                    key={model.id}
                    className={`flex items-center justify-between gap-[8px] px-[14px] py-[10px] min-h-[52px] bg-[var(--onboarding-card-bg)] backdrop-blur-[18px] backdrop-saturate-[1.2] border border-[var(--onboarding-card-border)] rounded-[8px] cursor-pointer transition-all duration-300 text-left hover:bg-[var(--onboarding-card-bg-hover)] hover:border-[var(--onboarding-card-border-strong)]${onboardingOpenRouterModel === model.id ? " bg-[rgba(240,185,11,0.12)] border-[rgba(240,185,11,0.32)]" : ""}`}
                    onClick={() => handleOpenRouterModelSelect(model.id)}
                    style={{ width: "100%" }}
                  >
                    <div>
                      <div
                        className="text-xs text-[var(--onboarding-text-primary)] leading-[1.3]"
                        style={{ textShadow: "0 1px 8px rgba(3,5,10,0.6)" }}
                      >
                        {model.name}
                      </div>
                      {model.description && (
                        <div
                          className="text-[10px] text-[var(--onboarding-text-subtle)] leading-[1.3] line-clamp-2"
                          style={{ textShadow: "0 1px 8px rgba(3,5,10,0.5)" }}
                        >
                          {model.description}
                        </div>
                      )}
                    </div>
                  </Button>
                ),
              )}
            </div>
          </div>
        )}

      <div className="flex justify-between items-center gap-6 mt-[18px] pt-3.5 border-t border-[var(--onboarding-footer-border)]">
        <Button
          variant="ghost"
          className="text-[10px] text-[var(--onboarding-text-muted)] tracking-[0.15em] uppercase cursor-pointer no-underline bg-none border-none font-inherit transition-colors duration-300 p-0 hover:text-[var(--onboarding-text-strong)]"
          style={{ textShadow: "0 1px 8px rgba(3,5,10,0.45)" }}
          onClick={clearProvider}
          type="button"
        >
          {t("onboarding.back")}
        </Button>
        <Button
          className="group relative inline-flex items-center justify-center gap-[8px] px-[32px] py-[12px] min-h-[44px] bg-[var(--onboarding-accent-bg)] border border-[var(--onboarding-accent-border)] rounded-[6px] text-[var(--onboarding-accent-foreground)] text-[11px] font-semibold tracking-[0.18em] uppercase cursor-pointer transition-all duration-300 font-inherit overflow-hidden hover:bg-[var(--onboarding-accent-bg-hover)] hover:border-[var(--onboarding-accent-border-hover)] disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ textShadow: "0 1px 6px rgba(3,5,10,0.55)" }}
          disabled={isConfirmDisabled}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const circle = document.createElement("span");
            const diameter = Math.max(rect.width, rect.height);
            circle.style.width = circle.style.height = `${diameter}px`;
            circle.style.left = `${e.clientX - rect.left - diameter / 2}px`;
            circle.style.top = `${e.clientY - rect.top - diameter / 2}px`;
            circle.className =
              "absolute rounded-full bg-[var(--onboarding-ripple)] transform scale-0 animate-[onboarding-ripple-expand_0.6s_ease-out_forwards] pointer-events-none";
            e.currentTarget.appendChild(circle);
            setTimeout(() => circle.remove(), 600);
            handleOnboardingNext();
          }}
          type="button"
        >
          {t("onboarding.confirm")}
        </Button>
      </div>
    </>
  );
}
