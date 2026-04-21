// @vitest-environment jsdom

import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  clientSetBaseUrlMock,
  clientSetTokenMock,
  clearPersistedActiveServerMock,
  discoverGatewayEndpointsMock,
  loadContentPackFromFilesMock,
  loadContentPackFromUrlMock,
  loadPersistedActivePackUrlMock,
  mockUseApp,
  releaseLoadedContentPackMock,
  savePersistedActivePackUrlMock,
  savePersistedActiveServerMock,
} = vi.hoisted(() => ({
  clientSetBaseUrlMock: vi.fn(),
  clientSetTokenMock: vi.fn(),
  clearPersistedActiveServerMock: vi.fn(),
  discoverGatewayEndpointsMock: vi.fn(),
  loadContentPackFromFilesMock: vi.fn(),
  loadContentPackFromUrlMock: vi.fn(),
  loadPersistedActivePackUrlMock: vi.fn(),
  mockUseApp: vi.fn(),
  releaseLoadedContentPackMock: vi.fn(),
  savePersistedActivePackUrlMock: vi.fn(),
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
  loadPersistedActivePackUrl: loadPersistedActivePackUrlMock,
  savePersistedActivePackUrl: savePersistedActivePackUrlMock,
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

vi.mock("../../content-packs", () => ({
  applyColorScheme: () => vi.fn(),
  applyContentPack: vi.fn(),
  loadContentPackFromFiles: loadContentPackFromFilesMock,
  loadContentPackFromUrl: loadContentPackFromUrlMock,
  releaseLoadedContentPack: releaseLoadedContentPackMock,
}));

vi.mock("./SplashContentPacks", () => ({
  SplashContentPacks: ({
    packs,
    onLoadCustomPack,
    onSelectPack,
  }: {
    packs: Array<{ manifest: { id: string; name: string } }>;
    onLoadCustomPack: () => void;
    onSelectPack: (pack: { manifest: { id: string; name: string } }) => void;
  }) => (
    <div>
      <button type="button" onClick={onLoadCustomPack}>
        Load pack
      </button>
      {packs.map((pack) => (
        <button
          type="button"
          key={pack.manifest.id}
          onClick={() => onSelectPack(pack)}
        >
          {pack.manifest.name}
        </button>
      ))}
    </div>
  ),
}));

vi.mock("./SplashServerChooser", () => ({
  SplashServerChooser: ({
    gateways,
    onConnectGateway,
    onCreateLocal,
    onManualConnect,
  }: {
    gateways: Array<{ stableId: string; name: string }>;
    onConnectGateway: (gateway: { stableId: string; name: string }) => void;
    onCreateLocal: () => void;
    onManualConnect: () => void;
  }) => (
    <div>
      <button type="button" onClick={onCreateLocal}>
        Create one
      </button>
      <button type="button" onClick={onManualConnect}>
        Manually connect to one
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

import { StartupShell } from "./StartupShell";

describe("StartupShell", () => {
  beforeEach(() => {
    clientSetBaseUrlMock.mockReset();
    clientSetTokenMock.mockReset();
    clearPersistedActiveServerMock.mockReset();
    discoverGatewayEndpointsMock.mockReset();
    loadContentPackFromFilesMock.mockReset();
    loadContentPackFromUrlMock.mockReset();
    loadPersistedActivePackUrlMock.mockReset();
    savePersistedActiveServerMock.mockReset();
    savePersistedActivePackUrlMock.mockReset();
    releaseLoadedContentPackMock.mockReset();
    discoverGatewayEndpointsMock.mockResolvedValue([]);
    loadContentPackFromFilesMock.mockRejectedValue(
      new Error("loadContentPackFromFiles not mocked"),
    );
    loadContentPackFromUrlMock.mockRejectedValue(
      new Error("loadContentPackFromUrl not mocked"),
    );
    loadPersistedActivePackUrlMock.mockReturnValue(null);
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

    const createButton = tree?.root.findByProps({ children: "Create one" });

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

    const connectButton = tree?.root.findByProps({ children: "Kei" });

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

  it("falls back to URL loading when directory upload is unsupported", async () => {
    mockSplashApp();
    const promptMock = vi
      .fn()
      .mockReturnValue("https://example.com/packs/medusa/");
    vi.stubGlobal("prompt", promptMock);
    loadContentPackFromUrlMock.mockResolvedValue({
      manifest: { id: "medusa", name: "Medusa" },
      colorScheme: undefined,
      source: { kind: "url", url: "https://example.com/packs/medusa/" },
    });

    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(<StartupShell />);
    });
    await act(async () => {});

    const loadButton = tree?.root.findByProps({ children: "Load pack" });
    await act(async () => {
      loadButton?.props.onClick();
    });

    expect(promptMock).toHaveBeenCalledTimes(1);
    expect(loadContentPackFromUrlMock).toHaveBeenCalledWith(
      "https://example.com/packs/medusa/",
    );
  });

  it("releases file-backed pack blobs when the active pack is deactivated", async () => {
    mockSplashApp({ activePackId: "medusa" });
    const filePack = {
      manifest: { id: "medusa", name: "Medusa" },
      colorScheme: undefined,
      source: { kind: "file", path: "medusa" },
    };
    loadContentPackFromFilesMock.mockResolvedValue(filePack);

    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(<StartupShell />);
    });
    await act(async () => {});

    const fileInput = tree?.root.findByProps({ type: "file" });
    await act(async () => {
      fileInput?.props.onChange({
        target: {
          files: [
            {
              name: "pack.json",
              webkitRelativePath: "medusa/pack.json",
              text: async () => "{}",
            },
          ],
        },
      });
    });

    const packButton = tree?.root.findByProps({ children: "Medusa" });
    await act(async () => {
      packButton?.props.onClick();
    });

    expect(releaseLoadedContentPackMock).toHaveBeenCalledWith(filePack);
  });
});
