/**
 * Onboarding wizard component — multi-step onboarding flow.
 */

import { useEffect, useState } from "react";
import { useApp, THEMES, type OnboardingStep } from "../AppContext.js";
import type { StylePreset, ProviderOption, CloudProviderOption, ModelOption, InventoryProviderOption, RpcProviderOption } from "../api-client";

export function OnboardingWizard() {
  const {
    onboardingStep,
    onboardingOptions,
    onboardingName,
    onboardingStyle,
    onboardingTheme,
    onboardingRunMode,
    onboardingCloudProvider,
    onboardingSmallModel,
    onboardingLargeModel,
    onboardingProvider,
    onboardingApiKey,
    onboardingSubscriptionTab,
    onboardingOAuthBusy,
    onboardingOAuthError,
    onboardingOAuthSuccess,
    onboardingOAuthPasteUrl,
    onboardingChannelType,
    onboardingChannelToken,
    onboardingSelectedChains,
    onboardingRpcSelections,
    onboardingRpcKeys,
    cloudConnected,
    cloudLoginBusy,
    cloudLoginError,
    cloudUserId,
    handleOnboardingNext,
    handleOnboardingBack,
    setState,
    setTheme,
    handleCloudLogin,
    client,
  } = useApp();

  const [oauthInstructions, setOauthInstructions] = useState("");

  useEffect(() => {
    if (onboardingStep === "theme") {
      setTheme(onboardingTheme);
    }
  }, [onboardingStep, onboardingTheme, setTheme]);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setState("onboardingName", e.target.value);
  };

  const handleStyleSelect = (catchphrase: string) => {
    setState("onboardingStyle", catchphrase);
  };

  const handleThemeSelect = (themeId: string) => {
    setState("onboardingTheme", themeId as typeof onboardingTheme);
    setTheme(themeId as typeof onboardingTheme);
  };

  const handleRunModeSelect = (mode: "local" | "cloud") => {
    setState("onboardingRunMode", mode);
  };

  const handleCloudProviderSelect = (providerId: string) => {
    setState("onboardingCloudProvider", providerId);
  };

  const handleSmallModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setState("onboardingSmallModel", e.target.value);
  };

  const handleLargeModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setState("onboardingLargeModel", e.target.value);
  };

  const handleProviderSelect = (providerId: string) => {
    setState("onboardingProvider", providerId);
    setState("onboardingApiKey", "");
    setState("onboardingOAuthBusy", false);
    setState("onboardingOAuthError", "");
    setState("onboardingOAuthSuccess", false);
    setState("onboardingOAuthPasteUrl", "");
    setOauthInstructions("");
    if (providerId === "anthropic-subscription") {
      setState("onboardingSubscriptionTab", "token");
    }
  };

  const handleSubscriptionTabSelect = (tab: "token" | "oauth") => {
    setState("onboardingSubscriptionTab", tab);
    setState("onboardingOAuthError", "");
    if (tab === "oauth") {
      setState("onboardingApiKey", "");
    }
  };

  const handleApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setState("onboardingApiKey", e.target.value);
  };

  const handleOAuthPasteInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setState("onboardingOAuthPasteUrl", e.target.value);
  };

  const handleAnthropicOAuthStart = async () => {
    setState("onboardingOAuthBusy", true);
    setState("onboardingOAuthError", "");
    setState("onboardingOAuthSuccess", false);
    setState("onboardingOAuthPasteUrl", "");
    try {
      const { authUrl } = await client.startAnthropicLogin();
      window.open(authUrl, "_blank");
    } catch (err) {
      setState("onboardingOAuthError", err instanceof Error ? err.message : "Failed to start Anthropic login");
    } finally {
      setState("onboardingOAuthBusy", false);
    }
  };

  const handleAnthropicOAuthSubmit = async () => {
    const code = onboardingOAuthPasteUrl.trim();
    if (!code) {
      setState("onboardingOAuthError", "Paste the authorization code first.");
      return;
    }
    setState("onboardingOAuthBusy", true);
    setState("onboardingOAuthError", "");
    try {
      const res = await client.exchangeAnthropicCode(code);
      if (!res.success) {
        throw new Error("Anthropic login did not complete.");
      }
      setState("onboardingOAuthSuccess", true);
    } catch (err) {
      setState("onboardingOAuthSuccess", false);
      setState("onboardingOAuthError", err instanceof Error ? err.message : "Failed to connect Anthropic subscription");
    } finally {
      setState("onboardingOAuthBusy", false);
    }
  };

  const handleVerifyAnthropicSetupToken = async () => {
    const token = onboardingApiKey.trim();
    if (!token) {
      setState("onboardingOAuthError", "Enter a setup token first.");
      setState("onboardingOAuthSuccess", false);
      return;
    }
    setState("onboardingOAuthBusy", true);
    setState("onboardingOAuthError", "");
    setState("onboardingOAuthSuccess", false);
    try {
      const res = await client.submitAnthropicSetupToken(token);
      if (!res.success) {
        throw new Error("Token verification failed.");
      }
      setState("onboardingOAuthSuccess", true);
    } catch (err) {
      setState("onboardingOAuthError", err instanceof Error ? err.message : "Failed to verify setup token");
      setState("onboardingOAuthSuccess", false);
    } finally {
      setState("onboardingOAuthBusy", false);
    }
  };

  const handleOpenAIOAuthStart = async () => {
    setState("onboardingOAuthBusy", true);
    setState("onboardingOAuthError", "");
    setState("onboardingOAuthSuccess", false);
    setState("onboardingOAuthPasteUrl", "");
    setOauthInstructions("");
    try {
      const { authUrl, instructions } = await client.startOpenAILogin();
      setOauthInstructions(instructions ?? "");
      window.open(authUrl, "_blank");
    } catch (err) {
      setState("onboardingOAuthError", err instanceof Error ? err.message : "Failed to start OpenAI login");
    } finally {
      setState("onboardingOAuthBusy", false);
    }
  };

  const handleOpenAIOAuthSubmit = async () => {
    const redirectUrl = onboardingOAuthPasteUrl.trim();
    if (!redirectUrl) {
      setState("onboardingOAuthError", "Paste the redirect URL first.");
      return;
    }
    setState("onboardingOAuthBusy", true);
    setState("onboardingOAuthError", "");
    try {
      const res = await client.exchangeOpenAICode(redirectUrl);
      if (!res.success) {
        throw new Error("OpenAI login did not complete.");
      }
      setState("onboardingOAuthSuccess", true);
    } catch (err) {
      setState("onboardingOAuthSuccess", false);
      setState("onboardingOAuthError", err instanceof Error ? err.message : "Failed to connect OpenAI subscription");
    } finally {
      setState("onboardingOAuthBusy", false);
    }
  };

  const handleChannelSelect = (type: string) => {
    setState("onboardingChannelType", type);
    setState("onboardingChannelToken", "");
  };

  const handleChannelTokenChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setState("onboardingChannelToken", e.target.value);
  };

  const handleChainToggle = (chain: string) => {
    const newSelected = new Set(onboardingSelectedChains);
    if (newSelected.has(chain)) {
      newSelected.delete(chain);
    } else {
      newSelected.add(chain);
    }
    setState("onboardingSelectedChains", newSelected);
  };

  const handleRpcSelectionChange = (chain: string, provider: string) => {
    setState("onboardingRpcSelections", { ...onboardingRpcSelections, [chain]: provider });
  };

  const handleRpcKeyChange = (chain: string, provider: string, key: string) => {
    const keyName = `${chain}:${provider}`;
    setState("onboardingRpcKeys", { ...onboardingRpcKeys, [keyName]: key });
  };

  const renderStep = (step: OnboardingStep) => {
    switch (step) {
      case "welcome":
        return (
          <div className="max-w-[500px] mx-auto mt-10 text-center font-body">
            <img
              src="/android-chrome-512x512.png"
              alt="Avatar"
              className="w-[140px] h-[140px] rounded-full object-cover border-[3px] border-border mx-auto mb-5 block"
            />
            <h1 className="text-[28px] font-normal mb-1 text-txt-strong">Welcome to Milaidy</h1>
            <p className="italic text-muted text-sm mb-8">Let's get you set up</p>
          </div>
        );

      case "name":
        return (
          <div className="max-w-[500px] mx-auto mt-10 text-center font-body">
            <div className="onboarding-speech bg-card border border-border rounded-xl px-5 py-4 mx-auto mb-6 max-w-[480px] relative text-[15px] text-txt leading-relaxed">
              <h2 className="text-[28px] font-normal mb-1 text-txt-strong">Choose a Name</h2>
            </div>
            <div className="flex flex-col gap-2 text-left max-w-[480px] mx-auto">
              {onboardingOptions?.names.map((name: string) => (
                <button
                  key={name}
                  className={`px-4 py-3 border-2 cursor-pointer transition-colors text-left ${
                    onboardingName === name
                      ? "border-accent bg-accent text-accent-fg"
                      : "border-border bg-card hover:border-accent"
                  }`}
                  onClick={() => setState("onboardingName", name)}
                >
                  <div className="font-bold text-sm">{name}</div>
                </button>
              ))}
            </div>
            <div className="max-w-[480px] mx-auto mt-4">
              <label className="text-xs text-muted block mb-2 text-left">Or enter custom name:</label>
              <div
                className={`px-4 py-3 border-2 cursor-pointer transition-colors ${
                  onboardingName && !onboardingOptions?.names.includes(onboardingName)
                    ? "border-accent bg-accent text-accent-fg"
                    : "border-border bg-card hover:border-accent"
                }`}
              >
                <input
                  type="text"
                  value={onboardingName}
                  onChange={handleNameChange}
                  className="border-none bg-transparent text-sm font-bold w-full p-0 outline-none text-inherit"
                  placeholder="Enter custom name"
                />
              </div>
            </div>
          </div>
        );

      case "style":
        return (
          <div className="max-w-[500px] mx-auto mt-10 text-center font-body">
            <div className="onboarding-speech bg-card border border-border rounded-xl px-5 py-4 mx-auto mb-6 max-w-[480px] relative text-[15px] text-txt leading-relaxed">
              <h2 className="text-[28px] font-normal mb-1 text-txt-strong">Choose a Style</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-left max-w-[480px] mx-auto">
              {onboardingOptions?.styles.map((style: StylePreset) => (
                <div
                  key={style.catchphrase}
                  className={`px-4 py-3 border-2 cursor-pointer transition-colors ${
                    onboardingStyle === style.catchphrase
                      ? "border-accent bg-accent text-accent-fg"
                      : "border-border bg-card hover:border-accent"
                  }`}
                  onClick={() => handleStyleSelect(style.catchphrase)}
                >
                  <div className="font-bold text-sm">{style.catchphrase}</div>
                  {style.hint && <div className={`text-xs mt-0.5 ${onboardingStyle === style.catchphrase ? "opacity-80" : "text-muted"}`}>{style.hint}</div>}
                </div>
              ))}
            </div>
          </div>
        );

      case "theme":
        return (
          <div className="max-w-[500px] mx-auto mt-10 text-center font-body">
            <div className="onboarding-speech bg-card border border-border rounded-xl px-5 py-4 mx-auto mb-6 max-w-[480px] relative text-[15px] text-txt leading-relaxed">
              <h2 className="text-[28px] font-normal mb-1 text-txt-strong">Choose a Theme</h2>
            </div>
            <div className="grid grid-cols-3 gap-2 text-left max-w-[480px] mx-auto">
              {THEMES.map((theme) => (
                <button
                  key={theme.id}
                  className={`px-2 py-3.5 border-2 cursor-pointer transition-colors text-center ${
                    onboardingTheme === theme.id
                      ? "border-accent bg-accent text-accent-fg"
                      : "border-border bg-card hover:border-accent"
                  }`}
                  onClick={() => handleThemeSelect(theme.id)}
                >
                  <div className="font-bold text-sm">{theme.label}</div>
                </button>
              ))}
            </div>
          </div>
        );

      case "runMode":
        return (
          <div className="max-w-[500px] mx-auto mt-10 text-center font-body">
            <div className="onboarding-speech bg-card border border-border rounded-xl px-5 py-4 mx-auto mb-6 max-w-[480px] relative text-[15px] text-txt leading-relaxed">
              <h2 className="text-[28px] font-normal mb-1 text-txt-strong">Run Mode</h2>
            </div>
            <div className="flex flex-col gap-2 text-left max-w-[480px] mx-auto">
              <button
                className={`px-4 py-3 border-2 cursor-pointer transition-colors ${
                  onboardingRunMode === "local"
                    ? "border-accent bg-accent text-accent-fg"
                    : "border-border bg-card hover:border-accent"
                }`}
                onClick={() => handleRunModeSelect("local")}
              >
                <div className="font-bold text-sm">Local</div>
                <div className={`text-xs mt-0.5 ${onboardingRunMode === "local" ? "opacity-80" : "text-muted"}`}>
                  Run on your machine with your own API keys
                </div>
              </button>
              <button
                className={`px-4 py-3 border-2 cursor-pointer transition-colors ${
                  onboardingRunMode === "cloud"
                    ? "border-accent bg-accent text-accent-fg"
                    : "border-border bg-card hover:border-accent"
                }`}
                onClick={() => handleRunModeSelect("cloud")}
              >
                <div className="font-bold text-sm">Cloud</div>
                <div className={`text-xs mt-0.5 ${onboardingRunMode === "cloud" ? "opacity-80" : "text-muted"}`}>
                  Use Eliza Cloud managed services
                </div>
              </button>
            </div>
          </div>
        );

      case "cloudProvider":
        return (
          <div className="max-w-[500px] mx-auto mt-10 text-center font-body">
            <div className="onboarding-speech bg-card border border-border rounded-xl px-5 py-4 mx-auto mb-6 max-w-[480px] relative text-[15px] text-txt leading-relaxed">
              <h2 className="text-[28px] font-normal mb-1 text-txt-strong">Cloud Provider</h2>
            </div>
            <div className="flex flex-col gap-2 text-left max-w-[480px] mx-auto">
              {onboardingOptions?.cloudProviders.map((provider: CloudProviderOption) => (
                <div
                  key={provider.id}
                  className={`px-4 py-3 border-2 cursor-pointer transition-colors ${
                    onboardingCloudProvider === provider.id
                      ? "border-accent bg-accent text-accent-fg"
                      : "border-border bg-card hover:border-accent"
                  }`}
                  onClick={() => handleCloudProviderSelect(provider.id)}
                >
                  <div className="font-bold text-sm">{provider.name}</div>
                  {provider.description && (
                    <div className={`text-xs mt-0.5 ${onboardingCloudProvider === provider.id ? "opacity-80" : "text-muted"}`}>
                      {provider.description}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );

      case "modelSelection":
        return (
          <div className="max-w-[500px] mx-auto mt-10 text-center font-body">
            <div className="onboarding-speech bg-card border border-border rounded-xl px-5 py-4 mx-auto mb-6 max-w-[480px] relative text-[15px] text-txt leading-relaxed">
              <h2 className="text-[28px] font-normal mb-1 text-txt-strong">Model Selection</h2>
            </div>
            <div className="flex flex-col gap-4 text-left max-w-[480px] mx-auto">
              <div>
                <label className="text-[13px] font-bold text-txt-strong block mb-2 text-left">
                  Small Model:
                </label>
                <select
                  value={onboardingSmallModel}
                  onChange={handleSmallModelChange}
                  className="w-full px-3 py-2 border border-border bg-card text-sm mt-2 focus:border-accent focus:outline-none"
                >
                  {onboardingOptions?.models.small.map((model: ModelOption) => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[13px] font-bold text-txt-strong block mb-2 text-left">
                  Large Model:
                </label>
                <select
                  value={onboardingLargeModel}
                  onChange={handleLargeModelChange}
                  className="w-full px-3 py-2 border border-border bg-card text-sm mt-2 focus:border-accent focus:outline-none"
                >
                  {onboardingOptions?.models.large.map((model: ModelOption) => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        );

      case "cloudLogin":
        return (
          <div className="max-w-[500px] mx-auto mt-10 text-center font-body">
            <div className="onboarding-speech bg-card border border-border rounded-xl px-5 py-4 mx-auto mb-6 max-w-[480px] relative text-[15px] text-txt leading-relaxed">
              <h2 className="text-[28px] font-normal mb-1 text-txt-strong">Cloud Login</h2>
            </div>
            {cloudConnected ? (
              <div className="max-w-[480px] mx-auto">
                <p className="text-txt mb-2">Logged in successfully!</p>
                {cloudUserId && <p className="text-muted text-sm">User ID: {cloudUserId}</p>}
              </div>
            ) : (
              <div className="max-w-[480px] mx-auto">
                <p className="text-txt mb-4">Click the button below to log in to Eliza Cloud</p>
                <button
                  className="px-6 py-2 border border-accent bg-accent text-accent-fg text-sm cursor-pointer hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed mt-5"
                  onClick={handleCloudLogin}
                  disabled={cloudLoginBusy}
                >
                  {cloudLoginBusy ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="inline-block w-5 h-5 border-2 border-border border-t-accent rounded-full animate-spin"></span>
                      Logging in...
                    </span>
                  ) : (
                    "Login to Eliza Cloud"
                  )}
                </button>
                {cloudLoginError && <p className="text-danger text-[13px] mt-2.5">{cloudLoginError}</p>}
              </div>
            )}
          </div>
        );

      case "llmProvider": {
        const providers = onboardingOptions?.providers ?? [];
        const cloudProviders = providers.filter((provider: ProviderOption) => provider.id === "elizacloud");
        const subscriptionProviders = providers.filter((provider: ProviderOption) =>
          provider.id === "anthropic-subscription" || provider.id === "openai-subscription",
        );
        const apiProviders = providers.filter(
          (provider: ProviderOption) => !subscriptionProviders.some((item) => item.id === provider.id) && provider.id !== "elizacloud",
        );

        const providerOverrides: Record<string, { name: string; description?: string }> = {
          elizacloud: { name: "Eliza Cloud" },
          "anthropic-subscription": {
            name: "Claude Subscription",
            description: "$20-200/mo Claude Pro/Max subscription",
          },
          "openai-subscription": {
            name: "ChatGPT Subscription",
            description: "$20-200/mo ChatGPT Plus/Pro subscription",
          },
          anthropic: { name: "Anthropic API Key" },
          openai: { name: "OpenAI API Key" },
          openrouter: { name: "OpenRouter" },
          gemini: { name: "Google Gemini" },
          grok: { name: "xAI (Grok)" },
          groq: { name: "Groq" },
          deepseek: { name: "DeepSeek" },
        };

        const getProviderDisplay = (provider: ProviderOption) => {
          const override = providerOverrides[provider.id];
          return {
            name: override?.name ?? provider.name,
            description: override?.description ?? provider.description,
          };
        };

        return (
          <div className="max-w-[760px] mx-auto mt-10 text-center font-body">
            <div className="onboarding-speech bg-card border border-border rounded-xl px-5 py-4 mx-auto mb-4 max-w-[420px] relative text-[15px] text-txt leading-relaxed">
              <h2 className="text-[28px] font-normal mb-1 text-txt-strong">LLM Provider</h2>
            </div>

            <div className="border border-border bg-card text-xs text-muted p-3 rounded text-left max-w-[760px] mx-auto mb-4">
              Most providers need an API key or subscription. Free options like Eliza Cloud have limited credits.
              Subscriptions (Claude/ChatGPT) are the easiest way to get started if you already pay for one.
            </div>

            {cloudProviders.length > 0 && (
              <div className="mb-3 text-left">
                <div className="text-[11px] uppercase tracking-wide text-muted mb-2">Cloud</div>
                <div className="grid grid-cols-1 gap-2">
                  {cloudProviders.map((provider: ProviderOption) => {
                    const display = getProviderDisplay(provider);
                    return (
                      <button
                        key={provider.id}
                        className={`px-5 py-4 border-2 cursor-pointer transition-colors text-left ${
                          onboardingProvider === provider.id
                            ? "border-accent bg-accent text-accent-fg"
                            : "border-border bg-card hover:border-accent"
                        }`}
                        onClick={() => handleProviderSelect(provider.id)}
                      >
                        <div className="flex items-center gap-2">
                          <div className="font-bold text-sm">{display.name}</div>
                          {onboardingProvider === provider.id && onboardingOAuthSuccess && (
                            <span className="text-[11px] px-1.5 py-0.5 rounded bg-emerald-600 text-white">✓ Connected</span>
                          )}
                        </div>
                        {display.description && (
                          <div className={`text-xs mt-0.5 ${onboardingProvider === provider.id ? "opacity-80" : "text-muted"}`}>
                            {display.description}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {subscriptionProviders.length > 0 && (
              <div className="mb-4 text-left">
                <div className="text-[11px] uppercase tracking-wide text-muted mb-2">Subscriptions</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {subscriptionProviders.map((provider: ProviderOption) => {
                    const display = getProviderDisplay(provider);
                    return (
                      <button
                        key={provider.id}
                        className={`px-5 py-4 border-2 cursor-pointer transition-colors text-left ${
                          onboardingProvider === provider.id
                            ? "border-accent bg-accent text-accent-fg"
                            : "border-border bg-card hover:border-accent"
                        }`}
                        onClick={() => handleProviderSelect(provider.id)}
                      >
                        <div className="flex items-center gap-2">
                          <div className="font-bold text-sm">{display.name}</div>
                          {onboardingProvider === provider.id && onboardingOAuthSuccess && (
                            <span className="text-[11px] px-1.5 py-0.5 rounded bg-emerald-600 text-white">✓ Connected</span>
                          )}
                        </div>
                        {display.description && (
                          <div className={`text-xs mt-0.5 ${onboardingProvider === provider.id ? "opacity-80" : "text-muted"}`}>
                            {display.description}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {apiProviders.length > 0 && (
              <div className="text-left">
                <div className="text-[11px] uppercase tracking-wide text-muted mb-2">API Keys</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {apiProviders.map((provider: ProviderOption) => {
                    const display = getProviderDisplay(provider);
                    return (
                      <button
                        key={provider.id}
                        className={`px-4 py-3 border-2 cursor-pointer transition-colors text-left ${
                          onboardingProvider === provider.id
                            ? "border-accent bg-accent text-accent-fg"
                            : "border-border bg-card hover:border-accent"
                        }`}
                        onClick={() => handleProviderSelect(provider.id)}
                      >
                        <div className="font-bold text-sm">{display.name}</div>
                        {display.description && (
                          <div className={`text-xs mt-0.5 ${onboardingProvider === provider.id ? "opacity-80" : "text-muted"}`}>
                            {display.description}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {onboardingProvider === "anthropic-subscription" && (
              <div className="max-w-[520px] mx-auto mt-4 text-left">
                <div className="flex items-center gap-4 border-b border-border mb-3">
                  <button
                    className={`text-sm pb-2 border-b-2 ${
                      onboardingSubscriptionTab === "token"
                        ? "border-accent text-accent"
                        : "border-transparent text-muted hover:text-txt"
                    }`}
                    onClick={() => handleSubscriptionTabSelect("token")}
                  >
                    Setup Token
                  </button>
                  <button
                    className={`text-sm pb-2 border-b-2 ${
                      onboardingSubscriptionTab === "oauth"
                        ? "border-accent text-accent"
                        : "border-transparent text-muted hover:text-txt"
                    }`}
                    onClick={() => handleSubscriptionTabSelect("oauth")}
                  >
                    OAuth Login
                  </button>
                </div>

                {onboardingSubscriptionTab === "token" ? (
                  <>
                    <label className="text-[13px] font-bold text-txt-strong block mb-2 text-left">Setup Token:</label>
                    <input
                      type="password"
                      value={onboardingApiKey}
                      onChange={handleApiKeyChange}
                      placeholder="sk-ant-oat01-..."
                      className="w-full px-3 py-2 border border-border bg-card text-sm mt-2 focus:border-accent focus:outline-none"
                    />
                    <div className="mt-3">
                      <button
                        className="px-4 py-2 border border-accent bg-accent text-accent-fg text-sm cursor-pointer hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed"
                        onClick={() => void handleVerifyAnthropicSetupToken()}
                        disabled={onboardingOAuthBusy}
                      >
                        {onboardingOAuthBusy ? (
                          <span className="flex items-center justify-center gap-2">
                            <span className="inline-block w-4 h-4 border-2 border-border border-t-accent rounded-full animate-spin"></span>
                            Verifying...
                          </span>
                        ) : (
                          "Verify"
                        )}
                      </button>
                    </div>
                    <p className="text-xs text-muted mt-2 whitespace-pre-line">
                      Paste your Claude Code setup token.{"\n"}
                      Get it from: claude.ai/settings/api → "Claude Code" → "Use setup token"
                    </p>
                  </>
                ) : (
                  <>
                    <button
                      className="px-6 py-2 border border-accent bg-accent text-accent-fg text-sm cursor-pointer hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed"
                      onClick={() => void handleAnthropicOAuthStart()}
                      disabled={onboardingOAuthBusy}
                    >
                      {onboardingOAuthBusy ? (
                        <span className="flex items-center justify-center gap-2">
                          <span className="inline-block w-4 h-4 border-2 border-border border-t-accent rounded-full animate-spin"></span>
                          Opening...
                        </span>
                      ) : (
                        "Login with Anthropic"
                      )}
                    </button>
                    <p className="text-xs text-muted mt-2">
                      Opens Anthropic login in your browser to connect your subscription.
                    </p>
                    <div className="mt-3">
                      <label className="text-[13px] font-bold text-txt-strong block mb-2 text-left">
                        After logging in, paste the authorization code here:
                      </label>
                      <input
                        type="text"
                        value={onboardingOAuthPasteUrl}
                        onChange={handleOAuthPasteInputChange}
                        placeholder="Paste authorization code"
                        className="w-full px-3 py-2 border border-border bg-card text-sm focus:border-accent focus:outline-none"
                      />
                      <button
                        className="mt-3 px-4 py-2 border border-border bg-card text-txt text-sm cursor-pointer hover:border-accent disabled:opacity-40 disabled:cursor-not-allowed"
                        onClick={() => void handleAnthropicOAuthSubmit()}
                        disabled={onboardingOAuthBusy}
                      >
                        {onboardingOAuthBusy ? "Connecting..." : "Connect Anthropic"}
                      </button>
                    </div>
                  </>
                )}
                {onboardingOAuthSuccess && (
                  <p className="text-[13px] text-emerald-600 mt-2">✓ Connected</p>
                )}
                {onboardingOAuthError && (
                  <p className="text-[13px] text-danger mt-2">{onboardingOAuthError}</p>
                )}
              </div>
            )}

            {onboardingProvider === "openai-subscription" && (
              <div className="max-w-[520px] mx-auto mt-4 text-left">
                <button
                  className="px-6 py-2 border border-accent bg-accent text-accent-fg text-sm cursor-pointer hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed"
                  onClick={() => void handleOpenAIOAuthStart()}
                  disabled={onboardingOAuthBusy}
                >
                  {onboardingOAuthBusy ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="inline-block w-4 h-4 border-2 border-border border-t-accent rounded-full animate-spin"></span>
                      Opening...
                    </span>
                  ) : (
                    "Login with OpenAI"
                  )}
                </button>
                <p className="text-xs text-muted mt-2">
                  Opens OpenAI login in your browser. Requires ChatGPT Plus ($20/mo) or Pro ($200/mo).
                </p>
                {oauthInstructions && (
                  <p className="text-xs text-muted mt-2 whitespace-pre-line">{oauthInstructions}</p>
                )}
                <div className="mt-3">
                  <label className="text-[13px] font-bold text-txt-strong block mb-2 text-left">
                    After logging in, paste the redirect URL here:
                  </label>
                  <input
                    type="text"
                    value={onboardingOAuthPasteUrl}
                    onChange={handleOAuthPasteInputChange}
                    placeholder="https://..."
                    className="w-full px-3 py-2 border border-border bg-card text-sm focus:border-accent focus:outline-none"
                  />
                  <button
                    className="mt-3 px-4 py-2 border border-border bg-card text-txt text-sm cursor-pointer hover:border-accent disabled:opacity-40 disabled:cursor-not-allowed"
                    onClick={() => void handleOpenAIOAuthSubmit()}
                    disabled={onboardingOAuthBusy}
                  >
                    {onboardingOAuthBusy ? "Connecting..." : "Connect OpenAI"}
                  </button>
                </div>
                {onboardingOAuthSuccess && (
                  <p className="text-[13px] text-emerald-600 mt-2">✓ Connected</p>
                )}
                {onboardingOAuthError && (
                  <p className="text-[13px] text-danger mt-2">{onboardingOAuthError}</p>
                )}
              </div>
            )}

            {onboardingProvider &&
              onboardingProvider !== "anthropic-subscription" &&
              onboardingProvider !== "openai-subscription" &&
              onboardingProvider !== "elizacloud" && (
                <div className="max-w-[520px] mx-auto mt-4">
                  <label className="text-[13px] font-bold text-txt-strong block mb-2 text-left">API Key:</label>
                  <input
                    type="password"
                    value={onboardingApiKey}
                    onChange={handleApiKeyChange}
                    placeholder="Enter your API key"
                    className="w-full px-3 py-2 border border-border bg-card text-sm mt-2 focus:border-accent focus:outline-none"
                  />
                </div>
              )}
          </div>
        );
      }

      case "channels": {
        const helperText =
          onboardingChannelType === "telegram"
            ? [
                "1. Open Telegram and message @BotFather",
                "2. Send /newbot and follow the prompts",
                "3. Copy the token (looks like 123456:ABC-DEF...)",
              ]
            : onboardingChannelType === "discord"
              ? [
                  "1. Go to discord.com/developers/applications",
                  "2. Create New Application → Bot → Add Bot",
                  "3. Reset Token → copy it",
                  '4. Enable "Message Content Intent" under Privileged Gateway Intents',
                  "5. Use OAuth2 URL Generator (scope: bot) to invite to your server",
                ]
              : onboardingChannelType === "slack"
                ? [
                    "1. Go to api.slack.com/apps → Create New App",
                    "2. OAuth & Permissions → add chat:write, app_mentions:read scopes",
                    "3. Install to workspace → copy Bot User OAuth Token",
                    "4. Also copy App-Level Token from Basic Information",
                  ]
                : [];

        return (
          <div className="max-w-[500px] mx-auto mt-10 text-center font-body">
            <div className="onboarding-speech bg-card border border-border rounded-xl px-5 py-4 mx-auto mb-6 max-w-[480px] relative text-[15px] text-txt leading-relaxed">
              <h2 className="text-[28px] font-normal mb-1 text-txt-strong">Connect a Chat Channel</h2>
              <p className="text-xs text-muted mt-2">
                Talk to your agent on Telegram, Discord, or Slack. You can skip this and add channels later.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-left max-w-[500px] mx-auto">
              <button
                className={`px-4 py-3 border-2 cursor-pointer transition-colors text-left ${
                  onboardingChannelType === "telegram"
                    ? "border-accent bg-accent text-accent-fg"
                    : "border-border bg-card hover:border-accent"
                }`}
                onClick={() => handleChannelSelect("telegram")}
              >
                <div className="font-bold text-sm">Telegram</div>
                <div className={`text-xs mt-0.5 ${onboardingChannelType === "telegram" ? "opacity-80" : "text-muted"}`}>
                  Recommended · Easy setup
                </div>
              </button>
              <button
                className={`px-4 py-3 border-2 cursor-pointer transition-colors text-left ${
                  onboardingChannelType === "discord"
                    ? "border-accent bg-accent text-accent-fg"
                    : "border-border bg-card hover:border-accent"
                }`}
                onClick={() => handleChannelSelect("discord")}
              >
                <div className="font-bold text-sm">Discord</div>
                <div className={`text-xs mt-0.5 ${onboardingChannelType === "discord" ? "opacity-80" : "text-muted"}`}>
                  Great for communities
                </div>
              </button>
              <button
                className={`px-4 py-3 border-2 cursor-pointer transition-colors text-left ${
                  onboardingChannelType === "slack"
                    ? "border-accent bg-accent text-accent-fg"
                    : "border-border bg-card hover:border-accent"
                }`}
                onClick={() => handleChannelSelect("slack")}
              >
                <div className="font-bold text-sm">Slack</div>
                <div className={`text-xs mt-0.5 ${onboardingChannelType === "slack" ? "opacity-80" : "text-muted"}`}>
                  For teams
                </div>
              </button>
            </div>

            <button
              className="text-xs text-muted hover:text-accent mt-4"
              onClick={() => void handleOnboardingNext()}
            >
              Skip for now — you can add channels later in Settings
            </button>

            {onboardingChannelType && (
              <div className="max-w-[480px] mx-auto mt-4 text-left">
                <div className="border border-border bg-card px-3 py-2 text-xs text-muted whitespace-pre-line">
                  {helperText.join("\n")}
                </div>
                <label className="text-[13px] font-bold text-txt-strong block mb-2 mt-3 text-left">Bot Token:</label>
                <input
                  type="password"
                  value={onboardingChannelToken}
                  onChange={handleChannelTokenChange}
                  placeholder="Paste your bot token"
                  className="w-full px-3 py-2 border border-border bg-card text-sm mt-2 focus:border-accent focus:outline-none"
                />
              </div>
            )}
          </div>
        );
      }

      case "inventorySetup":
        return (
          <div className="max-w-[500px] mx-auto mt-10 text-center font-body">
            <div className="onboarding-speech bg-card border border-border rounded-xl px-5 py-4 mx-auto mb-6 max-w-[480px] relative text-[15px] text-txt leading-relaxed">
              <h2 className="text-[28px] font-normal mb-1 text-txt-strong">Inventory Setup</h2>
            </div>
            <div className="text-left max-w-[480px] mx-auto">
              <h3 className="text-[13px] font-bold text-txt-strong block mb-2 text-left">Select Chains:</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {onboardingOptions?.inventoryProviders.map((provider: InventoryProviderOption) => (
                <div
                  key={provider.id}
                  className={`px-4 py-3 border-2 transition-colors ${
                    onboardingSelectedChains.has(provider.id)
                      ? "border-accent bg-accent text-accent-fg"
                      : "border-border bg-card hover:border-accent"
                  }`}
                >
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={onboardingSelectedChains.has(provider.id)}
                      onChange={() => handleChainToggle(provider.id)}
                      className="cursor-pointer"
                    />
                    <span className="font-bold text-sm">{provider.name}</span>
                  </label>
                  {provider.description && (
                    <p className={`text-xs mt-0.5 ml-6 ${onboardingSelectedChains.has(provider.id) ? "opacity-80" : "text-muted"}`}>
                      {provider.description}
                    </p>
                  )}
                  {onboardingSelectedChains.has(provider.id) && (
                    <div className="mt-3 ml-6">
                      <label className="text-[13px] font-bold block mb-2 text-left opacity-80">
                        RPC Provider:
                      </label>
                      <select
                        value={onboardingRpcSelections[provider.id] ?? "elizacloud"}
                        onChange={(e) => handleRpcSelectionChange(provider.id, e.target.value)}
                        className="w-full px-3 py-2 border border-border bg-card text-sm mt-2 focus:border-accent focus:outline-none"
                      >
                        {provider.rpcProviders.map((rpc: RpcProviderOption) => (
                          <option key={rpc.id} value={rpc.id}>
                            {rpc.name}
                          </option>
                        ))}
                      </select>
                      {onboardingRpcSelections[provider.id] && (
                        <div className="mt-3">
                          <label className="text-[13px] font-bold block mb-2 text-left opacity-80">
                            RPC API Key (optional):
                          </label>
                          <input
                            type="password"
                            value={onboardingRpcKeys[`${provider.id}:${onboardingRpcSelections[provider.id]}`] ?? ""}
                            onChange={(e) =>
                              handleRpcKeyChange(
                                provider.id,
                                onboardingRpcSelections[provider.id],
                                e.target.value,
                              )
                            }
                            placeholder="Optional API key"
                            className="w-full px-3 py-2 border border-border bg-card text-sm mt-2 focus:border-accent focus:outline-none"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  const canGoNext = () => {
    switch (onboardingStep) {
      case "welcome":
        return true;
      case "name":
        return onboardingName.trim().length > 0;
      case "style":
        return onboardingStyle.length > 0;
      case "theme":
        return true;
      case "runMode":
        return onboardingRunMode !== "";
      case "cloudProvider":
        return onboardingCloudProvider.length > 0;
      case "modelSelection":
        return onboardingSmallModel.length > 0 && onboardingLargeModel.length > 0;
      case "cloudLogin":
        return cloudConnected;
      case "llmProvider":
        if (onboardingProvider === "anthropic-subscription") {
          return onboardingApiKey.length > 0 || onboardingOAuthSuccess;
        }
        if (onboardingProvider === "openai-subscription") {
          return onboardingOAuthSuccess;
        }
        if (onboardingProvider === "elizacloud") {
          return true;
        }
        return onboardingProvider.length > 0 && onboardingApiKey.length > 0;
      case "channels":
        return true;
      case "inventorySetup":
        return true;
      default:
        return false;
    }
  };

  const canGoBack = onboardingStep !== "welcome";

  return (
    <div className={`${onboardingStep === "llmProvider" ? "max-w-[820px]" : "max-w-[700px]"} mx-auto py-10 px-4 text-center font-body min-h-screen overflow-y-auto`}>
      {renderStep(onboardingStep)}
      <div className="flex gap-2 mt-4 justify-center pb-8">
        {canGoBack && (
          <button
            className="px-6 py-2 border border-border bg-transparent text-txt text-sm cursor-pointer hover:bg-accent-subtle hover:text-accent mt-5"
            onClick={handleOnboardingBack}
          >
            Back
          </button>
        )}
        <button
          className="px-6 py-2 border border-accent bg-accent text-accent-fg text-sm cursor-pointer hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed mt-5"
          onClick={() => void handleOnboardingNext()}
          disabled={!canGoNext()}
        >
          Next
        </button>
      </div>
    </div>
  );
}
