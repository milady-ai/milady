/**
 * Downloads / distribution coverage for the homepage landing surface.
 *
 * The landing page surfaces a PlatformBar with per-OS download anchors
 * (MAC, PC, LINUX, WEB, ANDROID) sourced from
 * `src/generated/release-data.ts`. This spec verifies:
 *
 *   - All platform tiles render with `<a href>` pointing at GitHub releases.
 *   - The release tag on the page matches the one baked into release-data.ts.
 *   - Each download URL responds with a 2xx/3xx on HEAD (gated by
 *     `SKIP_DOWNLOAD_HEAD=1` for offline CI).
 *   - The release tag resolves to a real GitHub release tag (gated by
 *     `SKIP_GITHUB_TAG_CHECK=1`).
 *
 * WEB is interactive (cloud handoff) — not a download link — and is excluded
 * from the HEAD check.
 */

import { expect, test } from "@playwright/test";
import { releaseData } from "../../src/generated/release-data";
import { mockCloudApi } from "./fixtures/cloud-auth";

const SKIP_HEAD = process.env.SKIP_DOWNLOAD_HEAD === "1";
const SKIP_TAG_CHECK = process.env.SKIP_GITHUB_TAG_CHECK === "1";

const PLATFORM_LABELS = ["MAC", "PC", "LINUX", "ANDROID"] as const;
type PlatformLabel = (typeof PLATFORM_LABELS)[number];

const PLATFORM_TO_DOWNLOAD_IDS: Record<PlatformLabel, string[]> = {
  MAC: ["macos-arm64", "macos-x64"],
  PC: ["windows-x64"],
  LINUX: ["linux-x64", "linux-deb"],
  ANDROID: ["android-apk"],
};

test.describe("homepage downloads", () => {
  test.beforeEach(async ({ context }) => {
    await mockCloudApi(context, { agents: [] });
  });

  test("renders one anchor per supported platform pointing at GitHub", async ({
    page,
  }) => {
    await page.goto("/");
    const platformNav = page.getByRole("navigation", {
      name: /platform downloads/i,
    });
    await expect(platformNav).toBeVisible();

    for (const label of PLATFORM_LABELS) {
      const link = platformNav.getByRole("link", { name: label });
      await expect(link, `${label} link visible`).toBeVisible();
      const href = await link.getAttribute("href");
      expect(href, `${label} has href`).toBeTruthy();
      expect(
        href ?? "",
        `${label} href looks like a github release`,
      ).toMatch(/^https:\/\/github\.com\/.+\/releases\//);
    }
  });

  test("anchors map to the release-data fixture for current tag", async ({
    page,
  }) => {
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: /platform downloads/i });

    for (const label of PLATFORM_LABELS) {
      const link = nav.getByRole("link", { name: label });
      const href = (await link.getAttribute("href")) ?? "";
      const candidates = PLATFORM_TO_DOWNLOAD_IDS[label]
        .map((id) =>
          releaseData.release.downloads.find((d) => d.id === id)?.url,
        )
        .filter((url): url is string => Boolean(url));
      // ANDROID id may not exist in current release-data; if no candidates,
      // the fallback is the generic latest-release page.
      if (candidates.length === 0) {
        expect(href).toMatch(/\/releases(\/latest)?$/);
      } else {
        expect(
          candidates,
          `${label} href is one of the expected release-data URLs`,
        ).toContain(href);
      }
    }
  });

  test("release tag baked into the page matches release-data", async ({
    page,
  }) => {
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: /platform downloads/i });
    const macHref = (await nav.getByRole("link", { name: "MAC" }).getAttribute("href")) ?? "";
    expect(macHref).toContain(releaseData.release.tagName);
  });

  test("every download URL returns 2xx/3xx on HEAD", async ({ request }) => {
    test.skip(SKIP_HEAD, "SKIP_DOWNLOAD_HEAD=1 — skipping live HEAD probes");
    for (const download of releaseData.release.downloads) {
      const res = await request.fetch(download.url, {
        method: "HEAD",
        maxRedirects: 5,
        timeout: 15_000,
      });
      expect(
        res.status(),
        `HEAD ${download.id} (${download.url})`,
      ).toBeLessThan(400);
    }
  });

  test("release tag resolves to a real GitHub release", async ({ request }) => {
    test.skip(
      SKIP_TAG_CHECK,
      "SKIP_GITHUB_TAG_CHECK=1 — skipping live GitHub tag probe",
    );
    // Parse owner/repo from the release URL ("https://github.com/<owner>/<repo>/releases/tag/<tag>").
    const match = releaseData.release.url.match(
      /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/releases\/tag\/(.+)$/,
    );
    expect(match, `release.url shape: ${releaseData.release.url}`).not.toBeNull();
    if (!match) return;
    const [, owner, repo, tag] = match;
    expect(tag).toBe(releaseData.release.tagName);

    const res = await request.get(
      `https://api.github.com/repos/${owner}/${repo}/releases/tags/${tag}`,
      {
        headers: process.env.GITHUB_TOKEN
          ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
          : undefined,
        timeout: 15_000,
      },
    );
    expect(res.status(), `GitHub release ${owner}/${repo}@${tag}`).toBe(200);
    const body = (await res.json()) as { tag_name?: string };
    expect(body.tag_name).toBe(tag);
  });
});
