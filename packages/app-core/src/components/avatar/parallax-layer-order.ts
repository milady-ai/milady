/**
 * Back-to-front compositing order for the layered parallax avatar.
 *
 * Each entry is the filename stem (without extension). The regular layer
 * is `{stem}.png` and its depth map is `{stem}_depth.png`.
 *
 * Order matters: first entry is drawn first (farthest back), last entry
 * is drawn last (closest to viewer / on top).
 */
export const PARALLAX_LAYER_ORDER: readonly string[] = [
  "back-hair",
  "wings",
  "tail",
  "handwear",
  "neck",
  "bottomwear",
  "legwear",
  "footwear",
  "topwear",
  "neckwear",
  "face",
  "ears",
  "earwear",
  "eyewhite",
  "irides",
  "eyebrow",
  "eyelash",
  "nose",
  "mouth",
  "eyewear",
  "headwear",
  "front-hair",
  "objects",
] as const;
