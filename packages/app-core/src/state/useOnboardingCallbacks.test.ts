// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { MiladyClient } from "../api";
import { afterEach, describe, expect, it, vi } from "vitest";
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
  afterEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("records detected providers without rewriting the hosting target", () => {
    const setOnboardingDetectedProviders = vi.fn();
    const setOnboardingServerTarget = vi.fn();
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
        setOnboardingServerTarget,
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
    expect(setOnboardingServerTarget).not.toHaveBeenCalled();
    expect(setOnboardingRunMode).not.toHaveBeenCalled();
  });

  it("clears a persisted remote target before retrying local bootstrap", () => {
    window.localStorage.setItem(
      "milady:active-server",
      JSON.stringify({
        id: "remote:https://ren.example.com",
        kind: "remote",
        label: "ren.example.com",
        apiBase: "https://ren.example.com",
      }),
    );

    const retryStartup = vi.fn();
    const setOnboardingServerTarget = vi.fn();
    const client = {
      setBaseUrl: vi.fn(),
      setToken: vi.fn(),
    } as unknown as MiladyClient;

    const { result } = renderHook(() => {
      const onboarding = useOnboardingState();
      return useOnboardingCallbacks({
        onboarding,
        setOnboardingStep: vi.fn(),
        setOnboardingMode: vi.fn(),
        setOnboardingActiveGuide: vi.fn(),
        addDeferredOnboardingTask: vi.fn(),
        setOnboardingDetectedProviders: vi.fn(),
        setOnboardingServerTarget,
        setOnboardingRunMode: vi.fn(),
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
        retryStartup,
        forceLocalBootstrapRef: { current: false },
        client,
      });
    });

    act(() => {
      result.current.handleOnboardingUseLocalBackend();
    });

    expect(window.localStorage.getItem("milady:active-server")).toBeNull();
    expect(setOnboardingServerTarget).toHaveBeenCalledWith("");
    expect(retryStartup).toHaveBeenCalledTimes(1);
  });

  it("connects a remote backend through the canonical server target", async () => {
    const retryStartup = vi.fn();
    const setOnboardingServerTarget = vi.fn();
    const setOnboardingRemoteApiBase = vi.fn();
    const setOnboardingRemoteToken = vi.fn();
    const setOnboardingRemoteConnected = vi.fn();
    const setOnboardingRemoteConnecting = vi.fn();
    const setOnboardingRemoteError = vi.fn();
    const setActionNotice = vi.fn();

    const authSpy = vi
      .spyOn(MiladyClient.prototype, "getAuthStatus")
      .mockResolvedValue({
        required: false,
        pairingEnabled: false,
        expiresAt: null,
      });
    const onboardingStatusSpy = vi
      .spyOn(MiladyClient.prototype, "getOnboardingStatus")
      .mockResolvedValue({ complete: false });

    const { result } = renderHook(() => {
      const onboarding = useOnboardingState();
      return {
        onboarding,
        callbacks: useOnboardingCallbacks({
          onboarding,
          setOnboardingStep: vi.fn(),
          setOnboardingMode: vi.fn(),
          setOnboardingActiveGuide: vi.fn(),
          addDeferredOnboardingTask: vi.fn(),
          setOnboardingDetectedProviders: vi.fn(),
          setOnboardingServerTarget,
          setOnboardingRunMode: vi.fn(),
          setOnboardingCloudProvider: vi.fn(),
          setOnboardingCloudApiKey: vi.fn(),
          setOnboardingProvider: vi.fn(),
          setOnboardingApiKey: vi.fn(),
          setOnboardingPrimaryModel: vi.fn(),
          setOnboardingRemoteApiBase,
          setOnboardingRemoteToken,
          setOnboardingRemoteConnecting,
          setOnboardingRemoteError,
          setOnboardingRemoteConnected,
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
          setActionNotice,
          retryStartup,
          forceLocalBootstrapRef: { current: false },
          client: new MiladyClient("http://127.0.0.1:31337"),
        }),
      };
    });

    act(() => {
      result.current.onboarding.setField("remoteApiBase", "ren.example.com");
      result.current.onboarding.setField("remoteToken", "sk-remote");
    });

    await act(async () => {
      await result.current.callbacks.handleOnboardingRemoteConnect();
    });

    expect(authSpy).toHaveBeenCalledTimes(1);
    expect(onboardingStatusSpy).toHaveBeenCalledTimes(1);
    expect(setOnboardingServerTarget).toHaveBeenCalledWith("remote");
    expect(setOnboardingRemoteApiBase).toHaveBeenCalledWith(
      "https://ren.example.com",
    );
    expect(setOnboardingRemoteToken).toHaveBeenCalledWith("sk-remote");
    expect(setOnboardingRemoteConnected).toHaveBeenCalledWith(true);
    expect(setActionNotice).toHaveBeenCalledWith(
      "Connected to remote Milady backend.",
      "success",
      4200,
    );
    expect(retryStartup).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem("milady:active-server")).toContain(
      '"kind":"remote"',
    );
  });
});
