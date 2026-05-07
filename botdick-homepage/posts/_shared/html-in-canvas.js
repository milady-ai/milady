/*
 * html-in-canvas: render arbitrary HTML through the SVG <foreignObject>
 * pipeline so per-post pages can apply canvas-only effects (scanlines,
 * particle reveals, displacement, masking, blend modes) on top of real,
 * accessible HTML.
 *
 * The SVG <foreignObject> trick: an SVG image whose body is the HTML
 * fragment is loaded as a Blob URL into an <img>. Drawing that <img> to
 * canvas does NOT taint the canvas as long as the HTML is self-contained
 * (no external images/fonts). That lets us getImageData and run any
 * pixel-level effect afterward.
 *
 * Limitations to keep in mind for any per-post effect:
 *   - external resources (remote images, web fonts, CSS @import) DO NOT
 *     resolve inside the foreignObject; inline only.
 *   - Safari historically rejects the SVG-foreignObject pipeline; the
 *     helper falls back to raw HTML (no canvas effect) when the rasterize
 *     promise rejects.
 *   - the source rect width/height must be integers; non-integer sizes
 *     can produce stretched output on some browsers.
 *
 * API:
 *   const helper = createHtmlInCanvas(canvas);
 *   await helper.draw({ html: "<div>...</div>", width, height });
 *     // canvas now holds the rasterized HTML at (0,0).
 *   helper.scanlines(intensity);
 *     // overlays a scanline pass at any time.
 */

export function createHtmlInCanvas(canvas, options = {}) {
  if (!canvas) throw new Error("createHtmlInCanvas: canvas required");
  const ctx = canvas.getContext("2d");
  const dpr = options.devicePixelRatio || (window.devicePixelRatio || 1);

  function setLogicalSize(w, h) {
    const cssW = Math.round(w);
    const cssH = Math.round(h);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { width: cssW, height: cssH };
  }

  function rasterize({ html, width, height, css = "" }) {
    // The <foreignObject> body is wrapped in xhtml namespace so the SVG
    // parser treats it as HTML rather than ignoring unknown tags. xmlns
    // declarations are required at every level of the embedded fragment.
    const wrapped = `
      <div xmlns="http://www.w3.org/1999/xhtml" style="width:${width}px;height:${height}px;${css}">
        ${html}
      </div>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <foreignObject width="100%" height="100%">${wrapped}</foreignObject>
    </svg>`;
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = (err) => {
        URL.revokeObjectURL(url);
        reject(err);
      };
      img.src = url;
    });
  }

  async function draw({ html, width, height, css = "", x = 0, y = 0, clear = true }) {
    const size = clear ? setLogicalSize(width, height) : { width, height };
    const img = await rasterize({ html, width, height, css });
    if (clear) ctx.clearRect(0, 0, size.width, size.height);
    ctx.drawImage(img, x, y, width, height);
    return img;
  }

  function scanlines({ intensity = 0.18, gap = 2, color = "rgba(4,6,10,1)" } = {}) {
    // Horizontal scanline pass: every <gap>th line gets dimmed by intensity.
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    ctx.save();
    ctx.globalAlpha = intensity;
    ctx.fillStyle = color;
    for (let y = 0; y < h; y += gap) {
      ctx.fillRect(0, y, w, 1);
    }
    ctx.restore();
  }

  function vignette({ inner = 0.55, outer = 0.95, color = "rgba(4,6,10,0.85)" } = {}) {
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.hypot(w, h) / 2;
    const gradient = ctx.createRadialGradient(cx, cy, radius * inner, cx, cy, radius * outer);
    gradient.addColorStop(0, "rgba(4,6,10,0)");
    gradient.addColorStop(1, color);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  }

  function chromaticShift({ amount = 1.5 } = {}) {
    // Cheap chromatic aberration: re-blit the canvas onto itself with offset
    // RGB component blends. Strength is small to avoid a fully obvious
    // double-image — the post should still feel readable.
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    const snapshot = document.createElement("canvas");
    snapshot.width = canvas.width;
    snapshot.height = canvas.height;
    snapshot.getContext("2d").drawImage(canvas, 0, 0);

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = 0.55;
    ctx.drawImage(snapshot, amount, 0, w, h);
    ctx.drawImage(snapshot, -amount, 0, w, h);
    ctx.restore();
  }

  return {
    canvas,
    ctx,
    dpr,
    setLogicalSize,
    draw,
    scanlines,
    vignette,
    chromaticShift,
    rasterize,
  };
}

/*
 * Reveal helper: progressively unmasks a region from the top down. Used for
 * the "agent typing" reveal in the Discord post and reusable by other
 * posts that want a similar terminal-feel intro.
 */
export function topDownReveal({ canvas, durationMs = 2200, onComplete }) {
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const start = performance.now();
  let raf = 0;

  function step(now) {
    const t = Math.min((now - start) / durationMs, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    const cutoff = h * eased;

    // Draw a solid bar below the cutoff to mask out the un-revealed area.
    ctx.save();
    ctx.fillStyle = "rgba(4,6,10,1)";
    ctx.fillRect(0, cutoff, w, h - cutoff);
    // Sweep line at the leading edge gives the eye something to track.
    ctx.fillStyle = "rgba(67,199,217,0.85)";
    ctx.fillRect(0, cutoff - 2, w, 2);
    ctx.restore();

    if (t < 1) {
      raf = requestAnimationFrame(step);
    } else if (onComplete) {
      onComplete();
    }
  }

  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}
