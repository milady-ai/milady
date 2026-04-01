/**
 * StartupShell — the front door to the app.
 *
 * Shows a branded splash with retro progress bar during ALL startup phases.
 * New users see "Press Start" first. Returning users see the progress bar
 * immediately. The splash stays visible until the app is FULLY loaded
 * (including a brief settle delay after coordinator reaches ready).
 *
 * Non-loading phases (error, pairing, onboarding) delegate to their views.
 */

import { useApp } from "../state";
import type { StartupErrorState } from "../state/types";
import { OnboardingWizard } from "./OnboardingWizard";
import { PairingView } from "./PairingView";
import { StartupFailureView } from "./StartupFailureView";

const FONT = "'Courier New', 'Courier', 'Monaco', monospace";

const PHASE_PROGRESS: Record<string, number> = {
  splash: 0,
  "restoring-session": 10,
  "resolving-target": 20,
  "polling-backend": 40,
  "starting-runtime": 60,
  hydrating: 85,
  ready: 100,
};

function phaseToStatusKey(phase: string): string {
  switch (phase) {
    case "restoring-session":
      return "startupshell.Starting";
    case "resolving-target":
    case "polling-backend":
      return "startupshell.ConnectingBackend";
    case "starting-runtime":
      return "startupshell.InitializingAgent";
    case "hydrating":
    case "ready":
      return "startupshell.Loading";
    default:
      return "startupshell.Starting";
  }
}

export function StartupShell() {
  const { startupCoordinator, startupError, retryStartup, t } = useApp();
  const phase = startupCoordinator.phase;

  // Error — delegate
  if (phase === "error") {
    const coordState = startupCoordinator.state;
    const errState = coordState.phase === "error" ? coordState : null;
    const errorState: StartupErrorState = startupError ?? {
      reason: errState?.reason ?? "unknown",
      message:
        errState?.message ?? "An unexpected error occurred during startup.",
      phase: "starting-backend" as const,
    };
    return <StartupFailureView error={errorState} onRetry={retryStartup} />;
  }

  // Pairing — delegate
  if (phase === "pairing-required") {
    return <PairingView />;
  }

  // Onboarding — delegate
  if (phase === "onboarding-required") {
    return <OnboardingWizard />;
  }

  // Ready — let the app through
  if (phase === "ready") {
    return null;
  }

  // Everything else: splash with progress bar
  const isSplash = phase === "splash";
  const splashLoaded = isSplash
    ? (startupCoordinator.state as { loaded?: boolean }).loaded
    : false;
  const progress = PHASE_PROGRESS[phase] ?? 50;

  return (
    <div className="flex items-center justify-center h-full w-full bg-[#ffe600] text-black overflow-hidden">
      <img
        src="/splash-bg.png"
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full object-contain object-right-bottom opacity-40"
      />
      <div
        className="relative z-10 flex flex-col items-center gap-5 px-6 text-center w-full"
        style={{ maxWidth: 360 }}
      >
        <h1 style={{ fontFamily: FONT }} className="text-2xl text-black">
          MILADY
        </h1>
        <p
          style={{ fontFamily: FONT }}
          className="text-[7px] text-black/40 uppercase leading-relaxed"
        >
          {t("startupshell.SplashTagline", {
            defaultValue: "Your local-first AI assistant",
          })}
        </p>

        {/* Retro segmented progress bar */}
        {!isSplash && (
          <div className="w-full mt-2">
            <div className="h-5 w-full border-2 border-black/70 bg-black/5 overflow-hidden">
              <div
                className="h-full bg-black/70 transition-all duration-700 ease-out"
                style={{ width: `${progress}%` }}
              >
                <div
                  className="h-full w-full"
                  style={{
                    backgroundImage:
                      "repeating-linear-gradient(90deg, transparent, transparent 6px, rgba(255,230,0,0.5) 6px, rgba(255,230,0,0.5) 8px)",
                  }}
                />
              </div>
            </div>
            <p
              style={{ fontFamily: FONT }}
              className="mt-2 text-[8px] text-black/50 uppercase animate-pulse"
            >
              {t(phaseToStatusKey(phase))}
            </p>
          </div>
        )}

        {/* Press Start button — only on splash phase */}
        {isSplash && (
          <button
            type="button"
            disabled={!splashLoaded}
            onClick={() =>
              startupCoordinator.dispatch({ type: "SPLASH_CONTINUE" })
            }
            style={{ fontFamily: FONT }}
            className="mt-3 border-2 border-black bg-black px-5 py-2.5 text-[9px] uppercase text-[#ffe600] hover:bg-black/80 disabled:opacity-30 disabled:cursor-wait transition-all"
          >
            {splashLoaded
              ? t("startupshell.GetStarted", { defaultValue: "Press Start" })
              : t("startupshell.Loading", { defaultValue: "Loading..." })}
          </button>
        )}
      </div>
    </div>
  );
}
