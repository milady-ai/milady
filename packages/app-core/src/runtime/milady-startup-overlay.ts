/**
 * In-process embedding warmup progress for merging into GET /api/status.
 * The UI can poll status during startup to show download progress (GGUF).
 */

export type MiladyEmbeddingWarmupPhase =
  | "checking"
  | "downloading"
  | "loading"
  | "ready";

interface Snapshot {
  phase: MiladyEmbeddingWarmupPhase;
  detail?: string;
  updatedAt: number;
}

let snapshot: Snapshot | null = null;

const STALE_MS = 120_000;

/** Extract a 0–100 percentage from progress strings like "45% of 95 MB". */
export function parseEmbeddingProgressPercent(
  detail: string | undefined,
): number | undefined {
  if (!detail) return undefined;
  const m = detail.match(/(\d+(?:\.\d+)?)\s*%/);
  if (!m) return undefined;
  const n = Number.parseFloat(m[1] ?? "");
  if (!Number.isFinite(n)) return undefined;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function updateMiladyStartupEmbeddingProgress(
  phase: MiladyEmbeddingWarmupPhase,
  detail?: string,
): void {
  snapshot = {
    phase,
    detail,
    updatedAt: Date.now(),
  };
  if (phase === "ready") {
    snapshot = null;
  }
}

export function clearMiladyStartupEmbeddingProgress(): void {
  snapshot = null;
}

/**
 * Fields merged into the JSON `startup` object on GET /api/status (Milady compat layer).
 */
export function getMiladyStartupEmbeddingAugmentation(): Record<
  string,
  unknown
> | null {
  if (!snapshot) return null;
  if (Date.now() - snapshot.updatedAt > STALE_MS) {
    snapshot = null;
    return null;
  }
  if (snapshot.phase === "ready") return null;

  const out: Record<string, unknown> = {
    embeddingPhase: snapshot.phase,
  };
  if (snapshot.detail) {
    out.embeddingDetail = snapshot.detail;
    const pct = parseEmbeddingProgressPercent(snapshot.detail);
    if (pct !== undefined) {
      out.embeddingProgressPct = pct;
    }
  }
  return out;
}
