/**
 * Generate Android launcher icons from public/android-chrome-512x512.png.
 *
 * Run `bun run brand:assets` first so that file comes from
 * public/brand/icons/milady-icon-*.png, not upstream elizaOS assets.
 * Then run after `cap sync android`. Requires `sharp` (root dep).
 *
 * Usage: node apps/app/scripts/generate-android-icons.mjs
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcIcon = path.resolve(__dirname, "../public/android-chrome-512x512.png");
const resDir = path.resolve(__dirname, "../android/app/src/main/res");

const sizes = {
  "mipmap-mdpi": 48,
  "mipmap-hdpi": 72,
  "mipmap-xhdpi": 96,
  "mipmap-xxhdpi": 144,
  "mipmap-xxxhdpi": 192,
};

for (const [dir, size] of Object.entries(sizes)) {
  const out = path.join(resDir, dir);
  await sharp(srcIcon)
    .resize(size, size)
    .png()
    .toFile(path.join(out, "ic_launcher.png"));
  await sharp(srcIcon)
    .resize(size, size)
    .png()
    .toFile(path.join(out, "ic_launcher_round.png"));

  const fgSize = Math.round(size * 0.7);
  const pad = Math.round(size * 0.4);
  await sharp(srcIcon)
    .resize(fgSize, fgSize)
    .extend({
      top: pad,
      bottom: pad,
      left: pad,
      right: pad,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .resize(Math.round(size * 1.5), Math.round(size * 1.5))
    .png()
    .toFile(path.join(out, "ic_launcher_foreground.png"));
}

console.log("Android icons generated from", srcIcon);
