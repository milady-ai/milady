/** Unit tests for onboarding `flow.ts` — 2-step flow. */
import { describe, expect, it } from "vitest";
import {
  canRevertOnboardingTo,
  getFlaminaTopicForOnboardingStep,
  getOnboardingNavMetas,
  getStepOrder,
  resolveOnboardingNextStep,
  resolveOnboardingPreviousStep,
} from "../flow";

describe("onboarding flow", () => {
  describe("getStepOrder", () => {
    it("returns 2-step order (server select on splash, permissions lazy)", () => {
      expect(getStepOrder()).toEqual(["identity", "providers"]);
    });
  });

  describe("resolveOnboardingNextStep", () => {
    it("advances through all steps", () => {
      expect(resolveOnboardingNextStep("identity")).toBe("providers");
      expect(resolveOnboardingNextStep("providers")).toBe(null);
    });
  });

  describe("resolveOnboardingPreviousStep", () => {
    it("steps back through all steps", () => {
      expect(resolveOnboardingPreviousStep("identity")).toBe(null);
      expect(resolveOnboardingPreviousStep("providers")).toBe("identity");
    });
  });

  describe("canRevertOnboardingTo", () => {
    it("allows backward jump", () => {
      expect(
        canRevertOnboardingTo({ current: "providers", target: "identity" }),
      ).toBe(true);
    });
    it("disallows same-step jump", () => {
      expect(
        canRevertOnboardingTo({ current: "providers", target: "providers" }),
      ).toBe(false);
    });
    it("disallows forward jump", () => {
      expect(
        canRevertOnboardingTo({ current: "identity", target: "providers" }),
      ).toBe(false);
    });
  });

  describe("getOnboardingNavMetas", () => {
    it("returns all 2 steps", () => {
      const metas = getOnboardingNavMetas("providers", false);
      expect(metas.map((m) => m.id)).toEqual(["identity", "providers"]);
    });
  });

  describe("getFlaminaTopicForOnboardingStep", () => {
    it("maps advanced guide topics", () => {
      expect(getFlaminaTopicForOnboardingStep("providers")).toBe("provider");
      expect(getFlaminaTopicForOnboardingStep("identity")).toBe(null);
    });
  });
});
