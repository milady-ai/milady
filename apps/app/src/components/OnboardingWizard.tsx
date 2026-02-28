/**
 * Onboarding wizard component — 5-step onboarding flow.
 *
 * Steps:
 *   1. welcome        — Hosting choice + restore from backup
 *   2. identity        — Name + style combined
 *   3. infrastructure  — Exec mode + database (local) / cloud config (elizaos)
 *   4. aiProvider      — ElizaCloud login gate + provider selection
 *   5. launch          — (handled by handleOnboardingFinish in AppContext)
 */

import {
  Cloud,
  Database,
  HardDrive,
  Lock,
  Server,
  Terminal,
  Zap,
} from "lucide-react";
import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { type OnboardingStep, useApp } from "../AppContext";
import {
  type CloudProviderOption,
  client,
  type ModelOption,
  type OpenRouterModelOption,
  type PiAiModelOption,
  type ProviderOption,
  type StylePreset,
} from "../api-client";
import { getProviderLogo } from "../provider-logos";
import { PermissionsOnboardingSection } from "./PermissionsSection";

// Platform detection for mobile — on iOS/Android only cloud mode is available
let isMobilePlatform = false;
try {
  const { Capacitor } = await import("@capacitor/core");
  const plat = Capacitor.getPlatform();
  isMobilePlatform = plat === "ios" || plat === "android";
} catch {
  if (typeof navigator !== "undefined") {
    isMobilePlatform = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  }
}

function formatRequestError(err: unknown): string {
  return err instanceof Error ? err.message : "unknown error";
}

export function OnboardingWizard() {
  const {
    onboardingStep,
    onboardingOptions,
    onboardingName,
    onboardingStyle,
    onboardingHostingChoice,
    onboardingRunMode,
    onboardingCloudProvider,
    onboardingSmallModel,
    onboardingLargeModel,
    onboardingProvider,
    onboardingApiKey,
    onboardingOpenRouterModel,
    onboardingPrimaryModel,
    onboardingSubscriptionTab,
    onboardingDatabaseProvider,
    onboardingDatabaseConnectionString,
    onboardingElizaosRunMode,
    onboardingRestarting,
    cloudConnected,
    cloudLoginBusy,
    cloudLoginError,
    cloudUserId,
    handleOnboardingNext,
    handleOnboardingBack,
    setState,
    handleCloudLogin,
    devMode,
  } = useApp();

  // ── Local state ──────────────────────────────────────────────────────
  const [customNameText, setCustomNameText] = useState("");
  const [isCustomSelected, setIsCustomSelected] = useState(false);
  const [dockerDbBusy, setDockerDbBusy] = useState(false);
  const [dockerDbError, setDockerDbError] = useState<string | null>(null);
  const [dockerDbSuccess, setDockerDbSuccess] = useState(false);

  // OAuth state for subscriptions
  const [openaiOAuthStarted, setOpenaiOAuthStarted] = useState(false);
  const [openaiCallbackUrl, setOpenaiCallbackUrl] = useState("");
  const [openaiConnected, setOpenaiConnected] = useState(false);
  const [openaiError, setOpenaiError] = useState("");
  const [anthropicOAuthStarted, setAnthropicOAuthStarted] = useState(false);
  const [anthropicCode, setAnthropicCode] = useState("");
  const [anthropicConnected, setAnthropicConnected] = useState(false);
  const [anthropicError, setAnthropicError] = useState("");

  // Import state
  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPassword, setImportPassword] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const importFileRef = useRef<HTMLInputElement>(null);
  const importBusyRef = useRef(false);

  // ── Handlers ─────────────────────────────────────────────────────────

  const handleImportAgent = useCallback(async () => {
    if (importBusyRef.current || importBusy) return;
    if (!importFile) {
      setImportError("Select an export file before importing.");
      return;
    }
    if (!importPassword || importPassword.length < 4) {
      setImportError("Password must be at least 4 characters.");
      return;
    }
    try {
      importBusyRef.current = true;
      setImportBusy(true);
      setImportError(null);
      setImportSuccess(null);
      const fileBuffer = await importFile.arrayBuffer();
      const result = await client.importAgent(importPassword, fileBuffer);
      const counts = result.counts;
      const summary = [
        counts.memories ? `${counts.memories} memories` : null,
        counts.entities ? `${counts.entities} entities` : null,
        counts.rooms ? `${counts.rooms} rooms` : null,
      ]
        .filter(Boolean)
        .join(", ");
      setImportSuccess(
        `Imported "${result.agentName}" successfully${summary ? `: ${summary}` : ""}. Restarting...`,
      );
      setImportPassword("");
      setImportFile(null);
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Import failed");
    } finally {
      importBusyRef.current = false;
      setImportBusy(false);
    }
  }, [importBusy, importFile, importPassword]);

  const handleRunModeSelect = (
    mode: "local-rawdog" | "local-lifo" | "local-sandbox" | "cloud",
  ) => {
    setState("onboardingRunMode", mode);
  };

  const handleApiKeyChange = (e: ChangeEvent<HTMLInputElement>) => {
    setState("onboardingApiKey", e.target.value);
  };

  const handleSetupDockerDb = async () => {
    setDockerDbBusy(true);
    setDockerDbError(null);
    try {
      const result = await client.setupDockerDb();
      if (result.ok && result.credentials) {
        setState(
          "onboardingDatabaseConnectionString",
          result.credentials.connectionString,
        );
        setDockerDbSuccess(true);
      } else {
        setDockerDbError(result.error ?? "Docker database setup failed");
      }
    } catch (err) {
      setDockerDbError(formatRequestError(err));
    } finally {
      setDockerDbBusy(false);
    }
  };

  const handleAnthropicStart = async () => {
    setAnthropicError("");
    try {
      const { authUrl } = await client.startAnthropicLogin();
      if (authUrl) {
        window.open(
          authUrl,
          "anthropic-oauth",
          "width=600,height=700,top=50,left=200",
        );
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
        window.open(
          authUrl,
          "openai-oauth",
          "width=500,height=700,top=50,left=200",
        );
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
          ? "Login session expired. Click 'Start Over' and try again."
          : msg,
      );
    } catch (_err) {
      setOpenaiError("Network error — check your connection and try again.");
    }
  };

  // ── Step rendering ───────────────────────────────────────────────────

  const renderStep = (step: OnboardingStep) => {
    switch (step) {
      // ═══════════════════════════════════════════════════════════════════
      // Step 1: Welcome + Hosting Choice
      // ═══════════════════════════════════════════════════════════════════
      case "welcome":
        return (
          <div className="max-w-[520px] mx-auto mt-10 text-center font-body">
            <img
              src="/android-chrome-512x512.png"
              alt="Avatar"
              className="w-[140px] h-[140px] rounded-full object-cover border-[3px] border-border mx-auto mb-5 block"
            />
            <h1 className="text-[28px] font-normal mb-1 text-txt-strong">
              ohhh uhhhh hey there!
            </h1>
            <h1 className="text-[28px] font-normal mb-4 text-txt-strong">
              welcome to milady!
            </h1>

            {/* Hosting choice */}
            <div className="onboarding-speech bg-card border border-border rounded-xl px-5 py-4 mx-auto mb-6 max-w-[600px] relative text-[15px] text-txt leading-relaxed">
              <h2 className="text-[22px] font-normal mb-1 text-txt-strong">
                how are we running this?
              </h2>
            </div>
            <div className="flex flex-col gap-3 max-w-[360px] mx-auto">
              <button
                type="button"
                className={`px-5 py-4 border cursor-pointer bg-card transition-colors rounded-xl text-left ${
                  onboardingHostingChoice === "local"
                    ? "border-accent !bg-accent !text-accent-fg"
                    : "border-border hover:border-accent"
                }`}
                onClick={() => setState("onboardingHostingChoice", "local")}
              >
                <div className="font-bold text-base">Locally Hosting</div>
                <div
                  className={`text-[12px] mt-1 ${
                    onboardingHostingChoice === "local"
                      ? "text-accent-fg/70"
                      : "text-muted"
                  }`}
                >
                  Run everything on your own machine
                </div>
              </button>
              <button
                type="button"
                className={`px-5 py-4 border cursor-pointer bg-card transition-colors rounded-xl text-left ${
                  onboardingHostingChoice === "elizaos"
                    ? "border-accent !bg-accent !text-accent-fg"
                    : "border-border hover:border-accent"
                }`}
                onClick={() => setState("onboardingHostingChoice", "elizaos")}
              >
                <div className="font-bold text-base">ElizaOS</div>
                <div
                  className={`text-[12px] mt-1 ${
                    onboardingHostingChoice === "elizaos"
                      ? "text-accent-fg/70"
                      : "text-muted"
                  }`}
                >
                  Use the ElizaOS cloud platform
                </div>
              </button>
            </div>

            {/* Restore from backup */}
            {!showImport ? (
              <button
                type="button"
                className="mt-6 text-[13px] text-muted hover:text-txt underline cursor-pointer bg-transparent border-none"
                onClick={() => setShowImport(true)}
              >
                restore from backup
              </button>
            ) : (
              <div className="mt-6 mx-auto max-w-[400px] border border-border bg-card rounded-xl p-4 text-left">
                <div className="flex justify-between items-center mb-3">
                  <div className="font-bold text-sm text-txt-strong">
                    Import Agent
                  </div>
                  <button
                    type="button"
                    className="text-[11px] text-muted hover:text-txt cursor-pointer bg-transparent border-none"
                    onClick={() => {
                      setShowImport(false);
                      setImportError(null);
                      setImportSuccess(null);
                      setImportFile(null);
                      setImportPassword("");
                    }}
                  >
                    cancel
                  </button>
                </div>
                <div className="text-xs text-muted mb-3">
                  Select an <code className="text-[11px]">.eliza-agent</code>{" "}
                  export file and enter the password used during export.
                </div>
                <div className="flex flex-col gap-2">
                  <input
                    ref={importFileRef}
                    type="file"
                    accept=".eliza-agent"
                    onChange={(e) => {
                      setImportFile(e.target.files?.[0] ?? null);
                      setImportError(null);
                    }}
                    className="text-xs"
                  />
                  <input
                    type="password"
                    placeholder="Decryption password"
                    value={importPassword}
                    onChange={(e) => {
                      setImportPassword(e.target.value);
                      setImportError(null);
                    }}
                    className="px-2.5 py-1.5 border border-border bg-bg text-xs font-mono focus:border-accent focus:outline-none rounded"
                  />
                  {importError && (
                    <div className="text-[11px] text-[var(--danger,#e74c3c)]">
                      {importError}
                    </div>
                  )}
                  {importSuccess && (
                    <div className="text-[11px] text-[var(--ok,#16a34a)]">
                      {importSuccess}
                    </div>
                  )}
                  <button
                    type="button"
                    className="btn text-xs py-1.5 px-4 mt-1"
                    disabled={importBusy || !importFile}
                    onClick={() => void handleImportAgent()}
                  >
                    {importBusy ? "Importing..." : "Import & Restore"}
                  </button>
                </div>
              </div>
            )}
          </div>
        );

      // ═══════════════════════════════════════════════════════════════════
      // Step 2: Identity — Name + Style combined
      // ═══════════════════════════════════════════════════════════════════
      case "identity":
        return (
          <div className="max-w-[520px] mx-auto mt-10 text-center font-body">
            <img
              src="/android-chrome-512x512.png"
              alt="Avatar"
              className="w-[140px] h-[140px] rounded-full object-cover border-[3px] border-border mx-auto mb-5 block"
            />

            {/* Name section */}
            <div className="onboarding-speech bg-card border border-border rounded-xl px-5 py-4 mx-auto mb-4 max-w-[600px] relative text-[15px] text-txt leading-relaxed">
              <h2 className="text-[28px] font-normal mb-1 text-txt-strong">
                ohhh... what's my name again?
              </h2>
            </div>
            <div className="flex flex-wrap gap-2 justify-center mx-auto mb-3">
              {onboardingOptions?.names.slice(0, 5).map((name: string) => (
                <button
                  type="button"
                  key={name}
                  className={`px-5 py-2 border cursor-pointer bg-card transition-colors rounded-full text-sm font-bold ${
                    onboardingName === name && !isCustomSelected
                      ? "border-accent !bg-accent !text-accent-fg"
                      : "border-border hover:border-accent"
                  }`}
                  onClick={() => {
                    setState("onboardingName", name);
                    setIsCustomSelected(false);
                  }}
                >
                  {name}
                </button>
              ))}
            </div>
            <div className="max-w-[260px] mx-auto mb-8">
              <div
                className={`px-4 py-2.5 border cursor-text bg-card transition-colors rounded-full ${
                  isCustomSelected
                    ? "border-accent ring-2 ring-accent/30"
                    : "border-border hover:border-accent"
                }`}
              >
                <input
                  type="text"
                  value={customNameText}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => {
                    setCustomNameText(e.target.value);
                    setState("onboardingName", e.target.value);
                    setIsCustomSelected(true);
                  }}
                  onFocus={() => {
                    setIsCustomSelected(true);
                    setState("onboardingName", customNameText);
                  }}
                  className="border-none bg-transparent text-sm font-bold w-full p-0 outline-none text-txt text-center placeholder:text-muted"
                  placeholder="enter custom name..."
                />
              </div>
            </div>

            {/* Style section */}
            <div className="onboarding-speech bg-card border border-border rounded-xl px-5 py-4 mx-auto mb-4 max-w-[600px] relative text-[15px] text-txt leading-relaxed">
              <h2 className="text-[22px] font-normal mb-1 text-txt-strong">
                whats my vibe?
              </h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mx-auto max-w-[480px]">
              {onboardingOptions?.styles.map((preset: StylePreset) => (
                <button
                  type="button"
                  key={preset.catchphrase}
                  className={`px-3 py-3 border cursor-pointer bg-card transition-colors text-center rounded-lg ${
                    onboardingStyle === preset.catchphrase
                      ? "border-accent !bg-accent !text-accent-fg"
                      : "border-border hover:border-accent"
                  }`}
                  onClick={() => setState("onboardingStyle", preset.catchphrase)}
                >
                  <div className="font-bold text-sm">{preset.catchphrase}</div>
                  <div
                    className={`text-[11px] mt-0.5 ${
                      onboardingStyle === preset.catchphrase
                        ? "text-accent-fg/70"
                        : "text-muted"
                    }`}
                  >
                    {preset.hint}
                  </div>
                </button>
              ))}
            </div>
          </div>
        );

      // ═══════════════════════════════════════════════════════════════════
      // Step 3: Infrastructure — Exec mode + Database
      // ═══════════════════════════════════════════════════════════════════
      case "infrastructure":
        return (
          <div className="max-w-[580px] mx-auto mt-10 text-center font-body">
            <img
              src="/android-chrome-512x512.png"
              alt="Avatar"
              className="w-[100px] h-[100px] rounded-full object-cover border-[3px] border-border mx-auto mb-4 block"
            />

            {onboardingHostingChoice === "elizaos" ? (
              /* ── ElizaOS path: Cloud login + sub-choice ─────────── */
              <>
                <div className="onboarding-speech bg-card border border-border rounded-xl px-5 py-4 mx-auto mb-4 max-w-[600px] relative text-[15px] text-txt leading-relaxed">
                  <h2 className="text-[24px] font-normal mb-1 text-txt-strong">
                    connect to elizaos
                  </h2>
                  <p className="text-[13px] text-txt mt-1 opacity-70">
                    log in to access cloud services
                  </p>
                </div>

                {/* Cloud login */}
                <div className="max-w-[400px] mx-auto mb-6">
                  {cloudConnected ? (
                    <div className="flex items-center gap-2 px-4 py-2.5 border border-green-500/30 bg-green-500/10 text-green-400 text-sm rounded-lg justify-center">
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
                        <title>Connected</title>
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      connected{cloudUserId ? ` (${cloudUserId})` : ""}
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="w-full px-6 py-2.5 border border-accent bg-accent text-accent-fg text-sm cursor-pointer rounded-full hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed"
                      onClick={handleCloudLogin}
                      disabled={cloudLoginBusy}
                    >
                      {cloudLoginBusy ? (
                        <span className="flex items-center justify-center gap-2">
                          <span className="inline-block w-4 h-4 border-2 border-border border-t-accent rounded-full animate-spin" />
                          connecting...
                        </span>
                      ) : (
                        "connect account"
                      )}
                    </button>
                  )}
                  {cloudLoginError && (
                    <p className="text-danger text-[13px] mt-2">
                      {cloudLoginError}
                    </p>
                  )}
                </div>

                {/* Sub-choice: cloud hosted vs local + cloud services */}
                {cloudConnected && (
                  <div className="flex flex-col gap-3 max-w-[460px] mx-auto">
                    <button
                      type="button"
                      className={`px-4 py-4 border cursor-pointer bg-card transition-colors rounded-lg text-left ${
                        onboardingElizaosRunMode === "cloud-hosted"
                          ? "border-accent !bg-accent !text-accent-fg"
                          : "border-border hover:border-accent"
                      }`}
                      onClick={() => {
                        setState("onboardingElizaosRunMode", "cloud-hosted");
                        setState("onboardingRunMode", "cloud");
                      }}
                    >
                      <div className="font-bold text-sm flex items-center gap-1.5">
                        <Cloud className="w-4 h-4" /> Run in Cloud
                      </div>
                      <div className="text-[12px] mt-1 opacity-70">
                        everything managed by ElizaOS — always on, no setup
                      </div>
                    </button>
                    <button
                      type="button"
                      className={`px-4 py-4 border cursor-pointer bg-card transition-colors rounded-lg text-left ${
                        onboardingElizaosRunMode === "local-cloud-services"
                          ? "border-accent !bg-accent !text-accent-fg"
                          : "border-border hover:border-accent"
                      }`}
                      onClick={() => {
                        setState(
                          "onboardingElizaosRunMode",
                          "local-cloud-services",
                        );
                        setState("onboardingRunMode", "local-rawdog");
                      }}
                    >
                      <div className="font-bold text-sm flex items-center gap-1.5">
                        <Server className="w-4 h-4" /> Run Locally with Cloud
                        Services
                      </div>
                      <div className="text-[12px] mt-1 opacity-70">
                        run on your machine, use ElizaOS for AI &amp; services
                      </div>
                    </button>
                  </div>
                )}

                {/* If local+cloud: show execution mode + database pickers */}
                {cloudConnected &&
                  onboardingElizaosRunMode === "local-cloud-services" && (
                    <>
                      <div className="mt-6 mb-3 text-left max-w-[460px] mx-auto">
                        <h3 className="text-sm font-bold text-txt-strong mb-2">
                          Execution Mode
                        </h3>
                      </div>
                      <ExecutionModePicker
                        value={onboardingRunMode}
                        onChange={handleRunModeSelect}
                      />
                      <div className="mt-6 mb-3 text-left max-w-[460px] mx-auto">
                        <h3 className="text-sm font-bold text-txt-strong mb-2">
                          Database
                        </h3>
                      </div>
                      <DatabasePicker
                        value={onboardingDatabaseProvider}
                        connectionString={onboardingDatabaseConnectionString}
                        onChange={(v) =>
                          setState("onboardingDatabaseProvider", v)
                        }
                        onConnectionStringChange={(v) =>
                          setState("onboardingDatabaseConnectionString", v)
                        }
                        onSetupDockerDb={handleSetupDockerDb}
                        dockerDbBusy={dockerDbBusy}
                        dockerDbError={dockerDbError}
                        dockerDbSuccess={dockerDbSuccess}
                        dockerAvailable={
                          onboardingOptions?.detectedEnvironment
                            ?.dockerAvailable ?? false
                        }
                      />
                    </>
                  )}

                {/* If cloud hosted: show model selection */}
                {cloudConnected &&
                  onboardingElizaosRunMode === "cloud-hosted" && (
                    <div className="mt-6 max-w-[460px] mx-auto">
                      <CloudModelSelection
                        cloudProviders={
                          onboardingOptions?.cloudProviders ?? []
                        }
                        cloudProvider={onboardingCloudProvider}
                        smallModel={onboardingSmallModel}
                        largeModel={onboardingLargeModel}
                        models={onboardingOptions?.models}
                        onCloudProviderChange={(v) =>
                          setState("onboardingCloudProvider", v)
                        }
                        onSmallModelChange={(v) =>
                          setState("onboardingSmallModel", v)
                        }
                        onLargeModelChange={(v) =>
                          setState("onboardingLargeModel", v)
                        }
                      />
                    </div>
                  )}
              </>
            ) : (
              /* ── LOCAL path: Exec mode + Database ───────────────── */
              <>
                {/* Execution mode picker */}
                <div className="onboarding-speech bg-card border border-border rounded-xl px-5 py-4 mx-auto mb-4 max-w-[600px] relative text-[15px] text-txt leading-relaxed">
                  <h2 className="text-[24px] font-normal mb-1 text-txt-strong">
                    where should i live?
                  </h2>
                  <p className="text-[13px] text-txt mt-1 opacity-70">
                    pick how u want me to run bb
                  </p>
                </div>

                {isMobilePlatform ? (
                  <MobileCloudOnly
                    runMode={onboardingRunMode}
                    onSelect={handleRunModeSelect}
                  />
                ) : (
                  <ExecutionModePicker
                    value={onboardingRunMode}
                    onChange={handleRunModeSelect}
                  />
                )}

                {/* Database picker */}
                <div className="mt-8 mb-3 text-left max-w-[460px] mx-auto">
                  <h3 className="text-sm font-bold text-txt-strong mb-1">
                    Database
                  </h3>
                  <p className="text-[12px] text-muted">
                    where should i store my memories?
                  </p>
                </div>
                <DatabasePicker
                  value={onboardingDatabaseProvider}
                  connectionString={onboardingDatabaseConnectionString}
                  onChange={(v) => setState("onboardingDatabaseProvider", v)}
                  onConnectionStringChange={(v) =>
                    setState("onboardingDatabaseConnectionString", v)
                  }
                  onSetupDockerDb={handleSetupDockerDb}
                  dockerDbBusy={dockerDbBusy}
                  dockerDbError={dockerDbError}
                  dockerDbSuccess={dockerDbSuccess}
                  dockerAvailable={
                    onboardingOptions?.detectedEnvironment?.dockerAvailable ??
                    false
                  }
                />
              </>
            )}
          </div>
        );

      // ═══════════════════════════════════════════════════════════════════
      // Step 3b: Permissions (rawdog + electron + missing permissions)
      // ═══════════════════════════════════════════════════════════════════
      case "permissions":
        return (
          <div className="max-w-[520px] mx-auto mt-10 font-body">
            <PermissionsOnboardingSection
              onContinue={(opts) => handleOnboardingNext(opts)}
            />
          </div>
        );

      // ═══════════════════════════════════════════════════════════════════
      // Step 4: AI Provider — ElizaCloud login gate + provider selection
      // ═══════════════════════════════════════════════════════════════════
      case "aiProvider": {
        // For ElizaOS cloud-hosted path, provider is pre-configured — just confirm
        if (
          onboardingHostingChoice === "elizaos" &&
          onboardingElizaosRunMode === "cloud-hosted"
        ) {
          return (
            <div className="max-w-[520px] mx-auto mt-10 text-center font-body">
              <div className="onboarding-speech bg-card border border-border rounded-xl px-5 py-4 mx-auto mb-6 max-w-[600px] relative text-[15px] text-txt leading-relaxed">
                <h2 className="text-[24px] font-normal mb-1 text-txt-strong">
                  all set!
                </h2>
                <p className="text-[13px] text-txt mt-1 opacity-70">
                  ElizaOS will handle your AI provider. Click next to launch.
                </p>
              </div>
              <div className="max-w-[400px] mx-auto text-left">
                <div className="px-4 py-3 border border-green-500/30 bg-green-500/10 text-green-400 text-sm rounded-lg">
                  Cloud provider configured
                  {onboardingCloudProvider
                    ? ` (${onboardingCloudProvider})`
                    : ""}
                </div>
              </div>
            </div>
          );
        }

        // For ElizaOS local+cloud path, default provider to elizacloud
        if (
          onboardingHostingChoice === "elizaos" &&
          onboardingElizaosRunMode === "local-cloud-services" &&
          !onboardingProvider
        ) {
          setState("onboardingProvider", "elizacloud");
        }

        const providers = onboardingOptions?.providers ?? [];
        const cloudProviders = providers.filter(
          (p: ProviderOption) => p.id === "elizacloud",
        );
        const subscriptionProviders = providers.filter(
          (p: ProviderOption) =>
            p.id === "anthropic-subscription" ||
            p.id === "openai-subscription",
        );
        const apiProviders = providers.filter(
          (p: ProviderOption) =>
            !subscriptionProviders.some((s) => s.id === p.id) &&
            p.id !== "elizacloud",
        );

        const providerOverrides: Record<
          string,
          { name: string; description?: string }
        > = {
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
          "pi-ai": {
            name: "Pi Credentials (pi-ai)",
            description:
              "Use pi auth (~/.pi/agent/auth.json) for API keys / OAuth",
          },
        };

        const getProviderDisplay = (provider: ProviderOption) => {
          const override = providerOverrides[provider.id];
          return {
            name: override?.name ?? provider.name,
            description: override?.description ?? provider.description,
          };
        };

        const isDark = true; // theme defaults to "milady" which is dark

        const handleProviderSelect = (providerId: string) => {
          setState("onboardingProvider", providerId);
          setState("onboardingApiKey", "");
          setState("onboardingPrimaryModel", "");
          if (providerId === "anthropic-subscription") {
            setState("onboardingSubscriptionTab", "token");
          }
        };

        const renderProviderCard = (provider: ProviderOption) => {
          const display = getProviderDisplay(provider);
          const isSelected = onboardingProvider === provider.id;
          return (
            <button
              type="button"
              key={provider.id}
              className={`px-4 py-3 border-[1.5px] cursor-pointer transition-all text-left flex items-center gap-3 rounded-lg ${
                isSelected
                  ? "border-accent !bg-accent !text-accent-fg shadow-[0_0_0_3px_var(--accent),var(--shadow-md)]"
                  : "border-border bg-card hover:border-border-hover hover:bg-bg-hover hover:shadow-md hover:-translate-y-0.5"
              }`}
              onClick={() => handleProviderSelect(provider.id)}
            >
              <img
                src={getProviderLogo(provider.id, isDark)}
                alt={display.name}
                className="w-9 h-9 rounded-md object-contain bg-bg-muted p-1.5 shrink-0"
              />
              <div>
                <div className="font-semibold text-sm">{display.name}</div>
                {display.description && (
                  <div
                    className={`text-xs mt-0.5 ${isSelected ? "opacity-80" : "text-muted"}`}
                  >
                    {display.description}
                  </div>
                )}
              </div>
            </button>
          );
        };

        // ── Phase 1: provider grid (no provider selected yet) ──────
        if (!onboardingProvider) {
          return (
            <div className="w-full mx-auto mt-10 text-center font-body">
              <img
                src="/android-chrome-512x512.png"
                alt="Avatar"
                className="w-[140px] h-[140px] rounded-full object-cover border-[3px] border-border mx-auto mb-5 block"
              />
              <div className="onboarding-speech bg-card border border-border rounded-xl px-5 py-4 mx-auto mb-4 max-w-[420px] relative text-[15px] text-txt leading-relaxed">
                <h2 className="text-[28px] font-normal mb-1 text-txt-strong">
                  what is my brain?
                </h2>
              </div>
              <div className="w-full mx-auto px-2">
                <div className="mb-4 text-left">
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                    {cloudProviders.map((p: ProviderOption) =>
                      renderProviderCard(p),
                    )}
                    {subscriptionProviders.map((p: ProviderOption) =>
                      renderProviderCard(p),
                    )}
                    {apiProviders.map((p: ProviderOption) =>
                      renderProviderCard(p),
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        }

        // ── Phase 2: config for the selected provider ──────────────
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

        return (
          <div className="max-w-[520px] mx-auto mt-10 text-center font-body">
            {/* Header with selected provider + change link */}
            <div className="flex items-center justify-center gap-3 mb-6">
              {selectedProvider && (
                <img
                  src={getProviderLogo(selectedProvider.id, isDark)}
                  alt={selectedDisplay.name}
                  className="w-10 h-10 rounded-md object-contain bg-bg-muted p-1.5"
                />
              )}
              <div className="text-left">
                <h2 className="text-[22px] font-normal text-txt-strong leading-tight">
                  {selectedDisplay.name}
                </h2>
                {selectedDisplay.description && (
                  <p className="text-xs text-muted mt-0.5">
                    {selectedDisplay.description}
                  </p>
                )}
              </div>
              <button
                type="button"
                className="ml-2 text-xs text-accent bg-transparent border border-accent/30 px-2.5 py-1 rounded-full cursor-pointer hover:bg-accent/10"
                onClick={() => {
                  setState("onboardingProvider", "");
                  setState("onboardingApiKey", "");
                  setState("onboardingPrimaryModel", "");
                }}
              >
                change
              </button>
            </div>

            {/* Eliza Cloud — cloud login */}
            {onboardingProvider === "elizacloud" && (
              <div className="max-w-[600px] mx-auto">
                {cloudConnected ? (
                  <div className="flex items-center gap-2 px-4 py-2.5 border border-green-500/30 bg-green-500/10 text-green-400 text-sm rounded-lg justify-center">
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
                      <title>Connected</title>
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    connected~
                  </div>
                ) : (
                  <button
                    type="button"
                    className="w-full px-6 py-2.5 border border-accent bg-accent text-accent-fg text-sm cursor-pointer rounded-full hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed"
                    onClick={handleCloudLogin}
                    disabled={cloudLoginBusy}
                  >
                    {cloudLoginBusy ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="inline-block w-4 h-4 border-2 border-border border-t-accent rounded-full animate-spin" />
                        connecting...
                      </span>
                    ) : (
                      "connect account"
                    )}
                  </button>
                )}
                {cloudLoginError && (
                  <p className="text-danger text-[13px] mt-2">
                    {cloudLoginError}
                  </p>
                )}
                <p className="text-xs text-muted mt-3">
                  Free credits to start. No API key needed.
                </p>
              </div>
            )}

            {/* Claude Subscription — setup token / OAuth */}
            {onboardingProvider === "anthropic-subscription" && (
              <div className="text-left">
                <div className="flex items-center gap-4 border-b border-border mb-3">
                  <button
                    type="button"
                    className={`text-sm pb-2 border-b-2 ${
                      onboardingSubscriptionTab === "token"
                        ? "border-accent text-accent"
                        : "border-transparent text-muted hover:text-txt"
                    }`}
                    onClick={() =>
                      setState("onboardingSubscriptionTab", "token")
                    }
                  >
                    Setup Token
                  </button>
                  <button
                    type="button"
                    className={`text-sm pb-2 border-b-2 ${
                      onboardingSubscriptionTab === "oauth"
                        ? "border-accent text-accent"
                        : "border-transparent text-muted hover:text-txt"
                    }`}
                    onClick={() =>
                      setState("onboardingSubscriptionTab", "oauth")
                    }
                  >
                    OAuth Login
                  </button>
                </div>

                {onboardingSubscriptionTab === "token" ? (
                  <>
                    <span className="text-[13px] font-bold text-txt-strong block mb-2">
                      Setup Token:
                    </span>
                    <input
                      type="password"
                      value={onboardingApiKey}
                      onChange={handleApiKeyChange}
                      placeholder="sk-ant-oat01-..."
                      className="w-full px-3 py-2 border border-border bg-card text-sm focus:border-accent focus:outline-none"
                    />
                    <p className="text-xs text-muted mt-2 whitespace-pre-line">
                      {
                        'How to get your setup token:\n\n• Option A: Run  claude setup-token  in your terminal (if you have Claude Code CLI installed)\n\n• Option B: Go to claude.ai/settings/api → "Claude Code" → "Use setup token"'
                      }
                    </p>
                  </>
                ) : anthropicConnected ? (
                  <div className="flex flex-col items-center gap-3">
                    <div className="flex items-center gap-2 px-6 py-3 border border-green-500/30 bg-green-500/10 text-green-400 text-sm font-medium w-full max-w-xs justify-center">
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
                        <title>Connected</title>
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      Connected to Claude
                    </div>
                    <p className="text-xs text-muted text-center">
                      Your Claude subscription is linked. Click Next to
                      continue.
                    </p>
                  </div>
                ) : !anthropicOAuthStarted ? (
                  <div className="flex flex-col items-center gap-3">
                    <button
                      type="button"
                      className="w-full max-w-xs px-6 py-3 border border-accent bg-accent text-accent-fg text-sm font-medium cursor-pointer hover:bg-accent-hover transition-colors"
                      onClick={() => void handleAnthropicStart()}
                    >
                      Login with Anthropic
                    </button>
                    <p className="text-xs text-muted text-center">
                      Requires Claude Pro ($20/mo) or Max ($100/mo).
                    </p>
                    {anthropicError && (
                      <p className="text-xs text-red-400">{anthropicError}</p>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <p className="text-sm text-txt text-center">
                      After logging in, you'll see a code on Anthropic's page.
                      <br />
                      Copy and paste it below:
                    </p>
                    <input
                      type="text"
                      placeholder="Paste the authorization code here..."
                      value={anthropicCode}
                      onChange={(e) => setAnthropicCode(e.target.value)}
                      className="w-full max-w-xs px-3 py-2 border border-border bg-card text-sm text-center focus:border-accent focus:outline-none"
                    />
                    {anthropicError && (
                      <p className="text-xs text-red-400">{anthropicError}</p>
                    )}
                    <button
                      type="button"
                      disabled={!anthropicCode}
                      className="w-full max-w-xs px-6 py-2 border border-accent bg-accent text-accent-fg text-sm cursor-pointer hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed"
                      onClick={() => void handleAnthropicExchange()}
                    >
                      Connect
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ChatGPT Subscription — OAuth */}
            {onboardingProvider === "openai-subscription" && (
              <div className="space-y-4">
                {openaiConnected ? (
                  <div className="flex flex-col items-center gap-3">
                    <div className="flex items-center gap-2 px-6 py-3 border border-green-500/30 bg-green-500/10 text-green-400 text-sm font-medium w-full max-w-xs justify-center">
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
                        <title>Connected</title>
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      Connected to ChatGPT
                    </div>
                    <p className="text-xs text-muted text-center">
                      Your ChatGPT subscription is linked. Click Next to
                      continue.
                    </p>
                  </div>
                ) : !openaiOAuthStarted ? (
                  <div className="flex flex-col items-center gap-3">
                    <button
                      type="button"
                      className="w-full max-w-xs px-6 py-3 border border-accent bg-accent text-accent-fg text-sm font-medium cursor-pointer hover:bg-accent-hover transition-colors"
                      onClick={() => void handleOpenAIStart()}
                    >
                      Login with OpenAI
                    </button>
                    <p className="text-xs text-muted text-center">
                      Requires ChatGPT Plus ($20/mo) or Pro ($200/mo).
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    <div className="p-3 border border-border bg-card text-sm text-fg rounded">
                      <p className="font-medium mb-1">Almost there!</p>
                      <p className="text-muted text-xs leading-relaxed">
                        After logging in, you'll be redirected to a page that
                        won't load (starts with{" "}
                        <code className="text-fg bg-input px-1 py-0.5 text-xs">
                          localhost:1455
                        </code>
                        ). Copy the <strong>entire URL</strong> from your
                        browser's address bar and paste it below.
                      </p>
                    </div>
                    <input
                      type="text"
                      className="w-full px-3 py-2.5 border border-border bg-input text-fg text-sm placeholder:text-muted"
                      placeholder="http://localhost:1455/auth/callback?code=..."
                      value={openaiCallbackUrl}
                      onChange={(e) => {
                        setOpenaiCallbackUrl(e.target.value);
                        setOpenaiError("");
                      }}
                    />
                    {openaiError && (
                      <p className="text-xs text-red-400">{openaiError}</p>
                    )}
                    <div className="flex gap-2 justify-center">
                      <button
                        type="button"
                        className="px-6 py-2.5 border border-accent bg-accent text-accent-fg text-sm font-medium cursor-pointer hover:bg-accent-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        disabled={!openaiCallbackUrl}
                        onClick={() => void handleOpenAIExchange()}
                      >
                        Complete Login
                      </button>
                      <button
                        type="button"
                        className="px-4 py-2.5 border border-border text-muted text-sm cursor-pointer hover:text-fg transition-colors"
                        onClick={() => {
                          setOpenaiOAuthStarted(false);
                          setOpenaiCallbackUrl("");
                        }}
                      >
                        Start Over
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Regular API key input */}
            {onboardingProvider &&
              onboardingProvider !== "anthropic-subscription" &&
              onboardingProvider !== "openai-subscription" &&
              onboardingProvider !== "elizacloud" &&
              onboardingProvider !== "ollama" &&
              onboardingProvider !== "pi-ai" && (
                <div className="text-left">
                  <span className="text-[13px] font-bold text-txt-strong block mb-2">
                    API Key:
                  </span>
                  <input
                    type="password"
                    value={onboardingApiKey}
                    onChange={handleApiKeyChange}
                    placeholder="Enter your API key"
                    className="w-full px-3 py-2 border border-border bg-card text-sm focus:border-accent focus:outline-none"
                  />
                </div>
              )}

            {/* Ollama — no config needed */}
            {onboardingProvider === "ollama" && (
              <p className="text-xs text-muted">
                No configuration needed. Make sure Ollama is running locally.
              </p>
            )}

            {/* pi-ai — optional model override */}
            {onboardingProvider === "pi-ai" && (
              <div className="text-left">
                <span className="text-[13px] font-bold text-txt-strong block mb-2">
                  Primary Model (optional):
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
                      className="w-full px-3 py-2 border border-border bg-card text-sm focus:border-accent focus:outline-none"
                    >
                      <option value="">
                        Use pi default model
                        {piAiDefaultModel ? ` (${piAiDefaultModel})` : ""}
                      </option>
                      {piAiModels.map((model: PiAiModelOption) => (
                        <option key={model.id} value={model.id}>
                          {model.name} ({model.provider})
                        </option>
                      ))}
                      <option value="__custom__">Custom model spec…</option>
                    </select>

                    {piAiSelectValue === "__custom__" && (
                      <input
                        type="text"
                        value={onboardingPrimaryModel}
                        onChange={(e) =>
                          setState("onboardingPrimaryModel", e.target.value)
                        }
                        placeholder="provider/model (e.g. anthropic/claude-sonnet-4.5)"
                        className="w-full mt-2 px-3 py-2 border border-border bg-card text-sm focus:border-accent focus:outline-none"
                      />
                    )}
                  </>
                ) : (
                  <input
                    type="text"
                    value={onboardingPrimaryModel}
                    onChange={(e) =>
                      setState("onboardingPrimaryModel", e.target.value)
                    }
                    placeholder="provider/model (e.g. anthropic/claude-sonnet-4.5)"
                    className="w-full px-3 py-2 border border-border bg-card text-sm focus:border-accent focus:outline-none"
                  />
                )}

                <p className="text-xs text-muted mt-2">
                  Uses credentials from ~/.pi/agent/auth.json. Leave blank to
                  use your pi default model.
                  {piAiModels.length > 0
                    ? " Pick from the dropdown or choose a custom model spec."
                    : " Enter provider/model manually if you want an override."}
                </p>
              </div>
            )}

            {/* OpenRouter model selection */}
            {onboardingProvider === "openrouter" &&
              onboardingApiKey.trim() &&
              onboardingOptions?.openrouterModels && (
                <div className="mt-4 text-left">
                  <span className="text-[13px] font-bold text-txt-strong block mb-2">
                    Select Model:
                  </span>
                  <div className="flex flex-col gap-2">
                    {onboardingOptions?.openrouterModels?.map(
                      (model: OpenRouterModelOption) => (
                        <button
                          type="button"
                          key={model.id}
                          className={`w-full px-4 py-3 border cursor-pointer transition-colors text-left rounded-lg ${
                            onboardingOpenRouterModel === model.id
                              ? "border-accent !bg-accent !text-accent-fg"
                              : "border-border bg-card hover:border-accent/50"
                          }`}
                          onClick={() =>
                            setState("onboardingOpenRouterModel", model.id)
                          }
                        >
                          <div className="font-bold text-sm">{model.name}</div>
                          {model.description && (
                            <div className="text-xs text-muted mt-0.5">
                              {model.description}
                            </div>
                          )}
                        </button>
                      ),
                    )}
                  </div>
                </div>
              )}
          </div>
        );
      }

      // ═══════════════════════════════════════════════════════════════════
      // Step 5: Launch — handled by handleOnboardingFinish, this is a
      // fallback in case we ever render the "launch" step directly
      // ═══════════════════════════════════════════════════════════════════
      case "launch":
        return (
          <div className="max-w-[520px] mx-auto mt-10 text-center font-body">
            <div className="onboarding-speech bg-card border border-border rounded-xl px-5 py-4 mx-auto mb-6 max-w-[600px] relative text-[15px] text-txt leading-relaxed">
              <h2 className="text-[28px] font-normal mb-1 text-txt-strong">
                launching...
              </h2>
              <p className="text-[13px] text-txt mt-1 opacity-70">
                setting everything up for u~
              </p>
            </div>
            <div className="inline-block w-8 h-8 border-2 border-border border-t-accent rounded-full animate-spin" />
          </div>
        );

      default:
        return null;
    }
  };

  // ── canGoNext validation ─────────────────────────────────────────────

  const canGoNext = () => {
    switch (onboardingStep) {
      case "welcome":
        return onboardingHostingChoice !== "";
      case "identity":
        return (
          onboardingName.trim().length > 0 && onboardingStyle.length > 0
        );
      case "infrastructure":
        if (onboardingHostingChoice === "elizaos") {
          if (!cloudConnected) return false;
          if (!onboardingElizaosRunMode) return false;
          if (onboardingElizaosRunMode === "cloud-hosted") {
            return onboardingCloudProvider.length > 0;
          }
          // local-cloud-services: need run mode + database
          return onboardingRunMode !== "";
        }
        // Local path: need run mode
        return onboardingRunMode !== "";
      case "permissions":
        // Permissions step can always be skipped
        return true;
      case "aiProvider":
        // ElizaOS cloud-hosted: always valid (pre-configured)
        if (
          onboardingHostingChoice === "elizaos" &&
          onboardingElizaosRunMode === "cloud-hosted"
        ) {
          return true;
        }
        // Provider must be selected
        if (!onboardingProvider) return false;
        if (onboardingProvider === "anthropic-subscription") {
          return onboardingSubscriptionTab === "token"
            ? onboardingApiKey.length > 0
            : anthropicConnected;
        }
        if (onboardingProvider === "openai-subscription") {
          return openaiConnected;
        }
        if (
          onboardingProvider === "elizacloud" ||
          onboardingProvider === "ollama" ||
          onboardingProvider === "pi-ai"
        ) {
          return onboardingProvider === "elizacloud"
            ? cloudConnected || devMode === "all"
            : true;
        }
        return onboardingProvider.length > 0 && onboardingApiKey.length > 0;
      case "launch":
        return false;
      default:
        return false;
    }
  };

  const canGoBack = onboardingStep !== "welcome";

  /** On the aiProvider config screen, "back" returns to the provider grid. */
  const handleBack = () => {
    if (onboardingStep === "aiProvider" && onboardingProvider) {
      setState("onboardingProvider", "");
      setState("onboardingApiKey", "");
      setState("onboardingPrimaryModel", "");
    } else {
      handleOnboardingBack();
    }
  };

  return (
    <div className="mx-auto px-4 pb-16 text-center font-body h-full overflow-y-auto">
      {devMode && (
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 mb-2 rounded-full text-[11px] font-bold uppercase tracking-wider bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
          [DEV] {devMode === "paygate" ? "paygate mode" : "all unlocked"}
        </div>
      )}
      {renderStep(onboardingStep)}
      <div className="flex gap-2 mt-8 justify-center">
        {canGoBack && (
          <button
            type="button"
            className="px-6 py-2 border border-border bg-transparent text-txt text-sm cursor-pointer rounded-full hover:bg-accent-subtle hover:text-accent"
            onClick={handleBack}
            disabled={onboardingRestarting}
          >
            back
          </button>
        )}
        <button
          type="button"
          className="px-6 py-2 border border-accent bg-accent text-accent-fg text-sm cursor-pointer rounded-full hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed"
          onClick={() => void handleOnboardingNext()}
          disabled={!canGoNext() || onboardingRestarting}
        >
          {onboardingRestarting ? "restarting..." : "next"}
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Extracted sub-components
// ═══════════════════════════════════════════════════════════════════════════

/** Execution mode picker — shared between local and elizaos paths. */
function ExecutionModePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (mode: "local-rawdog" | "local-lifo" | "local-sandbox" | "cloud") => void;
}) {
  return (
    <div className="flex flex-col gap-3 max-w-[460px] mx-auto">
      <button
        type="button"
        className={`px-4 py-4 border cursor-pointer bg-card transition-colors rounded-lg text-left ${
          value === "local-rawdog"
            ? "border-accent !bg-accent !text-accent-fg"
            : "border-border hover:border-accent"
        }`}
        onClick={() => onChange("local-rawdog")}
      >
        <div className="font-bold text-sm flex items-center gap-1.5">
          <Zap className="w-4 h-4" /> elevated (raw)
        </div>
        <div className="text-[12px] mt-1 opacity-70">
          i run directly on ur machine w full access. fastest &amp; simplest but
          no sandbox protection
        </div>
      </button>
      <button
        type="button"
        className={`px-4 py-4 border cursor-pointer bg-card transition-colors rounded-lg text-left ${
          value === "local-lifo"
            ? "border-accent !bg-accent !text-accent-fg"
            : "border-border hover:border-accent"
        }`}
        onClick={() => onChange("local-lifo")}
      >
        <div className="font-bold text-sm flex items-center gap-1.5">
          <Terminal className="w-4 h-4" /> sandboxed (LIFO)
        </div>
        <div className="text-[12px] mt-1 opacity-70">
          i run in a browser-based virtual environment. safe isolation, no docker
          needed
        </div>
      </button>
      <button
        type="button"
        className={`px-4 py-4 border cursor-pointer bg-card transition-colors rounded-lg text-left ${
          value === "cloud"
            ? "border-accent !bg-accent !text-accent-fg"
            : "border-border hover:border-accent"
        }`}
        onClick={() => onChange("cloud")}
      >
        <div className="font-bold text-sm flex items-center gap-1.5">
          <Cloud className="w-4 h-4" /> cloud
        </div>
        <div className="text-[12px] mt-1 opacity-70">
          i run on eliza cloud. easiest setup, always on, can still use ur
          browser &amp; computer if u let me
        </div>
      </button>
    </div>
  );
}

/** Mobile-only: auto-selects cloud mode. */
function MobileCloudOnly({
  runMode,
  onSelect,
}: {
  runMode: string;
  onSelect: (mode: "cloud") => void;
}) {
  useEffect(() => {
    if (runMode !== "cloud") onSelect("cloud");
  }, [runMode, onSelect]);

  return (
    <div className="max-w-[460px] mx-auto">
      <div className="px-4 py-4 border border-accent bg-accent text-accent-fg rounded-lg text-left">
        <div className="font-bold text-sm flex items-center gap-1.5">
          <Cloud className="w-4 h-4" /> cloud
        </div>
        <div className="text-[12px] mt-1 opacity-80">
          since ur on mobile i'll run on eliza cloud. always on, works from any
          device
        </div>
      </div>
    </div>
  );
}

/** Database provider picker. */
function DatabasePicker({
  value,
  connectionString,
  onChange,
  onConnectionStringChange,
  onSetupDockerDb,
  dockerDbBusy,
  dockerDbError,
  dockerDbSuccess,
  dockerAvailable,
}: {
  value: "pglite" | "postgres" | "docker-postgres";
  connectionString: string;
  onChange: (v: "pglite" | "postgres" | "docker-postgres") => void;
  onConnectionStringChange: (v: string) => void;
  onSetupDockerDb: () => void;
  dockerDbBusy: boolean;
  dockerDbError: string | null;
  dockerDbSuccess: boolean;
  dockerAvailable: boolean;
}) {
  return (
    <div className="flex flex-col gap-2 max-w-[460px] mx-auto">
      <button
        type="button"
        className={`px-4 py-3 border cursor-pointer bg-card transition-colors rounded-lg text-left ${
          value === "pglite"
            ? "border-accent !bg-accent !text-accent-fg"
            : "border-border hover:border-accent"
        }`}
        onClick={() => onChange("pglite")}
      >
        <div className="font-bold text-sm flex items-center gap-1.5">
          <HardDrive className="w-4 h-4" /> PGLite (embedded)
        </div>
        <div className="text-[12px] mt-1 opacity-70">
          zero-config, built-in database. recommended for getting started
        </div>
      </button>

      <button
        type="button"
        className={`px-4 py-3 border cursor-pointer bg-card transition-colors rounded-lg text-left ${
          value === "postgres"
            ? "border-accent !bg-accent !text-accent-fg"
            : "border-border hover:border-accent"
        }`}
        onClick={() => onChange("postgres")}
      >
        <div className="font-bold text-sm flex items-center gap-1.5">
          <Database className="w-4 h-4" /> PostgreSQL (remote)
        </div>
        <div className="text-[12px] mt-1 opacity-70">
          connect to your own PostgreSQL server
        </div>
      </button>

      {value === "postgres" && (
        <div className="ml-2 mt-1">
          <input
            type="text"
            value={connectionString}
            onChange={(e) => onConnectionStringChange(e.target.value)}
            placeholder="postgresql://user:pass@host:5432/dbname"
            className="w-full px-3 py-2 border border-border bg-card text-sm font-mono focus:border-accent focus:outline-none rounded"
          />
        </div>
      )}

      <button
        type="button"
        className={`px-4 py-3 border cursor-pointer bg-card transition-colors rounded-lg text-left ${
          value === "docker-postgres"
            ? "border-accent !bg-accent !text-accent-fg"
            : "border-border hover:border-accent"
        }`}
        onClick={() => onChange("docker-postgres")}
      >
        <div className="font-bold text-sm flex items-center gap-1.5">
          <Server className="w-4 h-4" /> Docker PostgreSQL (auto-managed)
        </div>
        <div className="text-[12px] mt-1 opacity-70">
          auto-create a PostgreSQL container{" "}
          {!dockerAvailable && "(requires Docker)"}
        </div>
      </button>

      {value === "docker-postgres" && (
        <div className="ml-2 mt-1">
          {dockerDbSuccess ? (
            <div className="px-3 py-2 border border-green-500/30 bg-green-500/10 text-green-400 text-sm rounded">
              Docker PostgreSQL is ready
            </div>
          ) : (
            <>
              <button
                type="button"
                className="px-4 py-2 border border-accent bg-accent text-accent-fg text-sm cursor-pointer rounded hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed"
                onClick={onSetupDockerDb}
                disabled={dockerDbBusy || !dockerAvailable}
              >
                {dockerDbBusy
                  ? "Setting up..."
                  : !dockerAvailable
                    ? "Docker not available"
                    : "Setup Docker PostgreSQL"}
              </button>
              {dockerDbError && (
                <p className="text-xs text-red-400 mt-1">{dockerDbError}</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Cloud model selection — used in ElizaOS cloud-hosted path. */
function CloudModelSelection({
  cloudProviders,
  cloudProvider,
  smallModel,
  largeModel,
  models,
  onCloudProviderChange,
  onSmallModelChange,
  onLargeModelChange,
}: {
  cloudProviders: CloudProviderOption[];
  cloudProvider: string;
  smallModel: string;
  largeModel: string;
  models?: { small?: { id: string; name: string }[]; large?: { id: string; name: string }[] };
  onCloudProviderChange: (v: string) => void;
  onSmallModelChange: (v: string) => void;
  onLargeModelChange: (v: string) => void;
}) {
  return (
    <div className="text-left">
      <h3 className="text-sm font-bold text-txt-strong mb-3">
        Cloud Provider
      </h3>
      <div className="flex flex-col gap-2 mb-4">
        {cloudProviders.map((provider) => (
          <button
            type="button"
            key={provider.id}
            className={`w-full px-4 py-3 border cursor-pointer bg-card transition-colors rounded-lg text-left ${
              cloudProvider === provider.id
                ? "border-accent !bg-accent !text-accent-fg"
                : "border-border hover:border-accent"
            }`}
            onClick={() => onCloudProviderChange(provider.id)}
          >
            <div className="font-bold text-sm">{provider.name}</div>
            {provider.description && (
              <div
                className={`text-xs mt-0.5 ${
                  cloudProvider === provider.id
                    ? "text-accent-fg/70"
                    : "text-muted"
                }`}
              >
                {provider.description}
              </div>
            )}
          </button>
        ))}
      </div>

      {models && (
        <>
          <h3 className="text-sm font-bold text-txt-strong mb-2">
            Model Selection
          </h3>
          <div className="flex flex-col gap-3">
            <div>
              <span className="text-[13px] text-txt-strong block mb-1">
                Small Model:
              </span>
              <select
                value={smallModel}
                onChange={(e) => onSmallModelChange(e.target.value)}
                className="w-full px-3 py-2 border border-border bg-card text-sm focus:border-accent focus:outline-none rounded"
              >
                {models.small?.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <span className="text-[13px] text-txt-strong block mb-1">
                Large Model:
              </span>
              <select
                value={largeModel}
                onChange={(e) => onLargeModelChange(e.target.value)}
                className="w-full px-3 py-2 border border-border bg-card text-sm focus:border-accent focus:outline-none rounded"
              >
                {models.large?.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
