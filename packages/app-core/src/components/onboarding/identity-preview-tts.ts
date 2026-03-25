const CLOUD_TTS_VOICE_IDS = new Set([
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "nova",
  "sage",
  "shimmer",
  "verse",
]);

export function resolvePreviewTtsEndpoints(voiceId: string): string[] {
  const normalizedVoiceId = voiceId.trim().toLowerCase();
  const isCloudVoice = CLOUD_TTS_VOICE_IDS.has(normalizedVoiceId);
  return isCloudVoice
    ? ["/api/tts/cloud", "/api/tts/elevenlabs"]
    : ["/api/tts/elevenlabs"];
}

