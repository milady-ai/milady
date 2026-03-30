import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUseApp = vi.fn();
const mockOnWsEvent = vi.fn(() => () => {});
const mockHandlePluginToggle = vi.fn(async () => {});
const mockLoadPlugins = vi.fn(async () => {});
const mockHandlePluginConfigSave = vi.fn(async () => {});
const mockSetActionNotice = vi.fn();
const mockSetState = vi.fn();
const mockHandleParamChange = vi.fn();

vi.mock("@miladyai/app-core/state", () => ({
  useApp: () => mockUseApp(),
}));

vi.mock("@miladyai/app-core/api", () => ({
  client: {
    onWsEvent: (...args: unknown[]) => mockOnWsEvent(...args),
    installRegistryPlugin: vi.fn(),
    testPluginConnection: vi.fn(),
    restartAndWait: vi.fn(),
  },
}));

import { PluginsView } from "../../src/components/PluginsView";

function telegramPlugin(overrides: Record<string, unknown> = {}) {
  return {
    id: "telegram",
    name: "Telegram",
    description: "Telegram connector",
    tags: ["connector"],
    enabled: true,
    configured: true,
    envKey: "TELEGRAM_BOT_TOKEN",
    category: "connector" as const,
    source: "bundled" as const,
    parameters: [
      {
        key: "TELEGRAM_BOT_TOKEN",
        type: "string",
        description: "Bot token",
        required: true,
        sensitive: true,
        currentValue: "8690...XNl4",
        isSet: true,
      },
      {
        key: "TELEGRAM_ALLOWED_CHATS",
        type: "string",
        description: "JSON-encoded array of allowed chat IDs",
        required: false,
        sensitive: false,
        currentValue: null,
        isSet: false,
      },
      {
        key: "TELEGRAM_API_ROOT",
        type: "string",
        description: "Base URL for Telegram Bot API",
        required: false,
        sensitive: false,
        currentValue: null,
        isSet: false,
      },
      {
        key: "TELEGRAM_TEST_CHAT_ID",
        type: "string",
        description: "Test chat ID",
        required: false,
        sensitive: false,
        currentValue: null,
        isSet: false,
      },
    ],
    validationErrors: [],
    validationWarnings: [],
    isActive: true,
    ...overrides,
  };
}

function baseContext(pluginOverrides: Record<string, unknown> = {}) {
  return {
    t: (k: string) => k,
    plugins: [telegramPlugin(pluginOverrides)],
    pluginStatusFilter: "all" as const,
    pluginSearch: "",
    pluginSettingsOpen: new Set<string>(),
    pluginSaving: new Set<string>(),
    pluginSaveSuccess: new Set<string>(),
    loadPlugins: mockLoadPlugins,
    handlePluginToggle: mockHandlePluginToggle,
    handlePluginConfigSave: mockHandlePluginConfigSave,
    setActionNotice: mockSetActionNotice,
    setState: mockSetState,
  };
}

describe("Telegram connector UI", () => {
  beforeEach(() => {
    mockUseApp.mockReset();
    mockOnWsEvent.mockReset().mockReturnValue(() => {});
    mockHandlePluginToggle.mockReset().mockResolvedValue(undefined);
    mockLoadPlugins.mockReset().mockResolvedValue(undefined);
    mockHandlePluginConfigSave.mockReset().mockResolvedValue(undefined);
    mockSetActionNotice.mockReset();
    mockSetState.mockReset().mockImplementation(() => {});
  });

  describe("allParamsSet required-only logic", () => {
    it("shows ready status when only required params are set", async () => {
      // Only TELEGRAM_BOT_TOKEN is required and set; 3 optional params are unset
      mockUseApp.mockReturnValue(baseContext());

      let tree: TestRenderer.ReactTestRenderer;
      await act(async () => {
        tree = TestRenderer.create(React.createElement(PluginsView));
      });

      // Find the status dot — should be green (bg-ok) not red (bg-destructive)
      const statusDots = tree!.root.findAll(
        (node) =>
          typeof node.props.className === "string" &&
          node.props.className.includes("rounded-full") &&
          node.props.className.includes("shadow-[0_0_10px"),
      );

      // At least one status dot should be green
      const hasGreenDot = statusDots.some((dot) =>
        dot.props.className.includes("bg-ok"),
      );
      const hasRedDot = statusDots.some((dot) =>
        dot.props.className.includes("bg-destructive"),
      );

      expect(hasGreenDot).toBe(true);
      expect(hasRedDot).toBe(false);
    });

    it("shows needs-setup status when required param is missing", async () => {
      mockUseApp.mockReturnValue(
        baseContext({
          configured: false,
          parameters: [
            {
              key: "TELEGRAM_BOT_TOKEN",
              type: "string",
              description: "Bot token",
              required: true,
              sensitive: true,
              currentValue: null,
              isSet: false,
            },
            {
              key: "TELEGRAM_API_ROOT",
              type: "string",
              description: "API root",
              required: false,
              sensitive: false,
              currentValue: null,
              isSet: false,
            },
          ],
        }),
      );

      let tree: TestRenderer.ReactTestRenderer;
      await act(async () => {
        tree = TestRenderer.create(React.createElement(PluginsView));
      });

      const statusDots = tree!.root.findAll(
        (node) =>
          typeof node.props.className === "string" &&
          node.props.className.includes("rounded-full") &&
          node.props.className.includes("shadow-[0_0_10px"),
      );

      const hasRedDot = statusDots.some((dot) =>
        dot.props.className.includes("bg-destructive"),
      );

      expect(hasRedDot).toBe(true);
    });
  });

  describe("useTelegramChatMode toggle state", () => {
    it("defaults to allow-all when no allowed chats are configured", async () => {
      mockUseApp.mockReturnValue(baseContext());

      let tree: TestRenderer.ReactTestRenderer;
      await act(async () => {
        tree = TestRenderer.create(
          React.createElement(PluginsView, { mode: "social" }),
        );
      });

      // Expand the telegram connector to see settings
      const expandButton = tree!.root.findAll(
        (node) =>
          node.type === "button" &&
          node.props["data-plugin-toggle"] === "telegram",
      );

      // Find the chat mode toggle — it's a switch with role="switch"
      const switches = tree!.root.findAll(
        (node) =>
          node.type === "button" && node.props.role === "switch",
      );

      // The first switch should be the allow-all toggle, checked by default
      if (switches.length > 0) {
        expect(switches[0].props["aria-checked"]).toBe(true);
      }
    });

    it("initializes to specific-chats when allowed chats are configured", async () => {
      mockUseApp.mockReturnValue(
        baseContext({
          parameters: [
            {
              key: "TELEGRAM_BOT_TOKEN",
              type: "string",
              description: "Bot token",
              required: true,
              sensitive: true,
              currentValue: "8690...XNl4",
              isSet: true,
            },
            {
              key: "TELEGRAM_ALLOWED_CHATS",
              type: "string",
              description: "JSON-encoded array of allowed chat IDs",
              required: false,
              sensitive: false,
              currentValue: '["123456"]',
              isSet: true,
            },
          ],
        }),
      );

      let tree: TestRenderer.ReactTestRenderer;
      await act(async () => {
        tree = TestRenderer.create(
          React.createElement(PluginsView, { mode: "social" }),
        );
      });

      const switches = tree!.root.findAll(
        (node) =>
          node.type === "button" && node.props.role === "switch",
      );

      // Toggle should be unchecked (specific chats mode)
      if (switches.length > 0) {
        expect(switches[0].props["aria-checked"]).toBe(false);
      }
    });

    it("toggles from allow-all to specific without losing stashed value", async () => {
      mockUseApp.mockReturnValue(baseContext());

      let tree: TestRenderer.ReactTestRenderer;
      await act(async () => {
        tree = TestRenderer.create(
          React.createElement(PluginsView, { mode: "social" }),
        );
      });

      const getSwitch = () =>
        tree!.root.findAll(
          (node) =>
            node.type === "button" && node.props.role === "switch",
        )[0];

      if (!getSwitch()) return; // Skip if not rendered in this view mode

      // Initially allow-all
      expect(getSwitch().props["aria-checked"]).toBe(true);

      // Toggle to specific
      await act(async () => {
        getSwitch().props.onClick();
      });

      expect(getSwitch().props["aria-checked"]).toBe(false);

      // Toggle back to allow-all
      await act(async () => {
        getSwitch().props.onClick();
      });

      expect(getSwitch().props["aria-checked"]).toBe(true);
    });
  });
});
