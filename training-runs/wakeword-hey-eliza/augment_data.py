#!/usr/bin/env python3
"""Augment synthesized WAVs with simple PCM-domain perturbations.

Reads every *.wav under --src-dir, writes the original + N augmented copies
to --dst-dir. Augmentations (deterministic per seed):

  - gain: ×0.5 .. ×1.5
  - additive white noise: SNR 25-40 dB
  - time-shift: ±200 ms (with zero-pad)
  - mild speed change: ±5% (via linear resample; pitch shifts with it,
    which is fine for wake-word training — speakers vary by speed AND pitch)

All outputs stay 16 kHz mono PCM16 at the same duration as the input
(after speed-change re-pad/trim).
"""

from __future__ import annotations

import argparse
import wave
from pathlib import Path

import numpy as np


SAMPLE_RATE = 16_000


def read_wav(path: Path) -> np.ndarray:
    with wave.open(str(path), "rb") as w:
        assert w.getframerate() == SAMPLE_RATE
        assert w.getnchannels() == 1
        assert w.getsampwidth() == 2
        raw = w.readframes(w.getnframes())
    return np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0


def write_wav(path: Path, pcm: np.ndarray) -> None:
    clipped = np.clip(pcm * 32768.0, -32768, 32767).astype(np.int16)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SAMPLE_RATE)
        w.writeframes(clipped.tobytes())


def apply_gain(pcm: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    g = rng.uniform(0.5, 1.5)
    return pcm * g


def add_noise(pcm: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    snr_db = rng.uniform(25.0, 40.0)
    signal_rms = float(np.sqrt(np.mean(pcm ** 2) + 1e-12))
    noise_rms = signal_rms / (10.0 ** (snr_db / 20.0))
    noise = rng.standard_normal(pcm.shape).astype(np.float32) * noise_rms
    return pcm + noise


def time_shift(pcm: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    max_shift_samples = int(0.2 * SAMPLE_RATE)
    shift = int(rng.integers(-max_shift_samples, max_shift_samples + 1))
    out = np.zeros_like(pcm)
    if shift > 0:
        out[shift:] = pcm[: pcm.shape[0] - shift]
    elif shift < 0:
        out[: pcm.shape[0] + shift] = pcm[-shift:]
    else:
        out = pcm.copy()
    return out


def speed_change(pcm: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    factor = float(rng.uniform(0.95, 1.05))
    new_len = max(1, int(round(pcm.shape[0] / factor)))
    # Linear resample.
    src_idx = np.linspace(0, pcm.shape[0] - 1, new_len)
    floor = np.floor(src_idx).astype(np.int64)
    ceil = np.minimum(floor + 1, pcm.shape[0] - 1)
    frac = (src_idx - floor).astype(np.float32)
    resampled = pcm[floor] * (1 - frac) + pcm[ceil] * frac
    # Pad/trim back to original length so the windowing stays consistent.
    if resampled.shape[0] >= pcm.shape[0]:
        start = (resampled.shape[0] - pcm.shape[0]) // 2
        return resampled[start : start + pcm.shape[0]]
    pad = pcm.shape[0] - resampled.shape[0]
    pre = pad // 2
    post = pad - pre
    return np.concatenate([np.zeros(pre, dtype=np.float32), resampled.astype(np.float32), np.zeros(post, dtype=np.float32)])


def augment(pcm: np.ndarray, seed: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    out = pcm.copy()
    # Apply each augmentation with prob 0.6 to keep some originals close.
    if rng.random() < 0.6:
        out = speed_change(out, rng)
    if rng.random() < 0.7:
        out = time_shift(out, rng)
    if rng.random() < 0.7:
        out = apply_gain(out, rng)
    if rng.random() < 0.7:
        out = add_noise(out, rng)
    return out


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--src-dir", type=Path, required=True)
    ap.add_argument("--dst-dir", type=Path, required=True)
    ap.add_argument("--copies-per-clip", type=int, default=5,
                    help="Number of augmented copies per source clip (in addition to the original).")
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args(argv)

    args.dst_dir.mkdir(parents=True, exist_ok=True)
    wavs = sorted(args.src_dir.glob("*.wav"))
    if not wavs:
        raise SystemExit(f"no wavs in {args.src_dir}")
    n_orig = 0
    n_aug = 0
    for i, src in enumerate(wavs):
        pcm = read_wav(src)
        orig_dst = args.dst_dir / f"orig-{i:05d}.wav"
        write_wav(orig_dst, pcm)
        n_orig += 1
        for k in range(args.copies_per_clip):
            seed = args.seed + i * 100 + k
            aug = augment(pcm, seed)
            dst = args.dst_dir / f"aug-{i:05d}-{k:02d}.wav"
            write_wav(dst, aug)
            n_aug += 1
    print(f"[augment] wrote {n_orig} originals + {n_aug} augmented to {args.dst_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
