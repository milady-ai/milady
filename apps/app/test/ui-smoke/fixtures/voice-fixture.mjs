import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Synthetic "voice turn" audio for the bidirectional voice e2e.
 *
 * Chromium's `--use-file-for-fake-audio-capture` loops this WAV into
 * `getUserMedia`, so the /chat overlay's REAL mic capture + REAL VAD
 * end-of-turn detector (`createLocalAsrAutoStopDetector`: min-speech 180ms,
 * end-of-turn after 900ms of silence) run against it unchanged. We only stub
 * the on-device ASR/TTS models server-side.
 *
 * The "speech" segment is a loud, harmonic, syllable-modulated buzz — speech-
 * like enough to survive the browser's noise-suppression/AGC and stay well
 * above the detector's energy thresholds — followed by >=1s of true silence so
 * end-of-turn fires within one loop regardless of where capture starts.
 */
export const VOICE_FIXTURE = {
  sampleRate: 48_000,
  speechSeconds: 0.6,
  silenceSeconds: 1.4,
  /** Peak amplitude of the speech segment (0..1). */
  peak: 0.7,
};

// Formant-ish harmonic stack over a ~140Hz glottal f0 — a coarse vowel.
const F0 = 140;
const HARMONICS = [
  { hz: F0, gain: 0.5 },
  { hz: 330, gain: 0.38 },
  { hz: 660, gain: 0.26 },
  { hz: 1100, gain: 0.16 },
  { hz: 2400, gain: 0.1 },
];
// Syllabic amplitude modulation (~5 "syllables"/sec) so it reads as speech, not
// a steady tone the noise suppressor would gate out.
const SYLLABLE_HZ = 5;

function speechSample(t) {
  let value = 0;
  for (const { hz, gain } of HARMONICS) {
    value += gain * Math.sin(2 * Math.PI * hz * t);
  }
  const envelope = 0.55 + 0.45 * Math.sin(2 * Math.PI * SYLLABLE_HZ * t);
  return value * envelope;
}

export function buildVoiceTurnWav() {
  const { sampleRate, speechSeconds, silenceSeconds, peak } = VOICE_FIXTURE;
  const speechSamples = Math.round(sampleRate * speechSeconds);
  const silenceSamples = Math.round(sampleRate * silenceSeconds);

  const speech = new Float32Array(speechSamples);
  let rawPeak = 0;
  for (let i = 0; i < speechSamples; i += 1) {
    const sample = speechSample(i / sampleRate);
    speech[i] = sample;
    const abs = Math.abs(sample);
    if (abs > rawPeak) rawPeak = abs;
  }
  const scale = rawPeak > 0 ? peak / rawPeak : 0;

  const totalSamples = speechSamples + silenceSamples;
  const dataBytes = totalSamples * 2;
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16); // PCM fmt chunk size
  buffer.writeUInt16LE(1, 20); // audioFormat = PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28); // byteRate (mono, 16-bit)
  buffer.writeUInt16LE(2, 32); // blockAlign
  buffer.writeUInt16LE(16, 34); // bitsPerSample
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataBytes, 40);

  let offset = 44;
  for (let i = 0; i < speechSamples; i += 1) {
    const clamped = Math.max(-1, Math.min(1, speech[i] * scale));
    buffer.writeInt16LE(Math.round(clamped * 0x7fff), offset);
    offset += 2;
  }
  // Trailing silence — true zeros, so the VAD sees an unambiguous end-of-turn.
  buffer.fill(0, offset, offset + silenceSamples * 2);

  return buffer;
}

/**
 * Write the fixture to a stable temp path and return it. Regenerated each call
 * (cheap, deterministic) so a stale file from an older shape never lingers.
 */
export function ensureVoiceTurnWav() {
  const dir = path.join(os.tmpdir(), "eliza-ui-smoke-voice");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const target = path.join(dir, "voice-turn.wav");
  writeFileSync(target, buildVoiceTurnWav());
  return target;
}

// `node voice-fixture.mjs` — write it and print the path (handy for debugging).
if (import.meta.url === `file://${process.argv[1]}`) {
  process.stdout.write(`${ensureVoiceTurnWav()}\n`);
}
