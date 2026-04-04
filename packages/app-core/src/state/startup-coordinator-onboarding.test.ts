/**
 * Tests for onboarding completion flow through the StartupCoordinator.
 *
 * Replaces coverage from the deleted onboarding-finish-lock.test.ts.
 * The old tests verified the handoff overlay system which was removed.
 * These tests verify the coordinator-driven flow:
 *   onboarding-required → ONBOARDING_COMPLETE → starting-runtime → ready
 */

import { describe, expect, it } from "vitest";
import {
  INITIAL_STARTUP_STATE,
  startupReducer,
  type StartupState,
} from "./startup-coordinator";

describe("onboarding completion through coordinator", () => {
  it("transitions from onboarding-required to starting-runtime on ONBOARDING_COMPLETE", () => {
    const state: StartupState = {
      phase: "onboarding-required",
      serverReachable: true,
    };
    const next = startupReducer(state, { type: "ONBOARDING_COMPLETE" });
    expect(next.phase).toBe("starting-runtime");
  });

  it("duplicate ONBOARDING_COMPLETE from starting-runtime is ignored", () => {
    const state: StartupState = { phase: "starting-runtime", attempts: 0 };
    const next = startupReducer(state, { type: "ONBOARDING_COMPLETE" });
    // starting-runtime doesn't handle ONBOARDING_COMPLETE — returns same state
    expect(next).toBe(state);
  });

  it("duplicate ONBOARDING_COMPLETE from ready is ignored", () => {
    const state: StartupState = { phase: "ready" };
    const next = startupReducer(state, { type: "ONBOARDING_COMPLETE" });
    expect(next).toBe(state);
  });

  it("RETRY from onboarding-required restarts from restoring-session", () => {
    const state: StartupState = {
      phase: "onboarding-required",
      serverReachable: false,
    };
    const next = startupReducer(state, { type: "RETRY" });
    expect(next.phase).toBe("restoring-session");
  });

  it("full flow: splash → restoring-session → onboarding → starting-runtime → hydrating → ready", () => {
    let state: StartupState = INITIAL_STARTUP_STATE;
    expect(state.phase).toBe("splash");

    state = startupReducer(state, { type: "SPLASH_LOADED" });
    state = startupReducer(state, { type: "SPLASH_CONTINUE" });
    expect(state.phase).toBe("restoring-session");

    state = startupReducer(state, {
      type: "NO_SESSION",
      hadPriorOnboarding: false,
    });
    expect(state.phase).toBe("onboarding-required");

    state = startupReducer(state, { type: "ONBOARDING_COMPLETE" });
    expect(state.phase).toBe("starting-runtime");

    state = startupReducer(state, { type: "AGENT_RUNNING" });
    expect(state.phase).toBe("hydrating");

    state = startupReducer(state, { type: "HYDRATION_COMPLETE" });
    expect(state.phase).toBe("ready");
  });

  it("agent error during post-onboarding startup surfaces correctly", () => {
    let state: StartupState = {
      phase: "onboarding-required",
      serverReachable: true,
    };
    state = startupReducer(state, { type: "ONBOARDING_COMPLETE" });
    expect(state.phase).toBe("starting-runtime");

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

  it("auth required during post-onboarding startup redirects to pairing", () => {
    let state: StartupState = {
      phase: "onboarding-required",
      serverReachable: true,
    };
    state = startupReducer(state, { type: "ONBOARDING_COMPLETE" });
    state = startupReducer(state, { type: "BACKEND_AUTH_REQUIRED" });
    expect(state.phase).toBe("pairing-required");
  });

  it("coordinator reaches hydrating phase which creates conversations", () => {
    let state: StartupState = {
      phase: "onboarding-required",
      serverReachable: true,
    };
    state = startupReducer(state, { type: "ONBOARDING_COMPLETE" });
    state = startupReducer(state, { type: "AGENT_RUNNING" });
    expect(state.phase).toBe("hydrating");
    // hydrating phase calls hydrateInitialConversationState which creates
    // a conversation if none exist — verified by the coordinator's effect
  });

  it("completed onboarding with existing install goes to starting-runtime not onboarding", () => {
    let state: StartupState = { phase: "restoring-session" };
    state = startupReducer(state, {
      type: "SESSION_RESTORED",
      target: "embedded-local",
    });
    // resolving-target auto-advances
    state = startupReducer(state, { type: "RETRY" });
    state = startupReducer(state, {
      type: "BACKEND_REACHED",
      onboardingComplete: true,
    });
    expect(state.phase).toBe("starting-runtime");
  });
});
