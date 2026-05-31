// Build per-look contact sheets (idle + active) by rendering an HTML grid in Chrome.
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(__dirname, 'shots');
const SHEETS = join(__dirname, 'sheets');
mkdirSync(SHEETS, { recursive: true });

const pw = await import('/home/shaw/milady/node_modules/playwright/index.js');
const chromium = pw.chromium || pw.default?.chromium;
let browser;
for (const opt of [{}, { channel: 'chrome' }, { executablePath: '/usr/bin/google-chrome' }]) {
  try { browser = await chromium.launch(opt); break; } catch { /* next */ }
}
if (!browser) throw new Error('could not launch chromium');

const LOOKS = { 1: 'Soft Aurora Glass', 2: 'OLED Neon Cyber', 3: 'Warm Editorial Paper', 4: 'Clean System Light', 5: 'Brutalist Mono' };
const DIRS = {
  1: 'Giant Orb', 2: 'Avatar+Captions', 3: 'Chat+Voice Dock', 4: 'Ambient Edge', 5: 'Card Canvas',
  6: 'Terminal/CLI', 7: 'Spatial 3D', 8: 'Radial Menu', 9: 'Timeline', 10: 'Walkie-Talkie',
  11: 'Zen Single-Line', 12: 'App Launcher', 13: 'Split Artifacts', 14: 'Voice-Memo', 15: 'Companion',
  16: 'Dashboard', 17: 'Now-Playing', 18: 'Gesture/Swipe', 19: 'Glass HUD', 20: 'Sidebar+Stage',
};
const pad = (n) => String(n).padStart(2, '0');

async function sheet(kind) {
  for (let k = 1; k <= 5; k++) {
    const cells = [];
    for (let d = 1; d <= 20; d++) {
      const tag = `D${pad(d)}-L${k}`;
      let rel = `${tag}.png`;
      if (kind === 'active' && existsSync(join(SHOTS, `${tag}.active.png`))) rel = `${tag}.active.png`;
      const src = existsSync(join(SHOTS, rel)) ? rel : '';  // relative path -> same-origin file:// load
      cells.push(`<figure><img src="${src}" loading="eager"/><figcaption>${tag} · ${DIRS[d]}</figcaption></figure>`);
    }
    const html = `<!doctype html><meta charset="utf8"><style>
      body{margin:0;background:#0e0e12;font-family:ui-sans-serif,system-ui,Arial;color:#e8e8ee}
      h1{font-size:20px;margin:14px 18px 4px}
      .grid{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;padding:10px 14px 22px}
      figure{margin:0;background:#17171d;border:1px solid #2a2a33;border-radius:8px;overflow:hidden}
      img{display:block;width:100%;height:230px;object-fit:cover;object-position:top;background:#000}
      figcaption{font-size:12px;padding:6px 8px;color:#b9b9c6}
    </style><h1>Look ${k} — ${LOOKS[k]} · ${kind} state · 20 directions</h1>
    <div class="grid">${cells.join('')}</div>`;
    const tmp = join(SHOTS, `_sheet_${k}_${kind}.html`);
    writeFileSync(tmp, html);
    const page = await browser.newPage({ viewport: { width: 1900, height: 1200 }, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(tmp).href, { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(SHEETS, `look${k}_${kind}.png`), fullPage: true });
    await page.close();
    rmSync(tmp, { force: true });
    console.log(`built sheets/look${k}_${kind}.png (${LOOKS[k]})`);
  }
}
await sheet('idle');
await sheet('active');
await browser.close();
console.log('done');
