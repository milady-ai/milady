import fs from "node:fs";

import { describe, expect, it, vi } from "vitest";

vi.mock("../api", () => ({
  client: {
    setBaseUrl: vi.fn(),
    setToken: vi.fn(),
  },
}));

vi.mock("../bridge", () => ({
  getBackendStartupTimeoutMs: vi.fn(() => 30_000),
  getDesktopRuntimeMode: vi.fn(async () => null),
  inspectExistingElizaInstall: vi.fn(async () => null),
  invokeDesktopBridgeRequest: vi.fn(async () => {}),
  isElectrobunRuntime: vi.fn(() => false),
  scanProviderCredentials: vi.fn(async () => []),
}));

vi.mock("./onboarding-bootstrap", () => ({
  detectExistingOnboardingConnection: vi.fn(async () => null),
}));

vi.mock("./persistence", () => ({
  createPersistedActiveServer: vi.fn(),
  loadPersistedActiveServer: vi.fn(() => null),
  loadPersistedOnboardingComplete: vi.fn(() => false),
}));

import { client } from "../api";
import {
  getDesktopRuntimeMode,
  inspectExistingElizaInstall,
  invokeDesktopBridgeRequest,
} from "../bridge";
import { detectExistingOnboardingConnection } from "./onboarding-bootstrap";
import {
  loadPersistedActiveServer,
  loadPersistedOnboardingComplete,
} from "./persistence";
import {
  applyRestoredConnection,
  runRestoringSession,
} from "./startup-phase-restore";

describe("applyRestoredConnection", () => {
  it("clears stale session state before restoring a local runtime", async () => {
    vi.mocked(getDesktopRuntimeMode).mockResolvedValue({ mode: "local" });
    const clientRef = {
      setBaseUrl: vi.fn(),
      setToken: vi.fn(),
    };
    const startLocalRuntime = vi.fn(async () => {});

    await applyRestoredConnection({
      restoredActiveServer: {
        id: "local:embedded",
        kind: "local",
        label: "This device",
      },
      clientRef,
      startLocalRuntime,
    });

    expect(clientRef.setToken).toHaveBeenCalledWith(null);
    expect(clientRef.setBaseUrl).toHaveBeenCalledWith(null);
    expect(startLocalRuntime).toHaveBeenCalledTimes(1);
  });

  it("skips embedded runtime start when desktop is already in external api mode", async () => {
    vi.mocked(getDesktopRuntimeMode).mockResolvedValue({ mode: "external" });
    const clientRef = {
      setBaseUrl: vi.fn(),
      setToken: vi.fn(),
    };

    await applyRestoredConnection({
      restoredActiveServer: {
        id: "local:embedded",
        kind: "local",
        label: "This device",
      },
      clientRef,
      startLocalRuntime: async () => {
        const runtimeMode = await getDesktopRuntimeMode();
        if (runtimeMode?.mode !== "local") {
          return;
        }
        await invokeDesktopBridgeRequest({
          rpcMethod: "agentStart",
          ipcChannel: "agent:start",
        });
      },
    });

    expect(invokeDesktopBridgeRequest).not.toHaveBeenCalled();
  });

  it("clears stale tokens when restoring a remote target without an access token", async () => {
    const clientRef = {
      setBaseUrl: vi.fn(),
      setToken: vi.fn(),
    };

    await applyRestoredConnection({
      restoredActiveServer: {
        id: "remote:https://remote.example/api",
        kind: "remote",
        label: "remote.example",
        apiBase: "https://remote.example/api",
      },
      clientRef,
    });

    expect(clientRef.setBaseUrl).toHaveBeenCalledWith(
      "https://remote.example/api",
    );
    expect(clientRef.setToken).toHaveBeenCalledWith(null);
  });

  it("does not keep a redundant dynamic import for onboarding bootstrap helpers", () => {
    const source = fs.readFileSync(
      new URL("./startup-phase-restore.ts", import.meta.url),
      "utf8",
    );

    expect(source).not.toContain('await import("./onboarding-bootstrap")');
  });
});

describe("runRestoringSession", () => {
  it("restores an existing backend-configured install even without prior local onboarding evidence", async () => {
    vi.mocked(getDesktopRuntimeMode).mockResolvedValue({ mode: "local" });
    vi.mocked(loadPersistedActiveServer).mockReturnValue(null);
    vi.mocked(loadPersistedOnboardingComplete).mockReturnValue(false);
    vi.mocked(inspectExistingElizaInstall).mockResolvedValue(null);
    vi.mocked(detectExistingOnboardingConnection).mockResolvedValue({
      activeServer: {
        id: "local:embedded",
        kind: "local",
        label: "This device",
      },
      detectedExistingInstall: true,
    });

    const dispatch = vi.fn();
    const ctxRef = { current: null };
    const deps = {
      setStartupError: vi.fn(),
      setAuthRequired: vi.fn(),
      setConnected: vi.fn(),
      setOnboardingExistingInstallDetected: vi.fn(),
      setOnboardingOptions: vi.fn(),
      setOnboardingComplete: vi.fn(),
      setOnboardingLoading: vi.fn(),
      applyDetectedProviders: vi.fn(),
      forceLocalBootstrapRef: { current: false },
      onboardingCompletionCommittedRef: { current: false },
      uiLanguage: "en",
    };

    await runRestoringSession(deps, dispatch, ctxRef, { current: false });

    expect(detectExistingOnboardingConnection).toHaveBeenCalledOnce();
    expect(deps.setOnboardingExistingInstallDetected).toHaveBeenCalledWith(
      true,
    );
    expect(client.setToken).toHaveBeenCalledWith(null);
    expect(client.setBaseUrl).toHaveBeenCalledWith(null);
    expect(invokeDesktopBridgeRequest).toHaveBeenCalledOnce();
    expect(ctxRef.current).toMatchObject({
      persistedActiveServer: null,
      restoredActiveServer: {
        id: "local:embedded",
        kind: "local",
      },
      hadPriorOnboarding: false,
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "SESSION_RESTORED",
      target: "embedded-local",
    });
  });
});
