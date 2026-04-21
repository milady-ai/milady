// @vitest-environment jsdom

import type { PermissionState } from "../../api";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flush, text } from "../../../../../test/helpers/react-test";

const { mockClient, mockUseApp } = vi.hoisted(() => ({
  mockClient: {
    getWebsiteBlockerStatus: vi.fn(),
    getPermission: vi.fn(),
    requestPermission: vi.fn(),
    openPermissionSettings: vi.fn(),
    startWebsiteBlock: vi.fn(),
    stopWebsiteBlock: vi.fn(),
  },
  mockUseApp: vi.fn(),
}));

const mockTranslate = (key: string, vars?: Record<string, unknown>) =>
  typeof vars?.defaultValue === "string" ? vars.defaultValue : key;

vi.mock("../../api", () => ({
  client: mockClient,
}));

vi.mock("../../state", () => ({
  useApp: () => mockUseApp({ t: mockTranslate }),
}));

vi.mock("@miladyai/ui", () => ({
  Button: ({
    children,
    ...props
  }: React.PropsWithChildren<Record<string, unknown>>) =>
    React.createElement("button", { type: "button", ...props }, children),
  StatusBadge: ({
    label,
    ...props
  }: React.PropsWithChildren<{ label: string } & Record<string, unknown>>) =>
    React.createElement("span", props, label),
}));

import { WebsiteBlockerSettingsCard } from "./WebsiteBlockerSettingsCard";

function buildStatus(overrides: Record<string, unknown> = {}) {
  return {
    available: true,
    active: false,
    requiresElevation: false,
    websites: [],
    platform: "darwin",
    engine: "hosts-file",
    endsAt: null,
    reason: "ready",
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

function findButton(
  root: TestRenderer.ReactTestInstance,
  value: string,
): TestRenderer.ReactTestInstance {
  const matches = root.findAll(
    (node) => node.type === "button" && text(node).includes(value),
  );
  if (!matches[0]) {
    throw new Error(`Button containing "${value}" not found`);
  }
  return matches[0];
}

function findInput(
  root: TestRenderer.ReactTestInstance,
  testId: string,
): TestRenderer.ReactTestInstance {
  const matches = root.findAll((node) => node.props["data-testid"] === testId);
  if (!matches[0]) {
    throw new Error(`Input "${testId}" not found`);
  }
  return matches[0];
}

describe("WebsiteBlockerSettingsCard", () => {
  let renderer: TestRenderer.ReactTestRenderer | null = null;

  beforeEach(() => {
    mockClient.getWebsiteBlockerStatus.mockReset();
    mockClient.getPermission.mockReset();
    mockClient.requestPermission.mockReset();
    mockClient.openPermissionSettings.mockReset();
    mockClient.startWebsiteBlock.mockReset();
    mockClient.stopWebsiteBlock.mockReset();
    mockUseApp.mockReset();
    mockUseApp.mockImplementation(() => ({ t: mockTranslate }));
  });

  afterEach(async () => {
    if (!renderer) {
      return;
    }
    await act(async () => {
      renderer?.unmount();
      await flush();
    });
    renderer = null;
  });

  it("requests approval when permission is needed", async () => {
    mockClient.getWebsiteBlockerStatus.mockResolvedValue(buildStatus());
    mockClient.getPermission.mockResolvedValue({
      id: "website-blocking",
      status: "not-determined",
      lastChecked: Date.now(),
      canRequest: true,
      reason: "Need approval",
    } satisfies PermissionState);

    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(WebsiteBlockerSettingsCard, {
          mode: "desktop",
          permission: {
            id: "website-blocking",
            status: "not-determined",
            lastChecked: Date.now(),
            canRequest: true,
            reason: "Need approval",
          },
        }),
      );
      await flush();
    });

    expect(flattenText(renderer.root)).toContain("Request Approval");

    await act(async () => {
      await findButton(renderer.root, "Request Approval").props.onClick();
      await flush();
    });

    expect(mockClient.requestPermission).toHaveBeenCalledWith(
      "website-blocking",
    );
  });

  it("validates input and starts a timed block", async () => {
    mockClient.getWebsiteBlockerStatus.mockResolvedValue(buildStatus());
    mockClient.getPermission.mockResolvedValue({
      id: "website-blocking",
      status: "granted",
      lastChecked: Date.now(),
      canRequest: false,
    } satisfies PermissionState);
    mockClient.startWebsiteBlock.mockResolvedValue({
      success: true,
      error: null,
    });

    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(WebsiteBlockerSettingsCard, {
          mode: "desktop",
          permission: {
            id: "website-blocking",
            status: "granted",
            lastChecked: Date.now(),
            canRequest: false,
          },
        }),
      );
      await flush();
    });

    await act(async () => {
      await findButton(renderer.root, "Start Block").props.onClick();
      await flush();
    });
    expect(flattenText(renderer.root)).toContain(
      "Enter at least one website hostname",
    );
    expect(mockClient.startWebsiteBlock).not.toHaveBeenCalled();

    await act(async () => {
      findInput(renderer.root, "website-blocker-input").props.onChange({
        target: { value: "x.com, twitter.com" },
      });
      findInput(renderer.root, "website-blocker-duration").props.onChange({
        target: { value: "45" },
      });
      await flush();
    });

    await act(async () => {
      await findButton(renderer.root, "Start Block").props.onClick();
      await flush();
    });

    expect(mockClient.startWebsiteBlock).toHaveBeenCalledWith({
      websites: ["x.com", "twitter.com"],
      durationMinutes: 45,
      text: "x.com, twitter.com",
    });
  });

  it("stops an active block", async () => {
    mockClient.getWebsiteBlockerStatus.mockResolvedValue(
      buildStatus({
        active: true,
        websites: ["x.com", "twitter.com"],
        endsAt: "2026-04-06T18:00:00.000Z",
      }),
    );
    mockClient.getPermission.mockResolvedValue({
      id: "website-blocking",
      status: "granted",
      lastChecked: Date.now(),
      canRequest: false,
    } satisfies PermissionState);
    mockClient.stopWebsiteBlock.mockResolvedValue({
      success: true,
      error: null,
    });

    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(WebsiteBlockerSettingsCard, {
          mode: "desktop",
          permission: {
            id: "website-blocking",
            status: "granted",
            lastChecked: Date.now(),
            canRequest: false,
          },
        }),
      );
      await flush();
    });

    expect(flattenText(renderer.root)).toContain("Stop Block");

    await act(async () => {
      await findButton(renderer.root, "Stop Block").props.onClick();
      await flush();
    });

    expect(mockClient.stopWebsiteBlock).toHaveBeenCalledTimes(1);
  });
});
