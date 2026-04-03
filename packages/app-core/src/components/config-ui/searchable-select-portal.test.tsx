/**
 * @vitest-environment jsdom
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SELECT_FLOATING_LAYER_NAME,
  SELECT_FLOATING_LAYER_Z_INDEX,
} from "@miladyai/ui";
import { ProviderSwitcher } from "../settings/ProviderSwitcher";

const mockGetConfig = vi.fn();
const mockGetOnboardingOptions = vi.fn();
const mockGetSubscriptionStatus = vi.fn();
const mockUpdateConfig = vi.fn();
const mockRestartAgent = vi.fn();
const mockSwitchProvider = vi.fn();

vi.mock("../../api", () => ({
  client: {
    getConfig: (...args: unknown[]) => mockGetConfig(...args),
    getOnboardingOptions: (...args: unknown[]) =>
      mockGetOnboardingOptions(...args),
    getSubscriptionStatus: (...args: unknown[]) =>
      mockGetSubscriptionStatus(...args),
    updateConfig: (...args: unknown[]) => mockUpdateConfig(...args),
    restartAgent: (...args: unknown[]) => mockRestartAgent(...args),
    switchProvider: (...args: unknown[]) => mockSwitchProvider(...args),
  },
}));

vi.mock("../settings/ApiKeyConfig", () => ({
  ApiKeyConfig: () => null,
}));

vi.mock("../settings/SubscriptionStatus", () => ({
  SubscriptionStatus: () => null,
}));

const configFieldSource = readFileSync(
  path.resolve(import.meta.dirname, "config-field.tsx"),
  "utf-8",
);

const providerSwitcherSource = readFileSync(
  path.resolve(import.meta.dirname, "..", "settings", "ProviderSwitcher.tsx"),
  "utf-8",
);

function buildModel(id: string, name: string) {
  return {
    id,
    name,
    provider: "OpenRouter",
    description: `${name} description`,
  };
}

function renderLargeModelPicker() {
  return render(
    <div
      data-testid="settings-shell"
      className="overflow-hidden rounded-[30px] border border-border"
    >
      <ProviderSwitcher
        elizaCloudEnabled
        elizaCloudConnected
        elizaCloudCredits={704.66}
        elizaCloudCreditsLow={false}
        elizaCloudCreditsCritical={false}
        elizaCloudTopUpUrl="https://example.com/top-up"
        elizaCloudUserId="user_123"
        elizaCloudLoginBusy={false}
        elizaCloudLoginError={null}
        cloudDisconnecting={false}
        plugins={[]}
        pluginSaving={new Set<string>()}
        pluginSaveSuccess={new Set<string>()}
        loadPlugins={vi.fn(async () => {})}
        handlePluginToggle={vi.fn(async () => {})}
        handlePluginConfigSave={vi.fn()}
        handleCloudLogin={vi.fn(async () => {})}
        handleCloudDisconnect={vi.fn(async () => {})}
        setState={vi.fn()}
        setTab={vi.fn()}
      />
    </div>,
  );
}

describe("SearchableSelectInner portal contract", () => {
  beforeEach(() => {
    mockGetConfig.mockReset();
    mockGetOnboardingOptions.mockReset();
    mockGetSubscriptionStatus.mockReset();
    mockUpdateConfig.mockReset();
    mockRestartAgent.mockReset();
    mockSwitchProvider.mockReset();

    mockGetConfig.mockResolvedValue({
      models: {
        small: "small-1",
        large: "large-1",
      },
      linkedAccounts: {
        elizacloud: {
          status: "linked",
          source: "api-key",
        },
      },
      serviceRouting: {
        llmText: {
          backend: "elizacloud",
          transport: "cloud-proxy",
        },
      },
      agents: {},
      env: { vars: {} },
    });
    mockGetOnboardingOptions.mockResolvedValue({
      models: {
        small: [
          buildModel("small-1", "Small One"),
          buildModel("small-2", "Small Two"),
        ],
        large: Array.from({ length: 10 }, (_, index) =>
          buildModel(`large-${index + 1}`, `Large ${index + 1}`),
        ),
      },
      piAiModels: [],
      piAiDefaultModel: "",
    });
    mockGetSubscriptionStatus.mockResolvedValue({ providers: [] });
    mockUpdateConfig.mockResolvedValue({ ok: true });
    mockRestartAgent.mockResolvedValue({ ok: true });
    mockSwitchProvider.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("opens the large-model picker on a floating layer outside the shell", async () => {
    const { getByTestId } = renderLargeModelPicker();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Large 1/i })).not.toBeNull();
    });

    const shell = getByTestId("settings-shell");
    const largeTrigger = screen.getByRole("button", {
      name: /Large 1/i,
    }) as HTMLButtonElement | null;

    fireEvent.click(largeTrigger!);

    const dropdown = (await waitFor(() => {
      const layer = document.body.querySelector(
        `[data-floating-layer="${SELECT_FLOATING_LAYER_NAME}"]`,
      ) as HTMLElement | null;
      expect(layer).not.toBeNull();
      return layer;
    })) as HTMLElement | null;

    expect(dropdown).not.toBeNull();
    expect(dropdown?.getAttribute("data-floating-layer")).toBe(
      SELECT_FLOATING_LAYER_NAME,
    );
    expect(shell.contains(dropdown!)).toBe(false);
    expect(dropdown?.style.zIndex).toBe(String(SELECT_FLOATING_LAYER_Z_INDEX));
    expect(screen.getByPlaceholderText("Search 10 options...")).not.toBeNull();
  });

  it("closes the floating dropdown on ancestor scroll", async () => {
    renderLargeModelPicker();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Large 1/i })).not.toBeNull();
    });

    const largeTrigger = screen.getByRole("button", {
      name: /Large 1/i,
    }) as HTMLButtonElement;
    fireEvent.click(largeTrigger);

    await waitFor(() => {
      const layer = document.body.querySelector(
        `[data-floating-layer="${SELECT_FLOATING_LAYER_NAME}"]`,
      );
      expect(layer).not.toBeNull();
    });
    fireEvent.scroll(window);

    await waitFor(() => {
      expect(
        document.body.querySelector(
          `[data-floating-layer="${SELECT_FLOATING_LAYER_NAME}"]`,
        ),
      ).toBeNull();
    });
  });

  it("keeps the source contract for body portals and fixed positioning", () => {
    expect(configFieldSource).toContain(
      'import { createPortal } from "react-dom"',
    );
    expect(configFieldSource).toContain("createPortal(");
    expect(configFieldSource).toContain("document.body");
    expect(configFieldSource).toContain('position: "fixed"');
    expect(configFieldSource).toContain(
      "setDropdownStyle(computeDropdownStyle())",
    );
  });
});

describe("ProviderSwitcher model option wiring", () => {
  it("passes hint.options with value, label, and description for small models", () => {
    expect(providerSwitcherSource).toMatch(
      /small:\s*\{[\s\S]*?options:\s*modelOptions\.small\.map/,
    );
  });

  it("passes hint.options with value, label, and description for large models", () => {
    expect(providerSwitcherSource).toMatch(
      /large:\s*\{[\s\S]*?options:\s*modelOptions\.large\.map/,
    );
  });

  it("maps model name to label for human-readable dropdown entries", () => {
    const optionMappings = providerSwitcherSource.match(/label:\s*m\.name/g);
    expect(optionMappings).toBeTruthy();
    expect(optionMappings?.length).toBeGreaterThanOrEqual(2);
  });
});
