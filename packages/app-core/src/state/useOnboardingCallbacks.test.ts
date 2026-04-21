// @vitest-environment jsdom

const { mockInvokeDesktopBridgeRequest, mockCapacitorAgentStart } = vi.hoisted(
  () => ({
    mockInvokeDesktopBridgeRequest: vi.fn(async () => undefined),
    mockCapacitorAgentStart: vi.fn(async () => undefined),
  }),
);

vi.mock("../bridge", () => ({
  invokeDesktopBridgeRequest: (...args: unknown[]) =>
    mockInvokeDesktopBridgeRequest(...args),
  getDesktopRuntimeMode: vi.fn(async () => null),
  scanProviderCredentials: vi.fn(async () => []),
}));

vi.mock("@miladyai/capacitor-agent", () => ({
  Agent: {
    start: (...args: unknown[]) => mockCapacitorAgentStart(...args),
  },
}));

import { getDefaultStylePreset } from "@miladyai/shared/onboarding-presets";
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MiladyClient } from "../api";
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
    delete (window as unknown as Record<string, unknown>)
      .__ELIZA_CLOUD_AUTH_TOKEN__;
    mockInvokeDesktopBridgeRequest.mockReset();
    mockInvokeDesktopBridgeRequest.mockResolvedValue(undefined);
    mockCapacitorAgentStart.mockReset();
    mockCapacitorAgentStart.mockResolvedValue(undefined);
    vi.restoreAllMocks();
  });

  it("records detected providers without rewriting the hosting target", () => {
    const setOnboardingDetectedProviders = vi.fn();
    const setOnboardingServerTarget = vi.fn();

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
    const setOnboardingRemoteApiBase = vi.fn();
    const setOnboardingRemoteToken = vi.fn();
    const setOnboardingRemoteConnecting = vi.fn();
    const setOnboardingRemoteError = vi.fn();
    const setOnboardingRemoteConnected = vi.fn();
    const setActionNotice = vi.fn();
    const forceLocalBootstrapRef = { current: false };
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
        forceLocalBootstrapRef,
        client,
      });
    });

    act(() => {
      result.current.handleOnboardingUseLocalBackend();
    });

    expect(window.localStorage.getItem("milady:active-server")).toBeNull();
    expect(forceLocalBootstrapRef.current).toBe(true);
    expect(client.setBaseUrl).toHaveBeenCalledWith(null);
    expect(client.setToken).toHaveBeenCalledWith(null);
    expect(setOnboardingRemoteConnecting).toHaveBeenCalledWith(false);
    expect(setOnboardingRemoteError).toHaveBeenCalledWith(null);
    expect(setOnboardingRemoteConnected).toHaveBeenCalledWith(false);
    expect(setOnboardingRemoteApiBase).toHaveBeenCalledWith("");
    expect(setOnboardingRemoteToken).toHaveBeenCalledWith("");
    expect(setOnboardingServerTarget).toHaveBeenCalledWith("");
    expect(setActionNotice).toHaveBeenCalledWith(
      "Checking this device for an existing Eliza setup...",
      "info",
      3200,
    );
    expect(retryStartup).toHaveBeenCalledTimes(1);
  });

  it("reverts from providers to identity and resets the connection wizard state", () => {
    const setOnboardingStep = vi.fn();
    const setOnboardingActiveGuide = vi.fn();
    const setOnboardingServerTarget = vi.fn();
    const setOnboardingCloudApiKey = vi.fn();
    const setOnboardingProvider = vi.fn();
    const setOnboardingApiKey = vi.fn();
    const setOnboardingPrimaryModel = vi.fn();
    const setOnboardingRemoteError = vi.fn();
    const setOnboardingRemoteConnecting = vi.fn();

    const { result } = renderHook(() => {
      const onboarding = useOnboardingState();
      return {
        onboarding,
        callbacks: useOnboardingCallbacks({
          onboarding,
          setOnboardingStep,
          setOnboardingMode: vi.fn(),
          setOnboardingActiveGuide,
          addDeferredOnboardingTask: vi.fn(),
          setOnboardingDetectedProviders: vi.fn(),
          setOnboardingServerTarget,
          setOnboardingCloudApiKey,
          setOnboardingProvider,
          setOnboardingApiKey,
          setOnboardingPrimaryModel,
          setOnboardingRemoteApiBase: vi.fn(),
          setOnboardingRemoteToken: vi.fn(),
          setOnboardingRemoteConnecting,
          setOnboardingRemoteError,
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
        }),
      };
    });

    act(() => {
      result.current.onboarding.setMode("advanced");
      result.current.onboarding.setStep("providers");
    });

    act(() => {
      result.current.callbacks.handleOnboardingBack();
    });

    expect(setOnboardingStep).toHaveBeenCalledWith("identity");
    expect(setOnboardingActiveGuide).toHaveBeenCalledWith(null);
    expect(setOnboardingServerTarget).toHaveBeenCalledWith("");
    expect(setOnboardingCloudApiKey).toHaveBeenCalledWith("");
    expect(setOnboardingProvider).toHaveBeenCalledWith("");
    expect(setOnboardingApiKey).toHaveBeenCalledWith("");
    expect(setOnboardingPrimaryModel).toHaveBeenCalledWith("");
    expect(setOnboardingRemoteError).toHaveBeenCalledWith(null);
    expect(setOnboardingRemoteConnecting).toHaveBeenCalledWith(false);
  });

  it("ignores invalid onboarding jump targets instead of pretending to navigate", () => {
    const setOnboardingStep = vi.fn();
    const setOnboardingActiveGuide = vi.fn();

    const { result } = renderHook(() => {
      const onboarding = useOnboardingState();
      return {
        onboarding,
        callbacks: useOnboardingCallbacks({
          onboarding,
          setOnboardingStep,
          setOnboardingMode: vi.fn(),
          setOnboardingActiveGuide,
          addDeferredOnboardingTask: vi.fn(),
          setOnboardingDetectedProviders: vi.fn(),
          setOnboardingServerTarget: vi.fn(),
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
        }),
      };
    });

    act(() => {
      result.current.onboarding.setStep("identity");
    });

    act(() => {
      result.current.callbacks.handleOnboardingJumpToStep("providers");
    });

    expect(setOnboardingStep).not.toHaveBeenCalled();
    expect(setOnboardingActiveGuide).not.toHaveBeenCalled();
  });

  it("jumps back to identity from providers and resets the connection wizard state", () => {
    const setOnboardingStep = vi.fn();
    const setOnboardingActiveGuide = vi.fn();
    const setOnboardingServerTarget = vi.fn();
    const setOnboardingCloudApiKey = vi.fn();
    const setOnboardingProvider = vi.fn();
    const setOnboardingApiKey = vi.fn();
    const setOnboardingPrimaryModel = vi.fn();
    const setOnboardingRemoteError = vi.fn();
    const setOnboardingRemoteConnecting = vi.fn();

    const { result } = renderHook(() => {
      const onboarding = useOnboardingState();
      return {
        onboarding,
        callbacks: useOnboardingCallbacks({
          onboarding,
          setOnboardingStep,
          setOnboardingMode: vi.fn(),
          setOnboardingActiveGuide,
          addDeferredOnboardingTask: vi.fn(),
          setOnboardingDetectedProviders: vi.fn(),
          setOnboardingServerTarget,
          setOnboardingCloudApiKey,
          setOnboardingProvider,
          setOnboardingApiKey,
          setOnboardingPrimaryModel,
          setOnboardingRemoteApiBase: vi.fn(),
          setOnboardingRemoteToken: vi.fn(),
          setOnboardingRemoteConnecting,
          setOnboardingRemoteError,
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
        }),
      };
    });

    act(() => {
      result.current.onboarding.setMode("advanced");
      result.current.onboarding.setStep("providers");
    });

    act(() => {
      result.current.callbacks.handleOnboardingJumpToStep("identity");
    });

    expect(setOnboardingStep).toHaveBeenCalledWith("identity");
    expect(setOnboardingActiveGuide).toHaveBeenCalledWith(null);
    expect(setOnboardingServerTarget).toHaveBeenCalledWith("");
    expect(setOnboardingCloudApiKey).toHaveBeenCalledWith("");
    expect(setOnboardingProvider).toHaveBeenCalledWith("");
    expect(setOnboardingApiKey).toHaveBeenCalledWith("");
    expect(setOnboardingPrimaryModel).toHaveBeenCalledWith("");
    expect(setOnboardingRemoteError).toHaveBeenCalledWith(null);
    expect(setOnboardingRemoteConnecting).toHaveBeenCalledWith(false);
  });

  it("advances from identity to providers through the public next-step callback", async () => {
    const setOnboardingStep = vi.fn();
    const setOnboardingActiveGuide = vi.fn();

    const { result } = renderHook(() => {
      const onboarding = useOnboardingState();
      return {
        onboarding,
        callbacks: useOnboardingCallbacks({
          onboarding,
          setOnboardingStep,
          setOnboardingMode: vi.fn(),
          setOnboardingActiveGuide,
          addDeferredOnboardingTask: vi.fn(),
          setOnboardingDetectedProviders: vi.fn(),
          setOnboardingServerTarget: vi.fn(),
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
        }),
      };
    });

    act(() => {
      result.current.onboarding.setMode("advanced");
      result.current.onboarding.setStep("identity");
    });

    await act(async () => {
      await result.current.callbacks.handleOnboardingNext();
    });

    expect(setOnboardingStep).toHaveBeenCalledWith("providers");
    expect(setOnboardingActiveGuide).toHaveBeenCalledWith("provider");
  });

  it("routes explicit step navigation through the guide resolver", () => {
    const setOnboardingStep = vi.fn();
    const setOnboardingActiveGuide = vi.fn();

    const { result } = renderHook(() => {
      const onboarding = useOnboardingState();
      return {
        onboarding,
        callbacks: useOnboardingCallbacks({
          onboarding,
          setOnboardingStep,
          setOnboardingMode: vi.fn(),
          setOnboardingActiveGuide,
          addDeferredOnboardingTask: vi.fn(),
          setOnboardingDetectedProviders: vi.fn(),
          setOnboardingServerTarget: vi.fn(),
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
        }),
      };
    });

    act(() => {
      result.current.onboarding.setMode("advanced");
    });

    act(() => {
      result.current.callbacks.goToOnboardingStep("providers");
    });

    expect(setOnboardingStep).toHaveBeenCalledWith("providers");
    expect(setOnboardingActiveGuide).toHaveBeenCalledWith("provider");
  });

  it("finishes onboarding when next is invoked from the last step", async () => {
    const submitOnboarding = vi.fn().mockResolvedValue(undefined);
    const setOnboardingComplete = vi.fn();
    const setTab = vi.fn();

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
          setOnboardingServerTarget: vi.fn(),
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
          setOnboardingComplete,
          coordinatorOnboardingCompleteRef: { current: null },
          initialTabSetRef: { current: false },
          setTab,
          defaultLandingTab: "chat",
          loadCharacter: vi.fn(async () => {}),
          uiLanguage: "en",
          selectedVrmIndex: 1,
          walletConfig: {},
          elizaCloudConnected: false,
          setActionNotice: vi.fn(),
          retryStartup: vi.fn(),
          forceLocalBootstrapRef: { current: false },
          client: {
            getAuthStatus: vi.fn().mockResolvedValue({
              required: false,
              pairingEnabled: false,
              expiresAt: null,
            }),
            submitOnboarding,
            updateConfig: vi.fn().mockResolvedValue({}),
          } as unknown as MiladyClient,
        }),
      };
    });

    act(() => {
      result.current.onboarding.setOptions({
        names: [],
        styles: [getDefaultStylePreset("en")],
        providers: [],
        cloudProviders: [],
        models: { small: [], large: [] },
        inventoryProviders: [],
        sharedStyleRules: "Keep responses brief.",
      });
      result.current.onboarding.setField("name", "Chen");
      result.current.onboarding.setField("serverTarget", "local");
      result.current.onboarding.setField("provider", "openai");
      result.current.onboarding.setField("apiKey", "sk-openai-test");
      result.current.onboarding.setStep("providers");
    });

    await act(async () => {
      await result.current.callbacks.handleOnboardingNext();
    });

    expect(submitOnboarding).toHaveBeenCalledTimes(1);
    expect(setOnboardingComplete).toHaveBeenCalledWith(true);
    expect(setTab).toHaveBeenCalledWith("chat");
  });

  it("retries local auth polling while the local backend is still booting", async () => {
    const getAuthStatus = vi
      .fn()
      .mockRejectedValueOnce(new Error("still booting"))
      .mockResolvedValue({
        required: false,
        pairingEnabled: false,
        expiresAt: null,
      });
    const submitOnboarding = vi.fn().mockResolvedValue(undefined);
    const setOnboardingComplete = vi.fn();
    const setTimeoutSpy = vi
      .spyOn(globalThis, "setTimeout")
      .mockImplementation(((callback: TimerHandler) => {
        if (typeof callback === "function") {
          callback();
        }
        return 0 as ReturnType<typeof setTimeout>;
      }) as typeof setTimeout);

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
          setOnboardingServerTarget: vi.fn(),
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
          setOnboardingComplete,
          coordinatorOnboardingCompleteRef: { current: null },
          initialTabSetRef: { current: false },
          setTab: vi.fn(),
          defaultLandingTab: "chat",
          loadCharacter: vi.fn(async () => {}),
          uiLanguage: "en",
          selectedVrmIndex: 1,
          walletConfig: {},
          elizaCloudConnected: false,
          setActionNotice: vi.fn(),
          retryStartup: vi.fn(),
          forceLocalBootstrapRef: { current: false },
          client: {
            getAuthStatus,
            submitOnboarding,
            updateConfig: vi.fn().mockResolvedValue({}),
          } as unknown as MiladyClient,
        }),
      };
    });

    act(() => {
      result.current.onboarding.setOptions({
        names: [],
        styles: [getDefaultStylePreset("en")],
        providers: [],
        cloudProviders: [],
        models: { small: [], large: [] },
        inventoryProviders: [],
        sharedStyleRules: "Keep responses brief.",
      });
      result.current.onboarding.setField("name", "Chen");
      result.current.onboarding.setField("serverTarget", "local");
      result.current.onboarding.setField("provider", "openai");
      result.current.onboarding.setField("apiKey", "sk-openai-test");
    });

    await act(async () => {
      await result.current.callbacks.handleOnboardingFinish();
    });

    expect(mockInvokeDesktopBridgeRequest).toHaveBeenCalledTimes(1);
    expect(getAuthStatus).toHaveBeenCalledTimes(2);
    expect(setTimeoutSpy).toHaveBeenCalled();
    expect(submitOnboarding).toHaveBeenCalledTimes(1);
    expect(setOnboardingComplete).toHaveBeenCalledWith(true);
  });

  it("falls back to the Capacitor agent starter when the desktop bridge start request fails", async () => {
    mockInvokeDesktopBridgeRequest.mockRejectedValueOnce(
      new Error("desktop bridge unavailable"),
    );
    const getAuthStatus = vi.fn().mockResolvedValue({
      required: false,
      pairingEnabled: false,
      expiresAt: null,
    });
    const submitOnboarding = vi.fn().mockResolvedValue(undefined);

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
          setOnboardingServerTarget: vi.fn(),
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
          loadCharacter: vi.fn(async () => {}),
          uiLanguage: "en",
          selectedVrmIndex: 1,
          walletConfig: {},
          elizaCloudConnected: false,
          setActionNotice: vi.fn(),
          retryStartup: vi.fn(),
          forceLocalBootstrapRef: { current: false },
          client: {
            getAuthStatus,
            submitOnboarding,
            updateConfig: vi.fn().mockResolvedValue({}),
          } as unknown as MiladyClient,
        }),
      };
    });

    act(() => {
      result.current.onboarding.setOptions({
        names: [],
        styles: [getDefaultStylePreset("en")],
        providers: [],
        cloudProviders: [],
        models: { small: [], large: [] },
        inventoryProviders: [],
        sharedStyleRules: "Keep responses brief.",
      });
      result.current.onboarding.setField("name", "Chen");
      result.current.onboarding.setField("serverTarget", "local");
      result.current.onboarding.setField("provider", "openai");
      result.current.onboarding.setField("apiKey", "sk-openai-test");
    });

    await act(async () => {
      await result.current.callbacks.handleOnboardingFinish();
    });

    expect(mockInvokeDesktopBridgeRequest).toHaveBeenCalledTimes(1);
    expect(mockCapacitorAgentStart).toHaveBeenCalledTimes(1);
    expect(getAuthStatus).toHaveBeenCalledTimes(1);
    expect(submitOnboarding).toHaveBeenCalledTimes(1);
  });

  it("delegates cloud onboarding finish through the same chat handoff path", async () => {
    const submitOnboarding = vi.fn().mockResolvedValue(undefined);
    const setOnboardingComplete = vi.fn();
    const setTab = vi.fn();

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
          setOnboardingServerTarget: vi.fn(),
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
          setOnboardingComplete,
          coordinatorOnboardingCompleteRef: { current: null },
          initialTabSetRef: { current: false },
          setTab,
          defaultLandingTab: "chat",
          loadCharacter: vi.fn(async () => {}),
          uiLanguage: "en",
          selectedVrmIndex: 1,
          walletConfig: {},
          elizaCloudConnected: false,
          setActionNotice: vi.fn(),
          retryStartup: vi.fn(),
          forceLocalBootstrapRef: { current: false },
          client: {
            getAuthStatus: vi.fn().mockResolvedValue({
              required: false,
              pairingEnabled: false,
              expiresAt: null,
            }),
            submitOnboarding,
            updateConfig: vi.fn().mockResolvedValue({}),
          } as unknown as MiladyClient,
        }),
      };
    });

    act(() => {
      result.current.onboarding.setOptions({
        names: [],
        styles: [getDefaultStylePreset("en")],
        providers: [],
        cloudProviders: [],
        models: { small: [], large: [] },
        inventoryProviders: [],
        sharedStyleRules: "Keep responses brief.",
      });
      result.current.onboarding.setField("name", "Chen");
      result.current.onboarding.setField("serverTarget", "local");
      result.current.onboarding.setField("provider", "openai");
      result.current.onboarding.setField("apiKey", "sk-openai-test");
    });

    await act(async () => {
      await result.current.callbacks.handleCloudOnboardingFinish();
    });

    expect(submitOnboarding).toHaveBeenCalledTimes(1);
    expect(setOnboardingComplete).toHaveBeenCalledWith(true);
    expect(setTab).toHaveBeenCalledWith("chat");
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

  it("rejects remote backends that do not use http or https", async () => {
    const setOnboardingRemoteError = vi.fn();

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
          setOnboardingServerTarget: vi.fn(),
          setOnboardingCloudApiKey: vi.fn(),
          setOnboardingProvider: vi.fn(),
          setOnboardingApiKey: vi.fn(),
          setOnboardingPrimaryModel: vi.fn(),
          setOnboardingRemoteApiBase: vi.fn(),
          setOnboardingRemoteToken: vi.fn(),
          setOnboardingRemoteConnecting: vi.fn(),
          setOnboardingRemoteError,
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
        }),
      };
    });

    act(() => {
      result.current.onboarding.setField(
        "remoteApiBase",
        "ftp://ren.example.com",
      );
    });

    await act(async () => {
      await result.current.callbacks.handleOnboardingRemoteConnect();
    });

    expect(setOnboardingRemoteError).toHaveBeenCalledWith(
      "Remote backends must use http:// or https://.",
    );
  });

  it("requires an access key when the remote backend reports auth is required", async () => {
    const setOnboardingRemoteError = vi.fn();
    const setOnboardingRemoteConnecting = vi.fn();
    const retryStartup = vi.fn();
    const authSpy = vi
      .spyOn(MiladyClient.prototype, "getAuthStatus")
      .mockResolvedValue({
        required: true,
        pairingEnabled: false,
        expiresAt: null,
      });
    const onboardingStatusSpy = vi.spyOn(
      MiladyClient.prototype,
      "getOnboardingStatus",
    );

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
          setOnboardingServerTarget: vi.fn(),
          setOnboardingCloudApiKey: vi.fn(),
          setOnboardingProvider: vi.fn(),
          setOnboardingApiKey: vi.fn(),
          setOnboardingPrimaryModel: vi.fn(),
          setOnboardingRemoteApiBase: vi.fn(),
          setOnboardingRemoteToken: vi.fn(),
          setOnboardingRemoteConnecting,
          setOnboardingRemoteError,
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
          client: new MiladyClient("http://127.0.0.1:31337"),
        }),
      };
    });

    act(() => {
      result.current.onboarding.setField("remoteApiBase", "ren.example.com");
      result.current.onboarding.setField("remoteToken", "");
    });

    await act(async () => {
      await result.current.callbacks.handleOnboardingRemoteConnect();
    });

    expect(authSpy).toHaveBeenCalledTimes(1);
    expect(onboardingStatusSpy).not.toHaveBeenCalled();
    expect(setOnboardingRemoteError).toHaveBeenCalledWith(
      "This backend requires an access key.",
    );
    expect(setOnboardingRemoteConnecting).toHaveBeenCalledWith(true);
    expect(setOnboardingRemoteConnecting).toHaveBeenLastCalledWith(false);
    expect(retryStartup).not.toHaveBeenCalled();
  });

  it("normalizes unauthorized remote backend errors when an access key is rejected", async () => {
    const setOnboardingRemoteError = vi.fn();
    const retryStartup = vi.fn();
    vi.spyOn(MiladyClient.prototype, "getAuthStatus").mockResolvedValue({
      required: false,
      pairingEnabled: false,
      expiresAt: null,
    });
    vi.spyOn(MiladyClient.prototype, "getOnboardingStatus").mockRejectedValue(
      new Error("401 Unauthorized"),
    );

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
          setOnboardingServerTarget: vi.fn(),
          setOnboardingCloudApiKey: vi.fn(),
          setOnboardingProvider: vi.fn(),
          setOnboardingApiKey: vi.fn(),
          setOnboardingPrimaryModel: vi.fn(),
          setOnboardingRemoteApiBase: vi.fn(),
          setOnboardingRemoteToken: vi.fn(),
          setOnboardingRemoteConnecting: vi.fn(),
          setOnboardingRemoteError,
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

    expect(setOnboardingRemoteError).toHaveBeenCalledWith(
      "Access key rejected. Check the address and try again.",
    );
    expect(retryStartup).not.toHaveBeenCalled();
  });

  it("submits canonical credential inputs alongside canonical runtime routing", async () => {
    const submitOnboarding = vi.fn().mockResolvedValue(undefined);
    const updateConfig = vi.fn().mockResolvedValue({});
    const setOnboardingComplete = vi.fn();
    const setTab = vi.fn();
    const loadCharacter = vi.fn().mockResolvedValue(undefined);

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
          setOnboardingServerTarget: vi.fn(),
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
          setOnboardingComplete,
          coordinatorOnboardingCompleteRef: { current: null },
          initialTabSetRef: { current: false },
          setTab,
          defaultLandingTab: "chat",
          loadCharacter,
          uiLanguage: "en",
          selectedVrmIndex: 1,
          walletConfig: {},
          elizaCloudConnected: false,
          setActionNotice: vi.fn(),
          retryStartup: vi.fn(),
          forceLocalBootstrapRef: { current: false },
          client: {
            submitOnboarding,
            updateConfig,
          } as unknown as MiladyClient,
        }),
      };
    });

    act(() => {
      result.current.onboarding.setOptions({
        names: [],
        styles: [getDefaultStylePreset("en")],
        providers: [],
        cloudProviders: [],
        models: { small: [], large: [] },
        inventoryProviders: [],
        sharedStyleRules: "Keep responses brief.",
      });
      result.current.onboarding.setField("name", "Chen");
      result.current.onboarding.setField("serverTarget", "remote");
      result.current.onboarding.setField("provider", "openai");
      result.current.onboarding.setField("cloudApiKey", "ck-linked");
      result.current.onboarding.setField("apiKey", "sk-openai-test");
      result.current.onboarding.setField("primaryModel", "openai/gpt-5.4");
      result.current.onboarding.setField(
        "remoteApiBase",
        "https://ren.example.com",
      );
      result.current.onboarding.setField("remoteToken", "sk-remote");
      result.current.onboarding.setRemoteStatus("connected");
    });

    await act(async () => {
      await result.current.callbacks.handleOnboardingFinish();
    });

    expect(submitOnboarding).toHaveBeenCalledWith(
      expect.objectContaining({
        deploymentTarget: {
          runtime: "remote",
          provider: "remote",
          remoteApiBase: "https://ren.example.com",
          remoteAccessToken: "sk-remote",
        },
        linkedAccounts: {
          elizacloud: {
            status: "linked",
            source: "api-key",
          },
        },
        serviceRouting: {
          llmText: {
            backend: "openai",
            transport: "remote",
            remoteApiBase: "https://ren.example.com",
            primaryModel: "openai/gpt-5.4",
          },
        },
        credentialInputs: {
          cloudApiKey: "ck-linked",
          llmApiKey: "sk-openai-test",
        },
      }),
    );
    expect(setOnboardingComplete).toHaveBeenCalledWith(true);
    expect(setTab).toHaveBeenCalledWith("chat");
  });

  it("finishes Claude limited setup without creating a runtime route and sends the user to settings", async () => {
    const submitOnboarding = vi.fn().mockResolvedValue(undefined);
    const setOnboardingComplete = vi.fn();
    const setTab = vi.fn();
    const setActionNotice = vi.fn();
    const loadCharacter = vi.fn().mockResolvedValue(undefined);

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
          setOnboardingServerTarget: vi.fn(),
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
          setOnboardingComplete,
          coordinatorOnboardingCompleteRef: { current: null },
          initialTabSetRef: { current: false },
          setTab,
          defaultLandingTab: "chat",
          loadCharacter,
          uiLanguage: "en",
          selectedVrmIndex: 1,
          walletConfig: {},
          elizaCloudConnected: false,
          setActionNotice,
          retryStartup: vi.fn(),
          forceLocalBootstrapRef: { current: false },
          client: {
            getAuthStatus: vi.fn().mockResolvedValue({
              required: false,
              pairingEnabled: false,
              expiresAt: null,
            }),
            submitOnboarding,
            updateConfig: vi.fn().mockResolvedValue({}),
          } as unknown as MiladyClient,
        }),
      };
    });

    act(() => {
      result.current.onboarding.setOptions({
        names: [],
        styles: [getDefaultStylePreset("en")],
        providers: [],
        cloudProviders: [],
        models: { small: [], large: [] },
        inventoryProviders: [],
        sharedStyleRules: "Keep responses brief.",
      });
      result.current.onboarding.setField("name", "Chen");
      result.current.onboarding.setField("serverTarget", "local");
      result.current.onboarding.setField("provider", "anthropic-subscription");
      result.current.onboarding.setField("apiKey", "sk-ant-oat01-test-token");
    });

    await act(async () => {
      await result.current.callbacks.handleOnboardingFinish({
        omitRuntimeProvider: true,
      });
    });

    const payload = submitOnboarding.mock.calls[0]?.[0] as
      | Record<string, unknown>
      | undefined;

    expect(payload).toBeDefined();
    expect(payload?.deploymentTarget).toEqual({ runtime: "local" });
    expect(payload?.linkedAccounts).toEqual({
      "anthropic-subscription": {
        status: "linked",
        source: "subscription",
      },
    });
    expect(payload?.serviceRouting).toBeUndefined();
    expect(payload?.credentialInputs).toBeUndefined();
    expect(setActionNotice).toHaveBeenCalledWith(
      "Choose a chat provider in Settings to start chatting.",
      "info",
      6000,
    );
    expect(setOnboardingComplete).toHaveBeenCalledWith(true);
    expect(setTab).toHaveBeenCalledWith("settings");
  });

  it("strips raw API keys from detected providers after onboarding completes", async () => {
    const submitOnboarding = vi.fn().mockResolvedValue(undefined);
    const setOnboardingDetectedProviders = vi.fn();

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
          setOnboardingDetectedProviders,
          setOnboardingServerTarget: vi.fn(),
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
          loadCharacter: vi.fn(async () => {}),
          uiLanguage: "en",
          selectedVrmIndex: 1,
          walletConfig: {},
          elizaCloudConnected: false,
          setActionNotice: vi.fn(),
          retryStartup: vi.fn(),
          forceLocalBootstrapRef: { current: false },
          client: {
            getAuthStatus: vi.fn().mockResolvedValue({
              required: false,
              pairingEnabled: false,
              expiresAt: null,
            }),
            submitOnboarding,
            updateConfig: vi.fn().mockResolvedValue({}),
          } as unknown as MiladyClient,
        }),
      };
    });

    act(() => {
      result.current.onboarding.setOptions({
        names: [],
        styles: [getDefaultStylePreset("en")],
        providers: [],
        cloudProviders: [],
        models: { small: [], large: [] },
        inventoryProviders: [],
        sharedStyleRules: "Keep responses brief.",
      });
      result.current.onboarding.setDetectedProviders([
        { id: "openrouter", apiKey: "sk-or-test" },
        { id: "ollama" },
      ]);
      result.current.onboarding.setField("name", "Chen");
      result.current.onboarding.setField("serverTarget", "local");
      result.current.onboarding.setField("provider", "openai");
      result.current.onboarding.setField("apiKey", "sk-openai-test");
    });

    await act(async () => {
      await result.current.callbacks.handleOnboardingFinish();
    });

    expect(submitOnboarding).toHaveBeenCalledTimes(1);
    expect(setOnboardingDetectedProviders).toHaveBeenCalledWith([
      { id: "openrouter" },
      { id: "ollama" },
    ]);
  });

  it("surfaces onboarding completion failures instead of only logging them", async () => {
    const submitOnboarding = vi
      .fn()
      .mockRejectedValue(new Error("submit failed"));
    const setOnboardingComplete = vi.fn();
    const setTab = vi.fn();
    const setActionNotice = vi.fn();

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
          setOnboardingServerTarget: vi.fn(),
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
          setOnboardingComplete,
          coordinatorOnboardingCompleteRef: { current: null },
          initialTabSetRef: { current: false },
          setTab,
          defaultLandingTab: "chat",
          loadCharacter: vi.fn(async () => {}),
          uiLanguage: "en",
          selectedVrmIndex: 1,
          walletConfig: {},
          elizaCloudConnected: false,
          setActionNotice,
          retryStartup: vi.fn(),
          forceLocalBootstrapRef: { current: false },
          client: {
            getAuthStatus: vi.fn().mockResolvedValue({
              required: false,
              pairingEnabled: false,
              expiresAt: null,
            }),
            submitOnboarding,
            updateConfig: vi.fn().mockResolvedValue({}),
          } as unknown as MiladyClient,
        }),
      };
    });

    act(() => {
      result.current.onboarding.setOptions({
        names: [],
        styles: [getDefaultStylePreset("en")],
        providers: [],
        cloudProviders: [],
        models: { small: [], large: [] },
        inventoryProviders: [],
        sharedStyleRules: "Keep responses brief.",
      });
      result.current.onboarding.setField("name", "Chen");
      result.current.onboarding.setField("serverTarget", "local");
      result.current.onboarding.setField("provider", "openai");
      result.current.onboarding.setField("apiKey", "sk-openai-test");
    });

    await act(async () => {
      await result.current.callbacks.handleOnboardingFinish();
    });

    expect(setActionNotice).toHaveBeenCalledWith(
      "Failed to complete onboarding: submit failed",
      "error",
      8000,
    );
    expect(setOnboardingComplete).not.toHaveBeenCalled();
    expect(setTab).not.toHaveBeenCalled();
  });

  it("warns and still completes onboarding when voice preset persistence fails", async () => {
    const submitOnboarding = vi.fn().mockResolvedValue(undefined);
    const updateConfig = vi
      .fn()
      .mockRejectedValue(new Error("tts save failed"));
    const setOnboardingComplete = vi.fn();
    const setTab = vi.fn();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

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
          setOnboardingServerTarget: vi.fn(),
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
          setOnboardingComplete,
          coordinatorOnboardingCompleteRef: { current: null },
          initialTabSetRef: { current: false },
          setTab,
          defaultLandingTab: "chat",
          loadCharacter: vi.fn(async () => {}),
          uiLanguage: "en",
          selectedVrmIndex: 1,
          walletConfig: {},
          elizaCloudConnected: false,
          setActionNotice: vi.fn(),
          retryStartup: vi.fn(),
          forceLocalBootstrapRef: { current: false },
          client: {
            getAuthStatus: vi.fn().mockResolvedValue({
              required: false,
              pairingEnabled: false,
              expiresAt: null,
            }),
            submitOnboarding,
            updateConfig,
          } as unknown as MiladyClient,
        }),
      };
    });

    act(() => {
      result.current.onboarding.setOptions({
        names: [],
        styles: [getDefaultStylePreset("en")],
        providers: [],
        cloudProviders: [],
        models: { small: [], large: [] },
        inventoryProviders: [],
        sharedStyleRules: "Keep responses brief.",
      });
      result.current.onboarding.setField("name", "Chen");
      result.current.onboarding.setField("serverTarget", "local");
      result.current.onboarding.setField("provider", "openai");
      result.current.onboarding.setField("apiKey", "sk-openai-test");
      result.current.onboarding.setField("voiceProvider", "elevenlabs");
      result.current.onboarding.setField("voiceApiKey", "sk_voice_test");
    });

    await act(async () => {
      await result.current.callbacks.handleOnboardingFinish();
    });

    expect(submitOnboarding).toHaveBeenCalledTimes(1);
    expect(updateConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: {
          tts: expect.objectContaining({
            provider: "elevenlabs",
            mode: "own-key",
            elevenlabs: expect.objectContaining({
              apiKey: "sk_voice_test",
              voiceId: expect.any(String),
            }),
          }),
        },
      }),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      "[onboarding] Failed to persist selected voice preset",
      expect.any(Error),
    );
    expect(setOnboardingComplete).toHaveBeenCalledWith(true);
    expect(setTab).toHaveBeenCalledWith("chat");
  });

  it("completes connected Eliza Cloud onboarding without provisioning a sandbox", async () => {
    const submitOnboarding = vi.fn().mockResolvedValue(undefined);
    const provisionCloudSandbox = vi.fn().mockResolvedValue(undefined);
    const addDeferredOnboardingTask = vi.fn();
    const setOnboardingComplete = vi.fn();
    const setTab = vi.fn();

    (window as unknown as Record<string, unknown>).__ELIZA_CLOUD_AUTH_TOKEN__ =
      "cloud-auth-token";

    const { result } = renderHook(() => {
      const onboarding = useOnboardingState();
      return {
        onboarding,
        callbacks: useOnboardingCallbacks({
          onboarding,
          setOnboardingStep: vi.fn(),
          setOnboardingMode: vi.fn(),
          setOnboardingActiveGuide: vi.fn(),
          addDeferredOnboardingTask,
          setOnboardingDetectedProviders: vi.fn(),
          setOnboardingServerTarget: vi.fn(),
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
          setOnboardingComplete,
          coordinatorOnboardingCompleteRef: { current: null },
          initialTabSetRef: { current: false },
          setTab,
          defaultLandingTab: "chat",
          loadCharacter: async () => {},
          uiLanguage: "en",
          selectedVrmIndex: 1,
          walletConfig: {},
          elizaCloudConnected: true,
          setActionNotice: vi.fn(),
          retryStartup: vi.fn(),
          forceLocalBootstrapRef: { current: false },
          client: {
            provisionCloudSandbox,
            submitOnboarding,
            updateConfig: vi.fn().mockResolvedValue({}),
            setBaseUrl: vi.fn(),
            setToken: vi.fn(),
          } as unknown as MiladyClient,
        }),
      };
    });

    act(() => {
      result.current.onboarding.setOptions({
        names: [],
        styles: [getDefaultStylePreset("en")],
        providers: [],
        cloudProviders: [],
        models: { small: [], large: [] },
        inventoryProviders: [],
        sharedStyleRules: "Keep responses brief.",
      });
      result.current.onboarding.setField("name", "Chen");
      result.current.onboarding.setField("serverTarget", "elizacloud");
      result.current.onboarding.setField("provider", "elizacloud");
    });

    await act(async () => {
      await result.current.callbacks.handleOnboardingFinish();
    });

    expect(provisionCloudSandbox).not.toHaveBeenCalled();
    expect(submitOnboarding).toHaveBeenCalledTimes(1);
    expect(addDeferredOnboardingTask).not.toHaveBeenCalled();
    expect(setOnboardingComplete).toHaveBeenCalledWith(true);
    expect(setTab).toHaveBeenCalledWith("chat");
  });

  it("surfaces a real error when Eliza Cloud onboarding starts without an auth token", async () => {
    const setActionNotice = vi.fn();

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
          setOnboardingServerTarget: vi.fn(),
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
          setActionNotice,
          retryStartup: vi.fn(),
          forceLocalBootstrapRef: { current: false },
          client: {
            provisionCloudSandbox: vi.fn(),
            submitOnboarding: vi.fn(),
            updateConfig: vi.fn().mockResolvedValue({}),
          } as unknown as MiladyClient,
        }),
      };
    });

    act(() => {
      result.current.onboarding.setOptions({
        names: [],
        styles: [getDefaultStylePreset("en")],
        providers: [],
        cloudProviders: [],
        models: { small: [], large: [] },
        inventoryProviders: [],
        sharedStyleRules: "Keep responses brief.",
      });
      result.current.onboarding.setField("name", "Chen");
      result.current.onboarding.setField("serverTarget", "elizacloud");
      result.current.onboarding.setField("provider", "elizacloud");
    });

    await act(async () => {
      await result.current.callbacks.handleOnboardingFinish();
    });

    expect(setActionNotice).toHaveBeenCalledWith(
      "Failed to complete onboarding: Eliza Cloud authentication required. Please log in first.",
      "error",
      8000,
    );
  });

  it("forwards sandbox progress updates to the console during Eliza Cloud onboarding", async () => {
    const submitOnboarding = vi.fn().mockResolvedValue(undefined);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const provisionCloudSandbox = vi.fn(
      async (args: {
        onProgress?: (status: string, detail?: string) => void;
      }) => {
        args.onProgress?.("provisioning", "warming sandbox");
      },
    );

    (window as unknown as Record<string, unknown>).__ELIZA_CLOUD_AUTH_TOKEN__ =
      "cloud-auth-token";

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
          setOnboardingServerTarget: vi.fn(),
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
          client: {
            provisionCloudSandbox,
            submitOnboarding,
            updateConfig: vi.fn().mockResolvedValue({}),
            setBaseUrl: vi.fn(),
            setToken: vi.fn(),
          } as unknown as MiladyClient,
        }),
      };
    });

    act(() => {
      result.current.onboarding.setOptions({
        names: [],
        styles: [getDefaultStylePreset("en")],
        providers: [],
        cloudProviders: [],
        models: { small: [], large: [] },
        inventoryProviders: [],
        sharedStyleRules: "Keep responses brief.",
      });
      result.current.onboarding.setField("name", "Chen");
      result.current.onboarding.setField("serverTarget", "elizacloud");
      result.current.onboarding.setField("provider", "elizacloud");
    });

    await act(async () => {
      await result.current.callbacks.handleOnboardingFinish();
    });

    expect(provisionCloudSandbox).toHaveBeenCalledTimes(1);
    expect(submitOnboarding).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith(
      "[Sandbox] provisioning: warming sandbox",
    );
  });
});
