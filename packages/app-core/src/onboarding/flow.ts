/**
 * Onboarding wizard: pure flow resolution (no React, no API client).
 *
 * WHY this file exists:
 * - Step order used to be copy-pasted in AppContext (next + back) and again in the
 *   sidebar, which caused drift and subtle back/jump bugs.
 * - Keeping resolution pure here makes the graph testable without mounting React,
 *   and forces side effects (cloud login, finish, provider fill) to stay in
 *   AppContext where they already close over the right state.
 *
 * WHY step metadata still lives in state/types.ts:
 * - CLOUD_ONBOARDING_STEPS / CUSTOM_ONBOARDING_STEPS carry i18n keys and define
 *   canonical order. Importing them here avoids a circular dependency (types
 *   importing flow that imports types for values).
 *
 * See: docs/guides/onboarding-ui-flow.md
 * Tests: tests/flow.test.ts
 */

import type {
  FlaminaGuideTopic,
  OnboardingStep,
  OnboardingStepMeta,
} from "../state/types";
import {
  CLOUD_ONBOARDING_STEPS,
  CUSTOM_ONBOARDING_STEPS,
} from "../state/types";

/**
 * Custom track = the local setup line (connect → rpc → senses → activate).
 * WHY not include `welcome`: welcome uses the cloud *linear order* for resolvers
 * until the user lands on `connection` (e.g. Get Started). That matches legacy
 * behavior and avoids a separate persisted "track" field.
 */
export function isOnboardingCustomFlowStep(step: OnboardingStep): boolean {
  return CUSTOM_ONBOARDING_STEPS.some((s) => s.id === step);
}

/** Linear step ids for whichever track the current step belongs to. */
export function getStepOrderForCurrentStep(
  step: OnboardingStep,
): OnboardingStep[] {
  return isOnboardingCustomFlowStep(step)
    ? CUSTOM_ONBOARDING_STEPS.map((s) => s.id)
    : CLOUD_ONBOARDING_STEPS.map((s) => s.id);
}

/**
 * Next step in the active track, or null at the end / if the step is not in
 * the order (e.g. legacy `identity`).
 * WHY null instead of throwing: callers treat "no next" as a no-op after
 * terminal advance paths (finish) have already run.
 */
export function resolveOnboardingNextStep(
  current: OnboardingStep,
): OnboardingStep | null {
  const order = getStepOrderForCurrentStep(current);
  const i = order.indexOf(current);
  if (i < 0 || i >= order.length - 1) return null;
  return order[i + 1] ?? null;
}

/**
 * Previous step in the active track. From the first custom step (`connection`),
 * the previous screen is `welcome` even though `welcome` is not listed in the
 * custom-flow sidebar.
 * WHY: product wants back from connect to land on welcome; the sidebar only
 * lists the four setup steps so users are not tempted to "jump" to welcome
 * from the middle of the flow without using Back from connection.
 */
export function resolveOnboardingPreviousStep(
  current: OnboardingStep,
): OnboardingStep | null {
  const order = getStepOrderForCurrentStep(current);
  const i = order.indexOf(current);
  if (i > 0) return order[i - 1] ?? null;
  if (i === 0 && isOnboardingCustomFlowStep(current)) {
    return "welcome";
  }
  return null;
}

/**
 * Sidebar jump is allowed only to a strictly earlier step in the *same* track
 * order. WHY: forward jumps would skip handleOnboardingFinish, cloud login, and
 * in-step validation; repeated Back and sidebar back must stay equivalent.
 */
export function canRevertOnboardingTo(params: {
  current: OnboardingStep;
  target: OnboardingStep;
}): boolean {
  const order = getStepOrderForCurrentStep(params.current);
  const curIdx = order.indexOf(params.current);
  const tgtIdx = order.indexOf(params.target);
  return tgtIdx >= 0 && curIdx >= 0 && tgtIdx < curIdx;
}

/**
 * Rows shown in OnboardingStepNav for the active track.
 * WHY cloudOnly filters welcome: some branded builds skip the welcome row in
 * the rail while the machine may still be on `welcome` briefly—same as legacy.
 */
export function getOnboardingNavMetas(
  currentStep: OnboardingStep,
  cloudOnly: boolean,
): OnboardingStepMeta[] {
  if (isOnboardingCustomFlowStep(currentStep)) {
    return [...CUSTOM_ONBOARDING_STEPS];
  }
  if (cloudOnly) {
    return CLOUD_ONBOARDING_STEPS.filter((s) => s.id !== "welcome");
  }
  return [...CLOUD_ONBOARDING_STEPS];
}

/** Flamina companion guide topic for advanced onboarding mode, or null. */
export function getFlaminaTopicForOnboardingStep(
  step: OnboardingStep,
): FlaminaGuideTopic | null {
  switch (step) {
    case "connection":
      return "provider";
    case "rpc":
      return "rpc";
    case "senses":
      return "permissions";
    default:
      return null;
  }
}
