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
import { useEffect, useRef, useState } from "react";
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
  getOnboardingChoiceCardClassName,
  OnboardingField,
  OnboardingStatusBanner,
  onboardingCenteredStackClassName,
  onboardingChoiceCardTitleClassName,
  onboardingDetailStackClassName,
  onboardingHelperTextClassName,
  onboardingInfoPanelClassName,
  onboardingInputClassName,
  onboardingSubtleTextClassName,
} from "../onboarding-form-primitives";
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

function ConnectedIcon({ title }: { title: string }) {
  return (
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
      <title>{title}</title>
      <polyline points="20 6 9 17 4 12" />
    </svg>
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

  const elizaCloudApiKeyRef = useRef<HTMLInputElement>(null);
  const elizaCloudStatusRef = useRef<HTMLDivElement>(null);
  const anthropicTokenRef = useRef<HTMLInputElement>(null);
  const anthropicCodeRef = useRef<HTMLInputElement>(null);
  const anthropicStatusRef = useRef<HTMLDivElement>(null);
  const openaiCallbackRef = useRef<HTMLInputElement>(null);
  const openaiStatusRef = useRef<HTMLDivElement>(null);
  const genericApiKeyRef = useRef<HTMLInputElement>(null);
  const piAiCustomModelRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    if (
      onboardingProvider === "elizacloud" &&
      onboardingElizaCloudTab === "apikey"
    ) {
      elizaCloudApiKeyRef.current?.focus();
    }
  }, [onboardingElizaCloudTab, onboardingProvider]);

  useEffect(() => {
    if (
      onboardingProvider === "elizacloud" &&
      onboardingElizaCloudTab === "login" &&
      elizaCloudConnected
    ) {
      elizaCloudStatusRef.current?.focus();
    }
  }, [elizaCloudConnected, onboardingElizaCloudTab, onboardingProvider]);

  useEffect(() => {
    if (
      onboardingProvider === "anthropic-subscription" &&
      onboardingSubscriptionTab === "token"
    ) {
      anthropicTokenRef.current?.focus();
    }
  }, [onboardingProvider, onboardingSubscriptionTab]);

  useEffect(() => {
    if (
      onboardingProvider === "anthropic-subscription" &&
      onboardingSubscriptionTab === "oauth" &&
      anthropicOAuthStarted &&
      !anthropicConnected
    ) {
      anthropicCodeRef.current?.focus();
    }
  }, [
    anthropicConnected,
    anthropicOAuthStarted,
    onboardingProvider,
    onboardingSubscriptionTab,
  ]);

  useEffect(() => {
    if (anthropicConnected) {
      anthropicStatusRef.current?.focus();
    }
  }, [anthropicConnected]);

  useEffect(() => {
    if (
      onboardingProvider === "openai-subscription" &&
      openaiOAuthStarted &&
      !openaiConnected
    ) {
      openaiCallbackRef.current?.focus();
    }
  }, [onboardingProvider, openaiConnected, openaiOAuthStarted]);

  useEffect(() => {
    if (openaiConnected) {
      openaiStatusRef.current?.focus();
    }
  }, [openaiConnected]);

  useEffect(() => {
    if (
      onboardingProvider &&
      onboardingProvider !== "anthropic-subscription" &&
      onboardingProvider !== "openai-subscription" &&
      onboardingProvider !== "elizacloud" &&
      onboardingProvider !== "ollama" &&
      onboardingProvider !== "pi-ai"
    ) {
      genericApiKeyRef.current?.focus();
    }
  }, [onboardingProvider]);

  useEffect(() => {
    if (onboardingProvider === "pi-ai" && piAiSelectValue === "__custom__") {
      piAiCustomModelRef.current?.focus();
    }
  }, [onboardingProvider, piAiSelectValue]);

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
              alt=""
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
        <div className={onboardingDetailStackClassName}>
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
                <OnboardingStatusBanner
                  ref={elizaCloudStatusRef}
                  tone="success"
                >
                  <ConnectedIcon title={t("onboarding.connected")} />
                  {t("onboarding.connected")}
                </OnboardingStatusBanner>
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
                      <OnboardingStatusBanner
                        tone="neutral"
                        action={
                          <Button
                            variant="ghost"
                            type="button"
                            className={onboardingLinkActionClass}
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
                    <div className={onboardingCenteredStackClassName}>
                      <OnboardingStatusBanner tone="error" live="assertive">
                        {elizaCloudLoginError}
                      </OnboardingStatusBanner>
                      <Button
                        variant="ghost"
                        type="button"
                        className={onboardingLinkActionClass}
                        onClick={() => openExternalUrl(branding.bugReportUrl)}
                      >
                        {t("onboarding.reportIssue")}
                      </Button>
                    </div>
                  );
                })()}
              <p className={`${onboardingHelperTextClassName} text-center`}>
                {t("onboarding.freeCredits")}
              </p>
              <p className={`${onboardingSubtleTextClassName} text-center`}>
                {t("onboarding.cloudProviderBehaviorHint")}
              </p>
            </div>
          ) : (
            <div className={onboardingDetailStackClassName}>
              <div className={onboardingInfoPanelClassName}>
                <OnboardingField
                  controlId="elizacloud-apikey-detail"
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
                      id="elizacloud-apikey-detail"
                      ref={elizaCloudApiKeyRef}
                      type="password"
                      aria-describedby={describedBy}
                      aria-invalid={invalid}
                      className={onboardingInputClassName}
                      placeholder="ec-..."
                      value={onboardingApiKey}
                      onChange={handleApiKeyChange}
                    />
                  )}
                </OnboardingField>
              </div>
            </div>
          )}
        </div>
      )}

      {onboardingProvider === "anthropic-subscription" && (
        <div className={onboardingDetailStackClassName}>
          <OnboardingTabs
            tabs={[
              { id: "token" as const, label: t("onboarding.setupToken") },
              { id: "oauth" as const, label: t("onboarding.oauthLogin") },
            ]}
            active={onboardingSubscriptionTab}
            onChange={(tab) => dispatch({ type: "setSubscriptionTab", tab })}
          />

          {onboardingSubscriptionTab === "token" ? (
            <div className={onboardingInfoPanelClassName}>
              <OnboardingField
                controlId="anthropic-setup-token"
                label={t("onboarding.enterSetupToken")}
                description={t("onboarding.setupTokenInstructions")}
                descriptionClassName="whitespace-pre-line"
                message={apiKeyFormatWarning}
                messageTone="danger"
              >
                {({ describedBy, invalid }) => (
                  <Input
                    id="anthropic-setup-token"
                    ref={anthropicTokenRef}
                    type="password"
                    aria-describedby={describedBy}
                    aria-invalid={invalid}
                    className={onboardingInputClassName}
                    value={onboardingApiKey}
                    onChange={handleApiKeyChange}
                    placeholder="sk-ant-oat01-..."
                  />
                )}
              </OnboardingField>
            </div>
          ) : anthropicConnected ? (
            <div className={onboardingCenteredStackClassName}>
              <OnboardingStatusBanner ref={anthropicStatusRef} tone="success">
                <ConnectedIcon title={t("onboarding.connected")} />
                {t("onboarding.connectedToClaude")}
              </OnboardingStatusBanner>
              <p className={`${onboardingHelperTextClassName} text-center`}>
                {t("onboarding.claudeSubscriptionReady")}
              </p>
            </div>
          ) : !anthropicOAuthStarted ? (
            <div className={onboardingCenteredStackClassName}>
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
              <p className={`${onboardingHelperTextClassName} text-center`}>
                {t("onboarding.requiresClaudeSub")}
              </p>
              {anthropicError ? (
                <OnboardingStatusBanner tone="error" live="assertive">
                  {anthropicError}
                </OnboardingStatusBanner>
              ) : null}
            </div>
          ) : (
            <div className={onboardingDetailStackClassName}>
              <OnboardingField
                align="center"
                controlId="anthropic-auth-code"
                label={t("onboarding.pasteAuthCode")}
                description={t("onboarding.authCodeInstructions")}
                descriptionClassName="whitespace-pre-line"
                message={anthropicError}
                messageTone="danger"
              >
                {({ describedBy, invalid }) => (
                  <Input
                    id="anthropic-auth-code"
                    ref={anthropicCodeRef}
                    type="text"
                    aria-describedby={describedBy}
                    aria-invalid={invalid}
                    className={`${onboardingInputClassName} text-center`}
                    placeholder={t("onboarding.pasteAuthCode")}
                    value={anthropicCode}
                    onChange={(e) => setAnthropicCode(e.target.value)}
                  />
                )}
              </OnboardingField>
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
        <div className={onboardingDetailStackClassName}>
          {openaiConnected ? (
            <div className={onboardingCenteredStackClassName}>
              <OnboardingStatusBanner ref={openaiStatusRef} tone="success">
                <ConnectedIcon title={t("onboarding.connected")} />
                {t("onboarding.connectedToChatGPT")}
              </OnboardingStatusBanner>
              <p className={`${onboardingHelperTextClassName} text-center`}>
                {t("onboarding.chatgptSubscriptionReady")}
              </p>
            </div>
          ) : !openaiOAuthStarted ? (
            <div className={onboardingCenteredStackClassName}>
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
              <p className={`${onboardingHelperTextClassName} text-center`}>
                {t("onboarding.requiresChatGPTSub")}
              </p>
            </div>
          ) : (
            <div className={onboardingDetailStackClassName}>
              <div className={onboardingInfoPanelClassName}>
                <p className="mb-1 text-sm font-semibold text-[var(--onboarding-text-primary)]">
                  {t("onboarding.almostThere")}
                </p>
                <p className={onboardingHelperTextClassName}>
                  {t("onboarding.redirectInstructions")}{" "}
                  <code className="rounded bg-[var(--bg-hover)] px-1 py-0.5 text-xs">
                    localhost:1455
                  </code>
                  {t("onboarding.copyEntireUrl")}
                </p>
              </div>
              <OnboardingField
                controlId="openai-callback-url"
                label="Redirect URL"
                description={t("onboarding.copyEntireUrl")}
                message={openaiError}
                messageTone="danger"
              >
                {({ describedBy, invalid }) => (
                  <Input
                    id="openai-callback-url"
                    ref={openaiCallbackRef}
                    type="text"
                    aria-describedby={describedBy}
                    aria-invalid={invalid}
                    className={onboardingInputClassName}
                    placeholder="http://localhost:1455/..."
                    value={openaiCallbackUrl}
                    onChange={(e) => {
                      setOpenaiCallbackUrl(e.target.value);
                      setOpenaiError("");
                    }}
                  />
                )}
              </OnboardingField>
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
                    setOpenaiError("");
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
          <div className={onboardingInfoPanelClassName}>
            <OnboardingField
              controlId="provider-api-key"
              label={t("onboarding.apiKey")}
              message={apiKeyFormatWarning}
              messageTone="danger"
            >
              {({ describedBy, invalid }) => (
                <Input
                  id="provider-api-key"
                  ref={genericApiKeyRef}
                  type="password"
                  aria-describedby={describedBy}
                  aria-invalid={invalid}
                  className={onboardingInputClassName}
                  value={onboardingApiKey}
                  onChange={handleApiKeyChange}
                  placeholder={t("onboarding.enterApiKey")}
                />
              )}
            </OnboardingField>
          </div>
        )}

      {onboardingProvider === "ollama" && (
        <p
          className={`${onboardingHelperTextClassName} text-center`}
          style={onboardingBodyTextShadowStyle}
        >
          {t("onboarding.ollamaNoConfig")}
        </p>
      )}

      {onboardingProvider === "pi-ai" && (
        <div className={onboardingDetailStackClassName}>
          {piAiModels.length > 0 ? (
            <OnboardingField
              controlId="pi-ai-model-select"
              label={t("onboarding.primaryModelOptional")}
              description={`${t("onboarding.piCredentialsHint")}${t(
                "onboarding.piDropdownHint",
              )}`}
            >
              {({ describedBy, invalid }) => (
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
                    <SelectTrigger
                      id="pi-ai-model-select"
                      aria-describedby={describedBy}
                      aria-invalid={invalid}
                      className={`${onboardingInputClassName} text-center`}
                    >
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
                  {piAiSelectValue === "__custom__" ? (
                    <Input
                      id="pi-ai-custom-model"
                      ref={piAiCustomModelRef}
                      type="text"
                      aria-describedby={describedBy}
                      className={`${onboardingInputClassName} mt-2`}
                      value={onboardingPrimaryModel}
                      onChange={(e) =>
                        setState("onboardingPrimaryModel", e.target.value)
                      }
                      placeholder="provider/model (e.g. anthropic/claude-3.5-sonnet)"
                    />
                  ) : null}
                </>
              )}
            </OnboardingField>
          ) : (
            <OnboardingField
              controlId="pi-ai-model"
              label={t("onboarding.primaryModelOptional")}
              description={`${t("onboarding.piCredentialsHint")}${t(
                "onboarding.piManualHint",
              )}`}
            >
              {({ describedBy, invalid }) => (
                <Input
                  id="pi-ai-model"
                  ref={piAiCustomModelRef}
                  type="text"
                  aria-describedby={describedBy}
                  aria-invalid={invalid}
                  className={onboardingInputClassName}
                  value={onboardingPrimaryModel}
                  onChange={(e) =>
                    setState("onboardingPrimaryModel", e.target.value)
                  }
                  placeholder="provider/model (e.g. anthropic/claude-3.5-sonnet)"
                />
              )}
            </OnboardingField>
          )}
        </div>
      )}

      {onboardingProvider === "openrouter" &&
      onboardingApiKey.trim() &&
      onboardingOptions?.openrouterModels ? (
        <div className={`${onboardingDetailStackClassName} mt-4`}>
          <div
            id="openrouter-models-label"
            className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--onboarding-text-muted)]"
          >
            {t("onboarding.selectModel")}
          </div>
          <div
            role="radiogroup"
            aria-labelledby="openrouter-models-label"
            className="flex flex-col gap-2"
          >
            {onboardingOptions.openrouterModels.map(
              (model: OpenRouterModelOption) => (
                <Button
                  type="button"
                  role="radio"
                  aria-checked={onboardingOpenRouterModel === model.id}
                  key={model.id}
                  className={getOnboardingChoiceCardClassName({
                    selected: onboardingOpenRouterModel === model.id,
                  })}
                  onClick={() => handleOpenRouterModelSelect(model.id)}
                >
                  <div className="min-w-0">
                    <div className={onboardingChoiceCardTitleClassName}>
                      {model.name}
                    </div>
                    {model.description ? (
                      <div
                        className={`${onboardingSubtleTextClassName} mt-1 line-clamp-2`}
                      >
                        {model.description}
                      </div>
                    ) : null}
                  </div>
                </Button>
              ),
            )}
          </div>
        </div>
      ) : null}

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
      <p className={`${onboardingSubtleTextClassName} mt-3 text-center`}>
        {t("onboarding.restartAfterProviderChangeHint")}
      </p>
    </>
  );
}
