#!/usr/bin/env bun
/**
 * Generate hero images for the visible apps catalog using fal.ai.
 *
 * Package-backed apps write into their own package at
 * `eliza/apps/app-<name>/assets/hero.png`.
 *
 * Internal tool cards write to static assets under
 * `apps/app/public/app-heroes/<name>.png`.
 *
 * Usage:
 *   FAL_KEY=... bun run scripts/generate-app-heroes.mjs
 *   FAL_KEY=... bun run scripts/generate-app-heroes.mjs --force
 *   FAL_KEY=... bun run scripts/generate-app-heroes.mjs --only=companion,lifeops,plugin-viewer
 *   FAL_KEY=... bun run scripts/generate-app-heroes.mjs --model=fal-ai/flux-2-pro
 */

import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

const DEFAULT_MODEL = "fal-ai/flux-2-pro";
const IMAGE_SIZE = "square_hd";
const OUTPUT_FORMAT = "png";

const INTERNAL_HERO_PUBLIC_DIR = "apps/app/public/app-heroes";

/**
 * Catalog prompt seeds. Each slug maps to one visible app card on `/apps`.
 * Some entries write to multiple destinations so the same hero can back both
 * the visible catalog card and the package metadata used by the registry.
 */
const APP_HEROES = [
  {
    slug: "companion",
    outputs: [{ file: "eliza/apps/app-companion/assets/hero.png" }],
    prompt:
      "Milady Companion key art, cute futuristic anime companion avatar hovering inside a dreamy entertainment lounge, luminous holograms, soft chrome details, warm neon peach and aqua palette, cinematic digital illustration, no text, no UI, premium app hero image.",
  },
  {
    slug: "hyperscape",
    outputs: [{ file: "eliza/apps/app-hyperscape/assets/hero.png" }],
    prompt:
      "A sweeping multiplayer sci-fi world with floating plateaus, luminous portals, and distant towers under a cyan sunset, immersive 3D game key art, vibrant atmosphere, no text, premium app hero image.",
  },
  {
    slug: "babylon",
    outputs: [{ file: "eliza/apps/app-babylon/assets/hero.png" }],
    prompt:
      "Prediction market fantasy key art, neon financial data streams wrapping around an ancient ziggurat skyline, glass panels, gold and midnight blue palette, polished cinematic illustration, no text, premium app hero image.",
  },
  {
    slug: "2004scape",
    outputs: [{ file: "eliza/apps/app-2004scape/assets/hero.png" }],
    prompt:
      "Nostalgic early-2000s fantasy MMO landscape with a cozy medieval town, broad green hills, and an iconic quest path at golden hour, painterly adventure game art, no text, premium app hero image.",
  },
  {
    slug: "scape",
    outputs: [{ file: "eliza/apps/app-scape/assets/hero.png" }],
    prompt:
      "Stylized fantasy MMO adventure scene with a lone agent explorer overlooking rolling hills, distant ruins, and a glowing route marker, painterly concept art, no text, premium app hero image.",
  },
  {
    slug: "defense-of-the-agents",
    outputs: [{ file: "eliza/apps/app-defense-of-the-agents/assets/hero.png" }],
    prompt:
      "High-energy MOBA splash art with three agent champions on a neon battlefield, storm-lit sky, magical lane effects, rich cinematic contrast, no text, premium app hero image.",
  },
  {
    slug: "vincent",
    outputs: [{ file: "eliza/apps/app-vincent/assets/hero.png" }],
    prompt:
      "Luxury DeFi hero illustration with a glowing digital vault, elegant liquidity ribbons, and precise chart motifs in deep navy, emerald, and gold, polished fintech visual, no text, premium app hero image.",
  },
  {
    slug: "shopify",
    outputs: [{ file: "eliza/apps/app-shopify/assets/hero.png" }],
    prompt:
      "Modern commerce key art with premium product boxes, receipts, and storefront motion trails orbiting a central glow, clean mint and cream palette, editorial illustration, no text, premium app hero image.",
  },
  {
    slug: "clawville",
    outputs: [{ file: "eliza/apps/app-clawville/assets/hero.png" }],
    prompt:
      "Playful arcade fantasy scene with a neon claw machine full of plush agent creatures, retro toy-store lighting, glossy Y2K atmosphere, whimsical illustration, no text, premium app hero image.",
  },
  {
    slug: "lifeops",
    outputs: [
      { file: `${INTERNAL_HERO_PUBLIC_DIR}/lifeops.png` },
      { file: "eliza/apps/app-lifeops/assets/hero.png" },
    ],
    prompt:
      "Calm operational dashboard illustration with translucent calendar cards, reminders, routines, and inbox signals floating above a serene desk at dawn, soft indigo and apricot palette, no text, premium app hero image.",
  },
  {
    slug: "plugin-viewer",
    outputs: [{ file: `${INTERNAL_HERO_PUBLIC_DIR}/plugin-viewer.png` }],
    prompt:
      "Developer tools key art showing modular software blocks snapping together in midair with luminous connector lines, crisp technical illustration, teal and graphite palette, no text, premium app hero image.",
  },
  {
    slug: "skills-viewer",
    outputs: [{ file: `${INTERNAL_HERO_PUBLIC_DIR}/skills-viewer.png` }],
    prompt:
      "A curated library of glowing skill cards and tiny workflow glyphs arranged in a clean futuristic atelier, warm brass and electric blue accents, editorial illustration, no text, premium app hero image.",
  },
  {
    slug: "trajectory-viewer",
    outputs: [{ file: `${INTERNAL_HERO_PUBLIC_DIR}/trajectory-viewer.png` }],
    prompt:
      "Elegant observability artwork with layered conversation arcs, execution traces, and event timelines streaming through space, high clarity technical illustration, no text, premium app hero image.",
  },
  {
    slug: "relationship-viewer",
    outputs: [{ file: `${INTERNAL_HERO_PUBLIC_DIR}/relationship-viewer.png` }],
    prompt:
      "Abstract social graph visualization with luminous portraits, links, and trust constellations suspended in a dark airy scene, refined editorial illustration, no text, premium app hero image.",
  },
  {
    slug: "memory-viewer",
    outputs: [{ file: `${INTERNAL_HERO_PUBLIC_DIR}/memory-viewer.png` }],
    prompt:
      "Atmospheric memory archive with glowing note cards, facts, and image fragments stored in translucent shelves of light, deep cobalt and amber palette, no text, premium app hero image.",
  },
  {
    slug: "runtime-debugger",
    outputs: [{ file: `${INTERNAL_HERO_PUBLIC_DIR}/runtime-debugger.png` }],
    prompt:
      "Sophisticated runtime debugger art featuring an exposed AI engine core surrounded by diagnostic overlays, signal paths, and system gauges, polished technical concept art, no text, premium app hero image.",
  },
  {
    slug: "database-viewer",
    outputs: [{ file: `${INTERNAL_HERO_PUBLIC_DIR}/database-viewer.png` }],
    prompt:
      "High-end data platform illustration with stacked translucent tables, vectors, and storage cubes in a luminous grid room, precise and minimal, no text, premium app hero image.",
  },
  {
    slug: "log-viewer",
    outputs: [{ file: `${INTERNAL_HERO_PUBLIC_DIR}/log-viewer.png` }],
    prompt:
      "Cinematic log monitoring scene with cascading terminal ribbons, signal pulses, and alert markers moving through a dark observability tunnel, crisp technical illustration, no text, premium app hero image.",
  },
];

function parseArgs(argv) {
  const args = { force: false, only: null, model: DEFAULT_MODEL };
  for (const token of argv.slice(2)) {
    if (token === "--force" || token === "-f") {
      args.force = true;
    } else if (token.startsWith("--only=")) {
      args.only = new Set(
        token
          .slice("--only=".length)
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
      );
    } else if (token.startsWith("--model=")) {
      args.model = token.slice("--model=".length).trim() || DEFAULT_MODEL;
    } else if (token === "--help" || token === "-h") {
      console.log(
        "Usage: bun run scripts/generate-app-heroes.mjs [--force] [--only=slug1,slug2] [--model=fal-ai/flux-2-pro]",
      );
      process.exit(0);
    } else {
      console.warn(`Ignoring unknown argument: ${token}`);
    }
  }
  return args;
}

async function fileExists(file) {
  try {
    const info = await stat(file);
    return info.size > 0;
  } catch {
    return false;
  }
}

async function directoryExists(dir) {
  try {
    const info = await stat(dir);
    return info.isDirectory();
  } catch {
    return false;
  }
}

async function falGenerate({ apiKey, model, prompt }) {
  const endpoint = `https://fal.run/${model}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Key ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
      image_size: IMAGE_SIZE,
      num_images: 1,
      output_format: OUTPUT_FORMAT,
      enable_safety_checker: true,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `fal.ai returned ${response.status} ${response.statusText}: ${body.slice(0, 400)}`,
    );
  }

  const payload = await response.json();
  const imageUrl = payload?.images?.[0]?.url;
  if (typeof imageUrl !== "string" || !imageUrl) {
    throw new Error(
      `fal.ai response missing images[0].url: ${JSON.stringify(payload).slice(0, 400)}`,
    );
  }
  return imageUrl;
}

async function download(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to download image (${response.status} ${response.statusText}) from ${url}`,
    );
  }
  return new Uint8Array(await response.arrayBuffer());
}

async function main() {
  const args = parseArgs(process.argv);
  const apiKey = process.env.FAL_KEY ?? process.env.FAL_API_KEY;
  if (!apiKey) {
    console.error(
      "FAL_KEY is not set. Export your fal.ai key and retry (see https://fal.ai/dashboard/keys).",
    );
    process.exit(1);
  }

  const targets = APP_HEROES.filter(
    (entry) => !args.only || args.only.has(entry.slug),
  );
  if (args.only && targets.length === 0) {
    console.error(
      `No matching slugs in --only=${[...args.only].join(",")}. Available: ${APP_HEROES.map((entry) => entry.slug).join(", ")}`,
    );
    process.exit(1);
  }

  console.log(
    `Generating ${targets.length} hero image(s) with ${args.model} into package assets and apps/app/public/app-heroes`,
  );

  let generated = 0;
  let skipped = 0;
  const failures = [];

  for (const entry of targets) {
    const outputFiles = entry.outputs.map((output) =>
      path.join(REPO_ROOT, output.file),
    );
    const missingParents = [];
    for (let index = 0; index < outputFiles.length; index += 1) {
      const outFile = outputFiles[index];
      const requiredDir = entry.outputs[index]?.requiredDir
        ? path.join(REPO_ROOT, entry.outputs[index].requiredDir)
        : path.dirname(path.dirname(outFile));
      if (!(await directoryExists(requiredDir))) {
        missingParents.push(path.relative(REPO_ROOT, requiredDir));
      }
    }
    if (missingParents.length > 0) {
      console.log(
        `  skip  ${entry.slug} (missing directories: ${missingParents.join(", ")})`,
      );
      skipped += 1;
      continue;
    }

    const allOutputsExist = (
      await Promise.all(outputFiles.map((outFile) => fileExists(outFile)))
    ).every(Boolean);
    if (!args.force && allOutputsExist) {
      console.log(
        `  skip  ${entry.slug} (${entry.outputs.map((output) => output.file).join(", ")} already exist)`,
      );
      skipped += 1;
      continue;
    }

    process.stdout.write(`  gen   ${entry.slug} … `);
    try {
      const imageUrl = await falGenerate({
        apiKey,
        model: args.model,
        prompt: entry.prompt,
      });
      const buffer = await download(imageUrl);

      for (const outFile of outputFiles) {
        await mkdir(path.dirname(outFile), { recursive: true });
        await writeFile(outFile, buffer);
      }

      console.log(
        `ok → ${entry.outputs.map((output) => output.file).join(", ")}`,
      );
      generated += 1;
    } catch (error) {
      console.log(
        `fail (${error instanceof Error ? error.message : String(error)})`,
      );
      failures.push({ slug: entry.slug, error });
    }
  }

  console.log(
    `\nDone. generated=${generated} skipped=${skipped} failed=${failures.length}`,
  );

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
