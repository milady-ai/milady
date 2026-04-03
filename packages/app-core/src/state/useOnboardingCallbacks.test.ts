// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { MiladyClient } from "../api";
import { describe, expect, it, vi } from "vitest";
import {
  buildOnboardingStyleVoiceConfig,
  useOnboardingCallbacks,
} from "./useOnboardingCallbacks";
import { useOnboardingState } from "./useOnboardingState";

describe("buildOnboardingStyleVoiceConfig", () => {
  it("persists the onboarding ElevenLabs key when the user chose own-key voice", () => {
    expect(
      buildOnboardingStyleVoiceConfig({
        style: { id: "chen", voicePresetId: "rachel" },
        voiceProvider: "elevenlabs",
        voiceApiKey: "sk_voice_test",
        cloudTtsSelected: false,
      }),
    ).toEqual({
      provider: "elevenlabs",
      mode: "own-key",
      elevenlabs: {
        apiKey: "sk_voice_test",
        voiceId: "21m00Tcm4TlvDq8ikWAM",
      },
    });
  });

  it("uses cloud mode when Eliza Cloud TTS is selected without a direct key", () => {
    expect(
      buildOnboardingStyleVoiceConfig({
        style: { id: "chen", voicePresetId: "rachel" },
        voiceProvider: "",
        voiceApiKey: "",
        cloudTtsSelected: true,
      }),
    ).toEqual({
      provider: "elevenlabs",
      mode: "cloud",
      elevenlabs: {
        voiceId: "21m00Tcm4TlvDq8ikWAM",
      },
    });
  });
});

describe("useOnboardingCallbacks", () => {
  it("records detected providers without rewriting the hosting target", () => {
    const setOnboardingDetectedProviders = vi.fn();
    const setOnboardingRunMode = vi.fn();

    const { result } = renderHook(() => {
      const onboarding = useOnboardingState();
      return useOnboardingCallbacks({
        onboarding,
        setOnboardingStep: vi.fn(),
        setOnboardingMode: vi.fn(),
        setOnboardingActiveGuide: vi.fn(),
        addDeferredOnboardingTask: vi.fn(),
        setOnboardingDetectedProviders,
        setOnboardingRunMode,
        setOnboardingCloudProvider: vi.fn(),
        setOnboardingCloudApiKey: vi.fn(),
        setOnboardingProvider: vi.fn(),
        setOnboardingApiKey: vi.fn(),
        setOnboardingPrimaryModel: vi.fn(),
        setOnboardingRemoteApiBase: vi.fn(),
        setOnboardingRemoteToken: vi.fn(),
        setOnboardingRemoteConnecting: vi.fn(),
        setOnboardingRemoteError: vi.fn(),
        setOnboardingRemoteConnected: vi.fn(),
        setPostOnboardingChecklistDismissed: vi.fn(),
        setOnboardingComplete: vi.fn(),
        coordinatorOnboardingCompleteRef: { current: null },
        initialTabSetRef: { current: false },
        setTab: vi.fn(),
        defaultLandingTab: "chat",
        loadCharacter: async () => {},
        uiLanguage: "en",
        selectedVrmIndex: 1,
        walletConfig: {},
        elizaCloudConnected: false,
        setActionNotice: vi.fn(),
        retryStartup: vi.fn(),
        forceLocalBootstrapRef: { current: false },
        client: new MiladyClient("http://127.0.0.1:31337"),
      });
    });

    act(() => {
      result.current.applyDetectedProviders([
        { id: "openrouter", apiKey: "sk-or-test" },
      ]);
    });

    expect(setOnboardingDetectedProviders).toHaveBeenCalledWith([
      { id: "openrouter", apiKey: "sk-or-test" },
    ]);
    expect(setOnboardingRunMode).not.toHaveBeenCalled();
  });
});
