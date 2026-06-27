#!/usr/bin/env python3
"""Regenerate every Milady brand asset (app icons + splash screens) from one mark.

Whitelabel tool. Reads a single source line-art mark and the brand palette, then
writes the app icons and splash screens for web, Android, iOS, and the Electrobun
desktop shell. Re-run after changing the source mark or the brand colors — this is
the single command that makes the whole app wear a new brand.

Identity strings live in apps/app/app.config.ts; the palette mirrors
eliza/packages/ui/src/styles/brand-gold.css (--classic-gold + --jet-black). To
rebrand, point BRAND_MARK at a new mark and set BRAND_BG/BRAND_INK, then run:

    python3 apps/app/scripts/generate-brand-assets.py

Requires Pillow.
"""
import os

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(HERE)                       # apps/app
REPO = os.path.dirname(os.path.dirname(APP))      # milady repo root
ELIZA_EB = os.path.join(
    REPO, "eliza/packages/app-core/platforms/electrobun/assets"
)
# Tracked desktop iconset master (apps/app/electrobun/assets is gitignored, so
# the release desktop-icon copy-step reads from here instead).
DESKTOP_MASTER = os.path.join(APP, "public/brand/desktop")


def _rgb(env, default):
    v = os.environ.get(env)
    if not v:
        return default
    v = v.lstrip("#")
    return (int(v[0:2], 16), int(v[2:4], 16), int(v[4:6], 16))


# Brand palette. Default: Milady classic-gold field with a near-jet-black mark.
SRC = os.environ.get("BRAND_MARK", os.path.join(REPO, "apps/homepage/public/milady-icon.png"))
GOLD = _rgb("BRAND_BG", (240, 185, 11))      # #f0b90b classic-gold
GOLD_DEEP = _rgb("BRAND_BG_DEEP", (210, 156, 8))
INK = _rgb("BRAND_INK", (10, 10, 12))        # near jet-black

MARK = Image.open(SRC).convert("RGBA")
written = []


def recolor(color):
    """The source mark repainted to `color`, keeping its alpha as the stencil."""
    solid = Image.new("RGBA", MARK.size, color + (255,))
    solid.putalpha(MARK.getchannel("A"))
    return solid


def fitted(src, box):
    m = src.copy()
    m.thumbnail((box, box), Image.LANCZOS)
    return m


def vgrad(w, h, top, bot):
    """Vertical top→bot gradient, built as a 1×h column then stretched (fast)."""
    col = Image.new("RGBA", (1, h))
    px = col.load()
    for y in range(h):
        t = y / max(1, h - 1)
        px[0, y] = (
            round(top[0] + (bot[0] - top[0]) * t),
            round(top[1] + (bot[1] - top[1]) * t),
            round(top[2] + (bot[2] - top[2]) * t),
            255,
        )
    return col.resize((w, h))


def _place(canvas, scale, fg):
    w, h = canvas.size
    mk = fitted(recolor(fg), int(min(w, h) * scale))
    canvas.alpha_composite(mk, ((w - mk.width) // 2, (h - mk.height) // 2))
    return canvas


def icon(size, scale=0.60, rounded=False, flatten=False, transparent=False):
    if transparent:
        canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    else:
        canvas = vgrad(size, size, GOLD, GOLD_DEEP)
    _place(canvas, scale, INK)
    if rounded:
        mask = Image.new("L", (size, size), 0)
        ImageDraw.Draw(mask).ellipse((0, 0, size - 1, size - 1), fill=255)
        canvas.putalpha(mask)
    if flatten:
        flat = Image.new("RGB", (size, size), GOLD)
        flat.paste(canvas, (0, 0), canvas)
        return flat
    return canvas


def splash(w, h, scale=0.36):
    canvas = vgrad(w, h, GOLD, GOLD_DEEP)
    _place(canvas, scale, INK)
    return canvas.convert("RGB")


def save(img, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path)
    written.append(os.path.relpath(path, REPO))


def dims(path):
    with Image.open(path) as im:
        return im.size[0]


# ── Tracked master sources (read by run-mobile-build.mjs at build time) ───────
# The dark mark on transparent; run-mobile-build flattens it onto the brand
# gold (web.iconBackgroundColor) for iOS/Android launcher icons.
mark_master = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
_place(mark_master, 0.72, INK)
save(mark_master, os.path.join(APP, "public/brand/app-icon.png"))
# Square gold splash master; run-mobile-build cover-crops it to each density.
save(splash(2732, 2732, scale=0.30), os.path.join(APP, "public/launch-bg.png"))

# ── iOS app icon (no alpha allowed by the App Store) ──────────────────────────
save(
    icon(1024, scale=0.62, flatten=True),
    os.path.join(APP, "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png"),
)

# ── Android launcher icons (legacy square, round, adaptive foreground) ────────
ANDROID_LAUNCHER = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
ANDROID_FG = {"mdpi": 108, "hdpi": 162, "xhdpi": 216, "xxhdpi": 324, "xxxhdpi": 432}
RES = os.path.join(APP, "android/app/src/main/res")
for d, sz in ANDROID_LAUNCHER.items():
    base = os.path.join(RES, f"mipmap-{d}")
    save(icon(sz, scale=0.62), os.path.join(base, "ic_launcher.png"))
    save(icon(sz, scale=0.62, rounded=True), os.path.join(base, "ic_launcher_round.png"))
    # Adaptive foreground: ink mark on transparent, inside the ~66% safe circle.
    fg = os.path.join(base, "ic_launcher_foreground.png")
    fg_size = dims(fg) if os.path.exists(fg) else ANDROID_FG[d]
    save(icon(fg_size, scale=0.44, transparent=True), fg)

# ── Android splash (every density variant; gold field + centered mark) ────────
for root, _dirs, files in os.walk(RES):
    for name in files:
        if name == "splash.png" and os.path.basename(root).startswith("drawable"):
            p = os.path.join(root, name)
            with Image.open(p) as im:
                w, h = im.size
            save(splash(w, h, scale=0.42), p)

# ── iOS launch splash ─────────────────────────────────────────────────────────
for name in ("splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"):
    save(splash(2732, 2732, scale=0.30), os.path.join(APP, "ios/App/App/Assets.xcassets/Splash.imageset", name))

# ── Web splash backgrounds (legacy; kept on-brand) ────────────────────────────
for name in ("splash-bg.png", "splash-bg-dark.png"):
    save(splash(1672, 941, scale=0.30), os.path.join(APP, "public", name))

# ── Electrobun desktop icons (milady-owned copy + local eliza clone) ──────────
ICONSET = {
    "icon_16x16.png": 16, "icon_16x16@2x.png": 32,
    "icon_32x32.png": 32, "icon_32x32@2x.png": 64,
    "icon_128x128.png": 128, "icon_128x128@2x.png": 256,
    "icon_256x256.png": 256, "icon_256x256@2x.png": 512,
    "icon_512x512.png": 512, "icon_512x512@2x.png": 1024,
}
for assets_dir in (DESKTOP_MASTER, ELIZA_EB):
    if assets_dir == ELIZA_EB and not os.path.isdir(os.path.dirname(ELIZA_EB)):
        continue  # local eliza clone not present (packages mode)
    save(icon(1024, scale=0.62), os.path.join(assets_dir, "appIcon.png"))
    icon(256, scale=0.62, flatten=True).save(
        os.path.join(assets_dir, "appIcon.ico"),
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )
    written.append(os.path.relpath(os.path.join(assets_dir, "appIcon.ico"), REPO))
    for fname, sz in ICONSET.items():
        save(icon(sz, scale=0.62), os.path.join(assets_dir, "appIcon.iconset", fname))
    # .icns is best-effort on Linux; the mac build rebuilds it from the iconset.
    try:
        icns = icon(1024, scale=0.62, flatten=True)
        icns.save(os.path.join(assets_dir, "appIcon.icns"), format="ICNS")
        written.append(os.path.relpath(os.path.join(assets_dir, "appIcon.icns"), REPO))
    except Exception as exc:  # noqa: BLE001
        print(f"  (skipped {assets_dir}/appIcon.icns: {exc})")

print(f"Generated {len(written)} brand assets:")
for p in written:
    print(f"  {p}")
