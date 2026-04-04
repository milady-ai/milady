import {
  appNameInterpolationVars,
  useBranding,
} from "@miladyai/app-core/config";
import { useApp } from "@miladyai/app-core/state";
import { getStylePresets } from "@miladyai/shared/onboarding-presets";
import { Button } from "@miladyai/ui";
import { useEffect, useMemo, useState } from "react";
import { resolveRosterEntries } from "../character/CharacterRoster";
import {
  getOnboardingAssetPreloadSnapshot,
  type OnboardingAssetPreloadSnapshot,
  primeOnboardingCharacterAssets,
  subscribeOnboardingAssetPreload,
} from "./onboarding-asset-preload";
import {
  OnboardingSecondaryActionButton,
  OnboardingStepHeader,
  onboardingFooterClass,
  onboardingPrimaryActionClass,
  onboardingPrimaryActionTextShadowStyle,
  spawnOnboardingRipple,
} from "./onboarding-step-chrome";

/** Play a silent WAV to unlock browser autoplay during a user gesture. */
function unlockBrowserAutoplay() {
  try {
    const silence = new Audio(
      "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=",
    );
    silence.volume = 0;
    silence.play().catch(() => {});
  } catch {
    // Audio not available
  }
}

/** First screen; enters the custom setup track at `connection`. */
export function WelcomeStep() {
  const branding = useBranding();
  const {
    onboardingExistingInstallDetected,
    handleOnboardingUseLocalBackend,
    setState,
    goToOnboardingStep,
    t,
    uiLanguage,
  } = useApp();

  const rosterEntries = useMemo(
    () => resolveRosterEntries(getStylePresets(uiLanguage)),
    [uiLanguage],
  );
  const [preload, setPreload] = useState<OnboardingAssetPreloadSnapshot>(() =>
    getOnboardingAssetPreloadSnapshot(),
  );

  useEffect(() => {
    void primeOnboardingCharacterAssets(rosterEntries);
    return subscribeOnboardingAssetPreload(setPreload);
  }, [rosterEntries]);

  const handleGetStarted = () => {
    unlockBrowserAutoplay();
    // Default to Chen (blue-haired anime character) — user picks their
    // character in the identity step (now the very next screen).
    setState("onboardingStyle", "chen");
    setState("onboardingName", "Chen");
    setState("selectedVrmIndex", 1);
    // WHY goToOnboardingStep: syncs Flamina guide in advanced mode; persisted
    // step still goes through the same setter as the rest of onboarding.
    goToOnboardingStep("identity");
  };

  const handleUseExistingSetup = () => {
    unlockBrowserAutoplay();
    setState("onboardingStep", "identity");
  };

  const startDisabled = !preload.ready;
  const startLabel = preload.ready
    ? onboardingExistingInstallDetected
      ? t("onboarding.useExistingSetup")
      : t("onboarding.getStarted")
    : t("common.loading", {
        defaultValue: "Loading…",
      });
  const progressLabel = preload.ready
    ? preload.timedOut
      ? t("onboarding.assetsLoadingInBackground", {
          defaultValue: "Assets are still finishing in the background.",
        })
      : t("onboarding.assetsReady", {
          defaultValue:
            "Assets ready — character selection should open instantly.",
        })
    : t("onboarding.assetsLoadingProgress", {
        defaultValue: "Loading assets… {{loaded}} (critical {{critical}})",
        loaded: preload.loadedLabel,
        critical: preload.criticalLabel,
      });

  return (
    <>
      <OnboardingStepHeader
        eyebrow={t(
          "onboarding.welcomeTitle",
          appNameInterpolationVars(branding),
        )}
        description={
          onboardingExistingInstallDetected
            ? t("onboarding.existingSetupDesc")
            : t("onboarding.welcomeDesc")
        }
        descriptionClassName="mt-1"
      />
      <div className={onboardingFooterClass}>
        {onboardingExistingInstallDetected ? (
          <OnboardingSecondaryActionButton
            onClick={handleGetStarted}
            disabled={startDisabled}
            type="button"
          >
            {t("onboarding.customSetup")}
          </OnboardingSecondaryActionButton>
        ) : (
          <OnboardingSecondaryActionButton
            onClick={() => handleOnboardingUseLocalBackend()}
            type="button"
          >
            {t("onboarding.checkExistingSetup")}
          </OnboardingSecondaryActionButton>
        )}
        <div className="flex w-full flex-col items-center gap-2">
          <Button
            className={onboardingPrimaryActionClass}
            style={onboardingPrimaryActionTextShadowStyle}
            disabled={startDisabled}
            onClick={(e) => {
              if (startDisabled) {
                return;
              }
              spawnOnboardingRipple(e.currentTarget, {
                x: e.clientX,
                y: e.clientY,
              });

              if (onboardingExistingInstallDetected) {
                handleUseExistingSetup();
              } else {
                handleGetStarted();
              }
            }}
            type="button"
          >
            {startLabel}
          </Button>
          <div className="text-center text-[11px] tracking-[0.04em] text-[var(--onboarding-text-faint)]">
            {progressLabel}
            {preload.connectionLabel ? ` · ${preload.connectionLabel}` : ""}
          </div>
        </div>
      </div>
    </>
  );
}
