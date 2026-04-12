// @vitest-environment jsdom

import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  addAgentProfileMock,
  clientSetBaseUrlMock,
  clientSetTokenMock,
  clearPersistedActiveServerMock,
  discoverGatewayEndpointsMock,
  isDesktopPlatformMock,
  mockUseApp,
  savePersistedActiveServerMock,
} = vi.hoisted(() => ({
  addAgentProfileMock: vi.fn(),
  clientSetBaseUrlMock: vi.fn(),
  clientSetTokenMock: vi.fn(),
  clearPersistedActiveServerMock: vi.fn(),
  discoverGatewayEndpointsMock: vi.fn(),
  isDesktopPlatformMock: vi.fn(() => false),
  mockUseApp: vi.fn(),
  savePersistedActiveServerMock: vi.fn(),
}));

vi.mock("../../api", () => ({
  client: {
    setBaseUrl: clientSetBaseUrlMock,
    setToken: clientSetTokenMock,
    getOnboardingStatus: vi.fn().mockRejectedValue(new Error("not mocked")),
  },
}));

vi.mock("../../state", () => ({
  addAgentProfile: addAgentProfileMock,
  clearPersistedActiveServer: clearPersistedActiveServerMock,
  savePersistedActiveServer: savePersistedActiveServerMock,
  useApp: () => mockUseApp(),
}));

vi.mock("../../platform/init", () => ({
  isDesktopPlatform: isDesktopPlatformMock,
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

vi.mock("./SplashCloudAgents", () => ({
  SplashCloudAgents: ({ onBack }: { onBack: () => void }) => (
    <div>
      <button type="button" onClick={onBack}>
        Back
      </button>
      <span>Cloud agents view</span>
    </div>
  ),
}));

vi.mock("./SplashServerChooser", () => ({
  SplashServerChooser: ({
    gateways,
    onConnectGateway,
    onCreateLocal,
    onManualConnect,
    onManageCloudAgents,
  }: {
    gateways: Array<{ stableId: string; name: string }>;
    onConnectGateway: (gateway: { stableId: string; name: string }) => void;
    onCreateLocal: () => void;
    onManualConnect: () => void;
    onManageCloudAgents: () => void;
  }) => (
    <div>
      <button type="button" onClick={onCreateLocal}>
        Create one
      </button>
      <button type="button" onClick={onManualConnect}>
        Manually connect to one
      </button>
      <button type="button" onClick={onManageCloudAgents}>
        Manage cloud agents
      </button>
      {gateways.map((gateway) => (
        <button
          type="button"
          key={gateway.stableId}
          onClick={() => onConnectGateway(gateway)}
        >
          {gateway.name}
        </button>
      ))}
    </div>
  ),
}));

vi.mock("./StartupFailureView", () => ({
  StartupFailureView: () => <div>Error view</div>,
}));

vi.mock("./PairingView", () => ({
  PairingView: () => <div>Pairing view</div>,
}));

vi.mock("../onboarding/OnboardingWizard", () => ({
  OnboardingWizard: () => <div>Onboarding wizard</div>,
}));

import { StartupShell } from "./StartupShell";

describe("StartupShell", () => {
  beforeEach(() => {
    addAgentProfileMock.mockReset();
    clientSetBaseUrlMock.mockReset();
    clientSetTokenMock.mockReset();
    clearPersistedActiveServerMock.mockReset();
    discoverGatewayEndpointsMock.mockReset();
    savePersistedActiveServerMock.mockReset();
    isDesktopPlatformMock.mockReset().mockReturnValue(false);
    discoverGatewayEndpointsMock.mockResolvedValue([]);
    vi.restoreAllMocks();
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
    expect(snapshot).toContain("Manage cloud agents");
    expect(snapshot).toContain("Ren");
  });

  it("seeds local onboarding when create one is clicked", async () => {
    const { dispatch, goToOnboardingStep, setState } = mockSplashApp();

    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(<StartupShell />);
    });
    await act(async () => {});

    const createButton = tree?.root.findByProps({ children: "Create one" });

    await act(async () => {
      createButton?.props.onClick();
    });

    expect(addAgentProfileMock).toHaveBeenCalledWith({
      kind: "local",
      label: "Local Agent",
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
    const { dispatch } = mockSplashApp();
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

    const connectButton = tree?.root.findByProps({ children: "Kei" });

    await act(async () => {
      connectButton?.props.onClick();
    });

    expect(clientSetTokenMock).toHaveBeenCalledWith(null);
    expect(clientSetBaseUrlMock).toHaveBeenCalledWith(null);
    expect(savePersistedActiveServerMock).toHaveBeenCalledWith({
      id: "remote:kei",
      kind: "remote",
      label: "Kei",
      apiBase: "http://kei.local:18789",
    });
    expect(addAgentProfileMock).toHaveBeenCalledWith({
      kind: "remote",
      label: "Kei",
      apiBase: "http://kei.local:18789",
    });
    expect(dispatch).toHaveBeenCalledWith({ type: "SPLASH_CONTINUE" });
  });

  it("shows cloud agents view when manage cloud agents is clicked", async () => {
    mockSplashApp();

    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(<StartupShell />);
    });
    await act(async () => {});

    const cloudButton = tree?.root.findByProps({
      children: "Manage cloud agents",
    });
    await act(async () => {
      cloudButton?.props.onClick();
    });

    const snapshot = JSON.stringify(tree?.toJSON());
    expect(snapshot).toContain("Cloud agents view");
    expect(snapshot).not.toContain("Create one");
  });

  it("returns to chooser from cloud agents via back button", async () => {
    mockSplashApp();

    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(<StartupShell />);
    });
    await act(async () => {});

    // Go to cloud view
    const cloudButton = tree?.root.findByProps({
      children: "Manage cloud agents",
    });
    await act(async () => {
      cloudButton?.props.onClick();
    });

    // Go back
    const backButton = tree?.root.findByProps({ children: "Back" });
    await act(async () => {
      backButton?.props.onClick();
    });

    const snapshot = JSON.stringify(tree?.toJSON());
    expect(snapshot).toContain("Create one");
    expect(snapshot).not.toContain("Cloud agents view");
  });
});
