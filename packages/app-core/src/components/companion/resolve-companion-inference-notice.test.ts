import { describe, expect, it } from "vitest";
import { resolveCompanionInferenceNotice } from "./resolve-companion-inference-notice";

const t = (k: string) => k;

describe("resolveCompanionInferenceNotice", () => {
  it("prefers credential errors when connected", () => {
    expect(
      resolveCompanionInferenceNotice({
        elizaCloudConnected: true,
        elizaCloudAuthRejected: true,
        elizaCloudCreditsError: null,
        elizaCloudEnabled: true,
        hasInterruptedAssistant: true,
        t,
      }),
    ).toEqual({
      kind: "cloud",
      variant: "danger",
      tooltip: "notice.elizaCloudAuthRejected",
    });
  });

  it("returns credits API error when connected without auth rejection", () => {
    expect(
      resolveCompanionInferenceNotice({
        elizaCloudConnected: true,
        elizaCloudAuthRejected: false,
        elizaCloudCreditsError: "Upstream timeout",
        elizaCloudEnabled: true,
        hasInterruptedAssistant: false,
        t,
      }),
    ).toEqual({
      kind: "cloud",
      variant: "warn",
      tooltip: "Upstream timeout",
    });
  });

  it("returns disconnect copy when cloud expected but not connected", () => {
    expect(
      resolveCompanionInferenceNotice({
        elizaCloudConnected: false,
        elizaCloudAuthRejected: false,
        elizaCloudCreditsError: null,
        elizaCloudEnabled: true,
        hasInterruptedAssistant: true,
        t,
      }),
    ).toEqual({
      kind: "cloud",
      variant: "warn",
      tooltip: "chat.inferenceCloudNotConnected",
    });
  });

  it("returns stream interrupted when no cloud issue", () => {
    expect(
      resolveCompanionInferenceNotice({
        elizaCloudConnected: false,
        elizaCloudAuthRejected: false,
        elizaCloudCreditsError: null,
        elizaCloudEnabled: false,
        hasInterruptedAssistant: true,
        t,
      }),
    ).toEqual({
      kind: "settings",
      variant: "warn",
      tooltip: "chat.inferenceStreamInterrupted",
    });
  });

  it("detects disconnect via last model heuristic", () => {
    expect(
      resolveCompanionInferenceNotice({
        elizaCloudConnected: false,
        elizaCloudAuthRejected: false,
        elizaCloudCreditsError: null,
        elizaCloudEnabled: false,
        chatLastUsageModel: "kimi-k2",
        hasInterruptedAssistant: false,
        t,
      }),
    ).toEqual({
      kind: "cloud",
      variant: "warn",
      tooltip: "chat.inferenceCloudNotConnected",
    });
  });
});
