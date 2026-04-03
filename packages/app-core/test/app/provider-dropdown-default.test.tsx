import React from "react";
import {
  act,
  create,
  type ReactTestInstance,
  type ReactTestRenderer,
} from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

type MockSelectProps = {
  value: string;
  onValueChange: (value: string) => void;
  children?: React.ReactNode;
};

type MockChildrenProps = {
  children?: React.ReactNode;
};

type MockSelectItemProps = {
  value: string;
  disabled?: boolean;
  children?: React.ReactNode;
};

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetConfig = vi.fn();
const mockGetOnboardingOptions = vi.fn();
const mockGetSubscriptionStatus = vi.fn();
const mockUpdateConfig = vi.fn();
const mockSwitchProvider = vi.fn();

vi.mock("@miladyai/app-core/api", () => ({
  client: {
    getConfig: (...args: unknown[]) => mockGetConfig(...args),
    getOnboardingOptions: (...args: unknown[]) =>
      mockGetOnboardingOptions(...args),
    getSubscriptionStatus: (...args: unknown[]) =>
      mockGetSubscriptionStatus(...args),
    updateConfig: (...args: unknown[]) => mockUpdateConfig(...args),
    switchProvider: (...args: unknown[]) => mockSwitchProvider(...args),
  },
}));

vi.mock("@miladyai/app-core/components", async () => {
  const actual = await vi.importActual<
    typeof import("@miladyai/app-core/components")
  >("@miladyai/app-core/components");
  return {
    ...actual,
    ApiKeyConfig: () => null,
    SubscriptionStatus: () => null,
  };
});
vi.mock("@miladyai/app-core/config", () => ({
  ConfigRenderer: () => null,
  defaultRegistry: {},
}));

vi.mock("@miladyai/ui", async () => {
  const actual =
    await vi.importActual<typeof import("@miladyai/ui")>("@miladyai/ui");
  return {
    ...actual,
    Select: ({ value, onValueChange, children }: MockSelectProps) => (
      <select
        value={value}
        onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
          onValueChange(e.target.value)
        }
      >
        {children}
      </select>
    ),
    SelectTrigger: ({ children }: MockChildrenProps) => <>{children}</>,
    SelectValue: () => null,
    SelectContent: ({ children }: MockChildrenProps) => <>{children}</>,
    SelectItem: ({ value, disabled, children }: MockSelectItemProps) => (
      <option value={value} disabled={disabled}>
        {children}
      </option>
    ),
  };
});

import { ProviderSwitcher } from "@miladyai/app-core/components";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultProps() {
  return {
    elizaCloudEnabled: false,
    elizaCloudConnected: false,
    elizaCloudCredits: null,
    elizaCloudCreditsLow: false,
    elizaCloudCreditsCritical: false,
    elizaCloudTopUpUrl: "",
    elizaCloudUserId: null,
    elizaCloudLoginBusy: false,
    elizaCloudLoginError: null,
    cloudDisconnecting: false,
    plugins: [
      {
        id: "plugin-anthropic",
        name: "Anthropic",
        category: "ai-provider",
        enabled: true,
        configured: true,
        parameters: [],
      },
    ],
    pluginSaving: new Set<string>(),
    pluginSaveSuccess: new Set<string>(),
    loadPlugins: vi.fn(async () => {}),
    handlePluginToggle: vi.fn(async () => {}),
    handlePluginConfigSave: vi.fn(),
    handleCloudLogin: vi.fn(async () => {}),
    handleCloudDisconnect: vi.fn(async () => {}),
    setState: vi.fn(),
    setTab: vi.fn(),
  };
}

function getSelectValue(tree: ReactTestRenderer): string | undefined {
  const root = tree.root;
  const selects = root.findAll(
    (node: ReactTestInstance) =>
      node.type === "select" && node.props.value !== undefined,
  );
  return selects.length > 0 ? selects[0].props.value : undefined;
}

function getSelect(tree: ReactTestRenderer): ReactTestInstance {
  const root = tree.root;
  return root.find(
    (node: ReactTestInstance) =>
      node.type === "select" && node.props.value !== undefined,
  );
}

function getSelectOptionLabels(tree: ReactTestRenderer): string[] {
  return getSelect(tree)
    .findAll((node: ReactTestInstance) => node.type === "option")
    .map((node) => {
      const children = node.props.children;
      if (typeof children === "string") {
        return children;
      }
      if (Array.isArray(children)) {
        return children.join("");
      }
      return String(children ?? "");
    });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ProviderSwitcher provider dropdown default", () => {
  beforeEach(() => {
    mockGetConfig.mockReset();
    mockGetOnboardingOptions.mockReset();
    mockGetSubscriptionStatus.mockReset();
    mockUpdateConfig.mockReset();
    mockSwitchProvider.mockReset();
    mockUpdateConfig.mockResolvedValue({ ok: true });
    mockSwitchProvider.mockResolvedValue({ ok: true });
  });

  it("uses canonical service routing as the authoritative local provider selection", async () => {
    mockGetConfig.mockResolvedValue({
      serviceRouting: {
        llmText: {
          backend: "anthropic",
          transport: "direct",
        },
      },
      models: {},
      cloud: { enabled: false },
      agents: {},
      env: { vars: {} },
    });
    mockGetOnboardingOptions.mockResolvedValue({
      models: [],
      piAiModels: [],
      piAiDefaultModel: "",
    });
    mockGetSubscriptionStatus.mockResolvedValue({ providers: [] });

    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = create(React.createElement(ProviderSwitcher, defaultProps()));
    });

    // Let the async config load settle
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    const selectValue = getSelectValue(tree);
    expect(selectValue).toBe("anthropic");
  });

  it("selects __cloud__ when config returns cloud inference enabled", async () => {
    mockGetConfig.mockResolvedValue({
      models: {},
      cloud: {
        enabled: true,
        inferenceMode: "cloud",
        services: { inference: true },
      },
      agents: {},
      env: { vars: {} },
    });
    mockGetOnboardingOptions.mockResolvedValue({
      models: [],
      piAiModels: [],
      piAiDefaultModel: "",
    });
    mockGetSubscriptionStatus.mockResolvedValue({ providers: [] });

    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = create(
        React.createElement(ProviderSwitcher, {
          ...defaultProps(),
          elizaCloudEnabled: true,
        }),
      );
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    const selectValue = getSelectValue(tree);
    expect(selectValue).toBe("__cloud__");
  });

  it("switches to subscription providers even when plugin ids use short slugs", async () => {
    mockGetConfig.mockResolvedValue({
      models: {},
      cloud: {
        enabled: true,
        inferenceMode: "cloud",
        services: { inference: true },
      },
      agents: {},
      env: { vars: {} },
    });
    mockGetOnboardingOptions.mockResolvedValue({
      models: [],
      piAiModels: [],
      piAiDefaultModel: "",
    });
    mockGetSubscriptionStatus.mockResolvedValue({
      providers: [
        {
          provider: "anthropic-subscription",
          configured: true,
          valid: true,
          expiresAt: null,
        },
      ],
    });

    const handlePluginToggle = vi.fn(async () => {});

    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = create(
        React.createElement(ProviderSwitcher, {
          ...defaultProps(),
          elizaCloudEnabled: true,
          plugins: [
            {
              id: "plugin-openai",
              name: "OpenAI",
              category: "ai-provider",
              enabled: true,
              configured: true,
              parameters: [],
            },
            {
              id: "plugin-anthropic",
              name: "Anthropic",
              category: "ai-provider",
              enabled: false,
              configured: true,
              parameters: [],
            },
          ],
          handlePluginToggle,
        }),
      );
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    await act(async () => {
      getSelect(tree).props.onChange({
        target: { value: "anthropic-subscription" },
      });
      await Promise.resolve();
    });

    expect(mockSwitchProvider).toHaveBeenCalledWith("anthropic-subscription");
    expect(mockUpdateConfig).not.toHaveBeenCalled();
    expect(handlePluginToggle).not.toHaveBeenCalled();
  });

  it("restores Claude Subscription from saved config instead of collapsing to anthropic", async () => {
    mockGetConfig.mockResolvedValue({
      models: {},
      cloud: {
        enabled: false,
        inferenceMode: "byok",
        services: { inference: false },
      },
      agents: {
        defaults: {
          subscriptionProvider: "anthropic-subscription",
        },
      },
      env: { vars: {} },
    });
    mockGetOnboardingOptions.mockResolvedValue({
      models: [],
      piAiModels: [],
      piAiDefaultModel: "",
    });
    mockGetSubscriptionStatus.mockResolvedValue({ providers: [] });

    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = create(React.createElement(ProviderSwitcher, defaultProps()));
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(getSelectValue(tree)).toBe("anthropic-subscription");
  });

  it("shows plain-English subscription labels instead of raw translation keys", async () => {
    mockGetConfig.mockResolvedValue({
      models: {},
      cloud: {
        enabled: false,
        inferenceMode: "byok",
        services: { inference: false },
      },
      agents: {},
      env: { vars: {} },
    });
    mockGetOnboardingOptions.mockResolvedValue({
      models: [],
      piAiModels: [],
      piAiDefaultModel: "",
    });
    mockGetSubscriptionStatus.mockResolvedValue({ providers: [] });

    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = create(React.createElement(ProviderSwitcher, defaultProps()));
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    const optionLabels = getSelectOptionLabels(tree);
    expect(optionLabels).toContain("Claude Subscription");
    expect(optionLabels).toContain("ChatGPT Subscription");
    expect(optionLabels).not.toContain("providerswitcher.claudeSubscription");
    expect(optionLabels).not.toContain("providerswitcher.chatgptSubscription");
  });

  it("does not carry a stale non-pi model override when switching to pi-ai", async () => {
    mockGetConfig.mockResolvedValue({
      serviceRouting: {
        llmText: {
          backend: "openai",
          transport: "direct",
        },
      },
      models: {},
      cloud: {
        enabled: false,
        inferenceMode: "byok",
        services: { inference: false },
      },
      agents: {
        defaults: {
          model: {
            primary: "openai/gpt-5.2",
          },
        },
      },
      env: { vars: {} },
    });
    mockGetOnboardingOptions.mockResolvedValue({
      models: [],
      piAiModels: [],
      piAiDefaultModel: "",
    });
    mockGetSubscriptionStatus.mockResolvedValue({ providers: [] });

    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = create(React.createElement(ProviderSwitcher, defaultProps()));
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    await act(async () => {
      getSelect(tree).props.onChange({ target: { value: "pi-ai" } });
      await Promise.resolve();
    });

    expect(mockSwitchProvider).toHaveBeenCalledWith(
      "pi-ai",
      undefined,
      undefined,
    );
    expect(mockUpdateConfig).not.toHaveBeenCalled();
  });
});
