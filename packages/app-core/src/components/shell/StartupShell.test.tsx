// @vitest-environment jsdom

import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  clientSetBaseUrlMock,
  clientSetTokenMock,
  clearPersistedActiveServerMock,
  discoverGatewayEndpointsMock,
  mockUseApp,
  savePersistedActiveServerMock,
} = vi.hoisted(() => ({
  clientSetBaseUrlMock: vi.fn(),
  clientSetTokenMock: vi.fn(),
  clearPersistedActiveServerMock: vi.fn(),
  discoverGatewayEndpointsMock: vi.fn(),
  mockUseApp: vi.fn(),
  savePersistedActiveServerMock: vi.fn(),
}));

vi.mock("../../api", () => ({
  client: {
    setBaseUrl: clientSetBaseUrlMock,
    setToken: clientSetTokenMock,
  },
}));

vi.mock("../../state", () => ({
  clearPersistedActiveServer: clearPersistedActiveServerMock,
  savePersistedActiveServer: savePersistedActiveServerMock,
  useApp: () => mockUseApp(),
}));

vi.mock("../../bridge/gateway-discovery", () => ({
  discoverGatewayEndpoints: discoverGatewayEndpointsMock,
  gatewayEndpointToApiBase: (gateway: {
    host: string;
    gatewayPort?: number;
    port: number;
    tlsEnabled: boolean;
  }) =>
    `${gateway.tlsEnabled ? "https" : "http"}://${gateway.host}:${gateway.gatewayPort ?? gateway.port}`,
}));

import { StartupShell } from "./StartupShell";

describe("StartupShell", () => {
  beforeEach(() => {
    clientSetBaseUrlMock.mockReset();
    clientSetTokenMock.mockReset();
    clearPersistedActiveServerMock.mockReset();
    discoverGatewayEndpointsMock.mockReset();
    savePersistedActiveServerMock.mockReset();
    discoverGatewayEndpointsMock.mockResolvedValue([]);
  });

  function mockSplashApp(overrides?: Record<string, unknown>) {
    const dispatch = vi.fn();
    const goToOnboardingStep = vi.fn();
    const setState = vi.fn();
    mockUseApp.mockReturnValue({
      startupCoordinator: {
        phase: "splash",
        state: { phase: "splash", loaded: true },
        dispatch,
      },
      startupError: null,
      retryStartup: vi.fn(),
      setState,
      goToOnboardingStep,
      elizaCloudConnected: false,
      onboardingCloudApiKey: "",
      t: (_key: string, values?: Record<string, unknown>) =>
        (values?.defaultValue as string | undefined) ?? _key,
      ...overrides,
    });
    return { dispatch, goToOnboardingStep, setState };
  }

  it("renders chooser actions and discovered gateways on splash", async () => {
    mockSplashApp();
    discoverGatewayEndpointsMock.mockResolvedValue([
      {
        stableId: "ren",
        name: "Ren",
        host: "10.0.0.2",
        port: 18789,
        tlsEnabled: false,
        isLocal: true,
      },
    ]);

    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(<StartupShell />);
    });
    await act(async () => {});

    const snapshot = JSON.stringify(tree?.toJSON());
    expect(snapshot).toContain("Create one");
    expect(snapshot).toContain("Manually connect to one");
    expect(snapshot).toContain("Ren");
  });

  it("seeds local onboarding when create one is clicked", async () => {
    const { dispatch, goToOnboardingStep, setState } = mockSplashApp();

    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(<StartupShell />);
    });
    await act(async () => {});

    const buttons =
      tree?.root.findAll(
        (node) =>
          node.type === "button" && typeof node.props.onClick === "function",
      ) ?? [];
    const createButton = buttons[0];

    await act(async () => {
      createButton?.props.onClick();
    });

    expect(clientSetTokenMock).toHaveBeenCalledWith(null);
    expect(clientSetBaseUrlMock).toHaveBeenCalledWith(null);
    expect(clearPersistedActiveServerMock).toHaveBeenCalledTimes(1);
    expect(savePersistedActiveServerMock).not.toHaveBeenCalled();
    expect(goToOnboardingStep).toHaveBeenCalledWith("identity");
    expect(setState).toHaveBeenCalledWith("onboardingServerTarget", "local");
    expect(setState).toHaveBeenCalledWith("onboardingRemoteApiBase", "");
    expect(dispatch).toHaveBeenCalledWith({ type: "SPLASH_CONTINUE" });
  });

  it("seeds a discovered gateway through the remote onboarding path", async () => {
    const { dispatch, goToOnboardingStep, setState } = mockSplashApp();
    discoverGatewayEndpointsMock.mockResolvedValue([
      {
        stableId: "kei",
        name: "Kei",
        host: "kei.local",
        port: 18789,
        tlsEnabled: false,
        isLocal: true,
      },
    ]);

    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(<StartupShell />);
    });
    await act(async () => {});

    const buttons =
      tree?.root.findAll(
        (node) =>
          node.type === "button" && typeof node.props.onClick === "function",
      ) ?? [];
    const connectButton = buttons[0];

    await act(async () => {
      connectButton?.props.onClick();
    });

    expect(clientSetTokenMock).toHaveBeenCalledWith(null);
    expect(clientSetBaseUrlMock).toHaveBeenCalledWith(null);
    expect(clearPersistedActiveServerMock).not.toHaveBeenCalled();
    expect(savePersistedActiveServerMock).toHaveBeenCalledWith({
      id: "remote:kei",
      kind: "remote",
      label: "Kei",
      apiBase: "http://kei.local:18789",
    });
    expect(goToOnboardingStep).not.toHaveBeenCalled();
    expect(setState).not.toHaveBeenCalledWith(
      "onboardingServerTarget",
      "elizacloud",
    );
    expect(dispatch).toHaveBeenCalledWith({ type: "SPLASH_CONTINUE" });
  });
});
