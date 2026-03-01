/**
 * Talk Mode Module — STUB
 *
 * Voice I/O (TTS + Whisper STT) is not yet available in Electrobun.
 */

function notAvailable(feature: string) {
  return Promise.resolve({ error: `${feature} not available in Electrobun yet` });
}

export const talkModeHandlers: Record<string, (args: unknown[]) => Promise<unknown>> = {
  "talkmode:start": () => notAvailable("talkmode:start"),
  "talkmode:stop": () => Promise.resolve(),
  "talkmode:speak": () => notAvailable("talkmode:speak"),
  "talkmode:stopSpeaking": () => Promise.resolve(),
  "talkmode:getState": () => Promise.resolve({ enabled: false, speaking: false, listening: false }),
  "talkmode:getWhisperInfo": () => Promise.resolve({ available: false, reason: "Not available in Electrobun" }),
  "talkmode:isEnabled": () => Promise.resolve({ enabled: false }),
  "talkmode:isSpeaking": () => Promise.resolve({ speaking: false }),
  "talkmode:isWhisperAvailable": () => Promise.resolve({ available: false }),
  "talkmode:updateConfig": () => Promise.resolve(),
  "talkmode:audioChunk": () => Promise.resolve(),
};

export function getTalkModeManager() {
  return { setMainWindow: () => {}, dispose: () => {} };
}
