// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PluginInfo } from "../api";

const mockGetPlugins = vi.fn();
const mockSwitchProvider = vi.fn();
const mockUpdatePlugin = vi.fn();

vi.mock("../api", () => ({
  client: {
    getPlugins: (...args: unknown[]) => mockGetPlugins(...args),
    switchProvider: (...args: unknown[]) => mockSwitchProvider(...args),
    updatePlugin: (...args: unknown[]) => mockUpdatePlugin(...args),
  },
}));

vi.mock("../utils", () => ({
  confirmDesktopAction: vi.fn(),
}));

import { usePluginsSkillsState } from "./usePluginsSkillsState";

const openAiPlugin: PluginInfo = {
  id: "plugin-openai",
  name: "OpenAI",
  category: "ai-provider",
  enabled: true,
  configured: true,
  parameters: [],
};

describe("usePluginsSkillsState.handlePluginConfigSave", () => {
  beforeEach(() => {
    mockGetPlugins.mockReset();
    mockSwitchProvider.mockReset();
    mockUpdatePlugin.mockReset();

    mockGetPlugins.mockResolvedValue({
      plugins: [openAiPlugin],
    });
    mockSwitchProvider.mockResolvedValue({
      success: true,
      provider: "openai",
      restarting: true,
    });
    mockUpdatePlugin.mockResolvedValue({ ok: true });
  });

  it("normalizes ai provider plugin ids before requesting a provider switch", async () => {
    const setActionNotice = vi.fn();
    const { result } = renderHook(() =>
      usePluginsSkillsState({ setActionNotice }),
    );

    act(() => {
      result.current.setPlugins([openAiPlugin]);
    });

    await act(async () => {
      await result.current.handlePluginConfigSave("plugin-openai", {
        apiKey: "sk-openai-test",
      });
    });

    expect(mockUpdatePlugin).toHaveBeenCalledWith("plugin-openai", {
      config: { apiKey: "sk-openai-test" },
    });
    expect(mockSwitchProvider).toHaveBeenCalledWith("openai", "sk-openai-test");
  });
});
