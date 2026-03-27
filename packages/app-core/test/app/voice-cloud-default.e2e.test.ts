// @vitest-environment jsdom

import { useVoiceChat } from "@miladyai/app-core/hooks";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

class MockAnalyserNode {
  fftSize = 0;
  smoothingTimeConstant = 0;

  connect() {}
  disconnect() {}
  getFloatTimeDomainData(data: Float32Array) {
    data.fill(0);
  }
}

class MockAudioBufferSourceNode {
  buffer: { duration: number } | null = null;
  onended: (() => void) | null = null;

  connect() {}
  disconnect() {}
  stop() {}
  start() {
    queueMicrotask(() => {
      this.onended?.();
    });
  }
}

class MockAudioContext {
  state: AudioContextState = "running";
  destination = {};

  async resume() {}
  async close() {}
  async decodeAudioData() {
    return { duration: 0.05 } as AudioBuffer;
  }
  createAnalyser() {
    return new MockAnalyserNode() as unknown as AnalyserNode;
  }
  createBufferSource() {
    return new MockAudioBufferSourceNode() as unknown as AudioBufferSourceNode;
  }
}

describe("voice cloud default (e2e)", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "audio/mpeg" }),
      arrayBuffer: async () => new ArrayBuffer(16),
      text: async () => "",
    } satisfies Partial<Response>);

    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("AudioContext", MockAudioContext);
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: null,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the ElevenLabs server proxy when cloud is available and the stored key is only a masked placeholder", async () => {
    const { result } = renderHook(() =>
      useVoiceChat({
        cloudConnected: true,
        onTranscript: vi.fn(),
        voiceConfig: {
          provider: "elevenlabs",
          elevenlabs: {
            apiKey: "sk-t...1234",
            voiceId: "voice-123",
          },
        },
      }),
    );

    await act(async () => {
      result.current.speak("Hello from the cloud voice path.");
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/tts/elevenlabs");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toMatchObject({
      text: "Hello from the cloud voice path.",
      voiceId: "voice-123",
      modelId: "eleven_flash_v2_5",
      outputFormat: "mp3_44100_128",
    });
  });
});
