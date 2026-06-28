/**
 * Generate Milady app icons from canonical brand assets in public/brand/icons/.
 *
 * Sources (in priority order):
 * 1. milady-icon-transparent.png — flattened on black, artwork extracted + balanced
 * 2. milady-icon-black-bg.png — outer frame trimmed, then same pipeline
 *
 * Usage: node apps/app/scripts/generate-brand-assets.mjs
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(__dirname, "..");
const repoRoot = path.resolve(appDir, "../..");
const publicDir = path.join(appDir, "public");
const brandFaviconsDir = path.join(publicDir, "brand", "favicons");
const brandIconsDir = path.join(publicDir, "brand", "icons");
const iconTransparentPath = path.join(
  brandIconsDir,
  "milady-icon-transparent.png",
);
const iconBlackBgPath = path.join(brandIconsDir, "milady-icon-black-bg.png");
const electrobunAssetsDir = path.join(
  repoRoot,
  "eliza/packages/app-core/platforms/electrobun/assets",
);
const iosIconSetDir = path.join(
  appDir,
  "native-overrides/ios/App/App/Assets.xcassets/AppIcon.appiconset",
);

const BRAND_BLACK = "#000000";
const MASTER_SIZE = 1024;
const LUMA_THRESHOLD = 20;
const TRIM_THRESHOLD = 10;
const ARTWORK_PAD = 4;
/** Gold silhouette span as a fraction of the legacy .icns master. */
const GOLD_COVERAGE = 0.94;
/**
 * Liquid Glass layer scale. 1.32 was ~15% undersized; 1.75 overshot and
 * cropped the face. ~1.48 targets parity with standard dock icons on Tahoe.
 */
const LIQUID_GLASS_LAYER_SCALE = 1.48;
/** Layer nudge in Icon Composer points. Negative X moves left. */
const LIQUID_GLASS_NUDGE_X = -10;
const LIQUID_GLASS_NUDGE_Y = 0;
/** Fine-tune after margin balance. Positive X shifts right; positive Y shifts down. */
const OPTICAL_NUDGE_X = -20;
const OPTICAL_NUDGE_Y = 16;

const WEB_SIZES = {
  "favicon-16x16.png": 16,
  "favicon-32x32.png": 32,
  "favicon-256x256.png": 256,
  "android-chrome-192x192.png": 192,
  "android-chrome-512x512.png": 512,
  "apple-touch-icon.png": 180,
};

const ICONSET_SIZES = [
  ["icon_16x16.png", 16],
  ["icon_16x16@2x.png", 32],
  ["icon_32x32.png", 32],
  ["icon_32x32@2x.png", 64],
  ["icon_128x128.png", 128],
  ["icon_128x128@2x.png", 256],
  ["icon_256x256.png", 256],
  ["icon_256x256@2x.png", 512],
  ["icon_512x512.png", 512],
  ["icon_512x512@2x.png", 1024],
];

function writeIco(targetPath, entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);

  const directory = Buffer.alloc(entries.length * 16);
  let offset = header.length + directory.length;

  entries.forEach((entry, index) => {
    const dirOffset = index * 16;
    directory.writeUInt8(entry.width >= 256 ? 0 : entry.width, dirOffset);
    directory.writeUInt8(entry.height >= 256 ? 0 : entry.height, dirOffset + 1);
    directory.writeUInt8(0, dirOffset + 2);
    directory.writeUInt8(0, dirOffset + 3);
    directory.writeUInt16LE(1, dirOffset + 4);
    directory.writeUInt16LE(32, dirOffset + 6);
    directory.writeUInt32LE(entry.buffer.length, dirOffset + 8);
    directory.writeUInt32LE(offset, dirOffset + 12);
    offset += entry.buffer.length;
  });

  fs.writeFileSync(
    targetPath,
    Buffer.concat([header, directory, ...entries.map((entry) => entry.buffer)]),
  );
}

function goldBoundsFromRaw(data, width, height, channels = 4) {
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  let found = false;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      if (luma <= LUMA_THRESHOLD) continue;
      found = true;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }

  if (!found) {
    throw new Error("Milady icon source has no visible gold artwork.");
  }

  return { minX, minY, maxX, maxY, width, height };
}

async function goldBounds(buffer) {
  const { data, info } = await sharp(buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return goldBoundsFromRaw(data, info.width, info.height);
}

function balanceOffsets(bounds, canvasSize) {
  const marginLeft = bounds.minX;
  const marginRight = canvasSize - 1 - bounds.maxX;
  const marginTop = bounds.minY;
  const marginBottom = canvasSize - 1 - bounds.maxY;
  return {
    x: Math.round((marginRight - marginLeft) / 2),
    y: Math.round((marginBottom - marginTop) / 2),
    marginLeft,
    marginRight,
    marginTop,
    marginBottom,
  };
}

async function prepareNormalizedSource(inputPath, { trimFrame }) {
  let pipeline = sharp(inputPath).flatten({ background: BRAND_BLACK });
  if (trimFrame) {
    pipeline = pipeline.trim({ threshold: TRIM_THRESHOLD });
  }
  const flattened = await pipeline.png().toBuffer();

  const sourceBounds = await goldBounds(flattened);
  const extractLeft = Math.max(0, sourceBounds.minX - ARTWORK_PAD);
  const extractTop = Math.max(0, sourceBounds.minY - ARTWORK_PAD);
  const extractWidth = Math.min(
    sourceBounds.width - extractLeft,
    sourceBounds.maxX - sourceBounds.minX + 1 + ARTWORK_PAD * 2,
  );
  const extractHeight = Math.min(
    sourceBounds.height - extractTop,
    sourceBounds.maxY - sourceBounds.minY + 1 + ARTWORK_PAD * 2,
  );

  const artwork = await sharp(flattened)
    .extract({
      left: extractLeft,
      top: extractTop,
      width: extractWidth,
      height: extractHeight,
    })
    .png()
    .toBuffer();

  const artworkBounds = await goldBounds(artwork);
  const goldWidth = artworkBounds.maxX - artworkBounds.minX + 1;
  const goldHeight = artworkBounds.maxY - artworkBounds.minY + 1;
  const goldSpan = Math.min(goldWidth, goldHeight);
  const scale = (MASTER_SIZE * GOLD_COVERAGE) / goldSpan;

  const artworkMeta = await sharp(artwork).metadata();
  const artworkWidth = artworkMeta.width ?? goldWidth;
  const artworkHeight = artworkMeta.height ?? goldHeight;
  const scaledWidth = Math.max(1, Math.round(artworkWidth * scale));
  const scaledHeight = Math.max(1, Math.round(artworkHeight * scale));

  const scaled = await sharp(artwork)
    .resize(scaledWidth, scaledHeight, { fit: "fill" })
    .flatten({ background: BRAND_BLACK })
    .png()
    .toBuffer();

  const scaledBounds = await goldBounds(scaled);
  const balance = balanceOffsets(scaledBounds, scaledWidth);

  const baseLeft = Math.round((MASTER_SIZE - scaledWidth) / 2);
  const baseTop = Math.round((MASTER_SIZE - scaledHeight) / 2);
  const left = Math.max(
    0,
    Math.min(MASTER_SIZE - scaledWidth, baseLeft + balance.x + OPTICAL_NUDGE_X),
  );
  const top = Math.max(
    0,
    Math.min(MASTER_SIZE - scaledHeight, baseTop + balance.y + OPTICAL_NUDGE_Y),
  );

  let master;
  if (scaledWidth > MASTER_SIZE || scaledHeight > MASTER_SIZE) {
    const padded =
      scaledWidth < MASTER_SIZE || scaledHeight < MASTER_SIZE
        ? await sharp({
            create: {
              width: Math.max(scaledWidth, MASTER_SIZE),
              height: Math.max(scaledHeight, MASTER_SIZE),
              channels: 4,
              background: BRAND_BLACK,
            },
          })
            .composite([
              {
                input: scaled,
                left: Math.round(
                  (Math.max(scaledWidth, MASTER_SIZE) - scaledWidth) / 2,
                ),
                top: Math.round(
                  (Math.max(scaledHeight, MASTER_SIZE) - scaledHeight) / 2,
                ),
              },
            ])
            .png()
            .toBuffer()
        : scaled;
    const paddedMeta = await sharp(padded).metadata();
    const padW = paddedMeta.width ?? MASTER_SIZE;
    const padH = paddedMeta.height ?? MASTER_SIZE;
    const cropLeft = Math.max(
      0,
      Math.min(
        padW - MASTER_SIZE,
        Math.round((padW - MASTER_SIZE) / 2 + balance.x + OPTICAL_NUDGE_X),
      ),
    );
    const cropTop = Math.max(
      0,
      Math.min(
        padH - MASTER_SIZE,
        Math.round((padH - MASTER_SIZE) / 2 + balance.y + OPTICAL_NUDGE_Y),
      ),
    );
    master = await sharp(padded)
      .extract({
        left: cropLeft,
        top: cropTop,
        width: MASTER_SIZE,
        height: MASTER_SIZE,
      })
      .flatten({ background: BRAND_BLACK })
      .png()
      .toBuffer();
  } else {
    master = await sharp({
      create: {
        width: MASTER_SIZE,
        height: MASTER_SIZE,
        channels: 4,
        background: BRAND_BLACK,
      },
    })
      .composite([{ input: scaled, left, top }])
      .flatten({ background: BRAND_BLACK })
      .png()
      .toBuffer();
  }

  const masterBounds = await goldBounds(master);
  const masterBalance = balanceOffsets(masterBounds, MASTER_SIZE);
  const goldW = masterBounds.maxX - masterBounds.minX + 1;
  const goldH = masterBounds.maxY - masterBounds.minY + 1;
  const goldMax = Math.max(goldW, goldH);
  console.log(
    `[brand-assets] Gold ${goldW}x${goldH}px (max ${goldMax}, ${((goldMax / MASTER_SIZE) * 100).toFixed(1)}% of master) — margins L${masterBalance.marginLeft} R${masterBalance.marginRight} T${masterBalance.marginTop} B${masterBalance.marginBottom}`,
  );

  return master;
}

async function loadMiladyIconMaster() {
  if (fs.existsSync(iconTransparentPath)) {
    return prepareNormalizedSource(iconTransparentPath, { trimFrame: false });
  }

  if (fs.existsSync(iconBlackBgPath)) {
    return prepareNormalizedSource(iconBlackBgPath, { trimFrame: true });
  }

  throw new Error(
    `Missing Milady icon sources. Add ${iconTransparentPath} and/or ${iconBlackBgPath}.`,
  );
}

function resolveSourceLabel() {
  if (fs.existsSync(iconTransparentPath)) {
    return `${iconTransparentPath} (extract + margin balance)`;
  }
  if (fs.existsSync(iconBlackBgPath)) {
    return `${iconBlackBgPath} (trim + extract + margin balance)`;
  }
  return "missing source";
}

async function renderSquarePng(masterPng, size) {
  return sharp(masterPng).resize(size, size, { fit: "fill" }).png().toBuffer();
}

async function writePng(masterPng, outputPath, size) {
  const buffer = await renderSquarePng(masterPng, size);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, buffer);
}

function writeFaviconSvg() {
  const svg = `<svg width="256" height="256" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
  <rect width="256" height="256" fill="${BRAND_BLACK}"/>
  <image href="/milady-app-icon-source.png" width="256" height="256" preserveAspectRatio="xMidYMid meet"/>
</svg>
`;
  fs.writeFileSync(path.join(publicDir, "favicon.svg"), `${svg.trim()}\n`);
  fs.writeFileSync(
    path.join(brandFaviconsDir, "favicon.svg"),
    `${svg.trim()}\n`,
  );
}

async function generateWebIcons(masterPng) {
  for (const [filename, size] of Object.entries(WEB_SIZES)) {
    await writePng(masterPng, path.join(publicDir, filename), size);
    await writePng(masterPng, path.join(brandFaviconsDir, filename), size);
  }

  const icoEntries = await Promise.all(
    [16, 32, 48].map(async (size) => ({
      width: size,
      height: size,
      buffer: await renderSquarePng(masterPng, size),
    })),
  );
  for (const icoPath of [
    path.join(publicDir, "favicon.ico"),
    path.join(brandFaviconsDir, "favicon.ico"),
  ]) {
    writeIco(icoPath, icoEntries);
  }
}

async function generateDesktopIcons(masterPng) {
  if (!fs.existsSync(path.dirname(electrobunAssetsDir))) {
    console.warn(
      `[brand-assets] Skipping desktop icons — missing ${electrobunAssetsDir} (run eliza:local for desktop builds)`,
    );
    return;
  }

  const appIconPngPath = path.join(electrobunAssetsDir, "appIcon.png");
  const appIconIcoPath = path.join(electrobunAssetsDir, "appIcon.ico");
  const appIconsetDir = path.join(electrobunAssetsDir, "appIcon.iconset");
  const appIconIcnsPath = path.join(electrobunAssetsDir, "appIcon.icns");

  fs.mkdirSync(electrobunAssetsDir, { recursive: true });
  fs.rmSync(appIconsetDir, { force: true, recursive: true });
  fs.mkdirSync(appIconsetDir, { recursive: true });

  for (const [filename, size] of ICONSET_SIZES) {
    await writePng(masterPng, path.join(appIconsetDir, filename), size);
  }

  await writePng(masterPng, appIconPngPath, 512);

  const icoEntries = await Promise.all(
    [32, 256].map(async (size) => ({
      width: size,
      height: size,
      buffer: await renderSquarePng(masterPng, size),
    })),
  );
  writeIco(appIconIcoPath, icoEntries);

  if (process.platform === "darwin") {
    try {
      execFileSync("which", ["iconutil"], { stdio: "ignore" });
      execFileSync(
        "iconutil",
        ["-c", "icns", appIconsetDir, "-o", appIconIcnsPath],
        { stdio: "inherit" },
      );
    } catch {
      console.warn(
        "[brand-assets] iconutil unavailable — appIcon.icns not regenerated",
      );
    }
    await generateLiquidGlassIcon(masterPng);
  }
}

/** macOS 26+ Liquid Glass: legacy .icns alone renders smaller in the Dock ("icon jail"). */
async function generateLiquidGlassIcon(masterPng) {
  const iconDir = path.join(electrobunAssetsDir, "appIcon.icon");
  const assetsDir = path.join(iconDir, "Assets");
  const assetsCarPath = path.join(electrobunAssetsDir, "Assets.car");
  const compileOutDir = path.join(electrobunAssetsDir, ".icon-compile");
  const artworkPath = path.join(assetsDir, "artwork.png");

  fs.rmSync(iconDir, { force: true, recursive: true });
  fs.mkdirSync(assetsDir, { recursive: true });
  fs.writeFileSync(artworkPath, masterPng);
  fs.writeFileSync(
    path.join(iconDir, "icon.json"),
    `${JSON.stringify(
      {
        fill: { solid: "srgb:0.0,0.0,0.0,1.0" },
        groups: [
          {
            layers: [
              {
                "image-name": "artwork.png",
                name: "artwork",
                opacity: 1,
                glass: true,
                position: {
                  scale: LIQUID_GLASS_LAYER_SCALE,
                  "translation-in-points": [
                    LIQUID_GLASS_NUDGE_X,
                    LIQUID_GLASS_NUDGE_Y,
                  ],
                },
              },
            ],
          },
        ],
      },
      null,
      2,
    )}\n`,
  );

  fs.rmSync(compileOutDir, { force: true, recursive: true });
  fs.mkdirSync(compileOutDir, { recursive: true });

  try {
    execFileSync("xcrun", ["--find", "actool"], { stdio: "ignore" });
    execFileSync(
      "xcrun",
      [
        "actool",
        iconDir,
        "--compile",
        compileOutDir,
        "--output-format",
        "human-readable-text",
        "--notices",
        "--warnings",
        "--errors",
        "--output-partial-info-plist",
        path.join(compileOutDir, "partial.plist"),
        "--app-icon",
        "appIcon",
        "--include-all-app-icons",
        "--enable-on-demand-resources",
        "NO",
        "--development-region",
        "en",
        "--target-device",
        "mac",
        "--minimum-deployment-target",
        "26.0",
        "--platform",
        "macosx",
      ],
      { stdio: "inherit" },
    );

    const compiledCar = path.join(compileOutDir, "Assets.car");
    if (fs.existsSync(compiledCar)) {
      fs.copyFileSync(compiledCar, assetsCarPath);
    }
    console.log(
      `[brand-assets] Compiled macOS 26 Liquid Glass Assets.car (layer scale ${LIQUID_GLASS_LAYER_SCALE})`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[brand-assets] actool unavailable — skipping Liquid Glass icon: ${message}`,
    );
  } finally {
    fs.rmSync(compileOutDir, { force: true, recursive: true });
  }
}

async function generateIosOverrideIcons(masterPng) {
  const contentsPath = path.join(iosIconSetDir, "Contents.json");
  if (!fs.existsSync(contentsPath)) return;

  const contents = JSON.parse(fs.readFileSync(contentsPath, "utf8"));
  for (const image of contents.images ?? []) {
    if (!image.filename || !image.size || !image.scale) continue;
    const [width] = String(image.size).split("x");
    const scale = Number.parseFloat(String(image.scale));
    const pixels = Math.round(Number.parseFloat(width) * scale);
    if (!Number.isFinite(pixels) || pixels <= 0) continue;
    await writePng(masterPng, path.join(iosIconSetDir, image.filename), pixels);
  }
  console.log("[brand-assets] Updated iOS AppIcon.appiconset overrides.");
}

async function main() {
  const masterPng = await loadMiladyIconMaster();
  fs.writeFileSync(
    path.join(publicDir, "milady-app-icon-source.png"),
    masterPng,
  );
  writeFaviconSvg();
  await generateWebIcons(masterPng);
  await generateDesktopIcons(masterPng);
  await generateIosOverrideIcons(masterPng);
  console.log(
    `[brand-assets] Generated Milady icons from ${resolveSourceLabel()}`,
  );
}

await main();
