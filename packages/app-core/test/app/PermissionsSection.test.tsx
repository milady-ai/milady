/**
 * Tests for PermissionsSection — platform-aware rendering.
 *
 * Validates that the settings-page PermissionsSection renders the correct
 * view for each platform: desktop app (desktop permissions), web (info message),
 * and Capacitor/mobile (streaming permissions).
 */
// @vitest-environment jsdom
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Hoisted mocks ─────────────────────────────────────────────────────

const { mockUseApp, mockIsWeb, mockIsDesktop, mockIsNative } = vi.hoisted(
  () => ({
    mockUseApp: vi.fn(),
    mockIsWeb: vi.fn(() => false),
    mockIsDesktop: vi.fn(() => true),
    mockIsNative: { value: false },
  }),
);
const {
  mockGetPermission,
  mockGetPermissions,
  mockIsShellEnabled,
  mockRefreshPermissions,
  mockRequestPermission,
  mockOpenPermissionSettings,
  mockSetShellEnabled,
  mockGetWebsiteBlockerStatus,
  mockStartWebsiteBlock,
  mockStopWebsiteBlock,
  mockInvokeDesktopBridgeRequest,
  mockSubscribeDesktopBridgeEvent,
  permissionBridgeListener,
} = vi.hoisted(() => ({
  mockGetPermission: vi.fn(),
  mockGetPermissions: vi.fn(),
  mockIsShellEnabled: vi.fn(),
  mockRefreshPermissions: vi.fn(),
  mockRequestPermission: vi.fn(),
  mockOpenPermissionSettings: vi.fn(),
  mockSetShellEnabled: vi.fn(),
  mockGetWebsiteBlockerStatus: vi.fn(),
  mockStartWebsiteBlock: vi.fn(),
  mockStopWebsiteBlock: vi.fn(),
  mockInvokeDesktopBridgeRequest: vi.fn(),
  mockSubscribeDesktopBridgeEvent: vi.fn(),
  permissionBridgeListener: {
    current: null as ((payload: unknown) => void) | null,
  },
}));

vi.mock("@miladyai/app-core/state", () => ({
  useApp: () => mockUseApp(),
}));

vi.mock("@miladyai/app-core/platform", () => ({
  hasRequiredOnboardingPermissions: vi.fn(() => true),
  isWebPlatform: () => mockIsWeb(),
  isDesktopPlatform: () => mockIsDesktop(),
  get isNative() {
    return mockIsNative.value;
  },
  isIOS: false,
  isAndroid: false,
  platform: "web",
}));

vi.mock("@miladyai/app-core/api", () => ({
  client: {
    getPermission: mockGetPermission,
    getPermissions: mockGetPermissions,
    isShellEnabled: mockIsShellEnabled,
    refreshPermissions: mockRefreshPermissions,
    requestPermission: mockRequestPermission,
    openPermissionSettings: mockOpenPermissionSettings,
    setShellEnabled: mockSetShellEnabled,
    getWebsiteBlockerStatus: mockGetWebsiteBlockerStatus,
    startWebsiteBlock: mockStartWebsiteBlock,
    stopWebsiteBlock: mockStopWebsiteBlock,
  },
}));

vi.mock("../../src/bridge", () => ({
  invokeDesktopBridgeRequest: mockInvokeDesktopBridgeRequest,
  subscribeDesktopBridgeEvent: mockSubscribeDesktopBridgeEvent,
}));

vi.mock("@miladyai/ui", () => ({
  Button: ({
    children,
    onClick,
    ...rest
  }: {
    children: React.ReactNode;
    onClick?: () => void;
  }) =>
    React.createElement(
      "button",
      { type: "button", onClick, ...rest },
      children,
    ),
  StatusBadge: ({ label }: { label: string }) =>
    React.createElement("span", { "data-testid": "status-badge" }, label),
  Switch: () => React.createElement("span", null, "switch"),
}));

vi.mock("lucide-react", () => ({
  Camera: () => React.createElement("span", null, "📷"),
  Check: () => React.createElement("span", null, "✓"),
  CircleUserRound: () => React.createElement("span", null, "👤"),
  Cloud: () => React.createElement("span", null, "☁"),
  Mic: () => React.createElement("span", null, "🎤"),
  Monitor: () => React.createElement("span", null, "🖥"),
  MousePointer2: () => React.createElement("span", null, "🖱"),
  Settings: () => React.createElement("span", null, "⚙"),
  ShieldBan: () => React.createElement("span", null, "🚫"),
  Smartphone: () => React.createElement("span", null, "📱"),
  Terminal: () => React.createElement("span", null, "💻"),
}));

import { PermissionsSection } from "../../src/components/settings/PermissionsSection";

// ── Helpers ───────────────────────────────────────────────────────────

function baseContext(overrides?: Record<string, unknown>) {
  return {
    t: (k: string) => k,
    plugins: [],
    handlePluginToggle: vi.fn(),
    ...overrides,
  };
}

function collectText(node: TestRenderer.ReactTestInstance): string {
  return node.children
    .map((child) => (typeof child === "string" ? child : collectText(child)))
    .join(" ");
}

function findButtonsByAriaLabel(
  root: TestRenderer.ReactTestInstance,
  label: string,
): TestRenderer.ReactTestInstance[] {
  return root.findAll(
    (node) => node.type === "button" && node.props["aria-label"] === label,
  );
}

function ensureNavigatorPermissionMocks(): void {
  if (!navigator.permissions) {
    Object.defineProperty(navigator, "permissions", {
      value: { query: vi.fn() },
      writable: true,
      configurable: true,
    });
  }

  if (!navigator.mediaDevices) {
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: vi.fn(),
        enumerateDevices: vi.fn(),
      },
      writable: true,
      configurable: true,
    });
  }

  if (!navigator.mediaDevices.getUserMedia) {
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: vi.fn(),
      writable: true,
      configurable: true,
    });
  }

  if (!navigator.mediaDevices.enumerateDevices) {
    Object.defineProperty(navigator.mediaDevices, "enumerateDevices", {
      value: vi.fn(),
      writable: true,
      configurable: true,
    });
  }
}

const BRIDGE_CHANNELS = {
  permissionsGetAll: "permissions:getAll",
  permissionsIsShellEnabled: "permissions:isShellEnabled",
  permissionsGetPlatform: "permissions:getPlatform",
  permissionsRequest: "permissions:request",
  permissionsOpenSettings: "permissions:openSettings",
  permissionsSetShellEnabled: "permissions:setShellEnabled",
} as const;

type RpcGlobal = typeof globalThis & {
  __MILADY_ELECTROBUN_RPC__?: unknown;
};

type RpcWindow = Window & {
  __MILADY_ELECTROBUN_RPC__?: unknown;
};

function installDesktopBridgeRpcMock(): void {
  const requestEntries = Object.entries(BRIDGE_CHANNELS).map(
    ([rpcMethod, ipcChannel]) => [
      rpcMethod,
      (params?: unknown) =>
        mockInvokeDesktopBridgeRequest({
          rpcMethod,
          ipcChannel,
          params,
        }),
    ],
  );

  vi.stubGlobal("__MILADY_ELECTROBUN_RPC__", {
    request: Object.fromEntries(requestEntries),
    onMessage: (message: string, listener: (payload: unknown) => void) => {
      if (message === "permissionsChanged") {
        permissionBridgeListener.current = listener;
      }
    },
    offMessage: (message: string, listener: (payload: unknown) => void) => {
      if (
        message === "permissionsChanged" &&
        permissionBridgeListener.current === listener
      ) {
        permissionBridgeListener.current = null;
      }
    },
  });
}

// ====================================================================

describe("PermissionsSection", () => {
  const defaultPermissions = {
    accessibility: {
      id: "accessibility",
      status: "granted",
      canRequest: false,
    },
    "screen-recording": {
      id: "screen-recording",
      status: "granted",
      canRequest: false,
    },
    microphone: {
      id: "microphone",
      status: "not-determined",
      canRequest: true,
    },
    camera: { id: "camera", status: "granted", canRequest: false },
    shell: { id: "shell", status: "granted", canRequest: false },
  };

  beforeEach(() => {
    ensureNavigatorPermissionMocks();
    installDesktopBridgeRpcMock();
    mockUseApp.mockReset();
    mockIsWeb.mockReturnValue(false);
    mockIsDesktop.mockReturnValue(true);
    mockIsNative.value = false;
    mockGetPermission.mockReset();
    mockGetPermissions.mockReset();
    mockIsShellEnabled.mockReset();
    mockRefreshPermissions.mockReset();
    mockRequestPermission.mockReset();
    mockOpenPermissionSettings.mockReset();
    mockSetShellEnabled.mockReset();
    mockGetWebsiteBlockerStatus.mockReset();
    mockStartWebsiteBlock.mockReset();
    mockStopWebsiteBlock.mockReset();
    mockInvokeDesktopBridgeRequest.mockReset();
    mockSubscribeDesktopBridgeEvent.mockReset();
    permissionBridgeListener.current = null;
    mockGetPermission.mockResolvedValue({
      id: "website-blocking",
      status: "granted",
      canRequest: false,
      lastChecked: Date.now(),
    });
    mockGetPermissions.mockResolvedValue(defaultPermissions);
    mockIsShellEnabled.mockResolvedValue(true);
    mockGetWebsiteBlockerStatus.mockResolvedValue({
      available: true,
      active: false,
      hostsFilePath: "/tmp/hosts",
      endsAt: null,
      websites: [],
      canUnblockEarly: true,
      requiresElevation: false,
      engine: "hosts-file",
      platform: "darwin",
      supportsElevationPrompt: true,
      elevationPromptMethod: "osascript",
    });
    mockStartWebsiteBlock.mockResolvedValue({
      success: true,
      endsAt: "2026-04-05T10:00:00.000Z",
      request: {
        websites: ["x.com"],
        durationMinutes: 60,
      },
    });
    mockStopWebsiteBlock.mockResolvedValue({
      success: true,
      removed: true,
      status: {
        active: false,
        endsAt: null,
        websites: [],
        requiresElevation: false,
      },
    });
    mockInvokeDesktopBridgeRequest.mockImplementation(
      async (options: { rpcMethod: string }) => {
        if (options.rpcMethod === "permissionsGetAll") {
          return defaultPermissions;
        }
        if (options.rpcMethod === "permissionsIsShellEnabled") {
          return true;
        }
        if (options.rpcMethod === "permissionsGetPlatform") {
          return "darwin";
        }
        return null;
      },
    );
    mockSubscribeDesktopBridgeEvent.mockImplementation(
      (options: { listener: (payload: unknown) => void }) => {
        permissionBridgeListener.current = options.listener;
        return () => {
          if (permissionBridgeListener.current === options.listener) {
            permissionBridgeListener.current = null;
          }
        };
      },
    );
    vi.mocked(navigator.permissions.query).mockReset();
    vi.mocked(navigator.mediaDevices.getUserMedia).mockReset();
    vi.mocked(navigator.mediaDevices.enumerateDevices).mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete (window as RpcWindow).__MILADY_ELECTROBUN_RPC__;
    delete (globalThis as RpcGlobal).__MILADY_ELECTROBUN_RPC__;
  });

  it("renders web informational message when isWebPlatform() is true", async () => {
    mockIsWeb.mockReturnValue(true);
    mockIsDesktop.mockReturnValue(false);
    mockUseApp.mockReturnValue(baseContext());

    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(PermissionsSection));
    });

    const root = tree?.root;
    const webInfo = root.findByProps({ "data-testid": "web-permissions-info" });
    expect(webInfo).toBeDefined();
    const text = collectText(root);
    expect(text).toContain("Browser Permissions");
    expect(text).toContain("Camera");
    expect(text).toContain("Microphone");
  });

  it("renders mobile streaming permissions when isNative and not running in the desktop app", async () => {
    mockIsWeb.mockReturnValue(false);
    mockIsDesktop.mockReturnValue(false);
    mockIsNative.value = true;
    mockGetWebsiteBlockerStatus.mockResolvedValue({
      available: true,
      active: false,
      hostsFilePath: null,
      endsAt: null,
      websites: [],
      canUnblockEarly: true,
      requiresElevation: true,
      engine: "vpn-dns",
      platform: "android",
      supportsElevationPrompt: true,
      elevationPromptMethod: "vpn-consent",
    });
    mockGetPermission.mockResolvedValue({
      id: "website-blocking",
      status: "not-determined",
      canRequest: true,
      lastChecked: Date.now(),
      reason: "Android needs VPN consent.",
    });
    mockUseApp.mockReturnValue(baseContext());

    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(PermissionsSection));
    });

    const root = tree?.root;
    const mobileView = root.findByProps({
      "data-testid": "mobile-permissions",
    });
    expect(mobileView).toBeDefined();
    const text = collectText(root);
    expect(text).toContain("Streaming Permissions");
    expect(text).toContain("Camera");
    expect(text).toContain("Microphone");
    expect(text).toContain("Website Blocker");
    expect(text).toContain("local VPN DNS profile");
  });

  it("renders iPhone website blocker copy for the Safari content blocker path", async () => {
    mockIsWeb.mockReturnValue(false);
    mockIsDesktop.mockReturnValue(false);
    mockIsNative.value = true;
    mockGetWebsiteBlockerStatus.mockResolvedValue({
      available: true,
      active: false,
      hostsFilePath: null,
      endsAt: null,
      websites: [],
      canUnblockEarly: true,
      requiresElevation: true,
      engine: "content-blocker",
      platform: "ios",
      supportsElevationPrompt: false,
      elevationPromptMethod: "system-settings",
      reason:
        "Enable the Milady Website Blocker extension in iPhone Settings > Safari > Extensions before starting a block.",
    });
    mockGetPermission.mockResolvedValue({
      id: "website-blocking",
      status: "not-determined",
      canRequest: true,
      lastChecked: Date.now(),
      reason:
        "Enable the Milady Website Blocker extension in iPhone Settings > Safari > Extensions before starting a block.",
    });
    mockUseApp.mockReturnValue(baseContext());

    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(PermissionsSection));
    });

    const root = tree?.root;
    const text = collectText(root);
    expect(text).toContain("Website Blocker");
    expect(text).toContain("Safari content blocker");
    expect(text).toContain("Settings > Safari > Extensions");
  });

  it("renders desktop permission rows in the desktop app", async () => {
    mockIsWeb.mockReturnValue(false);
    mockIsDesktop.mockReturnValue(true);
    mockIsNative.value = false;
    mockUseApp.mockReturnValue(baseContext());

    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(PermissionsSection));
    });

    const root = tree?.root;
    const text = collectText(root);
    // Should show system permissions section with permission rows
    expect(text).toContain("System Permissions");
    expect(text).toContain("Website Blocker");
    expect(text).toContain("appsview.Capabilities");
  });

  it("starts a website block from the desktop settings card", async () => {
    mockUseApp.mockReturnValue(baseContext());

    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(PermissionsSection));
    });

    const root = tree?.root;
    expect(root).toBeDefined();
    if (!root) {
      throw new Error("PermissionsSection root not rendered");
    }

    const websitesField = root.findByProps({
      "data-testid": "website-blocker-input",
    });
    const durationField = root.findByProps({
      "data-testid": "website-blocker-duration",
    });
    const startButton = root.findByProps({ children: "Start Block" });

    await act(async () => {
      websitesField.props.onChange({
        target: { value: "x.com\ntwitter.com" },
      });
      durationField.props.onChange({
        target: { value: "45" },
      });
    });

    await act(async () => {
      startButton.props.onClick();
    });

    expect(mockStartWebsiteBlock).toHaveBeenCalledWith({
      websites: ["x.com", "twitter.com"],
      durationMinutes: 45,
      text: "x.com\ntwitter.com",
    });
  });

  it("uses the Electrobun bridge for permission requests", async () => {
    mockUseApp.mockReturnValue(baseContext());
    mockInvokeDesktopBridgeRequest.mockImplementation(
      async (options: { rpcMethod: string; params?: { id?: string } }) => {
        if (options.rpcMethod === "permissionsGetAll") {
          return defaultPermissions;
        }
        if (options.rpcMethod === "permissionsIsShellEnabled") {
          return true;
        }
        if (options.rpcMethod === "permissionsRequest") {
          return {
            id: options.params?.id ?? "microphone",
            status: "granted",
            canRequest: false,
            lastChecked: Date.now(),
          };
        }
        return null;
      },
    );

    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(PermissionsSection));
    });

    const requestButton = tree?.root.findByProps({ children: "Grant" });
    expect(requestButton).toBeDefined();

    await act(async () => {
      requestButton?.props.onClick();
    });

    expect(mockInvokeDesktopBridgeRequest).toHaveBeenCalledWith({
      rpcMethod: "permissionsRequest",
      ipcChannel: "permissions:request",
      params: { id: "microphone" },
    });
    expect(mockRequestPermission).not.toHaveBeenCalled();
  });

  it("uses fallback Open Settings copy instead of raw translation keys", async () => {
    mockUseApp.mockReturnValue(baseContext());
    mockInvokeDesktopBridgeRequest.mockImplementation(
      async (options: { rpcMethod: string }) => {
        if (options.rpcMethod === "permissionsGetAll") {
          return {
            ...defaultPermissions,
            camera: {
              id: "camera",
              status: "denied",
              canRequest: false,
            },
          };
        }
        if (options.rpcMethod === "permissionsIsShellEnabled") {
          return true;
        }
        if (options.rpcMethod === "permissionsGetPlatform") {
          return "darwin";
        }
        return null;
      },
    );

    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(PermissionsSection));
    });

    const text = collectText(tree?.root);
    expect(text).toContain("Open Settings");
    expect(text).not.toContain("permissionssection.OpenSettings");
  });

  it("shows plain-English permission badges in desktop settings", async () => {
    mockUseApp.mockReturnValue(baseContext());
    mockInvokeDesktopBridgeRequest.mockImplementation(
      async (options: { rpcMethod: string }) => {
        if (options.rpcMethod === "permissionsGetAll") {
          return {
            ...defaultPermissions,
            "screen-recording": {
              id: "screen-recording",
              status: "denied",
              canRequest: false,
            },
          };
        }
        if (options.rpcMethod === "permissionsIsShellEnabled") {
          return true;
        }
        if (options.rpcMethod === "permissionsGetPlatform") {
          return "darwin";
        }
        return null;
      },
    );

    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(PermissionsSection));
    });

    const text = collectText(tree?.root);
    expect(text).toContain("Off in Settings");
    expect(text).toContain("Not Asked");
    expect(text).not.toContain("Denied");
    expect(text).not.toContain("Not Set");
  });

  it("reconciles camera status from renderer permissions when already granted", async () => {
    mockUseApp.mockReturnValue(baseContext());
    mockInvokeDesktopBridgeRequest.mockImplementation(
      async (options: { rpcMethod: string }) => {
        if (options.rpcMethod === "permissionsGetAll") {
          return {
            ...defaultPermissions,
            camera: {
              id: "camera",
              status: "not-determined",
              canRequest: true,
            },
          };
        }
        if (options.rpcMethod === "permissionsIsShellEnabled") {
          return true;
        }
        if (options.rpcMethod === "permissionsGetPlatform") {
          return "darwin";
        }
        return null;
      },
    );
    vi.mocked(navigator.permissions.query).mockImplementation(
      async ({ name }: { name: PermissionName }) =>
        ({
          state:
            name === "camera"
              ? "granted"
              : name === "microphone"
                ? "prompt"
                : "prompt",
        }) as PermissionStatus,
    );

    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(PermissionsSection));
    });

    const root = tree?.root;
    expect(root).toBeDefined();
    if (!root) {
      throw new Error("PermissionsSection root not rendered");
    }

    expect(findButtonsByAriaLabel(root, "Check Access Camera")).toHaveLength(0);
    expect(collectText(root)).toContain("Granted");
  });

  it("does not reconcile renderer camera state on win32 desktop", async () => {
    mockUseApp.mockReturnValue(baseContext());
    mockInvokeDesktopBridgeRequest.mockImplementation(
      async (options: { rpcMethod: string }) => {
        if (options.rpcMethod === "permissionsGetAll") {
          return {
            ...defaultPermissions,
            camera: {
              id: "camera",
              status: "not-determined",
              canRequest: true,
            },
          };
        }
        if (options.rpcMethod === "permissionsIsShellEnabled") {
          return true;
        }
        if (options.rpcMethod === "permissionsGetPlatform") {
          return "win32";
        }
        return null;
      },
    );
    vi.mocked(navigator.permissions.query).mockImplementation(
      async () =>
        ({
          state: "granted",
        }) as PermissionStatus,
    );

    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(PermissionsSection));
    });

    const root = tree?.root;
    expect(root).toBeDefined();
    if (!root) {
      throw new Error("PermissionsSection root not rendered");
    }

    expect(
      findButtonsByAriaLabel(root, "Open Privacy Settings Camera"),
    ).toHaveLength(1);
    expect(collectText(root)).toContain("Not Asked");
    expect(collectText(root)).toContain(
      "Windows may not list Milady as a named app here.",
    );
  });

  it("uses the desktop bridge for camera permission requests", async () => {
    mockUseApp.mockReturnValue(baseContext());
    mockInvokeDesktopBridgeRequest.mockImplementation(
      async (options: { rpcMethod: string }) => {
        if (options.rpcMethod === "permissionsGetAll") {
          return {
            ...defaultPermissions,
            camera: {
              id: "camera",
              status: "not-determined",
              canRequest: true,
            },
          };
        }
        if (options.rpcMethod === "permissionsIsShellEnabled") {
          return true;
        }
        if (options.rpcMethod === "permissionsGetPlatform") {
          return "darwin";
        }
        return null;
      },
    );
    vi.mocked(navigator.permissions.query).mockImplementation(
      async ({ name }: { name: PermissionName }) =>
        ({
          state:
            name === "camera"
              ? "prompt"
              : name === "microphone"
                ? "prompt"
                : "prompt",
        }) as PermissionStatus,
    );
    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(PermissionsSection));
    });

    const root = tree?.root;
    expect(root).toBeDefined();
    if (!root) {
      throw new Error("PermissionsSection root not rendered");
    }

    const requestButton = findButtonsByAriaLabel(
      root,
      "Check Access Camera",
    )[0];
    expect(requestButton).toBeDefined();

    mockInvokeDesktopBridgeRequest.mockClear();

    await act(async () => {
      requestButton.props.onClick();
    });

    expect(mockInvokeDesktopBridgeRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        rpcMethod: "permissionsRequest",
        params: { id: "camera" },
      }),
    );
  });

  it("opens Windows privacy settings for win32 microphone and camera instead of implying direct grant", async () => {
    mockUseApp.mockReturnValue(baseContext());
    mockInvokeDesktopBridgeRequest.mockImplementation(
      async (options: { rpcMethod: string }) => {
        if (options.rpcMethod === "permissionsGetAll") {
          return {
            ...defaultPermissions,
            microphone: {
              id: "microphone",
              status: "not-determined",
              canRequest: true,
            },
            camera: {
              id: "camera",
              status: "not-determined",
              canRequest: true,
            },
          };
        }
        if (options.rpcMethod === "permissionsIsShellEnabled") {
          return true;
        }
        if (options.rpcMethod === "permissionsGetPlatform") {
          return "win32";
        }
        return null;
      },
    );

    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(PermissionsSection));
    });

    const root = tree?.root;
    expect(root).toBeDefined();
    if (!root) {
      throw new Error("PermissionsSection root not rendered");
    }

    expect(
      findButtonsByAriaLabel(root, "Open Privacy Settings Microphone"),
    ).toHaveLength(1);
    expect(
      findButtonsByAriaLabel(root, "Open Privacy Settings Camera"),
    ).toHaveLength(1);
    expect(collectText(root)).toContain(
      "Open Windows privacy settings for microphone and camera, then verify access by using those features in Milady.",
    );
  });

  it("uses the Electrobun bridge for permission refresh", async () => {
    mockUseApp.mockReturnValue(baseContext());

    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(PermissionsSection));
    });

    mockInvokeDesktopBridgeRequest.mockClear();

    const refreshButton = tree?.root.findByProps({
      "data-testid": "permissions-refresh-button",
    });
    expect(refreshButton).toBeDefined();

    await act(async () => {
      refreshButton.props.onClick();
    });

    expect(mockInvokeDesktopBridgeRequest).toHaveBeenCalledWith({
      rpcMethod: "permissionsGetAll",
      ipcChannel: "permissions:getAll",
      params: { forceRefresh: true },
    });
    expect(mockRefreshPermissions).not.toHaveBeenCalled();
  });

  it("rechecks permissions after opening settings", async () => {
    vi.useFakeTimers();

    try {
      mockUseApp.mockReturnValue(baseContext());
      mockInvokeDesktopBridgeRequest.mockImplementation(
        async (options: { rpcMethod: string }) => {
          if (options.rpcMethod === "permissionsGetAll") {
            return {
              ...defaultPermissions,
              camera: {
                id: "camera",
                status: "denied",
                canRequest: false,
              },
            };
          }
          if (options.rpcMethod === "permissionsIsShellEnabled") {
            return true;
          }
          if (options.rpcMethod === "permissionsGetPlatform") {
            return "darwin";
          }
          return null;
        },
      );

      let tree: TestRenderer.ReactTestRenderer | undefined;
      await act(async () => {
        tree = TestRenderer.create(React.createElement(PermissionsSection));
      });

      const root = tree?.root;
      expect(root).toBeDefined();
      if (!root) {
        throw new Error("PermissionsSection root not rendered");
      }

      const openSettingsButton = findButtonsByAriaLabel(
        root,
        "Open Settings Camera",
      )[0];
      expect(openSettingsButton).toBeDefined();

      mockInvokeDesktopBridgeRequest.mockClear();

      await act(async () => {
        openSettingsButton.props.onClick();
        await Promise.resolve();
      });

      const countRefreshCalls = () =>
        mockInvokeDesktopBridgeRequest.mock.calls.filter(
          ([options]) => options.rpcMethod === "permissionsGetAll",
        ).length;

      expect(countRefreshCalls()).toBe(1);

      await act(async () => {
        vi.advanceTimersByTime(1500);
        await Promise.resolve();
      });
      expect(countRefreshCalls()).toBe(2);

      await act(async () => {
        vi.advanceTimersByTime(2500);
        await Promise.resolve();
      });
      expect(countRefreshCalls()).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("refreshes from the bridge when permissionsChanged fires", async () => {
    mockUseApp.mockReturnValue(baseContext());

    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(PermissionsSection));
    });

    expect(tree).toBeDefined();
    mockInvokeDesktopBridgeRequest.mockClear();

    await act(async () => {
      permissionBridgeListener.current?.({ id: "microphone" });
    });

    expect(mockInvokeDesktopBridgeRequest).toHaveBeenCalledWith({
      rpcMethod: "permissionsGetAll",
      ipcChannel: "permissions:getAll",
      params: { forceRefresh: true },
    });
  });
});
