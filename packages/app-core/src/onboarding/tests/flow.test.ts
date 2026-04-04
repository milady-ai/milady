/** Unit tests for onboarding `flow.ts` — 2-step flow. */
import { describe, expect, it } from "vitest";
import {
  canRevertOnboardingTo,
  getFlaminaTopicForOnboardingStep,
  getOnboardingNavMetas,
  getStepOrder,
  resolveOnboardingNextStep,
  resolveOnboardingPreviousStep,
  shouldSkipConnectionStepsForCloudProvisionedContainer,
  shouldUseCloudOnboardingFastTrack,
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

  describe("shouldSkipConnectionStepsForCloudProvisionedContainer", () => {
    it("finishes immediately after identity for cloud-provisioned containers", () => {
      expect(
        shouldSkipConnectionStepsForCloudProvisionedContainer({
          currentStep: "identity",
          cloudProvisionedContainer: true,
        }),
      ).toBe(true);
    });

    it("keeps the normal wizard flow for non-cloud or later steps", () => {
      expect(
        shouldSkipConnectionStepsForCloudProvisionedContainer({
          currentStep: "identity",
          cloudProvisionedContainer: false,
        }),
      ).toBe(false);
      expect(
        shouldSkipConnectionStepsForCloudProvisionedContainer({
          currentStep: "hosting",
          cloudProvisionedContainer: true,
        }),
      ).toBe(false);
    });
  });

  describe("shouldUseCloudOnboardingFastTrack", () => {
    it("always fast-tracks cloud-provisioned containers", () => {
      expect(
        shouldUseCloudOnboardingFastTrack({
          cloudProvisionedContainer: true,
          elizaCloudConnected: false,
          onboardingRunMode: "",
          onboardingProvider: "",
        }),
      ).toBe(true);
    });

    it("preserves the existing Eliza Cloud fast-track for connected cloud setups", () => {
      expect(
        shouldUseCloudOnboardingFastTrack({
          cloudProvisionedContainer: false,
          elizaCloudConnected: true,
          onboardingRunMode: "cloud",
          onboardingProvider: "elizacloud",
        }),
      ).toBe(true);
      expect(
        shouldUseCloudOnboardingFastTrack({
          cloudProvisionedContainer: false,
          elizaCloudConnected: true,
          onboardingRunMode: "local",
          onboardingProvider: "anthropic",
        }),
      ).toBe(false);
    });
  });

  describe("getFlaminaTopicForOnboardingStep", () => {
    it("maps advanced guide topics", () => {
      expect(getFlaminaTopicForOnboardingStep("providers")).toBe("provider");
      expect(getFlaminaTopicForOnboardingStep("identity")).toBe(null);
    });
  });
});
