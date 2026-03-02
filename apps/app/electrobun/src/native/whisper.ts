/**
 * Whisper Module — STUB
 *
 * Native whisper-node is not yet available in Electrobun's Bun context.
 */

export function getWhisperInfo(): { available: boolean; reason?: string } {
  return {
    available: false,
    reason: "whisper-node not available in Electrobun yet",
  };
}
