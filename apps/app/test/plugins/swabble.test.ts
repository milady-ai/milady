// @vitest-environment jsdom
/**
 * Tests for @miladyai/capacitor-swabble — wake word, speech, audio devices, permissions.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SwabbleWeb } from "../../plugins/swabble/src/web";

describe("@miladyai/capacitor-swabble", () => {
  let sw: SwabbleWeb;

  beforeEach(() => {
    vi.restoreAllMocks();
    // jsdom doesn't fully provide mediaDevices or permissions — stub them
    if (!navigator.mediaDevices) {
      Object.defineProperty(navigator, "mediaDevices", {
        value: {},
        writable: true,
        configurable: true,
      });
    }
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: vi.fn(),
      writable: true,
      configurable: true,
    });
    Object.defineProperty(navigator.mediaDevices, "enumerateDevices", {
      value: vi.fn().mockResolvedValue([]),
      writable: true,
      configurable: true,
    });
    if (!navigator.permissions) {
      Object.defineProperty(navigator, "permissions", {
        value: { query: vi.fn().mockResolvedValue({ state: "prompt" }) },
        writable: true,
        configurable: true,
      });
    }
    sw = new SwabbleWeb();
  });

  // -- State machine --

  describe("state", () => {
    it("starts idle with null config", async () => {
      expect((await sw.isListening()).listening).toBe(false);
      expect((await sw.getConfig()).config).toBeNull();
    });

    it("stop is idempotent", async () => {
      await sw.stop();
      await sw.stop();
      expect((await sw.isListening()).listening).toBe(false);
    });
  });

  // -- Start without SpeechRecognition --

  describe("start without SpeechRecognition", () => {
    it("returns error and stays idle", async () => {
      const r = await sw.start({ config: { triggers: ["hey claude"] } });
      expect(r.started).toBe(false);
      expect(r.error).toContain("not supported");
      expect((await sw.isListening()).listening).toBe(false);
    });
  });

  // -- Config --

  it("updateConfig is a no-op when not started", async () => {
    await sw.updateConfig({ config: { triggers: ["new"], locale: "fr-FR" } });
    expect((await sw.getConfig()).config).toBeNull();
  });

  // -- Audio devices --

  describe("audio devices", () => {
    it("returns empty on enumerateDevices failure", async () => {
      vi.spyOn(
        navigator.mediaDevices,
        "enumerateDevices",
      ).mockRejectedValueOnce(new Error("denied"));
      expect((await sw.getAudioDevices()).devices).toEqual([]);
    });

    it("filters to audioinput and labels correctly", async () => {
      vi.spyOn(
        navigator.mediaDevices,
        "enumerateDevices",
      ).mockResolvedValueOnce([
        {
          kind: "audioinput",
          deviceId: "default",
          label: "Default Mic",
          groupId: "g",
          toJSON: () => ({}),
        },
        {
          kind: "videoinput",
          deviceId: "cam",
          label: "Camera",
          groupId: "g",
          toJSON: () => ({}),
        },
        {
          kind: "audioinput",
          deviceId: "usb",
          label: "",
          groupId: "g",
          toJSON: () => ({}),
        },
      ] as MediaDeviceInfo[]);

      const { devices } = await sw.getAudioDevices();
      expect(devices).toHaveLength(2);
      expect(devices[0]).toEqual({
        id: "default",
        name: "Default Mic",
        isDefault: true,
      });
      expect(devices[1]).toEqual({
        id: "usb",
        name: "Microphone 2",
        isDefault: false,
      });
    });
  });

  // -- WakeWordGate logic (tested indirectly via start + handleSpeechResult) --
  // WakeWordGate is a private class. We can test its logic by providing a mock
  // SpeechRecognition and feeding results through the public interface.
  // Since SpeechRecognition isn't available in our env, we test the gate
  // by accessing the private wakeGate after a failed start stores the config.

  describe("WakeWordGate (pure logic)", () => {
    it("emits wakeWord events when final speech matches a configured trigger", async () => {
      const originalSpeechRecognition = (
        window as Window & { SpeechRecognition?: unknown }
      ).SpeechRecognition;
      const originalAudioContext = globalThis.AudioContext;

      class MockSpeechRecognition extends EventTarget {
        static instance: MockSpeechRecognition | null = null;

        continuous = false;
        interimResults = false;
        lang = "en-US";
        onstart: (() => void) | null = null;
        onend: (() => void) | null = null;
        onerror: ((event: { error: string }) => void) | null = null;
        onresult:
          | ((event: {
              resultIndex: number;
              results: {
                length: number;
                [index: number]: {
                  isFinal: boolean;
                  0: { transcript: string; confidence: number };
                };
              };
            }) => void)
          | null = null;

        constructor() {
          super();
          MockSpeechRecognition.instance = this;
        }

        start() {
          this.onstart?.();
        }

        stop() {
          this.onend?.();
        }

        abort() {}
      }

      class MockAudioContext {
        createAnalyser = vi.fn(() => ({
          fftSize: 0,
          frequencyBinCount: 32,
          getByteFrequencyData: vi.fn((arr: Uint8Array) => arr.fill(0)),
        }));

        createMediaStreamSource = vi.fn(() => ({
          connect: vi.fn(),
        }));

        close = vi.fn(async () => {});
      }

      Object.defineProperty(window, "SpeechRecognition", {
        configurable: true,
        value: MockSpeechRecognition,
      });
      Object.defineProperty(globalThis, "AudioContext", {
        configurable: true,
        value: MockAudioContext,
      });
      vi.spyOn(navigator.mediaDevices, "getUserMedia").mockResolvedValue({
        getTracks: () => [],
      } as unknown as MediaStream);

      const notifySpy = vi.spyOn(
        sw as unknown as {
          notifyListeners: (eventName: string, payload: unknown) => void;
        },
        "notifyListeners",
      );

      const result = await sw.start({
        config: {
          triggers: ["hey milady"],
          minCommandLength: 3,
        },
      });

      expect(result.started).toBe(true);
      expect(MockSpeechRecognition.instance).not.toBeNull();
      MockSpeechRecognition.instance?.onresult?.({
        resultIndex: 0,
        results: {
          length: 1,
          0: {
            isFinal: true,
            0: {
              transcript: "hey milady open settings",
              confidence: 0.91,
            },
          },
        },
      });

      expect(notifySpy).toHaveBeenCalledWith(
        "wakeWord",
        expect.objectContaining({
          wakeWord: "hey milady",
          command: "open settings",
          postGap: -1,
          transcript: "hey milady open settings",
          confidence: 0.91,
        }),
      );

      await sw.stop();

      if (originalSpeechRecognition === undefined) {
        Reflect.deleteProperty(window, "SpeechRecognition");
      } else {
        Object.defineProperty(window, "SpeechRecognition", {
          configurable: true,
          value: originalSpeechRecognition,
        });
      }
      Object.defineProperty(globalThis, "AudioContext", {
        configurable: true,
        value: originalAudioContext,
      });
    });
  });

  // -- setAudioDevice --

  it("setAudioDevice throws on web", async () => {
    await expect(sw.setAudioDevice({ deviceId: "x" })).rejects.toThrow(
      /not supported on web/i,
    );
  });

  // -- Permissions --

  describe("permissions", () => {
    it("checkPermissions reports not_supported for speechRecognition", async () => {
      vi.spyOn(navigator.permissions, "query").mockResolvedValueOnce({
        state: "granted",
      } as PermissionStatus);
      const r = await sw.checkPermissions();
      expect(r.microphone).toBe("granted");
      expect(r.speechRecognition).toBe("not_supported");
    });

    it("checkPermissions falls back to prompt on query failure", async () => {
      vi.spyOn(navigator.permissions, "query").mockRejectedValueOnce(
        new Error("nope"),
      );
      expect((await sw.checkPermissions()).microphone).toBe("prompt");
    });

    it("requestPermissions returns denied when getUserMedia fails", async () => {
      vi.spyOn(navigator.mediaDevices, "getUserMedia").mockRejectedValueOnce(
        new Error("denied"),
      );
      const r = await sw.requestPermissions();
      expect(r.microphone).toBe("denied");
      expect(r.speechRecognition).toBe("denied");
    });
  });
});
