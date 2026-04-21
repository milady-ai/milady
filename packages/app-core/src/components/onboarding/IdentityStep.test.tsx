// @vitest-environment jsdom

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

/* ── Hoisted mocks ─────────────────────────────────────────────────── */

const { useAppMock, fetchWithTimeoutMock } = vi.hoisted(() => ({
  useAppMock: vi.fn(),
  fetchWithTimeoutMock: vi.fn(),
}));

vi.mock("@miladyai/app-core/state", () => ({
  useApp: () => useAppMock(),
}));

vi.mock("@miladyai/app-core/events", () => ({
  dispatchAppEmoteEvent: vi.fn(),
  dispatchWindowEvent: vi.fn(),
  ONBOARDING_VOICE_PREVIEW_AWAIT_TELEPORT_EVENT:
    "eliza:onboarding-voice-preview-await-teleport",
  VRM_TELEPORT_COMPLETE_EVENT: "eliza:vrm-teleport-complete",
}));

vi.mock("@miladyai/shared/onboarding-presets", () => ({
  getStylePresets: () => [
    {
      id: "chen",
      name: "Chen",
      avatarIndex: 1,
      voicePresetId: "alice",
      catchphrase: "I can't wait!",
    },
    {
      id: "tanya",
      name: "Tanya",
      avatarIndex: 2,
      voicePresetId: "rachel",
      catchphrase: "Let's go!",
    },
  ],
}));

vi.mock("../../utils/api-request", () => ({
  fetchWithTimeout: (...args: unknown[]) => fetchWithTimeoutMock(...args),
  resolveCompatApiToken: () => null,
}));

vi.mock("../../utils/asset-url", () => ({
  resolveApiUrl: (url: string) => `http://localhost${url}`,
  resolveAppAssetUrl: (url: string) =>
    `http://localhost/${url.replace(/^\/+/, "")}`,
}));

vi.mock("../../voice/types", () => ({
  PREMADE_VOICES: [
    {
      id: "alice",
      name: "Alice",
      voiceId: "Xb7hH8MSUJpSbSDYk0k2",
      gender: "female",
    },
    {
      id: "rachel",
      name: "Rachel",
      voiceId: "21m00Tcm4TlvDq8ikWAM",
      gender: "female",
    },
  ],
}));

vi.mock("../character/CharacterRoster", () => ({
  CharacterRoster: ({
    onSelect,
    entries,
  }: {
    onSelect: (entry: unknown) => void;
    entries: unknown[];
  }) =>
    React.createElement(
      "div",
      { "data-testid": "roster" },
      (entries as Array<{ id: string; name: string }>).map((e) =>
        React.createElement("button", {
          key: e.id,
          "data-testid": `roster-${e.id}`,
          onClick: () => onSelect(e),
        }),
      ),
    ),
  resolveRosterEntries: (
    styles: Array<{
      id: string;
      name: string;
      avatarIndex?: number;
      voicePresetId?: string;
      catchphrase?: string;
    }>,
  ) =>
    styles.map((s, i) => ({
      id: s.id,
      name: s.name,
      avatarIndex: s.avatarIndex ?? i + 1,
      voicePresetId: s.voicePresetId,
      catchphrase: s.catchphrase,
      preset: s,
    })),
}));

vi.mock("../character/character-greeting", () => ({
  resolveCharacterGreetingAnimation: () => null,
}));

vi.mock("./onboarding-asset-preload", () => ({
  preloadOnboardingCharacterAssets: vi.fn(),
}));

vi.mock("@miladyai/ui", () => ({
  Button: (props: React.PropsWithChildren<{ onClick?: () => void }>) =>
    React.createElement("button", { onClick: props.onClick }, props.children),
  Input: (props: { value?: string; onChange?: (v: string) => void }) =>
    React.createElement("input", {
      value: props.value,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
        props.onChange?.(e.target.value),
    }),
}));

/* ── Import under test (after mocks) ──────────────────────────────── */

import { IdentityStep } from "./IdentityStep";

/* ── Helpers ──────────────────────────────────────────────────────── */

function makeAppState(overrides: Record<string, unknown> = {}) {
  return {
    onboardingStyle: "",
    handleOnboardingNext: vi.fn(),
    setState: vi.fn(),
    t: (key: string) => key,
    uiLanguage: "en",
    ...overrides,
  };
}

/** Return a successful response with a tiny audio blob so the fallback chain
 *  short-circuits after the first endpoint. One fetch call = one preview. */
function successResponse() {
  return Promise.resolve({
    ok: true,
    status: 200,
    headers: {
      get: (name: string) =>
        name.toLowerCase() === "content-type" ? "audio/mpeg" : null,
    },
    blob: () =>
      Promise.resolve(new Blob(["fake-audio"], { type: "audio/mpeg" })),
  });
}

/* ── Tests ────────────────────────────────────────────────────────── */

describe("IdentityStep", () => {
  beforeEach(() => {
    useAppMock.mockReset();
    fetchWithTimeoutMock.mockReset().mockImplementation(successResponse);
  });

  it("queues preview for teleport-complete on mount with pre-set onboardingStyle", async () => {
    useAppMock.mockReturnValue(makeAppState({ onboardingStyle: "chen" }));

    await act(async () => {
      TestRenderer.create(
        React.createElement(IdentityStep, {
          gateVoicePreviewOnTeleport: false,
        }),
      );
    });

    // Preview is gated on teleport-complete, not fired immediately.
    // Simulate the teleport event (as OnboardingWizard's bridge would in no-VRM mode).
    await act(async () => {
      window.dispatchEvent(new Event("eliza:vrm-teleport-complete"));
    });

    expect(fetchWithTimeoutMock).toHaveBeenCalledTimes(1);
    expect(fetchWithTimeoutMock.mock.calls[0][0]).toBe(
      "/audio/onboarding/chen-en.mp3",
    );
  });

  it("does not double-fire preview when onboardingStyle is unset on mount", async () => {
    const setState = vi.fn();
    useAppMock.mockReturnValue(makeAppState({ onboardingStyle: "", setState }));

    await act(async () => {
      TestRenderer.create(
        React.createElement(IdentityStep, {
          gateVoicePreviewOnTeleport: false,
        }),
      );
    });

    // handleSelect(firstEntry, true) fires once → one TTS fetch
    // The effect should NOT re-fire a second playSelectionPreview
    expect(fetchWithTimeoutMock).toHaveBeenCalledTimes(1);
  });

  it("replays voiceline in new language when uiLanguage changes", async () => {
    const appState = makeAppState({
      onboardingStyle: "chen",
      uiLanguage: "en",
    });
    useAppMock.mockReturnValue(appState);

    let renderer: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(IdentityStep, {
          gateVoicePreviewOnTeleport: false,
        }),
      );
    });

    // Trigger initial teleport-complete to play the en voiceline
    await act(async () => {
      window.dispatchEvent(new Event("eliza:vrm-teleport-complete"));
    });

    expect(fetchWithTimeoutMock).toHaveBeenCalledTimes(1);
    expect(fetchWithTimeoutMock.mock.calls[0][0]).toBe(
      "/audio/onboarding/chen-en.mp3",
    );

    // Switch language to Spanish
    fetchWithTimeoutMock.mockClear();
    useAppMock.mockReturnValue({ ...appState, uiLanguage: "es" });
    await act(async () => {
      renderer!.update(
        React.createElement(IdentityStep, {
          gateVoicePreviewOnTeleport: false,
        }),
      );
    });

    expect(fetchWithTimeoutMock).toHaveBeenCalledTimes(1);
    expect(fetchWithTimeoutMock.mock.calls[0][0]).toBe(
      "/audio/onboarding/chen-es.mp3",
    );
  });
});
