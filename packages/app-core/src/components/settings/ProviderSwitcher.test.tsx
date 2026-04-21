import React from "react";
import {
  act,
  create,
  type ReactTestInstance,
  type ReactTestRenderer,
} from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProviderSwitcher } from "./ProviderSwitcher";

type MockSelectProps = {
  value: string;
  onValueChange: (value: string) => void;
  children?: React.ReactNode;
} & React.SelectHTMLAttributes<HTMLSelectElement>;

type MockChildrenProps = {
  children?: React.ReactNode;
};

type MockSelectItemProps = {
  value: string;
  disabled?: boolean;
  children?: React.ReactNode;
};

type MockConfigRendererProps = {
  onChange?: (key: string, value: unknown) => void;
};

const mockGetConfig = vi.fn();
const mockGetOnboardingOptions = vi.fn();
const mockGetSubscriptionStatus = vi.fn();
const mockSwitchProvider = vi.fn();
const mockUpdateConfig = vi.fn();
const mockRestartAgent = vi.fn();
const mockUseApp = vi.fn();
const mockUseBranding = vi.fn();
const mockOpenExternalUrl = vi.fn();
const mockSetActionNotice = vi.fn();

vi.mock("../../api", () => ({
  client: {
    getConfig: (...args: unknown[]) => mockGetConfig(...args),
    getOnboardingOptions: (...args: unknown[]) =>
      mockGetOnboardingOptions(...args),
    getSubscriptionStatus: (...args: unknown[]) =>
      mockGetSubscriptionStatus(...args),
    switchProvider: (...args: unknown[]) => mockSwitchProvider(...args),
    updateConfig: (...args: unknown[]) => mockUpdateConfig(...args),
    restartAgent: (...args: unknown[]) => mockRestartAgent(...args),
  },
}));

vi.mock("../../state", () => ({
  useApp: () => mockUseApp(),
}));

vi.mock("../../config", () => ({
  ConfigRenderer: ({ onChange }: MockConfigRendererProps) => (
    <>
      <button onClick={() => onChange?.("small", "cloud-small-2")}>
        mock-set-small-model
      </button>
      <button onClick={() => onChange?.("large", "cloud-large-2")}>
        mock-set-large-model
      </button>
    </>
  ),
  defaultRegistry: {},
}));

vi.mock("../../config/branding", () => ({
  useBranding: () => mockUseBranding(),
}));

vi.mock("../../hooks", () => ({
  useTimeout: () => ({ setTimeout }),
}));

vi.mock("../../utils", () => ({
  openExternalUrl: (...args: unknown[]) => mockOpenExternalUrl(...args),
}));

vi.mock("./ApiKeyConfig", () => ({
  ApiKeyConfig: () => null,
}));

vi.mock("./SubscriptionStatus", () => ({
  SubscriptionStatus: () => null,
}));

vi.mock("@miladyai/ui", () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} />
  ),
  Select: ({ value, onValueChange, children, ...props }: MockSelectProps) => (
    <select
      {...props}
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
}));

function defaultProps() {
  return {
    elizaCloudEnabled: true,
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

function getSelect(tree: ReactTestRenderer): ReactTestInstance {
  // The component places id="provider-switcher-select" on <SelectTrigger>,
  // not on <Select>.  Our mock renders <Select> as a plain <select> and
  // <SelectTrigger> as a fragment, so the id is discarded.  Match the
  // provider-switcher <select> by grabbing the first <select> with a value.
  const matches = tree.root.findAll(
    (node: ReactTestInstance) =>
      node.type === "select" && node.props.value !== undefined,
  );
  if (matches.length === 0) {
    throw new Error("No <select> with a value prop found");
  }
  return matches[0];
}

function getSelectValue(tree: ReactTestRenderer): string | undefined {
  return getSelect(tree).props.value;
}

function getButtonByText(
  tree: ReactTestRenderer,
  text: string,
): ReactTestInstance {
  const matches = tree.root.findAll(
    (node: ReactTestInstance) =>
      node.type === "button" && node.children.join("") === text,
  );
  if (matches.length === 0) {
    throw new Error(`Button not found: ${text}`);
  }
  return matches[0];
}

function getInputByPlaceholder(
  tree: ReactTestRenderer,
  placeholder: string,
): ReactTestInstance {
  const matches = tree.root.findAll(
    (node: ReactTestInstance) =>
      node.type === "input" && node.props.placeholder === placeholder,
  );
  if (matches.length === 0) {
    throw new Error(`Input not found: ${placeholder}`);
  }
  return matches[0];
}

describe("ProviderSwitcher subscription selection behavior", () => {
  beforeEach(() => {
    mockGetConfig.mockReset();
    mockGetOnboardingOptions.mockReset();
    mockGetSubscriptionStatus.mockReset();
    mockSwitchProvider.mockReset();
    mockUpdateConfig.mockReset();
    mockRestartAgent.mockReset();
    mockUseBranding.mockReset();
    mockOpenExternalUrl.mockReset();
    mockSetActionNotice.mockReset();
    mockUseApp.mockReturnValue({
      t: (key: string) => key,
      setActionNotice: (...args: unknown[]) => mockSetActionNotice(...args),
      elizaCloudConnected: false,
      elizaCloudCredits: null,
      elizaCloudCreditsLow: false,
      elizaCloudCreditsCritical: false,
      elizaCloudUserId: null,
      elizaCloudLoginBusy: false,
      elizaCloudLoginError: null,
      elizaCloudDisconnecting: false,
      plugins: [],
      pluginSaving: new Set<string>(),
      pluginSaveSuccess: new Set<string>(),
      loadPlugins: vi.fn(async () => {}),
      handlePluginConfigSave: vi.fn(),
      handleCloudLogin: vi.fn(async () => {}),
      handleCloudDisconnect: vi.fn(async () => {}),
      setState: vi.fn(),
      setTab: vi.fn(),
    });
    mockUseBranding.mockReturnValue({});
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
    mockGetSubscriptionStatus.mockResolvedValue({ providers: [] });
    mockGetOnboardingOptions.mockResolvedValue({
      models: {
        small: [
          {
            id: "cloud-small-1",
            name: "Cloud Small 1",
            provider: "Eliza Cloud",
            description: "Fast",
          },
          {
            id: "cloud-small-2",
            name: "Cloud Small 2",
            provider: "Eliza Cloud",
            description: "Faster",
          },
        ],
        large: [
          {
            id: "cloud-large-1",
            name: "Cloud Large 1",
            provider: "Eliza Cloud",
            description: "Capable",
          },
          {
            id: "cloud-large-2",
            name: "Cloud Large 2",
            provider: "Eliza Cloud",
            description: "More capable",
          },
        ],
      },
      piAiModels: [],
      piAiDefaultModel: "",
    });
    mockSwitchProvider.mockResolvedValue({ ok: true });
    mockUpdateConfig.mockResolvedValue({ ok: true });
    mockRestartAgent.mockResolvedValue({ ok: true });
  });

  it("selects Claude Subscription without switching the runtime immediately", async () => {
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

    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = create(<ProviderSwitcher {...defaultProps()} />);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    await act(async () => {
      getSelect(tree).props.onChange({
        target: { value: "anthropic-subscription" },
      });
      await Promise.resolve();
    });

    expect(getSelectValue(tree)).toBe("anthropic-subscription");
    expect(mockSwitchProvider).not.toHaveBeenCalled();
  });

  it("selects disconnected ChatGPT Subscription without switching the runtime", async () => {
    mockGetSubscriptionStatus.mockResolvedValue({ providers: [] });

    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = create(<ProviderSwitcher {...defaultProps()} />);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    await act(async () => {
      getSelect(tree).props.onChange({
        target: { value: "openai-subscription" },
      });
      await Promise.resolve();
    });

    expect(getSelectValue(tree)).toBe("openai-subscription");
    expect(mockSwitchProvider).not.toHaveBeenCalled();
  });

  it("switches the runtime when ChatGPT Subscription is already connected", async () => {
    mockGetSubscriptionStatus.mockResolvedValue({
      providers: [
        {
          provider: "openai-subscription",
          configured: true,
          valid: true,
          expiresAt: null,
        },
      ],
    });

    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = create(<ProviderSwitcher {...defaultProps()} />);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    await act(async () => {
      getSelect(tree).props.onChange({
        target: { value: "openai-subscription" },
      });
      await Promise.resolve();
    });

    expect(getSelectValue(tree)).toBe("openai-subscription");
    expect(mockSwitchProvider).toHaveBeenCalledWith("openai-subscription");
  });

  it("rolls the UI selection back and surfaces an error when a runtime switch fails", async () => {
    mockGetSubscriptionStatus.mockResolvedValue({
      providers: [
        {
          provider: "openai-subscription",
          configured: true,
          valid: true,
          expiresAt: null,
        },
      ],
    });
    mockSwitchProvider.mockRejectedValueOnce(new Error("switch failed"));

    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = create(<ProviderSwitcher {...defaultProps()} />);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(getSelectValue(tree)).toBe("__cloud__");

    await act(async () => {
      getSelect(tree).props.onChange({
        target: { value: "openai-subscription" },
      });
      await Promise.resolve();
    });

    expect(mockSwitchProvider).toHaveBeenCalledWith("openai-subscription");
    expect(getSelectValue(tree)).toBe("__cloud__");
    expect(mockSetActionNotice).toHaveBeenCalledWith(
      "Failed to update subscription provider: switch failed",
      "error",
      6000,
    );
  });

  it("switches a direct AI provider through the standard provider path", async () => {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = create(<ProviderSwitcher {...defaultProps()} />);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    await act(async () => {
      getSelect(tree).props.onChange({
        target: { value: "openai" },
      });
      await Promise.resolve();
    });

    expect(getSelectValue(tree)).toBe("openai");
    expect(mockSwitchProvider).toHaveBeenCalledWith("openai");
  });

  it("rolls cloud selection back and surfaces an error when Eliza Cloud switching fails", async () => {
    mockGetSubscriptionStatus.mockResolvedValue({
      providers: [
        {
          provider: "openai-subscription",
          configured: true,
          valid: true,
          expiresAt: null,
        },
      ],
    });
    mockGetConfig.mockResolvedValue({
      models: {},
      cloud: {
        enabled: false,
        inferenceMode: "byok",
        services: { inference: false },
      },
      agents: {
        defaults: {
          subscriptionProvider: "openai-subscription",
        },
      },
      env: { vars: {} },
    });
    mockSwitchProvider.mockRejectedValueOnce(new Error("cloud failed"));

    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = create(<ProviderSwitcher {...defaultProps()} />);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(getSelectValue(tree)).toBe("openai-subscription");

    await act(async () => {
      getSelect(tree).props.onChange({
        target: { value: "__cloud__" },
      });
      await Promise.resolve();
    });

    expect(mockSwitchProvider).toHaveBeenCalledWith("elizacloud");
    expect(getSelectValue(tree)).toBe("openai-subscription");
    expect(mockSetActionNotice).toHaveBeenCalledWith(
      "Failed to select Eliza Cloud: cloud failed",
      "error",
      6000,
    );
  });

  it("rolls pi.ai selection back and surfaces an error when enabling pi.ai fails", async () => {
    mockGetSubscriptionStatus.mockResolvedValue({
      providers: [
        {
          provider: "openai-subscription",
          configured: true,
          valid: true,
          expiresAt: null,
        },
      ],
    });
    mockGetConfig.mockResolvedValue({
      models: {},
      cloud: {
        enabled: false,
        inferenceMode: "byok",
        services: { inference: false },
      },
      agents: {
        defaults: {
          subscriptionProvider: "openai-subscription",
        },
      },
      env: { vars: {} },
    });
    mockSwitchProvider.mockRejectedValueOnce(new Error("pi failed"));

    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = create(<ProviderSwitcher {...defaultProps()} />);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(getSelectValue(tree)).toBe("openai-subscription");

    await act(async () => {
      getSelect(tree).props.onChange({
        target: { value: "pi-ai" },
      });
      await Promise.resolve();
    });

    expect(mockSwitchProvider).toHaveBeenCalledWith(
      "pi-ai",
      undefined,
      undefined,
    );
    expect(getSelectValue(tree)).toBe("openai-subscription");
    expect(mockSetActionNotice).toHaveBeenCalledWith(
      "Failed to enable pi.ai: pi failed",
      "error",
      6000,
    );
  });

  it("shows Eliza Cloud billing controls and disconnect flow when cloud is selected", async () => {
    const setState = vi.fn();
    const setTab = vi.fn();
    const handleCloudDisconnect = vi.fn(async () => {});
    mockGetConfig.mockResolvedValue({
      serviceRouting: {
        llmText: {
          backend: "elizacloud",
          transport: "cloud-proxy",
        },
      },
      models: {
        small: "cloud-small-1",
        large: "cloud-large-1",
      },
      cloud: {
        enabled: true,
        inferenceMode: "cloud",
        services: { inference: true },
      },
      agents: {},
      env: { vars: {} },
    });

    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = create(
        <ProviderSwitcher
          {...defaultProps()}
          elizaCloudConnected
          elizaCloudCredits={1.25}
          elizaCloudUserId="cloud-user-123"
          setState={setState}
          setTab={setTab}
          handleCloudDisconnect={handleCloudDisconnect}
        />,
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(getSelectValue(tree)).toBe("__cloud__");

    await act(async () => {
      getButtonByText(tree, "configpageview.TopUp").props.onClick();
      await Promise.resolve();
    });

    expect(setState).toHaveBeenCalledWith("cloudDashboardView", "billing");
    expect(setTab).toHaveBeenCalledWith("settings");

    await act(async () => {
      getButtonByText(tree, "providerswitcher.disconnect").props.onClick();
      await Promise.resolve();
    });

    expect(handleCloudDisconnect).toHaveBeenCalledTimes(1);

    await act(async () => {
      getButtonByText(tree, "mock-set-small-model").props.onClick();
      await Promise.resolve();
    });

    expect(mockUpdateConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        models: expect.objectContaining({
          small: "cloud-small-2",
          large: "cloud-large-1",
        }),
        serviceRouting: expect.objectContaining({
          llmText: expect.objectContaining({
            backend: "elizacloud",
            transport: "cloud-proxy",
            smallModel: "cloud-small-2",
            largeModel: "cloud-large-1",
          }),
        }),
      }),
    );
    expect(mockRestartAgent).toHaveBeenCalledTimes(1);
  });

  it("surfaces cloud model save failures instead of only logging them", async () => {
    mockGetConfig.mockResolvedValue({
      serviceRouting: {
        llmText: {
          backend: "elizacloud",
          transport: "cloud-proxy",
        },
      },
      models: {
        small: "cloud-small-1",
        large: "cloud-large-1",
      },
      cloud: {
        enabled: true,
        inferenceMode: "cloud",
        services: { inference: true },
      },
      agents: {},
      env: { vars: {} },
    });
    mockUpdateConfig.mockRejectedValueOnce(new Error("save failed"));

    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = create(
        <ProviderSwitcher {...defaultProps()} elizaCloudConnected />,
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    await act(async () => {
      getButtonByText(tree, "mock-set-small-model").props.onClick();
      await Promise.resolve();
    });

    expect(mockSetActionNotice).toHaveBeenCalledWith(
      "Failed to save cloud model config: save failed",
      "error",
      6000,
    );
  });

  it("opens the Eliza Cloud bug report template from the login error state", async () => {
    const handleCloudLogin = vi.fn(async () => {});
    mockUseBranding.mockReturnValue({
      bugReportUrl: "https://example.invalid/bug",
    });
    mockGetConfig.mockResolvedValue({
      serviceRouting: {
        llmText: {
          backend: "elizacloud",
          transport: "cloud-proxy",
        },
      },
      models: {},
      cloud: {
        enabled: true,
        inferenceMode: "cloud",
        services: { inference: true },
      },
      agents: {},
      env: { vars: {} },
    });

    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = create(
        <ProviderSwitcher
          {...defaultProps()}
          elizaCloudLoginError="Cloud login broke"
          handleCloudLogin={handleCloudLogin}
        />,
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    await act(async () => {
      getButtonByText(
        tree,
        "providerswitcher.reportIssueWithTemplate",
      ).props.onClick();
      await Promise.resolve();
    });

    expect(mockOpenExternalUrl).toHaveBeenCalledWith(
      "https://example.invalid/bug",
    );

    await act(async () => {
      getButtonByText(
        tree,
        "providerswitcher.logInToElizaCloud",
      ).props.onClick();
      await Promise.resolve();
    });

    expect(handleCloudLogin).toHaveBeenCalledTimes(1);
  });

  it("saves a custom pi.ai model override through the dedicated save flow", async () => {
    mockGetConfig.mockResolvedValue({
      serviceRouting: {
        llmText: {
          backend: "pi-ai",
          transport: "direct",
          primaryModel: "pi/custom-old",
        },
      },
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
      models: { small: [], large: [] },
      piAiModels: [
        {
          id: "pi/default",
          name: "Pi Default",
          provider: "Pi",
          description: "Default",
        },
      ],
      piAiDefaultModel: "pi/default",
    });

    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = create(<ProviderSwitcher {...defaultProps()} />);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(getSelectValue(tree)).toBe("pi-ai");

    await act(async () => {
      getInputByPlaceholder(
        tree,
        "providerswitcher.providerModelPlaceholder",
      ).props.onChange({
        target: { value: "pi/custom-new" },
      });
      await Promise.resolve();
    });

    await act(async () => {
      getButtonByText(tree, "apikeyconfig.save").props.onClick();
      await Promise.resolve();
    });

    expect(mockSwitchProvider).toHaveBeenCalledWith(
      "pi-ai",
      undefined,
      "pi/custom-new",
    );
  });
});
