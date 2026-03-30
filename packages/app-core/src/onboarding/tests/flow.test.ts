/** Unit tests for onboarding `flow.ts` — unified 6-step flow. */
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
    it("returns unified 6-step order", () => {
      expect(getStepOrder()).toEqual([
        "cloud_login",
        "identity",
        "hosting",
        "providers",
        "voice",
        "permissions",
        "launch",
      ]);
    });
  });

  describe("resolveOnboardingNextStep", () => {
    it("advances through all steps", () => {
      expect(resolveOnboardingNextStep("cloud_login")).toBe("identity");
      expect(resolveOnboardingNextStep("identity")).toBe("hosting");
      expect(resolveOnboardingNextStep("hosting")).toBe("providers");
      expect(resolveOnboardingNextStep("providers")).toBe("voice");
      expect(resolveOnboardingNextStep("voice")).toBe("permissions");
      expect(resolveOnboardingNextStep("permissions")).toBe("launch");
      expect(resolveOnboardingNextStep("launch")).toBe(null);
    });
  });

  describe("resolveOnboardingPreviousStep", () => {
    it("steps back through all steps", () => {
      expect(resolveOnboardingPreviousStep("cloud_login")).toBe(null);
      expect(resolveOnboardingPreviousStep("identity")).toBe("cloud_login");
      expect(resolveOnboardingPreviousStep("hosting")).toBe("identity");
      expect(resolveOnboardingPreviousStep("providers")).toBe("hosting");
      expect(resolveOnboardingPreviousStep("voice")).toBe("providers");
      expect(resolveOnboardingPreviousStep("permissions")).toBe("voice");
      expect(resolveOnboardingPreviousStep("launch")).toBe("permissions");
    });
  });

  describe("canRevertOnboardingTo", () => {
    it("allows backward jump", () => {
      expect(
        canRevertOnboardingTo({ current: "providers", target: "hosting" }),
      ).toBe(true);
      expect(
        canRevertOnboardingTo({ current: "launch", target: "cloud_login" }),
      ).toBe(true);
    });
    it("disallows same-step jump", () => {
      expect(
        canRevertOnboardingTo({ current: "providers", target: "providers" }),
      ).toBe(false);
    });
    it("disallows forward jump", () => {
      expect(
        canRevertOnboardingTo({ current: "cloud_login", target: "hosting" }),
      ).toBe(false);
    });
  });

  describe("getOnboardingNavMetas", () => {
    it("returns all 6 steps regardless of current step", () => {
      const metas = getOnboardingNavMetas("providers", false);
      expect(metas.map((m) => m.id)).toEqual([
        "cloud_login",
        "identity",
        "hosting",
        "providers",
        "voice",
        "permissions",
        "launch",
      ]);
    });
    it("returns same steps when cloudOnly", () => {
      const metas = getOnboardingNavMetas("cloud_login", true);
      expect(metas.map((m) => m.id)).toEqual([
        "cloud_login",
        "identity",
        "hosting",
        "providers",
        "voice",
        "permissions",
        "launch",
      ]);
    });
  });

  describe("getFlaminaTopicForOnboardingStep", () => {
    it("maps advanced guide topics", () => {
      expect(getFlaminaTopicForOnboardingStep("providers")).toBe("provider");
      expect(getFlaminaTopicForOnboardingStep("permissions")).toBe(
        "permissions",
      );
      expect(getFlaminaTopicForOnboardingStep("cloud_login")).toBe(null);
      expect(getFlaminaTopicForOnboardingStep("hosting")).toBe(null);
      expect(getFlaminaTopicForOnboardingStep("identity")).toBe(null);
      expect(getFlaminaTopicForOnboardingStep("launch")).toBe(null);
    });
  });
});
