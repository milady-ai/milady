import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentStatus, OnboardingOptions } from "../api/client";
import { completeResetLocalStateAfterServerWipe } from "./complete-reset-local-state-after-wipe";
import { handleResetAppliedFromMainCore } from "./handle-reset-applied-from-main";

describe("completeResetLocalStateAfterServerWipe", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("applies reset side effects in order and loads onboarding options", async () => {
    const order: string[] = [];
    const mockOptions = { styles: [] } as unknown as OnboardingOptions;
    const deps = {
      setAgentStatus: vi.fn((s: AgentStatus | null) => {
        order.push(`setAgentStatus:${s?.state ?? "null"}`);
      }),
      resetClientConnection: vi.fn(() => {
        order.push("resetClientConnection");
      }),
      clearPersistedConnectionMode: vi.fn(() => {
        order.push("clearPersistedConnectionMode");
      }),
      setClientBaseUrl: vi.fn(() => {
        order.push("setClientBaseUrl");
      }),
      setClientToken: vi.fn(() => {
        order.push("setClientToken");
      }),
      clearElizaCloudSessionUi: vi.fn(() => {
        order.push("clearElizaCloudSessionUi");
      }),
      markOnboardingReset: vi.fn(() => {
        order.push("markOnboardingReset");
      }),
      clearConversationLists: vi.fn(() => {
        order.push("clearConversationLists");
      }),
      fetchOnboardingOptions: vi.fn(async () => mockOptions),
      setOnboardingOptions: vi.fn(() => {
        order.push("setOnboardingOptions");
      }),
      logResetDebug: vi.fn(),
      logResetWarn: vi.fn(),
    };

    const agentStatus: AgentStatus = {
      state: "running",
      agentName: "Milady",
    };
    await completeResetLocalStateAfterServerWipe(agentStatus, deps);

    expect(order).toEqual([
      "setAgentStatus:running",
      "resetClientConnection",
      "clearPersistedConnectionMode",
      "setClientBaseUrl",
      "setClientToken",
      "clearElizaCloudSessionUi",
      "markOnboardingReset",
      "clearConversationLists",
      "setOnboardingOptions",
    ]);
    expect(deps.setAgentStatus).toHaveBeenCalledWith(agentStatus);
    expect(deps.setClientBaseUrl).toHaveBeenCalledWith(null);
    expect(deps.setClientToken).toHaveBeenCalledWith(null);
    expect(deps.setOnboardingOptions).toHaveBeenCalledWith(mockOptions);
    expect(deps.logResetWarn).not.toHaveBeenCalled();
  });

  it("logs a warning when onboarding options fail but still finishes other steps", async () => {
    const err = new Error("network");
    const deps = {
      setAgentStatus: vi.fn(),
      resetClientConnection: vi.fn(),
      clearPersistedConnectionMode: vi.fn(),
      setClientBaseUrl: vi.fn(),
      setClientToken: vi.fn(),
      clearElizaCloudSessionUi: vi.fn(),
      markOnboardingReset: vi.fn(),
      clearConversationLists: vi.fn(),
      fetchOnboardingOptions: vi.fn(async () => {
        throw err;
      }),
      setOnboardingOptions: vi.fn(),
      logResetDebug: vi.fn(),
      logResetWarn: vi.fn(),
    };

    await completeResetLocalStateAfterServerWipe(null, deps);
    expect(deps.clearConversationLists).toHaveBeenCalled();
    expect(deps.setOnboardingOptions).not.toHaveBeenCalled();
    expect(deps.logResetWarn).toHaveBeenCalledWith(
      "resetLocalState: getOnboardingOptions failed after reset",
      err,
    );
  });
});

describe("handleResetAppliedFromMainCore", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns early when lifecycle is busy without beginning reset", async () => {
    const beginLifecycleAction = vi.fn();
    const finishLifecycleAction = vi.fn();
    const completeResetLocalState = vi.fn();

    await handleResetAppliedFromMainCore(
      { agentStatus: { state: "running", agentName: "Milady" } },
      {
        performanceNow: () => 0,
        isLifecycleBusy: () => true,
        getActiveLifecycleAction: () => "start",
        beginLifecycleAction,
        finishLifecycleAction,
        setActionNotice: vi.fn(),
        parseTrayResetPayload: vi.fn(),
        completeResetLocalState,
        alertDesktopMessage: vi.fn(),
        logResetInfo: vi.fn(),
        logResetWarn: vi.fn(),
      },
    );

    expect(beginLifecycleAction).not.toHaveBeenCalled();
    expect(finishLifecycleAction).not.toHaveBeenCalled();
    expect(completeResetLocalState).not.toHaveBeenCalled();
  });

  it("returns early when beginLifecycleAction fails", async () => {
    const finishLifecycleAction = vi.fn();
    const completeResetLocalState = vi.fn();

    await handleResetAppliedFromMainCore(
      {},
      {
        performanceNow: () => 0,
        isLifecycleBusy: () => false,
        getActiveLifecycleAction: () => "reset",
        beginLifecycleAction: () => false,
        finishLifecycleAction,
        setActionNotice: vi.fn(),
        parseTrayResetPayload: vi.fn(),
        completeResetLocalState,
        alertDesktopMessage: vi.fn(),
        logResetInfo: vi.fn(),
        logResetWarn: vi.fn(),
      },
    );

    expect(finishLifecycleAction).not.toHaveBeenCalled();
    expect(completeResetLocalState).not.toHaveBeenCalled();
  });

  it("parses payload, completes local reset, and always finishes lifecycle", async () => {
    const parsed: AgentStatus = {
      state: "running",
      agentName: "Milady",
    };
    const parseTrayResetPayload = vi.fn(() => parsed);
    const completeResetLocalState = vi.fn(async () => {});
    const finishLifecycleAction = vi.fn();
    let t = 0;
    const performanceNow = vi.fn(() => {
      t += 100;
      return t;
    });

    await handleResetAppliedFromMainCore(
      { agentStatus: { state: "running", agentName: "Milady" } },
      {
        performanceNow,
        isLifecycleBusy: () => false,
        getActiveLifecycleAction: () => "reset",
        beginLifecycleAction: () => true,
        finishLifecycleAction,
        setActionNotice: vi.fn(),
        parseTrayResetPayload,
        completeResetLocalState,
        alertDesktopMessage: vi.fn(),
        logResetInfo: vi.fn(),
        logResetWarn: vi.fn(),
      },
    );

    expect(parseTrayResetPayload).toHaveBeenCalledOnce();
    expect(completeResetLocalState).toHaveBeenCalledWith(parsed);
    expect(finishLifecycleAction).toHaveBeenCalledOnce();
  });

  it("calls alertDesktopMessage and finishes lifecycle when completeReset throws", async () => {
    const boom = new Error("boom");
    const completeResetLocalState = vi.fn(async () => {
      throw boom;
    });
    const alertDesktopMessage = vi.fn(async () => {});
    const finishLifecycleAction = vi.fn();

    await handleResetAppliedFromMainCore(
      {},
      {
        performanceNow: () => 0,
        isLifecycleBusy: () => false,
        getActiveLifecycleAction: () => "reset",
        beginLifecycleAction: () => true,
        finishLifecycleAction,
        setActionNotice: vi.fn(),
        parseTrayResetPayload: vi.fn(() => null),
        completeResetLocalState,
        alertDesktopMessage,
        logResetInfo: vi.fn(),
        logResetWarn: vi.fn(),
      },
    );

    expect(alertDesktopMessage).toHaveBeenCalledWith({
      title: "Reset Failed",
      message: "Reset ran in the desktop shell but the UI could not refresh.",
      type: "error",
    });
    expect(finishLifecycleAction).toHaveBeenCalledOnce();
  });
});
