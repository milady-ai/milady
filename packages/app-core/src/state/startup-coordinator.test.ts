import { describe, expect, it } from "vitest";
import {
  INITIAL_STARTUP_STATE,
  connectionModeToTarget,
  createDesktopPolicy,
  createMobilePolicy,
  createWebPolicy,
  isStartupLoading,
  isStartupTerminal,
  startupReducer,
  toLegacyStartupPhase,
  type StartupEvent,
  type StartupState,
} from "./startup-coordinator";

function dispatch(
  state: StartupState,
  ...events: StartupEvent[]
): StartupState {
  return events.reduce((s, e) => startupReducer(s, e), state);
}

describe("StartupCoordinator", () => {
  describe("splash phase", () => {
    it("starts at splash with loaded=false", () => {
      expect(INITIAL_STARTUP_STATE).toEqual({ phase: "splash", loaded: false });
    });

    it("SPLASH_LOADED sets loaded=true", () => {
      const state = startupReducer(INITIAL_STARTUP_STATE, {
        type: "SPLASH_LOADED",
      });
      expect(state).toEqual({ phase: "splash", loaded: true });
    });

    it("SPLASH_CONTINUE transitions to restoring-session", () => {
      const loaded: StartupState = { phase: "splash", loaded: true };
      const next = startupReducer(loaded, { type: "SPLASH_CONTINUE" });
      expect(next.phase).toBe("restoring-session");
    });

    it("ignores unrelated events while on splash", () => {
      const state = INITIAL_STARTUP_STATE;
      expect(startupReducer(state, { type: "AGENT_RUNNING" })).toBe(state);
      expect(startupReducer(state, { type: "BACKEND_TIMEOUT" })).toBe(state);
    });

    it("RETRY from splash resets to splash", () => {
      const loaded: StartupState = { phase: "splash", loaded: true };
      const next = startupReducer(loaded, { type: "RETRY" });
      expect(next).toEqual({ phase: "splash", loaded: false });
    });
  });

  describe("happy path — local runtime", () => {
    it("boots → restoring → resolving → polling → starting → hydrating → ready", () => {
      let state: StartupState = { phase: "restoring-session" };

      state = startupReducer(state, {
        type: "SESSION_RESTORED",
        target: "embedded-local",
      });
      expect(state.phase).toBe("resolving-target");

      // resolving-target is a transient state — the reducer auto-advances
      // to polling-backend on ANY event (the event is ignored). In the real
      // app, the useEffect dispatches a kick event; here we verify the
      // auto-advance directly by sending a neutral event.
      state = startupReducer(state, { type: "RETRY" });
      expect(state).toEqual({
        phase: "polling-backend",
        target: "embedded-local",
        attempts: 0,
      });

      state = startupReducer(state, {
        type: "BACKEND_REACHED",
        onboardingComplete: true,
      });
      expect(state.phase).toBe("starting-runtime");

      state = startupReducer(state, { type: "AGENT_RUNNING" });
      expect(state.phase).toBe("hydrating");

      state = startupReducer(state, { type: "HYDRATION_COMPLETE" });
      expect(state.phase).toBe("ready");
    });
  });

  describe("happy path — cloud managed", () => {
    it("restores cloud session and reaches ready", () => {
      let state: StartupState = { phase: "restoring-session" };

      state = startupReducer(state, {
        type: "SESSION_RESTORED",
        target: "cloud-managed",
      });
      expect(state).toEqual({
        phase: "resolving-target",
        target: "cloud-managed",
      });

      // resolving-target auto-advances on any event
      state = startupReducer(state, { type: "RETRY" });
      expect(state.phase).toBe("polling-backend");

      state = startupReducer(state, {
        type: "BACKEND_REACHED",
        onboardingComplete: true,
      });
      expect(state.phase).toBe("starting-runtime");
    });
  });

  describe("first-run — no session, no prior onboarding", () => {
    it("goes straight to onboarding-required (offline)", () => {
      let state: StartupState = { phase: "restoring-session" };
      state = startupReducer(state, {
        type: "NO_SESSION",
        hadPriorOnboarding: false,
      });
      expect(state).toEqual({
        phase: "onboarding-required",
        serverReachable: false,
      });
    });
  });

  describe("stale session — prior onboarding but backend gone", () => {
    it("goes to error with backend-unreachable", () => {
      let state: StartupState = { phase: "restoring-session" };
      state = startupReducer(state, {
        type: "NO_SESSION",
        hadPriorOnboarding: true,
      });
      expect(state.phase).toBe("error");
      if (state.phase === "error") {
        expect(state.reason).toBe("backend-unreachable");
      }
    });
  });

  describe("auth required — pairing flow", () => {
    it("polling-backend → pairing-required → retry → booting", () => {
      let state: StartupState = {
        phase: "polling-backend",
        target: "embedded-local",
        attempts: 3,
      };

      state = startupReducer(state, { type: "BACKEND_AUTH_REQUIRED" });
      expect(state.phase).toBe("pairing-required");

      state = startupReducer(state, { type: "PAIRING_SUCCESS" });
      expect(state.phase).toBe("restoring-session");
    });
  });

  describe("onboarding — server reachable", () => {
    it("backend reached + incomplete → onboarding-required (server) → complete → starting-runtime", () => {
      let state: StartupState = {
        phase: "polling-backend",
        target: "embedded-local",
        attempts: 0,
      };

      state = startupReducer(state, {
        type: "BACKEND_REACHED",
        onboardingComplete: false,
      });
      expect(state).toEqual({
        phase: "onboarding-required",
        serverReachable: true,
      });

      state = startupReducer(state, { type: "ONBOARDING_COMPLETE" });
      expect(state.phase).toBe("starting-runtime");
    });

    it("RETRY from onboarding-required restarts from booting", () => {
      const state: StartupState = {
        phase: "onboarding-required",
        serverReachable: true,
      };
      const next = startupReducer(state, { type: "RETRY" });
      expect(next.phase).toBe("restoring-session");
    });
  });

  describe("timeouts", () => {
    it("backend timeout → error", () => {
      let state: StartupState = {
        phase: "polling-backend",
        target: "embedded-local",
        attempts: 10,
      };
      state = startupReducer(state, { type: "BACKEND_TIMEOUT" });
      expect(state.phase).toBe("error");
      if (state.phase === "error") {
        expect(state.reason).toBe("backend-timeout");
        expect(state.timedOut).toBe(true);
      }
    });

    it("agent timeout → error", () => {
      let state: StartupState = { phase: "starting-runtime", attempts: 50 };
      state = startupReducer(state, { type: "AGENT_TIMEOUT" });
      expect(state.phase).toBe("error");
      if (state.phase === "error") {
        expect(state.reason).toBe("agent-timeout");
        expect(state.timedOut).toBe(true);
      }
    });
  });

  describe("error recovery", () => {
    it("error + RETRY → booting", () => {
      let state: StartupState = {
        phase: "error",
        reason: "backend-timeout",
        message: "timed out",
        timedOut: true,
      };
      state = startupReducer(state, { type: "RETRY" });
      expect(state.phase).toBe("restoring-session");
    });
  });

  describe("agent error during runtime start", () => {
    it("AGENT_ERROR → error with message", () => {
      let state: StartupState = { phase: "starting-runtime", attempts: 5 };
      state = startupReducer(state, {
        type: "AGENT_ERROR",
        message: "Plugin initialization failed",
      });
      expect(state.phase).toBe("error");
      if (state.phase === "error") {
        expect(state.reason).toBe("agent-error");
        expect(state.message).toBe("Plugin initialization failed");
      }
    });
  });

  describe("auth required during agent polling", () => {
    it("starting-runtime + BACKEND_AUTH_REQUIRED → pairing-required", () => {
      let state: StartupState = { phase: "starting-runtime", attempts: 3 };
      state = startupReducer(state, { type: "BACKEND_AUTH_REQUIRED" });
      expect(state.phase).toBe("pairing-required");
    });
  });

  describe("helpers", () => {
    it("connectionModeToTarget maps correctly", () => {
      expect(connectionModeToTarget("cloud")).toBe("cloud-managed");
      expect(connectionModeToTarget("remote")).toBe("remote-backend");
      expect(connectionModeToTarget("local")).toBe("embedded-local");
      expect(connectionModeToTarget(undefined)).toBe("embedded-local");
    });

    it("isStartupLoading is true for all intermediate phases", () => {
      expect(isStartupLoading({ phase: "restoring-session" })).toBe(true);
      expect(isStartupLoading({ phase: "restoring-session" })).toBe(true);
      expect(
        isStartupLoading({
          phase: "polling-backend",
          target: "embedded-local",
          attempts: 0,
        }),
      ).toBe(true);
      expect(isStartupLoading({ phase: "starting-runtime", attempts: 0 })).toBe(
        true,
      );
      expect(isStartupLoading({ phase: "hydrating" })).toBe(true);
      expect(isStartupLoading({ phase: "ready" })).toBe(false);
      expect(isStartupLoading({ phase: "pairing-required" })).toBe(false);
      expect(
        isStartupLoading({
          phase: "onboarding-required",
          serverReachable: false,
        }),
      ).toBe(false);
    });

    it("isStartupTerminal is true only for ready and error", () => {
      expect(isStartupTerminal({ phase: "ready" })).toBe(true);
      expect(
        isStartupTerminal({
          phase: "error",
          reason: "unknown",
          message: "",
          timedOut: false,
        }),
      ).toBe(true);
      expect(isStartupTerminal({ phase: "restoring-session" })).toBe(false);
    });

    it("toLegacyStartupPhase maps to the three legacy phases", () => {
      expect(toLegacyStartupPhase({ phase: "restoring-session" })).toBe(
        "starting-backend",
      );
      expect(
        toLegacyStartupPhase({
          phase: "polling-backend",
          target: "embedded-local",
          attempts: 0,
        }),
      ).toBe("starting-backend");
      expect(
        toLegacyStartupPhase({ phase: "starting-runtime", attempts: 0 }),
      ).toBe("initializing-agent");
      expect(toLegacyStartupPhase({ phase: "ready" })).toBe("ready");
      expect(toLegacyStartupPhase({ phase: "pairing-required" })).toBe("ready");
      expect(
        toLegacyStartupPhase({
          phase: "onboarding-required",
          serverReachable: false,
        }),
      ).toBe("ready");
    });
  });

  describe("platform policies", () => {
    it("desktop policy supports local runtime with long timeouts", () => {
      const policy = createDesktopPolicy();
      expect(policy.supportsLocalRuntime).toBe(true);
      expect(policy.backendTimeoutMs).toBe(180_000);
      expect(policy.probeForExistingInstall).toBe(true);
      expect(policy.defaultTarget).toBe("embedded-local");
    });

    it("web policy has short timeouts and no local runtime", () => {
      const policy = createWebPolicy();
      expect(policy.supportsLocalRuntime).toBe(false);
      expect(policy.backendTimeoutMs).toBe(30_000);
      expect(policy.probeForExistingInstall).toBe(false);
      expect(policy.defaultTarget).toBeNull();
    });

    it("mobile policy defaults to cloud-managed", () => {
      const policy = createMobilePolicy();
      expect(policy.supportsLocalRuntime).toBe(false);
      expect(policy.defaultTarget).toBe("cloud-managed");
    });
  });

  describe("ready is terminal for startup events", () => {
    it("ignores all events once ready", () => {
      const ready: StartupState = { phase: "ready" };
      expect(startupReducer(ready, { type: "BACKEND_TIMEOUT" })).toBe(ready);
      expect(startupReducer(ready, { type: "AGENT_ERROR", message: "x" })).toBe(
        ready,
      );
      expect(startupReducer(ready, { type: "RETRY" })).toBe(ready);
    });

    it("RESET from ready returns to splash for re-onboarding", () => {
      const ready: StartupState = { phase: "ready" };
      const next = startupReducer(ready, { type: "RESET" });
      expect(next).toEqual(INITIAL_STARTUP_STATE);
    });
  });
});
