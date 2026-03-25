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
import type { ChangeEvent, ReactNode } from "react";
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
import {
  OnboardingStepHeader,
  onboardingBodyTextShadowStyle,
  onboardingFooterClass,
  onboardingLinkActionClass,
  onboardingPrimaryActionClass,
  onboardingPrimaryActionTextShadowStyle,
  onboardingSecondaryActionClass,
  onboardingSecondaryActionTextShadowStyle,
  spawnOnboardingRipple,
} from "../onboarding-step-chrome";
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

const detailStackClass = "flex w-full flex-col gap-4 text-left";
const centeredDetailStackClass =
  "flex w-full flex-col items-center gap-3 text-center";
const statusBannerBaseClass =
  "flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm";
const fieldLabelClass =
  "mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--onboarding-text-muted)]";
const fieldInputClass =
  "h-12 w-full rounded-xl border border-[var(--onboarding-card-border)] bg-[var(--onboarding-card-bg)] px-4 text-left text-[var(--onboarding-text-primary)] outline-none transition-all duration-300 focus:border-[var(--onboarding-field-focus-border)] focus:shadow-[var(--onboarding-field-focus-shadow)] placeholder:text-[var(--onboarding-text-faint)]";
const helperTextClass =
  "text-sm leading-relaxed text-[var(--onboarding-text-muted)]";
const subtleTextClass =
  "text-xs leading-relaxed text-[var(--onboarding-text-subtle)]";
const infoPanelClass =
  "rounded-2xl border border-[var(--onboarding-card-border)] bg-[var(--onboarding-card-bg)]/90 px-4 py-4 backdrop-blur-[18px] backdrop-saturate-[1.15]";
const modelButtonClass =
  "flex min-h-[56px] w-full items-start justify-between gap-3 rounded-xl border border-[var(--onboarding-card-border)] bg-[var(--onboarding-card-bg)] px-4 py-3 text-left transition-all duration-300 hover:border-[var(--onboarding-card-border-strong)] hover:bg-[var(--onboarding-card-bg-hover)]";

function StatusBanner({
  tone,
  children,
  live = "polite",
}: {
  tone: "success" | "neutral" | "error";
  children: ReactNode;
  live?: "polite" | "assertive";
}) {
  const toneClass =
    tone === "success"
      ? "border-[var(--ok-muted)] bg-[var(--ok-subtle)] text-[var(--ok)]"
      : tone === "error"
        ? "border-[color:color-mix(in_srgb,var(--danger)_38%,transparent)] bg-[color:color-mix(in_srgb,var(--danger)_12%,transparent)] text-[var(--danger)]"
        : "border-[var(--onboarding-card-border)] bg-[var(--onboarding-card-bg)] text-[var(--onboarding-text-muted)]";

  return (
    <div
      aria-live={live}
      role={tone === "error" ? "alert" : "status"}
      className={`${statusBannerBaseClass} ${toneClass}`}
    >
      {children}
    </div>
  );
}

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
      {selectedProvider ? (
        <div className="mb-4 flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--onboarding-card-border)] bg-[var(--onboarding-card-bg)]/90 backdrop-blur-[18px] backdrop-saturate-[1.15]">
            <img
              src={getProviderLogo(
                selectedProvider.id,
                false,
                getCustomLogo(selectedProvider.id),
              )}
              alt={selectedDisplay.name}
              className="h-8 w-8 rounded-md object-contain"
            />
          </div>
        </div>
      ) : null}
      <OnboardingStepHeader
        eyebrow={selectedDisplay.name}
        description={selectedDisplay.description}
        descriptionClassName="mx-auto max-w-[32ch]"
      />

      {onboardingProvider === "elizacloud" && (
        <div className={detailStackClass}>
          <OnboardingTabs
            tabs={[
              { id: "login" as const, label: t("onboarding.login") },
              { id: "apikey" as const, label: t("onboarding.apiKey") },
            ]}
            active={onboardingElizaCloudTab}
            onChange={(tab) => dispatch({ type: "setElizaCloudTab", tab })}
          />

          {onboardingElizaCloudTab === "login" ? (
            <div className={centeredDetailStackClass}>
              {elizaCloudConnected ? (
                <StatusBanner tone="success">
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
                </StatusBanner>
              ) : (
                <Button
                  type="button"
                  className={`${onboardingPrimaryActionClass} w-full`}
                  style={onboardingPrimaryActionTextShadowStyle}
                  onClick={(e) => {
                    spawnOnboardingRipple(e.currentTarget, {
                      x: e.clientX,
                      y: e.clientY,
                    });
                    void handleCloudLogin();
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
                      <Button
                        variant="ghost"
                        type="button"
                        className={onboardingLinkActionClass}
                        onClick={() => openExternalUrl(urlMatch[1])}
                      >
                        Open login page in browser
                      </Button>
                    );
                  }
                  return (
                    <StatusBanner tone="error" live="assertive">
                      {elizaCloudLoginError}
                    </StatusBanner>
                  );
                })()}
              <p className={`${helperTextClass} text-center`}>
                {t("onboarding.freeCredits")}
              </p>
            </div>
          ) : (
            <div className={detailStackClass}>
              <div className={infoPanelClass}>
                <label
                  htmlFor="elizacloud-apikey-detail"
                  className={fieldLabelClass}
                >
                  {t("onboarding.apiKey")}
                </label>
                <Input
                  id="elizacloud-apikey-detail"
                  type="password"
                  className={fieldInputClass}
                  placeholder="ec-..."
                  value={onboardingApiKey}
                  onChange={handleApiKeyChange}
                />
              </div>
              <p className={helperTextClass}>
                {t("onboarding.useExistingKey")}{" "}
                <a
                  href="https://elizacloud.ai/dashboard/settings"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--onboarding-link)] underline underline-offset-2"
                >
                  {t("onboarding.getOneHere")}
                </a>
              </p>
            </div>
          )}
        </div>
      )}

      {onboardingProvider === "anthropic-subscription" && (
        <div className={detailStackClass}>
          <OnboardingTabs
            tabs={[
              { id: "token" as const, label: t("onboarding.setupToken") },
              { id: "oauth" as const, label: t("onboarding.oauthLogin") },
            ]}
            active={onboardingSubscriptionTab}
            onChange={(tab) => dispatch({ type: "setSubscriptionTab", tab })}
          />

          {onboardingSubscriptionTab === "token" ? (
            <div className={infoPanelClass}>
              <div className={fieldLabelClass}>
                {t("onboarding.enterSetupToken")}
              </div>
              <Input
                type="password"
                className={fieldInputClass}
                value={onboardingApiKey}
                onChange={handleApiKeyChange}
                placeholder="sk-ant-oat01-..."
              />
              <p className={`${helperTextClass} mt-3 whitespace-pre-line`}>
                {t("onboarding.setupTokenInstructions")}
              </p>
            </div>
          ) : anthropicConnected ? (
            <div className={centeredDetailStackClass}>
              <StatusBanner tone="success">
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
              </StatusBanner>
              <p className={`${helperTextClass} text-center`}>
                {t("onboarding.claudeSubscriptionReady")}
              </p>
            </div>
          ) : !anthropicOAuthStarted ? (
            <div className={centeredDetailStackClass}>
              <Button
                type="button"
                className={`${onboardingPrimaryActionClass} w-full`}
                style={onboardingPrimaryActionTextShadowStyle}
                onClick={(e) => {
                  spawnOnboardingRipple(e.currentTarget, {
                    x: e.clientX,
                    y: e.clientY,
                  });
                  void handleAnthropicStart();
                }}
              >
                {t("onboarding.loginWithAnthropic")}
              </Button>
              <p className={`${helperTextClass} text-center`}>
                {t("onboarding.requiresClaudeSub")}
              </p>
              {anthropicError && (
                <StatusBanner tone="error" live="assertive">
                  {anthropicError}
                </StatusBanner>
              )}
            </div>
          ) : (
            <div className={detailStackClass}>
              <p className={`${helperTextClass} text-center`}>
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
                className={`${fieldInputClass} text-center`}
                placeholder={t("onboarding.pasteAuthCode")}
                value={anthropicCode}
                onChange={(e) => setAnthropicCode(e.target.value)}
              />
              {anthropicError && (
                <StatusBanner tone="error" live="assertive">
                  {anthropicError}
                </StatusBanner>
              )}
              <Button
                type="button"
                className={`${onboardingPrimaryActionClass} self-center`}
                style={onboardingPrimaryActionTextShadowStyle}
                disabled={!anthropicCode}
                onClick={(e) => {
                  spawnOnboardingRipple(e.currentTarget, {
                    x: e.clientX,
                    y: e.clientY,
                  });
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
        <div className={detailStackClass}>
          {openaiConnected ? (
            <div className={centeredDetailStackClass}>
              <StatusBanner tone="success">
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
              </StatusBanner>
              <p className={`${helperTextClass} text-center`}>
                {t("onboarding.chatgptSubscriptionReady")}
              </p>
            </div>
          ) : !openaiOAuthStarted ? (
            <div className={centeredDetailStackClass}>
              <Button
                type="button"
                className={`${onboardingPrimaryActionClass} w-full`}
                style={onboardingPrimaryActionTextShadowStyle}
                onClick={(e) => {
                  spawnOnboardingRipple(e.currentTarget, {
                    x: e.clientX,
                    y: e.clientY,
                  });
                  void handleOpenAIStart();
                }}
              >
                {t("onboarding.loginWithOpenAI")}
              </Button>
              <p className={`${helperTextClass} text-center`}>
                {t("onboarding.requiresChatGPTSub")}
              </p>
            </div>
          ) : (
            <div className={detailStackClass}>
              <div className={infoPanelClass}>
                <p className="mb-1 text-sm font-semibold text-[var(--onboarding-text-primary)]">
                  {t("onboarding.almostThere")}
                </p>
                <p className={helperTextClass}>
                  {t("onboarding.redirectInstructions")}{" "}
                  <code className="rounded bg-[var(--bg-hover)] px-1 py-0.5 text-xs">
                    localhost:1455
                  </code>
                  {t("onboarding.copyEntireUrl")}
                </p>
              </div>
              <Input
                type="text"
                className={fieldInputClass}
                placeholder="http://localhost:1455/..."
                value={openaiCallbackUrl}
                onChange={(e) => {
                  setOpenaiCallbackUrl(e.target.value);
                  setOpenaiError("");
                }}
              />
              {openaiError && (
                <StatusBanner tone="error" live="assertive">
                  {openaiError}
                </StatusBanner>
              )}
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Button
                  type="button"
                  className={onboardingPrimaryActionClass}
                  style={onboardingPrimaryActionTextShadowStyle}
                  disabled={!openaiCallbackUrl}
                  onClick={(e) => {
                    spawnOnboardingRipple(e.currentTarget, {
                      x: e.clientX,
                      y: e.clientY,
                    });
                    void handleOpenAIExchange();
                  }}
                >
                  {t("onboarding.completeLogin")}
                </Button>
                <Button
                  variant="ghost"
                  type="button"
                  className={onboardingSecondaryActionClass}
                  style={onboardingSecondaryActionTextShadowStyle}
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
          <div className={infoPanelClass}>
            <div className={fieldLabelClass}>{t("onboarding.apiKey")}</div>
            <Input
              type="password"
              className={fieldInputClass}
              value={onboardingApiKey}
              onChange={handleApiKeyChange}
              placeholder={t("onboarding.enterApiKey")}
            />
            {apiKeyFormatWarning && (
              <p
                aria-live="assertive"
                className="mt-3 text-xs text-[var(--danger)]"
              >
                {apiKeyFormatWarning}
              </p>
            )}
          </div>
        )}

      {onboardingProvider === "ollama" && (
        <p
          className={`${helperTextClass} text-center`}
          style={onboardingBodyTextShadowStyle}
        >
          {t("onboarding.ollamaNoConfig")}
        </p>
      )}

      {onboardingProvider === "pi-ai" && (
        <div className={detailStackClass}>
          <div className={fieldLabelClass}>
            {t("onboarding.primaryModelOptional")}
          </div>
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
                <SelectTrigger className={`${fieldInputClass} text-center`}>
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
                  className={`${fieldInputClass} mt-2`}
                  value={onboardingPrimaryModel}
                  onChange={(e) =>
                    setState("onboardingPrimaryModel", e.target.value)
                  }
                  placeholder="provider/model (e.g. anthropic/claude-3.5-sonnet)"
                />
              )}
            </>
          ) : (
            <Input
              type="text"
              className={fieldInputClass}
              value={onboardingPrimaryModel}
              onChange={(e) =>
                setState("onboardingPrimaryModel", e.target.value)
              }
              placeholder="provider/model (e.g. anthropic/claude-3.5-sonnet)"
            />
          )}
          <p className={helperTextClass}>
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
          <div className={`${detailStackClass} mt-4`}>
            <div className={fieldLabelClass}>{t("onboarding.selectModel")}</div>
            <div className="flex flex-col gap-2">
              {onboardingOptions?.openrouterModels?.map(
                (model: OpenRouterModelOption) => (
                  <Button
                    type="button"
                    key={model.id}
                    className={`${modelButtonClass}${onboardingOpenRouterModel === model.id ? " border-[rgba(240,185,11,0.32)] bg-[rgba(240,185,11,0.12)]" : ""}`}
                    onClick={() => handleOpenRouterModelSelect(model.id)}
                  >
                    <div>
                      <div className="text-xs leading-[1.3] text-[var(--onboarding-text-primary)]">
                        {model.name}
                      </div>
                      {model.description && (
                        <div className={`${subtleTextClass} mt-1 line-clamp-2`}>
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

      <div className={onboardingFooterClass}>
        <Button
          variant="ghost"
          className={onboardingSecondaryActionClass}
          style={onboardingSecondaryActionTextShadowStyle}
          onClick={clearProvider}
          type="button"
        >
          {t("onboarding.back")}
        </Button>
        <Button
          className={onboardingPrimaryActionClass}
          style={onboardingPrimaryActionTextShadowStyle}
          disabled={isConfirmDisabled}
          onClick={(e) => {
            spawnOnboardingRipple(e.currentTarget, {
              x: e.clientX,
              y: e.clientY,
            });
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
