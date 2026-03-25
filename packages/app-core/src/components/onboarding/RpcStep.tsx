import { useApp } from "@miladyai/app-core/state";
import { Button, Input } from "@miladyai/ui";
import { useState } from "react";
import {
  OnboardingStepHeader,
  onboardingBodyTextShadowStyle,
  onboardingFooterClass,
  onboardingPrimaryActionClass,
  onboardingPrimaryActionTextShadowStyle,
  onboardingSecondaryActionClass,
  onboardingSecondaryActionTextShadowStyle,
  spawnOnboardingRipple,
} from "./onboarding-step-chrome";

type RpcMode = "" | "cloud" | "byok";

const rpcModeCardBaseClass =
  "flex min-h-[76px] w-full items-center justify-center rounded-2xl border px-4 py-3 text-center backdrop-blur-[18px] backdrop-saturate-[1.2] transition-all duration-300";

const rpcModeTitleClass =
  "text-sm font-semibold leading-tight text-[var(--onboarding-text-primary)]";

const rpcModeDescriptionClass =
  "mt-1 text-xs leading-[1.45] text-[var(--onboarding-text-subtle)]";

const rpcCalloutClass =
  "mx-auto mt-4 flex w-full max-w-[25rem] items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm leading-relaxed shadow-[0_18px_50px_rgba(3,5,10,0.2)] backdrop-blur-sm";

const rpcFieldStackClass = "mx-auto w-full max-w-[27rem] space-y-4 text-left";

const rpcFieldLabelClass =
  "mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--onboarding-text-muted)]";

const rpcFieldHintClass =
  "mb-2 text-xs leading-relaxed text-[var(--onboarding-text-subtle)]";

const rpcInputClass =
  "w-full rounded-xl border border-[var(--onboarding-card-border)] bg-[var(--onboarding-card-bg)] px-4 py-3 text-left text-sm tracking-[0.01em] text-[var(--onboarding-text-primary)] outline-none transition-[border-color,box-shadow,background-color] duration-300 placeholder:text-[var(--onboarding-text-faint)] focus:border-[var(--onboarding-field-focus-border)] focus:shadow-[var(--onboarding-field-focus-shadow)]";

function RpcModeCard({
  title,
  description,
  tone = "default",
  onClick,
}: {
  title: string;
  description: string;
  tone?: "default" | "recommended";
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant={tone === "recommended" ? "default" : "outline"}
      className={`${rpcModeCardBaseClass} ${
        tone === "recommended"
          ? "border-[var(--onboarding-recommended-border)] bg-[var(--onboarding-recommended-bg)] hover:border-[var(--onboarding-recommended-border-strong)] hover:bg-[var(--onboarding-recommended-bg-hover)]"
          : "border-[var(--onboarding-card-border)] bg-[var(--onboarding-card-bg)] hover:border-[var(--onboarding-card-border-strong)] hover:bg-[var(--onboarding-card-bg-hover)]"
      }`}
      onClick={onClick}
    >
      <div className="min-w-0">
        <div
          className={rpcModeTitleClass}
          style={onboardingBodyTextShadowStyle}
        >
          {title}
        </div>
        <div
          className={rpcModeDescriptionClass}
          style={onboardingBodyTextShadowStyle}
        >
          {description}
        </div>
      </div>
    </Button>
  );
}

function RpcKeyField({
  id,
  label,
  hint,
  placeholder,
  value,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className={rpcFieldLabelClass}>
        {label}
      </label>
      {hint ? <p className={rpcFieldHintClass}>{hint}</p> : null}
      <Input
        id={id}
        type="password"
        className={rpcInputClass}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function CloudLoginErrorMessage({ error }: { error: string }) {
  const urlMatch = error.match(/^Open this link to log in: (.+)$/);
  if (urlMatch) {
    return (
      <p
        className="mt-3 text-sm text-[var(--onboarding-text-strong)]"
        style={onboardingBodyTextShadowStyle}
      >
        Open this link to log in:{" "}
        <a
          href={urlMatch[1]}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2"
        >
          Click here
        </a>
      </p>
    );
  }

  return (
    <div
      className={`${rpcCalloutClass} border-[color:color-mix(in_srgb,var(--danger)_42%,transparent)] bg-[color:color-mix(in_srgb,var(--danger)_12%,transparent)] text-[var(--danger)]`}
      role="alert"
      style={onboardingBodyTextShadowStyle}
    >
      {error}
    </div>
  );
}

export function RpcStep() {
  const {
    elizaCloudConnected,
    elizaCloudLoginBusy,
    elizaCloudLoginError,
    onboardingRunMode,
    onboardingCloudProvider,
    onboardingApiKey,
    handleCloudLogin,
    handleOnboardingNext,
    handleOnboardingBack,
    onboardingRpcKeys,
    setState,
    t,
  } = useApp();

  const elizaCloudReady =
    elizaCloudConnected ||
    (onboardingRunMode === "cloud" &&
      onboardingCloudProvider === "elizacloud" &&
      onboardingApiKey.trim().length > 0);
  const [mode, setMode] = useState<RpcMode>(elizaCloudReady ? "cloud" : "");

  const rpcKeys = onboardingRpcKeys as Record<string, string>;

  const setRpcKey = (key: string, value: string) => {
    setState("onboardingRpcKeys", { ...rpcKeys, [key]: value });
  };

  const applyCloudSelections = () => {
    setState("onboardingRpcSelections", {
      evm: "eliza-cloud",
      bsc: "eliza-cloud",
      solana: "eliza-cloud",
    });
  };

  if (!mode) {
    return (
      <>
        <OnboardingStepHeader
          eyebrow={t("onboarding.rpcTitle")}
          title={t("onboarding.rpcQuestion")}
          description={t("onboarding.rpcDesc")}
          descriptionClassName="mx-auto mt-1 max-w-[34ch] text-balance text-[13px] leading-6"
        />

        <div className="mx-auto flex w-full max-w-[25rem] flex-col gap-3">
          <RpcModeCard
            title={t("onboarding.rpcElizaCloud")}
            description={t("onboarding.rpcElizaCloudDesc")}
            tone="recommended"
            onClick={() => {
              if (elizaCloudConnected) {
                applyCloudSelections();
              }
              setMode("cloud");
            }}
          />
          <RpcModeCard
            title={t("onboarding.rpcBringKeys")}
            description="Alchemy, QuickNode, Helius"
            onClick={() => setMode("byok")}
          />
        </div>

        <div className={onboardingFooterClass}>
          <Button
            variant="ghost"
            className={onboardingSecondaryActionClass}
            style={onboardingSecondaryActionTextShadowStyle}
            onClick={handleOnboardingBack}
            type="button"
          >
            {t("onboarding.back")}
          </Button>
          <Button
            variant="ghost"
            className={onboardingSecondaryActionClass}
            style={onboardingSecondaryActionTextShadowStyle}
            onClick={() => void handleOnboardingNext()}
            type="button"
          >
            {t("onboarding.rpcSkip")}
          </Button>
        </div>
      </>
    );
  }

  if (mode === "cloud") {
    return (
      <>
        <OnboardingStepHeader
          eyebrow={t("onboarding.rpcTitle")}
          title={t("onboarding.rpcElizaCloud")}
          description={t("onboarding.rpcElizaCloudDesc")}
          descriptionClassName="mx-auto mt-1 max-w-[34ch] text-balance"
        />

        <div className="mx-auto w-full max-w-[25rem] text-center">
          {elizaCloudConnected ? (
            <div
              className={`${rpcCalloutClass} border-[var(--ok-muted)] bg-[var(--ok-subtle)] text-[var(--ok)]`}
              role="status"
              style={onboardingBodyTextShadowStyle}
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
              {t("onboarding.rpcConnectedCloud")}
            </div>
          ) : (
            <>
              <Button
                type="button"
                className={`${onboardingPrimaryActionClass} w-full`}
                style={onboardingPrimaryActionTextShadowStyle}
                onClick={(event) => {
                  spawnOnboardingRipple(event.currentTarget, {
                    x: event.clientX,
                    y: event.clientY,
                  });
                  void handleCloudLogin();
                }}
                disabled={elizaCloudLoginBusy || elizaCloudReady}
              >
                {elizaCloudLoginBusy
                  ? t("onboarding.connecting")
                  : elizaCloudReady
                    ? t("onboarding.connected")
                    : t("onboarding.connectAccount")}
              </Button>
              {elizaCloudLoginError ? (
                <CloudLoginErrorMessage error={elizaCloudLoginError} />
              ) : null}
              <p
                className="mt-3 text-sm leading-relaxed text-[var(--onboarding-text-muted)]"
                style={onboardingBodyTextShadowStyle}
              >
                {t("onboarding.freeCredits")}
              </p>
            </>
          )}
        </div>

        <div className={onboardingFooterClass}>
          <Button
            variant="ghost"
            className={onboardingSecondaryActionClass}
            style={onboardingSecondaryActionTextShadowStyle}
            onClick={() => setMode("")}
            type="button"
          >
            {t("onboarding.back")}
          </Button>
          <Button
            className={onboardingPrimaryActionClass}
            style={onboardingPrimaryActionTextShadowStyle}
            onClick={() => {
              applyCloudSelections();
              void handleOnboardingNext();
            }}
            disabled={!elizaCloudReady}
            type="button"
          >
            {t("onboarding.next") ?? "Next"}
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <OnboardingStepHeader
        eyebrow={t("onboarding.rpcTitle")}
        title={t("onboarding.rpcBringKeys")}
        description="Connect your preferred RPC providers for chains where you want direct control."
        descriptionClassName="mx-auto mt-1 max-w-[35ch] text-balance"
      />

      <div className={rpcFieldStackClass}>
        <RpcKeyField
          id="rpc-alchemy"
          label={t("onboarding.rpcAlchemyKey")}
          hint="Covers Ethereum, Base, Arbitrum, Optimism, Polygon, and BSC."
          placeholder="Enter Alchemy API key"
          value={rpcKeys.ALCHEMY_API_KEY ?? ""}
          onChange={(value) => setRpcKey("ALCHEMY_API_KEY", value)}
        />
        <RpcKeyField
          id="rpc-helius"
          label={t("onboarding.rpcHeliusKey")}
          hint="Solana mainnet RPC and token data."
          placeholder="Enter Helius API key"
          value={rpcKeys.HELIUS_API_KEY ?? ""}
          onChange={(value) => setRpcKey("HELIUS_API_KEY", value)}
        />
        <RpcKeyField
          id="rpc-birdeye"
          label={t("onboarding.rpcBirdeyeKey")}
          hint="Optional Solana market data for richer token coverage."
          placeholder="Enter Birdeye API key (optional)"
          value={rpcKeys.BIRDEYE_API_KEY ?? ""}
          onChange={(value) => setRpcKey("BIRDEYE_API_KEY", value)}
        />
      </div>

      <div className={onboardingFooterClass}>
        <Button
          variant="ghost"
          className={onboardingSecondaryActionClass}
          style={onboardingSecondaryActionTextShadowStyle}
          onClick={() => setMode("")}
          type="button"
        >
          {t("onboarding.back")}
        </Button>
        <Button
          className={onboardingPrimaryActionClass}
          style={onboardingPrimaryActionTextShadowStyle}
          onClick={(event) => {
            spawnOnboardingRipple(event.currentTarget, {
              x: event.clientX,
              y: event.clientY,
            });

            const selections: Record<string, string> = {};
            if (rpcKeys.ALCHEMY_API_KEY) {
              selections.evm = "alchemy";
              selections.bsc = "alchemy";
            }
            if (rpcKeys.HELIUS_API_KEY) {
              selections.solana = "helius-birdeye";
            }
            setState("onboardingRpcSelections", selections);
            void handleOnboardingNext();
          }}
          type="button"
        >
          {t("onboarding.next") ?? "Next"}
        </Button>
      </div>
    </>
  );
}
