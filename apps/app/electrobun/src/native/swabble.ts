/**
 * Swabble (Audio Input / Whisper STT) Module — STUB
 *
 * Not yet available in Electrobun.
 */

function notAvailable(feature: string) {
  return Promise.resolve({ error: `${feature} not available in Electrobun yet` });
}

export const swabbleHandlers: Record<string, (args: unknown[]) => Promise<unknown>> = {
  "swabble:start": () => notAvailable("swabble:start"),
  "swabble:stop": () => Promise.resolve(),
  "swabble:isListening": () => Promise.resolve({ listening: false }),
  "swabble:isWhisperAvailable": () => Promise.resolve({ available: false }),
  "swabble:getConfig": () => Promise.resolve({}),
  "swabble:updateConfig": () => Promise.resolve(),
  "swabble:audioChunk": () => Promise.resolve(),
};

export function getSwabbleManager() {
  return { setMainWindow: () => {}, dispose: () => {} };
}
