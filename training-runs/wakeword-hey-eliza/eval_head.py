#!/usr/bin/env python3
"""Held-out evaluation for the trained wake-word head.

Runs each WAV in --positives-dir and --negatives-dir through the same
front-end + head the runtime uses, reports the highest P(wake) per clip,
and computes accept/reject rates at the threshold from the provenance
sidecar.

Outputs JSON to stdout (and --out if given) with per-clip scores plus
aggregate metrics: trueAcceptRate, falseAcceptRate, threshold.
"""

from __future__ import annotations

import argparse
import json
import sys
import wave
from pathlib import Path

_TRAINING_ROOT = Path("/home/shaw/milady/eliza/packages/training")
sys.path.insert(0, str(_TRAINING_ROOT))

from scripts.wakeword.train_eliza1_wakeword_head import (  # noqa: E402
    HEAD_WINDOW_EMBEDDINGS,
    EMBEDDING_DIM,
    OpenWakeWordFrontEnd,
    read_wav_pcm16_mono,
)


def score_clip(wav_path: Path, front_end: OpenWakeWordFrontEnd, head_sess) -> float:
    """Return the maximum P(wake) across all windows in this clip."""
    import numpy as np  # noqa: PLC0415

    pcm = read_wav_pcm16_mono(wav_path)
    windows = front_end.embedding_windows(pcm)
    if not windows:
        return 0.0
    best = 0.0
    for w in windows:
        arr = np.asarray(w, dtype=np.float32)[None, :, :]
        out = head_sess.run(None, {head_sess.get_inputs()[0].name: arr})[0]
        p = float(out.flatten()[0])
        if p > best:
            best = p
    return best


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--front-mel", type=Path, required=True)
    ap.add_argument("--front-emb", type=Path, required=True)
    ap.add_argument("--head", type=Path, required=True)
    ap.add_argument("--positives-dir", type=Path, required=True)
    ap.add_argument("--negatives-dir", type=Path, required=True)
    ap.add_argument("--threshold", type=float, default=None,
                    help="Override threshold; default reads from <head>.provenance.json")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args(argv)

    import onnxruntime as ort  # noqa: PLC0415

    front_end = OpenWakeWordFrontEnd(args.front_mel, args.front_emb)
    head = ort.InferenceSession(str(args.head), providers=["CPUExecutionProvider"])

    threshold = args.threshold
    if threshold is None:
        prov = args.head.with_suffix(".provenance.json")
        if prov.is_file():
            blob = json.loads(prov.read_text())
            threshold = blob.get("headMetrics", {}).get("threshold")
    if threshold is None:
        threshold = 0.5

    pos_wavs = sorted(args.positives_dir.glob("*.wav"))
    neg_wavs = sorted(args.negatives_dir.glob("*.wav"))
    if not pos_wavs or not neg_wavs:
        sys.stderr.write("need positives + negatives\n")
        return 2

    pos_scores = []
    for w in pos_wavs:
        s = score_clip(w, front_end, head)
        pos_scores.append({"wav": w.name, "score": round(s, 4), "fired": s >= threshold})
    neg_scores = []
    for w in neg_wavs:
        s = score_clip(w, front_end, head)
        neg_scores.append({"wav": w.name, "score": round(s, 4), "fired": s >= threshold})

    true_accept = sum(1 for r in pos_scores if r["fired"]) / max(1, len(pos_scores))
    false_accept = sum(1 for r in neg_scores if r["fired"]) / max(1, len(neg_scores))

    report = {
        "threshold": round(threshold, 4),
        "trueAcceptRate": round(true_accept, 4),
        "falseAcceptRate": round(false_accept, 4),
        "heldOutPositives": len(pos_scores),
        "heldOutNegatives": len(neg_scores),
        "positives": pos_scores,
        "negatives": neg_scores,
    }
    blob = json.dumps(report, indent=2) + "\n"
    print(blob)
    if args.out:
        args.out.write_text(blob)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
