const RECOMMENDED_BUN_MAJOR = 1;
const RECOMMENDED_BUN_MINOR = 3;

function parseBunVersion(rawVersion) {
  const trimmed = String(rawVersion ?? "").trim();
  const match = /^(\d+)\.(\d+)\.(\d+)(.*)$/.exec(trimmed);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    suffix: match[4] ?? "",
    raw: trimmed,
  };
}

export function getBunVersionAdvisory() {
  const raw = globalThis.Bun?.version;
  if (!raw) return null;
  const parsed = parseBunVersion(raw);
  if (!parsed) {
    return `Detected Bun ${raw}. Recommended dev toolchain is Bun ${RECOMMENDED_BUN_MAJOR}.${RECOMMENDED_BUN_MINOR}.x stable.`;
  }

  const isCanary = parsed.suffix.includes("canary");
  if (isCanary) {
    return `Detected Bun ${parsed.raw} (canary). Bun canary can break module interop; prefer Bun ${RECOMMENDED_BUN_MAJOR}.${RECOMMENDED_BUN_MINOR}.x stable for dev.`;
  }

  if (
    parsed.major !== RECOMMENDED_BUN_MAJOR ||
    parsed.minor !== RECOMMENDED_BUN_MINOR
  ) {
    return `Detected Bun ${parsed.raw}. Recommended dev toolchain is Bun ${RECOMMENDED_BUN_MAJOR}.${RECOMMENDED_BUN_MINOR}.x stable.`;
  }

  return null;
}

