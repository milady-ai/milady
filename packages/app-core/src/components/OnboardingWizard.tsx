import { LanguageDropdown } from "@miladyai/app-core/components";
import type { UiLanguage } from "@miladyai/app-core/i18n";
import { normalizeLanguage } from "@miladyai/app-core/i18n";
import {
  applyUiTheme,
  getVrmPreviewUrl,
  getVrmUrl,
  useApp,
} from "@miladyai/app-core/state";
import { resolveAppAssetUrl } from "@miladyai/app-core/utils";
import { useEffect, useState } from "react";
import { useBranding } from "../config/branding";
import { COMPANION_ENABLED } from "../navigation";
import { VrmStage } from "./companion/VrmStage";
import { ActivateStep } from "./onboarding/ActivateStep";
import { ConnectionStep } from "./onboarding/ConnectionStep";
import { OnboardingPanel } from "./onboarding/OnboardingPanel";
import { OnboardingStepNav } from "./onboarding/OnboardingStepNav";
import { PermissionsStep } from "./onboarding/PermissionsStep";
import { WelcomeStep } from "./onboarding/WelcomeStep";

const FORCE_VRM =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("test_force_vrm") === "1";

const DISABLE_ONBOARDING_VRM =
  !FORCE_VRM &&
  (String(import.meta.env.VITE_E2E_DISABLE_VRM ?? "").toLowerCase() ===
    "true" ||
    String(import.meta.env.VITE_E2E_DISABLE_VRM ?? "") === "1");

export function OnboardingWizard() {
  const branding = useBranding();
  const isEliza = branding.appName === "Eliza";
  const disableVrm =
    !FORCE_VRM && (DISABLE_ONBOARDING_VRM || isEliza || !COMPANION_ENABLED);
  const {
    onboardingStep,
    selectedVrmIndex,
    customVrmUrl,
    uiLanguage,
    uiTheme,
    setState,
    t,
    onboardingUiRevealNonce,
    companionVrmPowerMode,
    companionHalfFramerateMode,
    companionAnimateWhenHidden,
  } = useApp();
  // After Reset Agent from chat/companion, nonce bumps: show welcome UI immediately instead
  // of waiting for VrmStage reveal (often missing when remounting after an active session).
  const [revealStarted, setRevealStarted] = useState(
    () => disableVrm || onboardingUiRevealNonce > 0,
  );

  const setUiLanguage = (lang: UiLanguage) =>
    setState("uiLanguage", normalizeLanguage(lang));

  // Use same VRM resolution logic as CompanionView for character unification
  const safeSelectedVrmIndex = selectedVrmIndex > 0 ? selectedVrmIndex : 1;
  const vrmPath =
    selectedVrmIndex === 0 && customVrmUrl
      ? customVrmUrl
      : getVrmUrl(safeSelectedVrmIndex);
  const fallbackPreview =
    selectedVrmIndex > 0
      ? getVrmPreviewUrl(safeSelectedVrmIndex)
      : getVrmPreviewUrl(1);
  const worldUrl = resolveAppAssetUrl("worlds/companion-day.spz");

  useEffect(() => {
    // Onboarding keeps a fixed "light" chrome; companion mode owns day/night scenes.
    applyUiTheme("light");
    return () => {
      applyUiTheme(uiTheme);
    };
  }, [uiTheme]);

  // Overlay stays opacity 0 until VrmStage calls onRevealStart. After Reset Milady (or
  // any remount), the engine sometimes never emits reveal — user sees only the avatar.
  useEffect(() => {
    if (disableVrm) return;
    const id = window.setTimeout(() => {
      setRevealStarted((prev) => (prev ? prev : true));
    }, 3500);
    return () => window.clearTimeout(id);
  }, [disableVrm]);

  function renderStep() {
    switch (onboardingStep) {
      case "welcome":
        return <WelcomeStep />;
      case "hosting":
      case "providers":
        return <ConnectionStep />;
      case "permissions":
        return <PermissionsStep />;
      case "launch":
        return <ActivateStep />;
      default:
        return null;
    }
  }

  return (
    <div className="w-screen h-screen bg-transparent relative overflow-hidden" style={{ '--text': 'rgba(240,238,250,0.94)', '--muted': 'rgba(240,238,250,0.66)', '--border': 'rgba(255,255,255,0.14)', '--card': 'rgba(10,14,20,0.28)', '--ok': 'rgba(240,185,11,0.92)', '--ok-muted': 'rgba(240,185,11,0.34)', '--ok-subtle': 'rgba(240,185,11,0.12)', '--accent': 'rgba(240,185,11,0.94)', '--accent-foreground': 'rgba(240,238,250,0.94)', '--danger': 'rgb(248,113,113)' } as React.CSSProperties}>
      {/* Keep browser E2E runs lightweight and deterministic by skipping VRM boot. */}
      {disableVrm ? (
        <div
          aria-hidden="true"
          className="absolute inset-0 z-10 pointer-events-none"
          style={{
            background:
              "radial-gradient(circle at 50% 25%, rgba(255,255,255,0.16), transparent 34%), linear-gradient(180deg, rgba(17,17,17,0.08), rgba(10,10,10,0.36))",
          }}
        />
      ) : (
        <VrmStage
          vrmPath={vrmPath}
          worldUrl={worldUrl}
          fallbackPreviewUrl={fallbackPreview}
          cameraProfile="companion"
          initialCompanionZoomNormalized={1}
          companionVrmPowerMode={companionVrmPowerMode}
          companionHalfFramerateMode={companionHalfFramerateMode}
          companionAnimateWhenHidden={companionAnimateWhenHidden}
          onRevealStart={() => setRevealStarted((prev) => (prev ? prev : true))}
          t={t}
        />
      )}

      <div
        data-testid="onboarding-ui-overlay"
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          opacity: revealStarted ? 1 : 0,
          transition: "opacity 1.2s ease-in-out",
          zIndex: 40,
        }}
      >
        {/* Corner decorations */}
        <svg
          className="absolute w-9 h-9 pointer-events-none z-30 top-5 left-5 onboarding-corner-anim"
          viewBox="0 0 36 36"
          fill="none"
          stroke="rgba(240,185,11,0.18)"
          strokeWidth="1"
          aria-hidden="true"
        >
          <path d="M0 18 L0 0 L18 0" />
          <circle
            cx="0"
            cy="0"
            r="2"
            fill="rgba(240,185,11,0.25)"
            stroke="none"
          />
        </svg>
        <svg
          className="absolute w-9 h-9 pointer-events-none z-30 top-5 right-5 -scale-x-100 onboarding-corner-anim"
          style={{ animationDelay: '1s' }}
          viewBox="0 0 36 36"
          fill="none"
          stroke="rgba(240,185,11,0.18)"
          strokeWidth="1"
          aria-hidden="true"
        >
          <path d="M0 18 L0 0 L18 0" />
          <circle
            cx="0"
            cy="0"
            r="2"
            fill="rgba(240,185,11,0.25)"
            stroke="none"
          />
        </svg>
        <svg
          className="absolute w-9 h-9 pointer-events-none z-30 bottom-5 left-5 -scale-y-100 onboarding-corner-anim"
          style={{ animationDelay: '2s' }}
          viewBox="0 0 36 36"
          fill="none"
          stroke="rgba(240,185,11,0.18)"
          strokeWidth="1"
          aria-hidden="true"
        >
          <path d="M0 18 L0 0 L18 0" />
          <circle
            cx="0"
            cy="0"
            r="2"
            fill="rgba(240,185,11,0.25)"
            stroke="none"
          />
        </svg>
        <svg
          className="absolute w-9 h-9 pointer-events-none z-30 bottom-5 right-5 -scale-100 onboarding-corner-anim"
          style={{ animationDelay: '3s' }}
          viewBox="0 0 36 36"
          fill="none"
          stroke="rgba(240,185,11,0.18)"
          strokeWidth="1"
          aria-hidden="true"
        >
          <path d="M0 18 L0 0 L18 0" />
          <circle
            cx="0"
            cy="0"
            r="2"
            fill="rgba(240,185,11,0.25)"
            stroke="none"
          />
        </svg>

        {/* Language selector — top right */}
        <div
          style={{
            position: "absolute",
            top: "1rem",
            right: "1rem",
            zIndex: 50,
            display: "flex",
            gap: "0.5rem",
            alignItems: "center",
          }}
        >
          <LanguageDropdown
            uiLanguage={uiLanguage}
            setUiLanguage={setUiLanguage}
            t={t}
            variant="companion"
          />
        </div>

        {/* ── Standard overlaid UI — step nav + content panel ── */}
        <div className="absolute inset-0 z-20 flex justify-between pointer-events-none [&>*]:pointer-events-auto max-md:flex-col">
          <OnboardingStepNav />
          <OnboardingPanel step={onboardingStep}>
            {renderStep()}
          </OnboardingPanel>
        </div>
      </div>
    </div>
  );
}
