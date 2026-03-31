#!/usr/bin/env node
/**
 * Run the VRM screenshotter via Playwright: generate preview images and save to public/vrms/previews.
 *
 * Requires the Vite dev server to be running (bun run dev) and raw .vrm files in public_src/vrms.
 *
 * Usage:
 *   node scripts/run-screenshotter.mjs
 *   node scripts/run-screenshotter.mjs --url http://localhost:2138
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PREVIEWS_DIR = path.join(
  ROOT,
  "apps",
  "app",
  "public",
  "vrms",
  "previews",
);
const BACKGROUNDS_DIR = path.join(
  ROOT,
  "apps",
  "app",
  "public",
  "vrms",
  "backgrounds",
);
const CHARACTER_DEFS_PATH = path.join(
  ROOT,
  "packages",
  "agent",
  "src",
  "brand",
  "character-definitions.json",
);

/** Same default slug rule as `createPresetApi({ slugPrefix: "milady" })` for dev tooling. */
const DEFAULT_SLUG_PREFIX = "milady";

function loadScreenshotRoster() {
  const raw = fs.readFileSync(CHARACTER_DEFS_PATH, "utf8");
  const defs = JSON.parse(raw);
  if (!Array.isArray(defs)) {
    throw new Error("character-definitions.json must be an array");
  }
  const prefix = DEFAULT_SLUG_PREFIX.replace(/-+$/, "");
  return [...defs]
    .sort((a, b) => a.avatarIndex - b.avatarIndex)
    .map((d) => ({
      id: d.avatarIndex,
      slug:
        typeof d.slug === "string" && d.slug
          ? d.slug
          : `${prefix}-${d.avatarIndex}`,
    }));
}

function parseArgs() {
  const args = process.argv.slice(2);
  let url = "http://localhost:2138";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--url" && args[i + 1]) {
      url = args[i + 1];
      i++;
    }
  }
  return { url };
}

async function main() {
  const { url } = parseArgs();
  const roster = loadScreenshotRoster();
  const screenshotterUrl = `${url}/public_src/screenshotter.html`;

  console.log("[run-screenshotter] Launching browser...");
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--ignore-gpu-blocklist",
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--disable-gpu-sandbox",
      "--no-sandbox",
    ],
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(180000);

  try {
    console.log("[run-screenshotter] Loading screenshotter...");
    const response = await page.goto(screenshotterUrl, {
      waitUntil: "networkidle",
      timeout: 15000,
    });
    if (!response?.ok()) {
      throw new Error(
        `Failed to load screenshotter: ${response?.status()} ${response?.statusText()}. Is the dev server running? Try: bun run dev`,
      );
    }

    console.log("[run-screenshotter] Clicking Generate All Previews...");
    await page.click("#run-all");

    await page.waitForSelector(".card.loading, .card.done, .card.error", {
      timeout: 10000,
    });

    console.log("[run-screenshotter] Waiting for all previews to render...");
    await page.waitForFunction(
      () => {
        const done = document.querySelectorAll(".card.done").length;
        const error = document.querySelectorAll(".card.error").length;
        const total = document.querySelectorAll(".card").length;
        return done + error >= total;
      },
      { timeout: 180000 },
    );

    const errors = await page.$$eval(".card.error", (els) =>
      els.map((e) => e.querySelector(".label")?.textContent ?? "unknown"),
    );
    if (errors.length > 0) {
      console.warn("[run-screenshotter] Some cards failed:", errors);
    }

    fs.mkdirSync(PREVIEWS_DIR, { recursive: true });
    fs.mkdirSync(BACKGROUNDS_DIR, { recursive: true });

    let saved = 0;
    const total = roster.length;
    for (const { id, slug } of roster) {
      const dataUrl = await page.evaluate((assetId) => {
        const dl = document.getElementById(`d${assetId}`);
        return dl?.href ?? null;
      }, id);
      if (!dataUrl?.startsWith("data:image/png")) {
        console.warn(`[run-screenshotter] No preview for ${slug} (id ${id})`);
        continue;
      }
      const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
      const buf = Buffer.from(base64, "base64");
      const previewPath = path.join(PREVIEWS_DIR, `${slug}.png`);
      fs.writeFileSync(previewPath, buf);
      console.log(`[run-screenshotter] Saved ${previewPath}`);
      saved++;

      const bgPath = path.join(BACKGROUNDS_DIR, `${slug}.png`);
      fs.writeFileSync(bgPath, buf);
    }

    console.log(
      `[run-screenshotter] Done. Saved ${saved}/${total} previews and backgrounds.`,
    );
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("[run-screenshotter]", err.message);
  process.exit(1);
});
