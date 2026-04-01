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
 * Consolidated 6-step flow: identity → hosting → providers → voice → permissions → launch
 * (cloud_login is now handled by the startup splash page, not the onboarding wizard)
 *
 * See: docs/guides/onboarding-ui-flow.md
 * Tests: tests/flow.test.ts
 */

import type {
  FlaminaGuideTopic,
  OnboardingStep,
  OnboardingStepMeta,
} from "../state/types";
import { ONBOARDING_STEPS } from "../state/types";

/** Linear step ids for the unified onboarding flow. */
export function getStepOrder(): OnboardingStep[] {
  return ONBOARDING_STEPS.map((s) => s.id);
}

/**
 * Next step in the flow, or null at the end.
 * WHY null instead of throwing: callers treat "no next" as a no-op after
 * terminal advance paths (finish) have already run.
 */
export function resolveOnboardingNextStep(
  current: OnboardingStep,
): OnboardingStep | null {
  const order = getStepOrder();
  const i = order.indexOf(current);
  if (i < 0 || i >= order.length - 1) return null;
  return order[i + 1] ?? null;
}

/**
 * Previous step in the flow.
 * Returns null from the first step (identity).
 */
export function resolveOnboardingPreviousStep(
  current: OnboardingStep,
): OnboardingStep | null {
  const order = getStepOrder();
  const i = order.indexOf(current);
  if (i > 0) return order[i - 1] ?? null;
  return null;
}

/**
 * Sidebar jump is allowed only to a strictly earlier step.
 * WHY: forward jumps would skip handleOnboardingFinish, cloud login, and
 * in-step validation; repeated Back and sidebar back must stay equivalent.
 */
export function canRevertOnboardingTo(params: {
  current: OnboardingStep;
  target: OnboardingStep;
}): boolean {
  const order = getStepOrder();
  const curIdx = order.indexOf(params.current);
  const tgtIdx = order.indexOf(params.target);
  return tgtIdx >= 0 && curIdx >= 0 && tgtIdx < curIdx;
}

/**
 * Rows shown in OnboardingStepNav.
 */
export function getOnboardingNavMetas(
  _currentStep: OnboardingStep,
  _cloudOnly: boolean,
): OnboardingStepMeta[] {
  return [...ONBOARDING_STEPS];
}

/** Flamina companion guide topic for advanced onboarding mode, or null. */
export function getFlaminaTopicForOnboardingStep(
  step: OnboardingStep,
): FlaminaGuideTopic | null {
  switch (step) {
    case "providers":
      return "provider";
    case "voice":
      return "voice";
    case "permissions":
      return "permissions";
    default:
      return null;
  }
}
