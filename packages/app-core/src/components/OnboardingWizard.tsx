import {
  LANGUAGE_DROPDOWN_TRIGGER_CLASSNAME,
  LanguageDropdown,
} from "@miladyai/app-core/components";
import {
  dispatchWindowEvent,
  ONBOARDING_VOICE_PREVIEW_AWAIT_TELEPORT_EVENT,
  VRM_TELEPORT_COMPLETE_EVENT,
} from "@miladyai/app-core/events";
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
import { CloudLoginStep } from "./onboarding/CloudLoginStep";
import { ConnectionStep } from "./onboarding/ConnectionStep";
import { IdentityStep } from "./onboarding/IdentityStep";
import { OnboardingPanel } from "./onboarding/OnboardingPanel";
import { OnboardingStepNav } from "./onboarding/OnboardingStepNav";
import { PermissionsStep } from "./onboarding/PermissionsStep";
import { VoiceProviderStep } from "./onboarding/VoiceProviderStep";

const FORCE_VRM =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("test_force_vrm") === "1";

const ONBOARDING_UI_REVEAL_FALLBACK_MS = 1200;

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
  } = useApp();
  const revealWelcomeUiImmediately =
    disableVrm ||
    onboardingStep === "cloud_login" ||
    onboardingUiRevealNonce > 0;
  // After Reset Agent from chat/companion, nonce bumps: show cloud ui immediately instead
  // of waiting for VrmStage reveal (often missing when remounting after an active session).
  const [revealStarted, setRevealStarted] = useState(
    () => revealWelcomeUiImmediately,
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

  useEffect(() => {
    const docEl = document.documentElement;
    const body = document.body;
    const prevDocOverflow = docEl.style.overflow;
    const prevDocOverscroll = docEl.style.overscrollBehavior;
    const prevBodyOverflow = body.style.overflow;
    const prevBodyOverscroll = body.style.overscrollBehavior;

    // Lock page-level scroll while onboarding is active; panel handles its own scroll.
    docEl.style.overflow = "hidden";
    docEl.style.overscrollBehavior = "none";
    body.style.overflow = "hidden";
    body.style.overscrollBehavior = "none";

    return () => {
      docEl.style.overflow = prevDocOverflow;
      docEl.style.overscrollBehavior = prevDocOverscroll;
      body.style.overflow = prevBodyOverflow;
      body.style.overscrollBehavior = prevBodyOverscroll;
    };
  }, []);

  // Overlay stays opacity 0 until VrmStage calls onRevealStart. After Reset Milady (or
  // any remount), the engine sometimes never emits reveal — user sees only the avatar.
  useEffect(() => {
    if (revealWelcomeUiImmediately) {
      setRevealStarted(true);
      return;
    }
    const id = window.setTimeout(() => {
      setRevealStarted((prev) => (prev ? prev : true));
    }, ONBOARDING_UI_REVEAL_FALLBACK_MS);
    return () => window.clearTimeout(id);
  }, [revealWelcomeUiImmediately]);

  // No VrmStage: engine never emits teleport-complete; bridge roster preview to the same event.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!disableVrm || onboardingStep !== "identity") return;
    const bridge = () => {
      dispatchWindowEvent(VRM_TELEPORT_COMPLETE_EVENT);
    };
    window.addEventListener(
      ONBOARDING_VOICE_PREVIEW_AWAIT_TELEPORT_EVENT,
      bridge,
    );
    return () => {
      window.removeEventListener(
        ONBOARDING_VOICE_PREVIEW_AWAIT_TELEPORT_EVENT,
        bridge,
      );
    };
  }, [disableVrm, onboardingStep]);

  function renderStep() {
    switch (onboardingStep) {
      case "cloud_login":
        return <CloudLoginStep />;
      case "hosting":
      case "providers":
        return <ConnectionStep />;
      case "voice":
        return <VoiceProviderStep />;
      case "permissions":
        return <PermissionsStep />;
      case "identity":
        return <IdentityStep gateVoicePreviewOnTeleport={!disableVrm} />;
      case "launch":
        return <ActivateStep />;
      default:
        return null;
    }
  }

  return (
    <div className="onboarding-screen">
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
          transition: "opacity 0.7s ease-in-out",
          zIndex: 40,
        }}
      >
        {/* Corner decorations removed to avoid gold tint artifacts on the scene. */}

        {/* Language selector — top right */}
        <div
          style={{
            position: "absolute",
            top: "calc(var(--safe-area-top, 0px) + 1rem)",
            right: "calc(var(--safe-area-right, 0px) + 1rem)",
            zIndex: 50,
            display: "flex",
            gap: "0.5rem",
            alignItems: "center",
            pointerEvents: "auto",
          }}
        >
          <LanguageDropdown
            uiLanguage={uiLanguage}
            setUiLanguage={setUiLanguage}
            t={t}
            variant="companion"
            triggerClassName={LANGUAGE_DROPDOWN_TRIGGER_CLASSNAME}
          />
        </div>

        {/* ── Standard overlaid UI — step nav + content panel ── */}
        {onboardingStep === "identity" ? (
          <div className="absolute inset-0 z-20 flex flex-col justify-end pointer-events-none [&>*]:pointer-events-auto">
            <IdentityStep />
          </div>
        ) : (
          <div className="absolute inset-0 z-20 flex flex-col justify-end pointer-events-none [&>*]:pointer-events-auto">
            <OnboardingStepNav />
            <OnboardingPanel step={onboardingStep}>
              {renderStep()}
            </OnboardingPanel>
          </div>
        )}
      </div>
    </div>
  );
}
