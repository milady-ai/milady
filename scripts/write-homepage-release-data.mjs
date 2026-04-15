#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolveRepoRoot } from "./lib/repo-root.mjs";

const REPOSITORY = "milady-ai/milady";
const REPO_ROOT = resolveRepoRoot(import.meta.url);
const OUTPUT_PATH = path.resolve(
  REPO_ROOT,
  "apps/homepage/src/generated/release-data.ts",
);
const RELEASES_URL = `https://api.github.com/repos/${REPOSITORY}/releases?per_page=20`;
const RELEASES_PAGE_URL = `https://github.com/${REPOSITORY}/releases`;

const installBaseUrl = "https://milady.ai";
const scripts = {
  shell: {
    url: `${installBaseUrl}/install.sh`,
    command: `curl -fsSL ${installBaseUrl}/install.sh | bash`,
  },
  powershell: {
    url: `${installBaseUrl}/install.ps1`,
    command: `irm ${installBaseUrl}/install.ps1 | iex`,
  },
};

const publishedAtFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function buildRawGitHubAssetBase({ repository, releaseTag, assetRoot }) {
  if (!repository || !releaseTag || !assetRoot) {
    return "";
  }

  const normalizedRoot = assetRoot.replace(/^\/+|\/+$/g, "");
  return `https://raw.githubusercontent.com/${repository}/${releaseTag}/${normalizedRoot}/`;
}

function normalizeReleaseTag(value) {
  const normalized = value?.trim();
  if (!normalized || !/^[vV]?\d+\.\d+\.\d+(?:[-.][\w.-]+)?$/.test(normalized)) {
    return null;
  }

  return normalized.startsWith("v") ? normalized : `v${normalized}`;
}

function resolveRequestedReleaseTag() {
  return normalizeReleaseTag(
    process.env.MILADY_RELEASE_TAG ||
      process.env.ELIZA_RELEASE_TAG ||
      process.env.RELEASE_TAG ||
      process.env.GITHUB_REF_NAME,
  );
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "size unavailable";
  }

  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  const decimals = unitIndex === 0 ? 0 : 1;
  return `${size.toFixed(decimals)} ${units[unitIndex]}`;
}

function noteForAsset(name) {
  if (/\.dmg$/i.test(name)) {
    return "DMG installer";
  }
  if (/\.msix$/i.test(name)) {
    return "MSIX package";
  }
  if (/\.exe$/i.test(name)) {
    return "Windows installer";
  }
  if (/\.zip$/i.test(name)) {
    return "ZIP package";
  }
  if (/\.appimage$/i.test(name)) {
    return "AppImage";
  }
  if (/\.deb$/i.test(name)) {
    return "Debian package";
  }
  if (/\.tar\.gz$/i.test(name)) {
    return "tar.gz package";
  }
  return "Release asset";
}

function sortReleasesByRecency(releases) {
  return [...releases]
    .filter((release) => !release.draft)
    .sort((a, b) => {
      const aTime = Date.parse(a.published_at ?? a.created_at ?? 0);
      const bTime = Date.parse(b.published_at ?? b.created_at ?? 0);
      return bTime - aTime;
    });
}

function pickStableRelease(releases) {
  const stable = sortReleasesByRecency(releases).filter((r) => !r.prerelease);
  return (
    stable.find((r) => Array.isArray(r.assets) && r.assets.length > 0) ??
    stable[0] ??
    null
  );
}

function pickAsset(assets, matchers) {
  for (const matcher of matchers) {
    const asset = assets.find(matcher);
    if (asset) {
      return asset;
    }
  }
  return null;
}

function serializeDownload(id, label, asset) {
  return {
    id,
    label,
    fileName: asset.name,
    url: asset.browser_download_url,
    sizeLabel: formatBytes(asset.size ?? 0),
    note: noteForAsset(asset.name),
  };
}

function pickAssetFromReleases(releases, matchers) {
  for (const release of releases) {
    const assets = Array.isArray(release.assets) ? release.assets : [];
    const asset = pickAsset(assets, matchers);
    if (asset) {
      return asset;
    }
  }
  return null;
}

function buildRelease(release, stableReleases = []) {
  if (!release) {
    return {
      tagName: "unavailable",
      publishedAtLabel: "unavailable",
      prerelease: false,
      url: RELEASES_PAGE_URL,
      downloads: [],
      checksum: null,
    };
  }

  const assets = Array.isArray(release.assets) ? release.assets : [];
  const releasesByRecency = sortReleasesByRecency(stableReleases).filter(
    (candidate) => candidate.tag_name !== release.tag_name,
  );
  const prioritizedReleases = [release, ...releasesByRecency].filter(Boolean);

  const downloads = [
    {
      id: "macos-arm64",
      label: "macOS (Apple Silicon)",
      asset: pickAssetFromReleases(prioritizedReleases, [
        (asset) =>
          /macos-arm64/i.test(asset.name) && /\.dmg$/i.test(asset.name),
        (asset) => /arm64/i.test(asset.name) && /\.dmg$/i.test(asset.name),
      ]),
    },
    {
      id: "macos-x64",
      label: "macOS (Intel)",
      asset: pickAssetFromReleases(prioritizedReleases, [
        (asset) => /macos-x64/i.test(asset.name) && /\.dmg$/i.test(asset.name),
        (asset) =>
          /mac/i.test(asset.name) &&
          !/arm64/i.test(asset.name) &&
          /\.dmg$/i.test(asset.name),
      ]),
    },
    {
      id: "windows-x64",
      label: "Windows",
      asset: pickAssetFromReleases(prioritizedReleases, [
        (asset) => /setup/i.test(asset.name) && /\.exe$/i.test(asset.name),
        (asset) => /win/i.test(asset.name) && /\.exe$/i.test(asset.name),
        (asset) => /win/i.test(asset.name) && /\.msix$/i.test(asset.name),
      ]),
    },
    {
      id: "linux-x64",
      label: "Linux",
      asset: pickAssetFromReleases(prioritizedReleases, [
        (asset) => /linux/i.test(asset.name) && /\.appimage$/i.test(asset.name),
        (asset) => /linux/i.test(asset.name) && /\.tar\.gz$/i.test(asset.name),
      ]),
    },
    {
      id: "linux-deb",
      label: "Ubuntu / Debian",
      asset: pickAssetFromReleases(prioritizedReleases, [
        (asset) => /linux/i.test(asset.name) && /\.deb$/i.test(asset.name),
        (asset) => /\.deb$/i.test(asset.name),
      ]),
    },
  ]
    .filter((entry) => entry.asset)
    .map((entry) => serializeDownload(entry.id, entry.label, entry.asset));

  const checksumAsset =
    assets.find((asset) => asset.name === "SHA256SUMS.txt") ?? null;

  return {
    tagName: release.tag_name ?? "unavailable",
    publishedAtLabel: release.published_at
      ? publishedAtFormatter.format(new Date(release.published_at))
      : "unavailable",
    prerelease: false,
    url: release.html_url ?? RELEASES_PAGE_URL,
    downloads,
    checksum: checksumAsset
      ? {
          fileName: checksumAsset.name,
          url: checksumAsset.browser_download_url,
        }
      : null,
  };
}

function buildPayload(release, stableReleases = []) {
  const tagName = release?.tag_name ?? "unavailable";
  return {
    generatedAt: new Date().toISOString(),
    scripts,
    cdn: {
      tagName,
      appAssetBaseUrl:
        tagName === "unavailable"
          ? ""
          : buildRawGitHubAssetBase({
              repository: REPOSITORY,
              releaseTag: tagName,
              assetRoot: "apps/app/public",
            }),
      homepageAssetBaseUrl:
        tagName === "unavailable"
          ? ""
          : buildRawGitHubAssetBase({
              repository: REPOSITORY,
              releaseTag: tagName,
              assetRoot: "apps/homepage/public",
            }),
    },
    release: buildRelease(release, stableReleases),
  };
}

function toModule(payload) {
  return `export const releaseData = ${JSON.stringify(payload, null, 2)} as const;\n`;
}

function buildHeaders() {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "milady-homepage-release-data",
  };

  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

async function fetchReleases() {
  const response = await fetch(RELEASES_URL, { headers: buildHeaders() });
  if (!response.ok) {
    throw new Error(
      `GitHub API returned ${response.status} ${response.statusText}`,
    );
  }

  return response.json();
}

async function fetchReleaseByTag(tag) {
  const response = await fetch(
    `https://api.github.com/repos/${REPOSITORY}/releases/tags/${tag}`,
    {
      headers: buildHeaders(),
    },
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(
      `GitHub API returned ${response.status} ${response.statusText} for tag ${tag}`,
    );
  }

  return response.json();
}

async function resolveStableRelease(stableReleases) {
  const requestedTag = resolveRequestedReleaseTag();
  if (!requestedTag) {
    return pickStableRelease(stableReleases);
  }

  const requestedRelease = await fetchReleaseByTag(requestedTag);
  if (!requestedRelease) {
    console.warn(
      `homepage release data: requested release ${requestedTag} not found, using latest stable`,
    );
    return pickStableRelease(stableReleases);
  }

  if (requestedRelease.draft || requestedRelease.prerelease) {
    console.warn(
      `homepage release data: requested release ${requestedTag} is not stable, using latest stable`,
    );
    return pickStableRelease(stableReleases);
  }

  return requestedRelease;
}

async function writePayload(payload) {
  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, toModule(payload));
  const biomeCommand = process.platform === "win32" ? "cmd.exe" : "bunx";
  const biomeArgs =
    process.platform === "win32"
      ? [
          "/d",
          "/s",
          "/c",
          "bunx",
          "@biomejs/biome",
          "format",
          "--write",
          OUTPUT_PATH,
        ]
      : ["@biomejs/biome", "format", "--write", OUTPUT_PATH];
  execFileSync(biomeCommand, biomeArgs, { stdio: "ignore" });
}

async function main() {
  const releases = await fetchReleases();
  const stableReleases = sortReleasesByRecency(releases).filter(
    (release) => !release.prerelease,
  );
  const stableRelease = await resolveStableRelease(stableReleases);
  const releasePool =
    stableRelease &&
    !stableReleases.some(
      (release) => release.tag_name === stableRelease.tag_name,
    )
      ? [stableRelease, ...stableReleases]
      : stableReleases;
  await writePayload(buildPayload(stableRelease, releasePool));
  const tag = stableRelease?.tag_name ?? "no published stable release";
  console.log(`homepage release data: stable=${tag}`);
}

await main();
