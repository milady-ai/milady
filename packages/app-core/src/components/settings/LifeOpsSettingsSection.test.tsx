// @vitest-environment jsdom

import type {
  LifeOpsConnectorSide,
  LifeOpsGoogleConnectorStatus,
} from "@miladyai/shared/contracts/lifeops";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockUseGoogleLifeOpsConnector, mockClientGetBaseUrl } = vi.hoisted(
  () => ({
    mockUseGoogleLifeOpsConnector: vi.fn(),
    mockClientGetBaseUrl: vi.fn(),
  }),
);

vi.mock("../../hooks", () => ({
  useGoogleLifeOpsConnector: (options?: { side?: LifeOpsConnectorSide }) =>
    mockUseGoogleLifeOpsConnector(options),
}));

vi.mock("../../api", () => ({
  client: {
    getBaseUrl: () => mockClientGetBaseUrl(),
  },
}));

vi.mock("../../state", () => ({
  useApp: () => ({
    setState: vi.fn(),
    t: (key: string, vars?: Record<string, unknown>) =>
      typeof vars?.defaultValue === "string" ? vars.defaultValue : key,
  }),
}));

vi.mock("../connectors/LifeOpsBrowserSetupPanel", () => ({
  LifeOpsBrowserSetupPanel: () =>
    React.createElement("div", null, "lifeops-browser-setup-panel"),
}));

vi.mock("@miladyai/ui", () => {
  const passthrough = ({
    children,
    ...props
  }: React.PropsWithChildren<Record<string, unknown>>) =>
    React.createElement("div", props, children);
  return {
    Badge: passthrough,
    Button: ({
      children,
      ...props
    }: React.PropsWithChildren<Record<string, unknown>>) =>
      React.createElement("button", { type: "button", ...props }, children),
    Card: passthrough,
    CardContent: passthrough,
    CardHeader: passthrough,
    CardTitle: passthrough,
  };
});

vi.mock("lucide-react", () => ({
  CalendarDays: () => React.createElement("span", null, "calendar"),
  Copy: () => React.createElement("span", null, "copy"),
  Download: () => React.createElement("span", null, "download"),
  FolderOpen: () => React.createElement("span", null, "folder"),
  Mail: () => React.createElement("span", null, "mail"),
  Package: () => React.createElement("span", null, "package"),
  Plug2: () => React.createElement("span", null, "plug"),
  RefreshCw: () => React.createElement("span", null, "refresh"),
  ShieldCheck: () => React.createElement("span", null, "shield"),
  Sparkles: () => React.createElement("span", null, "sparkles"),
}));

import { LifeOpsSettingsSection } from "./LifeOpsSettingsSection";

function buildStatus(
  side: LifeOpsConnectorSide,
  overrides: Partial<LifeOpsGoogleConnectorStatus> = {},
): LifeOpsGoogleConnectorStatus {
  return {
    provider: "google",
    side,
    mode: "cloud_managed",
    defaultMode: "cloud_managed",
    availableModes: ["cloud_managed", "local"],
    executionTarget: "cloud",
    sourceOfTruth: "cloud_connection",
    configured: true,
    connected: false,
    reason: "disconnected",
    preferredByAgent: false,
    cloudConnectionId: null,
    identity: null,
    grantedCapabilities: [],
    grantedScopes: [],
    expiresAt: null,
    hasRefreshToken: false,
    grant: null,
    ...overrides,
  };
}

function buildController(
  side: LifeOpsConnectorSide,
  overrides: Record<string, unknown> = {},
) {
  return {
    activeMode: "cloud_managed",
    actionPending: false,
    connect: vi.fn(),
    disconnect: vi.fn(),
    error: null,
    loading: false,
    modeOptions: ["cloud_managed", "local"],
    refresh: vi.fn(),
    selectMode: vi.fn(),
    selectedMode: "cloud_managed",
    side,
    status: buildStatus(side),
    ...overrides,
  };
}

function flattenText(node: TestRenderer.ReactTestInstance): string {
  return node.children
    .map((child) => {
      if (typeof child === "string") {
        return child;
      }
      return flattenText(child);
    })
    .join(" ");
}

describe("LifeOpsSettingsSection", () => {
  beforeEach(() => {
    mockClientGetBaseUrl.mockReset();
    mockUseGoogleLifeOpsConnector.mockReset();
    mockClientGetBaseUrl.mockReturnValue("http://127.0.0.1:3000");
  });

  it("renders separate owner and agent setup cards with local instructions", () => {
    const ownerConnector = buildController("owner", {
      activeMode: "local",
      selectedMode: "local",
      status: buildStatus("owner", {
        mode: "local",
        availableModes: ["cloud_managed"],
        executionTarget: "local",
        sourceOfTruth: "local_storage",
        configured: false,
        reason: "config_missing",
      }),
    });
    const agentConnector = buildController("agent", {
      status: buildStatus("agent", {
        connected: true,
        reason: "connected",
        preferredByAgent: true,
        identity: {
          name: "Agent Example",
          email: "agent@example.com",
        },
      }),
    });
    mockUseGoogleLifeOpsConnector.mockImplementation(
      (options?: { side?: LifeOpsConnectorSide }) =>
        options?.side === "agent" ? agentConnector : ownerConnector,
    );

    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(LifeOpsSettingsSection),
      );
    });

    const text = flattenText(renderer.root);
    expect(mockUseGoogleLifeOpsConnector).toHaveBeenCalledWith({
      side: "owner",
    });
    expect(mockUseGoogleLifeOpsConnector).toHaveBeenCalledWith({
      side: "agent",
    });
    expect(text).toContain("Owner setup");
    expect(text).toContain("Agent setup");
    expect(text).toContain("lifeops-browser-setup-panel");
    expect(text).toContain("Local desktop OAuth");
    expect(text).toContain("MILADY_GOOGLE_OAUTH_DESKTOP_CLIENT_ID");
    expect(text).toContain(
      "http://127.0.0.1:3000/api/lifeops/connectors/google/callback",
    );
    expect(text).toContain("Agent Example");
    expect(text).toContain("agent@example.com");
  });

  it("wires owner-side refresh, connect, and mode selection actions", async () => {
    const ownerRefresh = vi.fn();
    const ownerConnect = vi.fn();
    const ownerSelectMode = vi.fn();
    const agentConnect = vi.fn();
    const ownerConnector = buildController("owner", {
      refresh: ownerRefresh,
      connect: ownerConnect,
      selectMode: ownerSelectMode,
    });
    const agentConnector = buildController("agent", {
      connect: agentConnect,
      status: buildStatus("agent", {
        connected: true,
        reason: "connected",
        identity: {
          email: "agent@example.com",
        },
      }),
    });
    mockUseGoogleLifeOpsConnector.mockImplementation(
      (options?: { side?: LifeOpsConnectorSide }) =>
        options?.side === "agent" ? agentConnector : ownerConnector,
    );

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(LifeOpsSettingsSection),
      );
    });

    await act(async () => {
      renderer.root
        .findAllByType("button")
        .find((button) => button.props["aria-label"] === "Refresh Owner setup")
        ?.props.onClick();
      renderer.root
        .findAllByType("button")
        .find((button) => button.props["aria-label"] === "Connect Owner setup")
        ?.props.onClick();
      renderer.root
        .findAllByType("button")
        .find(
          (button) => button.props["aria-label"] === "Owner setup Local mode",
        )
        ?.props.onClick();
    });

    expect(ownerRefresh).toHaveBeenCalledTimes(1);
    expect(ownerConnect).toHaveBeenCalledTimes(1);
    expect(ownerSelectMode).toHaveBeenCalledWith("local");
    expect(agentConnect).not.toHaveBeenCalled();
  });
});
