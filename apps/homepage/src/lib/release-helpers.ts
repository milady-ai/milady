/**
 * Pure functions extracted from scripts/write-homepage-release-data.mjs
 * so they can be unit-tested.
 */

/** jsDelivr CDN base for serving GitHub repo files at a specific release tag. */
export const JSDELIVR_CDN_BASE = "https://cdn.jsdelivr.net/gh/milady-ai/milady";

/**
 * Build a jsDelivr CDN URL for a file committed to the repo at a release tag.
 *
 * Example:
 *   buildCdnUrl("v2.0.0-alpha.128", "install.sh")
 *   → "https://cdn.jsdelivr.net/gh/milady-ai/milady@v2.0.0-alpha.128/install.sh"
 */
export function buildCdnUrl(tag: string, filePath: string): string {
  const cleanPath = filePath.startsWith("/") ? filePath.slice(1) : filePath;
  return `${JSDELIVR_CDN_BASE}@${tag}/${cleanPath}`;
}

export interface GithubRelease {
  draft: boolean;
  prerelease: boolean;
  tag_name?: string;
  published_at?: string;
  created_at?: string;
  html_url?: string;
  assets: Array<{
    name: string;
    size?: number;
    browser_download_url: string;
  }>;
}

/**
 * Match an asset filename to a platform ID.
 * Mirrors the logic in the build script.
 */
export function matchAsset(name: string): string | null {
  const n = name.toLowerCase();
  if (/macos.*arm64.*\.dmg$/.test(n)) return "macos-arm64";
  if (/macos.*x64.*\.dmg$/.test(n)) return "macos-x64";
  if (/setup.*\.exe$/.test(n) || /win.*\.exe$/.test(n)) return "windows-x64";
  if (/win.*setup.*\.zip$/.test(n)) return "windows-x64";
  if (/linux.*\.deb$/.test(n)) return "linux-deb";
  if (/linux.*\.appimage$/.test(n)) return "linux-x64";
  if (/linux.*\.tar\.gz$/.test(n)) return "linux-x64";
  return null;
}

/**
 * Pick the best release from an array of GitHub releases.
 * Skips drafts, prefers most recent release with assets.
 */
export function pickRelease(releases: GithubRelease[]): GithubRelease | null {
  const published = releases.filter((release) => !release.draft);
  published.sort((a, b) => {
    const aTime = Date.parse(a.published_at ?? a.created_at ?? "0");
    const bTime = Date.parse(b.published_at ?? b.created_at ?? "0");
    return bTime - aTime;
  });
  return (
    published.find((r) => Array.isArray(r.assets) && r.assets.length > 0) ??
    published[0] ??
    null
  );
}
