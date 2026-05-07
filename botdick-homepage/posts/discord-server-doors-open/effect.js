/*
 * Per-post canvas effect for "Discord server doors open with receipts".
 *
 * The effect:
 *   1. Render the article's deck + capability list into the post canvas
 *      via the SVG-foreignObject pipeline so we have real HTML pixels to
 *      manipulate.
 *   2. Top-down sweep reveals the rendered HTML behind a leading cyan
 *      scanline (gives the eye something to track as the page "loads").
 *   3. Once the sweep finishes, capability badges pop in along the right
 *      edge one at a time, each accompanied by a typed receipt fragment
 *      drawn directly onto the canvas in a monospace font.
 *   4. After everything has landed, a slow scanline + vignette pass keeps
 *      the canvas alive without distracting from the article that follows.
 *   5. A "raw view" control swaps the entire canvas-wrap out for the
 *      live HTML article so the post is fully accessible the moment the
 *      reader wants to read it.
 *
 * The actual <article> below the canvas always carries the full,
 * selectable, screen-readable post — the canvas is decorative.
 */

import { createHtmlInCanvas, topDownReveal } from "../_shared/html-in-canvas.js";

const canvas = document.getElementById("post-canvas");
const wrap = canvas?.closest(".post-canvas-wrap");
const stack = document.getElementById("capability-stack");
const replayButton = document.querySelector('[data-action="replay"]');
const rawButton = document.querySelector('[data-action="raw"]');

if (canvas && wrap) {
  const helper = createHtmlInCanvas(canvas);
  let raf = 0;
  let postRevealStart = 0;

  const RECEIPT_LINES = [
    { cap: "open", text: "GET https://example.com/release-notes -> 200 14kb html" },
    { cap: "pdf", text: "pdftotext /tmp/spec.pdf -> 8 pages, 32kb plaintext" },
    { cap: "knowledge", text: "knowledge.add(uri=…/release-notes) -> ok" },
    { cap: "ascii", text: "ascii_render('botdick') -> 7 lines, monospace ok" },
    { cap: "block", text: "fetch http://10.0.0.5/admin -> refused, private network" },
  ];

  // Inline HTML the canvas will rasterize. Self-contained (no external
  // assets) so the foreignObject blit stays untainted.
  const innerHtml = `
    <div style="font-family:ui-monospace,Menlo,monospace;color:#f2eadc;padding:36px 44px;line-height:1.45;">
      <div style="font-size:11px;letter-spacing:0.18em;color:#43c7d9;margin-bottom:16px;">
        BOTDICK · DISCORD ABILITY PASS · LIVE
      </div>
      <div style="font-size:24px;font-weight:700;line-height:1.15;margin-bottom:14px;max-width:520px;">
        He can read the public web now,<br/>and refuse the private one.
      </div>
      <div style="font-size:13px;color:#9aa3b3;line-height:1.55;max-width:520px;margin-bottom:18px;">
        Open public links. Read HTML / text / PDFs. Save things to knowledge.
        Render ASCII inline. Refuse anything pointing at the host's own LAN.
      </div>
      <div id="receipt-pad" style="
        font-size:11px;color:#7ee06c;line-height:1.6;background:rgba(126,224,108,0.06);
        border:1px solid rgba(126,224,108,0.22);padding:10px 14px;border-radius:3px;
        max-width:520px;min-height:96px;">
        <div style="color:#43c7d9;letter-spacing:0.12em;font-size:10px;margin-bottom:6px;">
          ./receipts.log
        </div>
        <div id="receipt-stream"></div>
      </div>
    </div>`;

  function liveBadgeFor(cap) {
    return stack?.querySelector(`.capability[data-cap="${cap}"]`);
  }

  function paintReceiptOverlay(progress) {
    // Renders typed receipts on top of the rasterized HTML. We position them
    // over the receipt pad shape rendered above (rough x/y placement based
    // on the 880x520 canvas size).
    const ctx = helper.ctx;
    const padX = 44;
    const padTopY = 296;
    const lineHeight = 17;
    const visibleCount = Math.min(
      RECEIPT_LINES.length,
      Math.floor(progress * RECEIPT_LINES.length * 1.05),
    );
    ctx.save();
    ctx.font = "11px ui-monospace, Menlo, monospace";
    ctx.fillStyle = "#7ee06c";
    for (let i = 0; i < visibleCount; i += 1) {
      const line = RECEIPT_LINES[i];
      const lineProgress = Math.min(
        1,
        progress * RECEIPT_LINES.length * 1.05 - i,
      );
      const charCount = Math.floor(lineProgress * line.text.length);
      const visible = line.text.slice(0, charCount);
      ctx.fillText(`> ${visible}`, padX + 14, padTopY + i * lineHeight);
      // Reveal the matching capability badge on the first time a receipt
      // line has at least three characters showing — that timing matches
      // the eye reaching the badge column.
      if (charCount > 3) {
        const badge = liveBadgeFor(line.cap);
        if (badge && !badge.classList.contains("is-live")) {
          badge.classList.add("is-live");
        }
      }
    }
    ctx.restore();
  }

  async function runEffect() {
    // Reset capability badges so a replay re-animates them from zero.
    stack?.querySelectorAll(".capability").forEach((el) => el.classList.remove("is-live"));

    helper.setLogicalSize(880, 520);
    helper.ctx.fillStyle = "#04060a";
    helper.ctx.fillRect(0, 0, 880, 520);

    try {
      await helper.draw({ html: innerHtml, width: 880, height: 520 });
    } catch (err) {
      // foreignObject failed (Safari quirk or CSP). Skip the canvas
      // experience entirely so the article below is the read path.
      console.warn("html-in-canvas draw failed; falling back to raw view", err);
      wrap.classList.add("is-raw");
      return;
    }

    // Top-down reveal sweep covers the bottom while easing it open.
    cancelAnimationFrame(raf);
    let revealDone = false;
    topDownReveal({
      canvas,
      durationMs: 1800,
      onComplete: () => {
        revealDone = true;
        postRevealStart = performance.now();
        runReceiptLoop();
      },
    });

    // While the sweep is running, the receipt loop hasn't started yet.
    // Once it has, the loop schedules its own RAF chain.
    function runReceiptLoop() {
      const baseSnapshot = document.createElement("canvas");
      baseSnapshot.width = canvas.width;
      baseSnapshot.height = canvas.height;
      baseSnapshot.getContext("2d").drawImage(canvas, 0, 0);

      const RECEIPT_DURATION = 4200;

      function frame(now) {
        const t = Math.min((now - postRevealStart) / RECEIPT_DURATION, 1);
        // Re-blit the snapshot each frame so the typed receipts appear on
        // top of the static HTML rasterization.
        helper.ctx.setTransform(helper.dpr, 0, 0, helper.dpr, 0, 0);
        helper.ctx.drawImage(
          baseSnapshot,
          0,
          0,
          canvas.width / helper.dpr,
          canvas.height / helper.dpr,
        );
        paintReceiptOverlay(t);

        // Subtle ambient passes. Kept very mild so the article stays
        // readable through the canvas.
        helper.scanlines({ intensity: 0.14, gap: 3 });
        helper.vignette({ inner: 0.45, outer: 0.95 });

        if (t < 1) {
          raf = requestAnimationFrame(frame);
        } else {
          // Mark all badges live in case any receipt didn't reach the
          // threshold (shouldn't happen, but defensive).
          RECEIPT_LINES.forEach((line) => liveBadgeFor(line.cap)?.classList.add("is-live"));
          // After the animation finishes, settle into a slow ambient
          // scanline that doesn't pulse the eye. Could re-trigger on
          // hover, but that feels like noise.
        }
      }

      raf = requestAnimationFrame(frame);
    }

    // Keep a watchdog: if reveal never completed (off-screen tab), still
    // mark the badges live after a generous timeout so a returning reader
    // doesn't see a half-built canvas.
    setTimeout(() => {
      if (!revealDone) {
        RECEIPT_LINES.forEach((line) => liveBadgeFor(line.cap)?.classList.add("is-live"));
      }
    }, 6000);
  }

  if (replayButton) {
    replayButton.addEventListener("click", () => {
      cancelAnimationFrame(raf);
      wrap.classList.remove("is-raw");
      runEffect();
    });
  }
  if (rawButton) {
    rawButton.addEventListener("click", () => {
      // Toggle: rotate between the canvas experience and the raw HTML
      // article-only view. Useful for screen readers, copy-paste, anyone
      // who finds the canvas effect distracting.
      cancelAnimationFrame(raf);
      const isRaw = wrap.classList.toggle("is-raw");
      rawButton.textContent = isRaw ? "canvas view" : "raw view";
    });
  }

  // Respect prefers-reduced-motion: skip the reveal but still draw the
  // article HTML and reveal all capability badges so the page isn't blank.
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    helper
      .draw({ html: innerHtml, width: 880, height: 520 })
      .then(() => helper.scanlines({ intensity: 0.1, gap: 3 }))
      .catch(() => wrap.classList.add("is-raw"));
    RECEIPT_LINES.forEach((line) => liveBadgeFor(line.cap)?.classList.add("is-live"));
  } else {
    runEffect();
  }
}
