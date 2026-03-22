/** Unit tests for onboarding `flow.ts` — parity with legacy step order and edges. */
import { describe, expect, it } from "vitest";
import {
  canRevertOnboardingTo,
  getFlaminaTopicForOnboardingStep,
  getOnboardingNavMetas,
  getStepOrderForCurrentStep,
  isOnboardingCustomFlowStep,
  resolveOnboardingNextStep,
  resolveOnboardingPreviousStep,
} from "../flow";

describe("onboarding flow", () => {
  describe("isOnboardingCustomFlowStep", () => {
    it("is true for custom track steps", () => {
      expect(isOnboardingCustomFlowStep("connection")).toBe(true);
      expect(isOnboardingCustomFlowStep("rpc")).toBe(true);
      expect(isOnboardingCustomFlowStep("senses")).toBe(true);
      expect(isOnboardingCustomFlowStep("activate")).toBe(true);
    });
    it("is false for cloud and other steps", () => {
      expect(isOnboardingCustomFlowStep("welcome")).toBe(false);
      expect(isOnboardingCustomFlowStep("cloudLogin")).toBe(false);
      expect(isOnboardingCustomFlowStep("identity")).toBe(false);
    });
  });

  describe("getStepOrderForCurrentStep", () => {
    it("returns custom order when on a custom step", () => {
      expect(getStepOrderForCurrentStep("rpc")).toEqual([
        "connection",
        "rpc",
        "senses",
        "activate",
      ]);
    });
    it("returns cloud order when on cloud steps", () => {
      expect(getStepOrderForCurrentStep("welcome")).toEqual([
        "welcome",
        "cloudLogin",
      ]);
      expect(getStepOrderForCurrentStep("cloudLogin")).toEqual([
        "welcome",
        "cloudLogin",
      ]);
    });
    it("treats identity as cloud track", () => {
      expect(getStepOrderForCurrentStep("identity")).toEqual([
        "welcome",
        "cloudLogin",
      ]);
    });
  });

  describe("resolveOnboardingNextStep", () => {
    it("advances within custom flow", () => {
      expect(resolveOnboardingNextStep("connection")).toBe("rpc");
      expect(resolveOnboardingNextStep("rpc")).toBe("senses");
      expect(resolveOnboardingNextStep("senses")).toBe("activate");
      expect(resolveOnboardingNextStep("activate")).toBe(null);
    });
    it("advances within cloud flow", () => {
      expect(resolveOnboardingNextStep("welcome")).toBe("cloudLogin");
      expect(resolveOnboardingNextStep("cloudLogin")).toBe(null);
    });
    it("returns null for unknown index in order", () => {
      expect(resolveOnboardingNextStep("identity")).toBe(null);
    });
  });

  describe("resolveOnboardingPreviousStep", () => {
    it("goes welcome when backing from first custom step", () => {
      expect(resolveOnboardingPreviousStep("connection")).toBe("welcome");
    });
    it("steps back within custom flow", () => {
      expect(resolveOnboardingPreviousStep("rpc")).toBe("connection");
      expect(resolveOnboardingPreviousStep("senses")).toBe("rpc");
      expect(resolveOnboardingPreviousStep("activate")).toBe("senses");
    });
    it("steps back within cloud flow", () => {
      expect(resolveOnboardingPreviousStep("cloudLogin")).toBe("welcome");
      expect(resolveOnboardingPreviousStep("welcome")).toBe(null);
    });
    it("returns null for identity", () => {
      expect(resolveOnboardingPreviousStep("identity")).toBe(null);
    });
  });

  describe("canRevertOnboardingTo", () => {
    it("allows backward jump within custom flow", () => {
      expect(
        canRevertOnboardingTo({ current: "rpc", target: "connection" }),
      ).toBe(true);
      expect(canRevertOnboardingTo({ current: "rpc", target: "rpc" })).toBe(
        false,
      );
      expect(
        canRevertOnboardingTo({ current: "connection", target: "welcome" }),
      ).toBe(false);
    });
    it("allows backward jump within cloud flow", () => {
      expect(
        canRevertOnboardingTo({ current: "cloudLogin", target: "welcome" }),
      ).toBe(true);
      expect(
        canRevertOnboardingTo({ current: "welcome", target: "cloudLogin" }),
      ).toBe(false);
    });
  });

  describe("getOnboardingNavMetas", () => {
    it("returns custom metas on custom step", () => {
      const metas = getOnboardingNavMetas("rpc", false);
      expect(metas.map((m) => m.id)).toEqual([
        "connection",
        "rpc",
        "senses",
        "activate",
      ]);
    });
    it("filters welcome when cloudOnly on cloud track", () => {
      const metas = getOnboardingNavMetas("cloudLogin", true);
      expect(metas.map((m) => m.id)).toEqual(["cloudLogin"]);
    });
    it("includes welcome when not cloudOnly on cloud track", () => {
      const metas = getOnboardingNavMetas("welcome", false);
      expect(metas.map((m) => m.id)).toEqual(["welcome", "cloudLogin"]);
    });
  });

  describe("getFlaminaTopicForOnboardingStep", () => {
    it("maps advanced guide topics", () => {
      expect(getFlaminaTopicForOnboardingStep("connection")).toBe("provider");
      expect(getFlaminaTopicForOnboardingStep("rpc")).toBe("rpc");
      expect(getFlaminaTopicForOnboardingStep("senses")).toBe("permissions");
      expect(getFlaminaTopicForOnboardingStep("activate")).toBe(null);
      expect(getFlaminaTopicForOnboardingStep("welcome")).toBe(null);
    });
  });
});
