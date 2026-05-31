#!/usr/bin/env node
// Screenshot every concept-*.html in the concepts dir, capturing JS/console errors.
// Usage: node shoot.mjs [--only D01-L1] [--state idle|active]
import { readdirSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONCEPTS = resolve(__dirname, '..');
const SHOTS = join(__dirname, 'shots');
mkdirSync(SHOTS, { recursive: true });

const argOnly = (process.argv.find((a) => a.startsWith('--only=')) || '').split('=')[1];

// resolve playwright from the milady root node_modules (CJS module -> use default interop)
const pw = await import('/home/shaw/milady/node_modules/playwright/index.js');
const chromium = pw.chromium || pw.default?.chromium;
if (!chromium) throw new Error('playwright chromium export not found');

async function launch() {
  const tries = [
    () => chromium.launch(),
    () => chromium.launch({ channel: 'chrome' }),
    () => chromium.launch({ executablePath: '/usr/bin/google-chrome' }),
  ];
  let last;
  for (const t of tries) {
    try { return await t(); } catch (e) { last = e; }
  }
  throw new Error('could not launch chromium: ' + (last && last.message));
}

const files = readdirSync(CONCEPTS)
  .filter((f) => /^concept-D\d\d-L\d\.html$/.test(f))
  .filter((f) => !argOnly || f.includes(argOnly))
  .sort();

console.log(`Found ${files.length} concept files`);
const browser = await launch();
const report = [];
const CONCURRENCY = Number((process.argv.find((a) => a.startsWith('--jobs=')) || '').split('=')[1]) || 6;

async function shootOne(f) {
  const id = f.replace(/^concept-/, '').replace(/\.html$/, '');
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 880 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });
  page.on('requestfailed', (r) => {
    const u = r.url();
    if (!u.startsWith('data:')) errors.push(`requestfailed: ${u} (${r.failure()?.errorText})`);
  });
  let ok = true;
  let activated = false;
  try {
    await page.goto(pathToFileURL(join(CONCEPTS, f)).href, { waitUntil: 'load', timeout: 15000 });
    await page.waitForTimeout(1600); // let intro animations settle
    await page.screenshot({ path: join(SHOTS, `${id}.png`), fullPage: false });

    // best-effort: trigger the concept's scripted demo to populate content, then capture an "active" state
    try {
      activated = await page.evaluate(() => {
        const vis = (el) => el && el.offsetParent !== null && el.getBoundingClientRect().width > 4;
        const cands = Array.from(document.querySelectorAll('button,[role="button"],a,[onclick],.btn,[data-demo]'));
        const txt = (el) => ((el.innerText || el.textContent || '') + ' ' + (el.getAttribute('aria-label') || '') + ' ' + (el.title || '')).toLowerCase();
        const byRe = (re) => cands.find((el) => vis(el) && re.test(txt(el)));
        const t = byRe(/play demo|run demo|try demo|\bdemo\b|simulate|play conversation|see it/i)
          || byRe(/\bmic\b|speak|talk|voice|listen|hold to|tap to/i);
        if (t) { t.click(); return true; }
        return false;
      });
    } catch { /* non-fatal */ }
    if (activated) {
      await page.waitForTimeout(4200); // let the scripted listen->think->speak cycle populate the log
      await page.screenshot({ path: join(SHOTS, `${id}.active.png`), fullPage: false });
    }
  } catch (e) {
    ok = false;
    errors.push(`screenshot: ${e.message}`);
  }
  await ctx.close();
  report.push({ id, file: f, ok, activated, errors });
  process.stdout.write(`${errors.length ? 'x' : '.'} ${id}${activated ? ' +active' : ''}${errors.length ? ` (${errors.length} err)` : ''}\n`);
}

// simple concurrency pool
const queue = [...files];
const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
  while (queue.length) {
    const f = queue.shift();
    if (!f) break;
    try { await shootOne(f); } catch (e) { report.push({ id: f, file: f, ok: false, errors: [String(e.message)] }); }
  }
});
await Promise.all(workers);

await browser.close();
// merge into any existing report so partial (--only) runs don't clobber the full set
const reportPath = join(SHOTS, '_report.json');
let merged = report;
if (existsSync(reportPath)) {
  try {
    const prev = JSON.parse(readFileSync(reportPath, 'utf8'));
    const map = new Map(prev.map((r) => [r.id, r]));
    for (const r of report) map.set(r.id, r);
    merged = [...map.values()].sort((a, b) => a.id.localeCompare(b.id));
  } catch { /* keep new report */ }
}
writeFileSync(reportPath, JSON.stringify(merged, null, 2));
const bad = report.filter((r) => r.errors.length);
console.log(`\nDone. ${report.length} shots. ${bad.length} with errors.`);
if (bad.length) console.log(bad.map((b) => `  ${b.id}: ${b.errors.slice(0, 2).join(' | ')}`).join('\n'));
