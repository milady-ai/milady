// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockUseApp } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
}));

vi.mock("../state", () => ({
  useApp: () => mockUseApp(),
}));

import { HeartbeatsView } from "./HeartbeatsView";

function t(key: string): string {
  const translations: Record<string, string> = {
    "wallet.name": "Name",
    "triggersview.Instructions": "Instructions",
    "triggersview.ScheduleType": "Schedule Type",
    "triggersview.WakeMode": "Wake Mode",
    "heartbeatsview.interval": "Interval",
    "triggersview.MaxRunsOptional": "Max Runs",
    "triggersview.StartEnabled": "Start Enabled",
    "heartbeatsview.newHeartbeat": "New Heartbeat",
    "heartbeatsview.createHeartbeat": "Create Heartbeat",
    "apikeyconfig.saving": "Saving",
    "triggersview.eGDailyDigestH": "Daily Digest",
    "triggersview.WhatShouldTheAgen": "Do the thing",
    "triggersview.RepeatingInterval": "Repeating Interval",
    "triggersview.InjectAmpWakeIm": "Inject & Wake Immediately",
    "heartbeatsview.durationUnitHours": "Hours",
  };
  return translations[key] ?? key;
}

function makeAppState(overrides: Record<string, unknown> = {}) {
  return {
    triggers: [],
    triggersLoaded: false,
    triggersLoading: false,
    triggersSaving: false,
    triggerRunsById: {},
    triggerHealth: null,
    triggerError: null,
    loadTriggers: vi.fn(async () => {}),
    createTrigger: vi.fn(async () => ({ id: "created-trigger" })),
    updateTrigger: vi.fn(async () => null),
    deleteTrigger: vi.fn(async () => true),
    runTriggerNow: vi.fn(async () => true),
    loadTriggerRuns: vi.fn(async () => {}),
    loadTriggerHealth: vi.fn(async () => {}),
    t,
    ...overrides,
  };
}

describe("HeartbeatsView form interactions", () => {
  beforeEach(() => {
    mockUseApp.mockReset();
    window.localStorage.clear();
    document.body.innerHTML = "";
  });

  it("toggles Start Enabled from the row control before submit", async () => {
    const createTrigger = vi.fn(async () => ({ id: "created-trigger" }));
    mockUseApp.mockReturnValue(makeAppState({ createTrigger }));

    render(<HeartbeatsView />);

    fireEvent.click(
      screen.getAllByRole("button", { name: "New Heartbeat" })[0],
    );

    fireEvent.change(screen.getByPlaceholderText("Daily Digest"), {
      target: { value: "Nightly Heartbeat" },
    });
    fireEvent.change(screen.getByPlaceholderText("Do the thing"), {
      target: { value: "Check systems" },
    });

    fireEvent.click(screen.getByRole("switch", { name: "Start Enabled" }));
    fireEvent.click(screen.getByRole("button", { name: "Create Heartbeat" }));

    await waitFor(() => {
      expect(createTrigger).toHaveBeenCalledWith(
        expect.objectContaining({
          displayName: "Nightly Heartbeat",
          instructions: "Check systems",
          enabled: false,
        }),
      );
    });
  });

  it("exposes Start Enabled as a proper switch and toggles it once", async () => {
    const createTrigger = vi.fn(async () => ({ id: "created-trigger" }));
    mockUseApp.mockReturnValue(makeAppState({ createTrigger }));

    render(<HeartbeatsView />);

    fireEvent.click(
      screen.getAllByRole("button", { name: "New Heartbeat" })[0],
    );

    fireEvent.change(screen.getByPlaceholderText("Daily Digest"), {
      target: { value: "Nightly Heartbeat" },
    });
    fireEvent.change(screen.getByPlaceholderText("Do the thing"), {
      target: { value: "Check systems" },
    });

    const toggle = screen.getByRole("switch", { name: "Start Enabled" });
    expect(toggle.getAttribute("aria-checked")).toBe("true");

    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole("button", { name: "Create Heartbeat" }));

    await waitFor(() => {
      expect(createTrigger).toHaveBeenCalledWith(
        expect.objectContaining({
          enabled: false,
        }),
      );
    });

    expect(toggle.getAttribute("aria-checked")).toBe("false");
  });
});
