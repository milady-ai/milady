export const meta = {
  name: 'assistant-concept-review-fix-baked',
  description: 'Per-concept review + fix: each agent audits ONE mockup (screenshots + source) vs a checklist, then a fixer repairs anything below a 100% bar, re-screenshots, and self-verifies',
  phases: [
    { title: 'Review', detail: 'one design-director agent per concept (1 file + its screenshots)' },
    { title: 'Fix', detail: 'per-file fixer repairs flagged/buggy concepts, re-screenshots, self-verifies' },
  ],
}

// args: flat list of concepts -> [{ directionId, directionName, lookId, lookName, hasActive, knownErrors:[String] }]
const DIR = '/home/shaw/milady/design/assistant-concepts'
const SHOOT = `${DIR}/_review/shoot.mjs`
const concepts = [{"directionId":2,"directionName":"Full-Screen Avatar + Floating Captions","lookId":1,"lookName":"Soft Aurora Glass","hasActive":true,"knownErrors":["pageerror: Unexpected identifier 's'"]},{"directionId":2,"directionName":"Full-Screen Avatar + Floating Captions","lookId":2,"lookName":"OLED Neon Cyber","hasActive":true,"knownErrors":[]},{"directionId":2,"directionName":"Full-Screen Avatar + Floating Captions","lookId":3,"lookName":"Warm Editorial Paper","hasActive":true,"knownErrors":[]},{"directionId":2,"directionName":"Full-Screen Avatar + Floating Captions","lookId":4,"lookName":"Clean System Light","hasActive":true,"knownErrors":[]},{"directionId":2,"directionName":"Full-Screen Avatar + Floating Captions","lookId":5,"lookName":"Brutalist Mono","hasActive":true,"knownErrors":[]},{"directionId":3,"directionName":"Classic Chat + Voice Dock","lookId":1,"lookName":"Soft Aurora Glass","hasActive":true,"knownErrors":[]},{"directionId":3,"directionName":"Classic Chat + Voice Dock","lookId":2,"lookName":"OLED Neon Cyber","hasActive":true,"knownErrors":[]},{"directionId":3,"directionName":"Classic Chat + Voice Dock","lookId":3,"lookName":"Warm Editorial Paper","hasActive":false,"knownErrors":[]},{"directionId":3,"directionName":"Classic Chat + Voice Dock","lookId":4,"lookName":"Clean System Light","hasActive":false,"knownErrors":[]},{"directionId":3,"directionName":"Classic Chat + Voice Dock","lookId":5,"lookName":"Brutalist Mono","hasActive":true,"knownErrors":[]},{"directionId":4,"directionName":"Ambient Peripheral Home","lookId":1,"lookName":"Soft Aurora Glass","hasActive":false,"knownErrors":[]},{"directionId":4,"directionName":"Ambient Peripheral Home","lookId":2,"lookName":"OLED Neon Cyber","hasActive":false,"knownErrors":[]},{"directionId":4,"directionName":"Ambient Peripheral Home","lookId":3,"lookName":"Warm Editorial Paper","hasActive":false,"knownErrors":[]},{"directionId":4,"directionName":"Ambient Peripheral Home","lookId":4,"lookName":"Clean System Light","hasActive":false,"knownErrors":[]},{"directionId":4,"directionName":"Ambient Peripheral Home","lookId":5,"lookName":"Brutalist Mono","hasActive":false,"knownErrors":[]},{"directionId":5,"directionName":"Card Canvas (Answers Are Cards)","lookId":1,"lookName":"Soft Aurora Glass","hasActive":true,"knownErrors":["pageerror: Unexpected identifier 's'","pageerror: runDemo is not defined"]},{"directionId":5,"directionName":"Card Canvas (Answers Are Cards)","lookId":2,"lookName":"OLED Neon Cyber","hasActive":false,"knownErrors":[]},{"directionId":5,"directionName":"Card Canvas (Answers Are Cards)","lookId":3,"lookName":"Warm Editorial Paper","hasActive":true,"knownErrors":[]},{"directionId":5,"directionName":"Card Canvas (Answers Are Cards)","lookId":4,"lookName":"Clean System Light","hasActive":false,"knownErrors":[]},{"directionId":5,"directionName":"Card Canvas (Answers Are Cards)","lookId":5,"lookName":"Brutalist Mono","hasActive":true,"knownErrors":[]},{"directionId":6,"directionName":"Terminal / CLI Hybrid","lookId":1,"lookName":"Soft Aurora Glass","hasActive":true,"knownErrors":[]},{"directionId":6,"directionName":"Terminal / CLI Hybrid","lookId":2,"lookName":"OLED Neon Cyber","hasActive":true,"knownErrors":[]},{"directionId":6,"directionName":"Terminal / CLI Hybrid","lookId":3,"lookName":"Warm Editorial Paper","hasActive":true,"knownErrors":[]},{"directionId":6,"directionName":"Terminal / CLI Hybrid","lookId":4,"lookName":"Clean System Light","hasActive":false,"knownErrors":[]},{"directionId":6,"directionName":"Terminal / CLI Hybrid","lookId":5,"lookName":"Brutalist Mono","hasActive":true,"knownErrors":[]},{"directionId":7,"directionName":"Spatial 3D Depth","lookId":1,"lookName":"Soft Aurora Glass","hasActive":true,"knownErrors":["pageerror: Unexpected identifier 'll'","pageerror: runDemo is not defined"]},{"directionId":7,"directionName":"Spatial 3D Depth","lookId":2,"lookName":"OLED Neon Cyber","hasActive":true,"knownErrors":[]},{"directionId":7,"directionName":"Spatial 3D Depth","lookId":3,"lookName":"Warm Editorial Paper","hasActive":true,"knownErrors":["pageerror: Unexpected identifier 's'","pageerror: runDemo is not defined"]},{"directionId":7,"directionName":"Spatial 3D Depth","lookId":4,"lookName":"Clean System Light","hasActive":true,"knownErrors":[]},{"directionId":7,"directionName":"Spatial 3D Depth","lookId":5,"lookName":"Brutalist Mono","hasActive":false,"knownErrors":[]},{"directionId":8,"directionName":"Radial Menu Around Avatar","lookId":1,"lookName":"Soft Aurora Glass","hasActive":true,"knownErrors":[]},{"directionId":8,"directionName":"Radial Menu Around Avatar","lookId":2,"lookName":"OLED Neon Cyber","hasActive":true,"knownErrors":[]},{"directionId":8,"directionName":"Radial Menu Around Avatar","lookId":3,"lookName":"Warm Editorial Paper","hasActive":true,"knownErrors":[]},{"directionId":8,"directionName":"Radial Menu Around Avatar","lookId":4,"lookName":"Clean System Light","hasActive":true,"knownErrors":[]},{"directionId":8,"directionName":"Radial Menu Around Avatar","lookId":5,"lookName":"Brutalist Mono","hasActive":true,"knownErrors":[]},{"directionId":9,"directionName":"Conversation-as-Vertical-Timeline","lookId":1,"lookName":"Soft Aurora Glass","hasActive":true,"knownErrors":["pageerror: Unexpected identifier 's'","pageerror: runDemo is not defined"]},{"directionId":9,"directionName":"Conversation-as-Vertical-Timeline","lookId":2,"lookName":"OLED Neon Cyber","hasActive":true,"knownErrors":[]},{"directionId":9,"directionName":"Conversation-as-Vertical-Timeline","lookId":3,"lookName":"Warm Editorial Paper","hasActive":true,"knownErrors":["pageerror: Unexpected identifier 's'","pageerror: runDemo is not defined"]},{"directionId":9,"directionName":"Conversation-as-Vertical-Timeline","lookId":4,"lookName":"Clean System Light","hasActive":true,"knownErrors":[]},{"directionId":9,"directionName":"Conversation-as-Vertical-Timeline","lookId":5,"lookName":"Brutalist Mono","hasActive":true,"knownErrors":[]},{"directionId":10,"directionName":"Push-to-Talk Walkie-Talkie","lookId":1,"lookName":"Soft Aurora Glass","hasActive":true,"knownErrors":[]},{"directionId":10,"directionName":"Push-to-Talk Walkie-Talkie","lookId":2,"lookName":"OLED Neon Cyber","hasActive":true,"knownErrors":[]},{"directionId":10,"directionName":"Push-to-Talk Walkie-Talkie","lookId":3,"lookName":"Warm Editorial Paper","hasActive":true,"knownErrors":[]},{"directionId":10,"directionName":"Push-to-Talk Walkie-Talkie","lookId":4,"lookName":"Clean System Light","hasActive":true,"knownErrors":[]},{"directionId":10,"directionName":"Push-to-Talk Walkie-Talkie","lookId":5,"lookName":"Brutalist Mono","hasActive":true,"knownErrors":[]},{"directionId":11,"directionName":"Zen Single-Line Minimal","lookId":1,"lookName":"Soft Aurora Glass","hasActive":true,"knownErrors":["pageerror: Unexpected identifier 's'"]},{"directionId":11,"directionName":"Zen Single-Line Minimal","lookId":2,"lookName":"OLED Neon Cyber","hasActive":true,"knownErrors":[]},{"directionId":11,"directionName":"Zen Single-Line Minimal","lookId":3,"lookName":"Warm Editorial Paper","hasActive":true,"knownErrors":["pageerror: Unexpected identifier 's'"]},{"directionId":11,"directionName":"Zen Single-Line Minimal","lookId":4,"lookName":"Clean System Light","hasActive":true,"knownErrors":["pageerror: Unexpected identifier 's'"]},{"directionId":11,"directionName":"Zen Single-Line Minimal","lookId":5,"lookName":"Brutalist Mono","hasActive":true,"knownErrors":[]},{"directionId":12,"directionName":"App-Launcher-First Home","lookId":1,"lookName":"Soft Aurora Glass","hasActive":true,"knownErrors":["pageerror: missing ) after argument list","pageerror: runDemo is not defined"]},{"directionId":12,"directionName":"App-Launcher-First Home","lookId":2,"lookName":"OLED Neon Cyber","hasActive":true,"knownErrors":[]},{"directionId":12,"directionName":"App-Launcher-First Home","lookId":3,"lookName":"Warm Editorial Paper","hasActive":true,"knownErrors":["pageerror: missing ) after argument list","pageerror: runDemo is not defined"]},{"directionId":12,"directionName":"App-Launcher-First Home","lookId":4,"lookName":"Clean System Light","hasActive":true,"knownErrors":["pageerror: missing ) after argument list","pageerror: runDemo is not defined"]},{"directionId":12,"directionName":"App-Launcher-First Home","lookId":5,"lookName":"Brutalist Mono","hasActive":true,"knownErrors":[]},{"directionId":13,"directionName":"Split Avatar + Work Canvas (Artifacts)","lookId":1,"lookName":"Soft Aurora Glass","hasActive":true,"knownErrors":[]},{"directionId":13,"directionName":"Split Avatar + Work Canvas (Artifacts)","lookId":2,"lookName":"OLED Neon Cyber","hasActive":true,"knownErrors":[]},{"directionId":13,"directionName":"Split Avatar + Work Canvas (Artifacts)","lookId":3,"lookName":"Warm Editorial Paper","hasActive":true,"knownErrors":[]},{"directionId":13,"directionName":"Split Avatar + Work Canvas (Artifacts)","lookId":4,"lookName":"Clean System Light","hasActive":true,"knownErrors":[]},{"directionId":13,"directionName":"Split Avatar + Work Canvas (Artifacts)","lookId":5,"lookName":"Brutalist Mono","hasActive":true,"knownErrors":[]},{"directionId":14,"directionName":"Voice-Memo / Audio-Waveform Style","lookId":1,"lookName":"Soft Aurora Glass","hasActive":true,"knownErrors":[]},{"directionId":14,"directionName":"Voice-Memo / Audio-Waveform Style","lookId":2,"lookName":"OLED Neon Cyber","hasActive":true,"knownErrors":[]},{"directionId":14,"directionName":"Voice-Memo / Audio-Waveform Style","lookId":3,"lookName":"Warm Editorial Paper","hasActive":true,"knownErrors":[]},{"directionId":14,"directionName":"Voice-Memo / Audio-Waveform Style","lookId":4,"lookName":"Clean System Light","hasActive":true,"knownErrors":["pageerror: missing ) after argument list","pageerror: playDemo is not defined"]},{"directionId":14,"directionName":"Voice-Memo / Audio-Waveform Style","lookId":5,"lookName":"Brutalist Mono","hasActive":true,"knownErrors":[]},{"directionId":15,"directionName":"Character / Companion with Personality","lookId":1,"lookName":"Soft Aurora Glass","hasActive":true,"knownErrors":[]},{"directionId":15,"directionName":"Character / Companion with Personality","lookId":2,"lookName":"OLED Neon Cyber","hasActive":true,"knownErrors":[]},{"directionId":15,"directionName":"Character / Companion with Personality","lookId":3,"lookName":"Warm Editorial Paper","hasActive":true,"knownErrors":[]},{"directionId":15,"directionName":"Character / Companion with Personality","lookId":4,"lookName":"Clean System Light","hasActive":true,"knownErrors":[]},{"directionId":15,"directionName":"Character / Companion with Personality","lookId":5,"lookName":"Brutalist Mono","hasActive":true,"knownErrors":[]},{"directionId":16,"directionName":"Dashboard Home with Widgets","lookId":1,"lookName":"Soft Aurora Glass","hasActive":true,"knownErrors":[]},{"directionId":16,"directionName":"Dashboard Home with Widgets","lookId":2,"lookName":"OLED Neon Cyber","hasActive":true,"knownErrors":[]},{"directionId":16,"directionName":"Dashboard Home with Widgets","lookId":3,"lookName":"Warm Editorial Paper","hasActive":true,"knownErrors":[]},{"directionId":16,"directionName":"Dashboard Home with Widgets","lookId":4,"lookName":"Clean System Light","hasActive":true,"knownErrors":[]},{"directionId":16,"directionName":"Dashboard Home with Widgets","lookId":5,"lookName":"Brutalist Mono","hasActive":true,"knownErrors":[]},{"directionId":17,"directionName":"Now-Playing / Media-Player Style","lookId":1,"lookName":"Soft Aurora Glass","hasActive":true,"knownErrors":[]},{"directionId":17,"directionName":"Now-Playing / Media-Player Style","lookId":2,"lookName":"OLED Neon Cyber","hasActive":false,"knownErrors":[]},{"directionId":17,"directionName":"Now-Playing / Media-Player Style","lookId":3,"lookName":"Warm Editorial Paper","hasActive":false,"knownErrors":[]},{"directionId":17,"directionName":"Now-Playing / Media-Player Style","lookId":4,"lookName":"Clean System Light","hasActive":true,"knownErrors":["pageerror: missing ) after argument list"]},{"directionId":17,"directionName":"Now-Playing / Media-Player Style","lookId":5,"lookName":"Brutalist Mono","hasActive":true,"knownErrors":[]},{"directionId":18,"directionName":"Gesture / Swipe-Driven","lookId":1,"lookName":"Soft Aurora Glass","hasActive":true,"knownErrors":[]},{"directionId":18,"directionName":"Gesture / Swipe-Driven","lookId":2,"lookName":"OLED Neon Cyber","hasActive":true,"knownErrors":[]},{"directionId":18,"directionName":"Gesture / Swipe-Driven","lookId":3,"lookName":"Warm Editorial Paper","hasActive":true,"knownErrors":["pageerror: missing ) after argument list"]},{"directionId":18,"directionName":"Gesture / Swipe-Driven","lookId":4,"lookName":"Clean System Light","hasActive":true,"knownErrors":["pageerror: Unexpected identifier 's'"]},{"directionId":18,"directionName":"Gesture / Swipe-Driven","lookId":5,"lookName":"Brutalist Mono","hasActive":true,"knownErrors":[]},{"directionId":19,"directionName":"Glass HUD Overlay","lookId":1,"lookName":"Soft Aurora Glass","hasActive":false,"knownErrors":[]},{"directionId":19,"directionName":"Glass HUD Overlay","lookId":2,"lookName":"OLED Neon Cyber","hasActive":false,"knownErrors":[]},{"directionId":19,"directionName":"Glass HUD Overlay","lookId":3,"lookName":"Warm Editorial Paper","hasActive":false,"knownErrors":[]},{"directionId":19,"directionName":"Glass HUD Overlay","lookId":4,"lookName":"Clean System Light","hasActive":false,"knownErrors":[]},{"directionId":19,"directionName":"Glass HUD Overlay","lookId":5,"lookName":"Brutalist Mono","hasActive":true,"knownErrors":[]},{"directionId":20,"directionName":"Sidebar + Stage (Two-Pane Console)","lookId":1,"lookName":"Soft Aurora Glass","hasActive":true,"knownErrors":[]},{"directionId":20,"directionName":"Sidebar + Stage (Two-Pane Console)","lookId":2,"lookName":"OLED Neon Cyber","hasActive":true,"knownErrors":["pageerror: Identifier 'demoTimers' has already been declared"]},{"directionId":20,"directionName":"Sidebar + Stage (Two-Pane Console)","lookId":3,"lookName":"Warm Editorial Paper","hasActive":true,"knownErrors":[]},{"directionId":20,"directionName":"Sidebar + Stage (Two-Pane Console)","lookId":4,"lookName":"Clean System Light","hasActive":true,"knownErrors":[]},{"directionId":20,"directionName":"Sidebar + Stage (Two-Pane Console)","lookId":5,"lookName":"Brutalist Mono","hasActive":true,"knownErrors":[]}]
if (!concepts.length) throw new Error("no concepts baked in")

const CHECKLIST = [
  'Avatar/presence with 4 visibly distinct CSS-animated states: idle (breathing), listening (reacts to faked mic level), thinking, speaking',
  'A clear "voice is LIVE / listening" indicator (animated waveform/ring/particles driven by a JS-faked mic level)',
  'A mute control AND a distinct muted visual state',
  'Mic<->Send morph: empty input shows mic/voice primary action; typing morphs it into Send; clearing reverts',
  'Typed AND spoken (transcribed) turns both appear in the SAME chat log, visually distinguishable (mic glyph on voice turns)',
  'Contextual suggestion chips (at idle and/or while typing)',
  'An attach control that adds a mock attachment chip/thumbnail and shows it in the sent message',
  'At least one inline app/widget card as an assistant response (weather/calendar/music/timer/map etc.)',
  'A scripted voice demo cycle (idle -> listening -> thinking -> speaking that streams a reply into the log)',
  'Self-contained: vanilla HTML/CSS/JS only, no network/CDN/frameworks, renders via file:// with NO console/page errors',
]

const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    directionId: { type: 'number' },
    lookId: { type: 'number' },
    aesthetic: { type: 'number', description: '1-10 design-director score' },
    complete: { type: 'boolean' },
    missing: { type: 'array', items: { type: 'string' } },
    jsErrors: { type: 'array', items: { type: 'string' } },
    issues: { type: 'array', items: { type: 'string' } },
    verdict: { type: 'string', enum: ['pass', 'fix'] },
    fixInstructions: { type: 'string' },
  },
  required: ['directionId', 'lookId', 'aesthetic', 'complete', 'verdict'],
}
const FIX_SCHEMA = {
  type: 'object',
  properties: {
    directionId: { type: 'number' },
    lookId: { type: 'number' },
    fixed: { type: 'boolean' },
    remaining: { type: 'array', items: { type: 'string' } },
    note: { type: 'string' },
  },
  required: ['directionId', 'lookId', 'fixed'],
}

const pad = (n) => String(n).padStart(2, '0')

phase('Review')
const results = await pipeline(
  concepts,
  // stage 1: review ONE concept
  (c) => {
    const NN = pad(c.directionId)
    const tag = `D${NN}-L${c.lookId}`
    return agent(
      `You are a ruthless but fair design director auditing ONE AI voice+chat+avatar assistant concept mockup.\n\n` +
      `Concept ${tag} — direction "${c.directionName}", visual look "${c.lookName}".\n` +
      `Files:\n` +
      `  source: ${DIR}/concept-${tag}.html\n` +
      `  idle screenshot: ${DIR}/_review/shots/${tag}.png\n` +
      (c.hasActive ? `  active screenshot: ${DIR}/_review/shots/${tag}.active.png\n` : ``) +
      `Captured JS/console errors for this file (from a real headless-chrome load): ${JSON.stringify(c.knownErrors || [])}\n\n` +
      `STEPS: (1) Read the screenshot PNG(s) with the Read tool. (2) Read the HTML source — verify features actually exist in code (an empty chat at idle is fine IF a scripted demo populates it; confirm in source). (3) Treat any captured JS error as an automatic 'fix'.\n\n` +
      `Score AESTHETICS 1-10 (layout balance, polish, distinctiveness of this look, typography, color, spacing, avatar treatment, NO overlap/clipping/invisible text, readability/contrast, looks shippable).\n` +
      `Check COMPLETENESS against this checklist (verify in source):\n${CHECKLIST.map((x, i) => `  ${i + 1}. ${x}`).join('\n')}\n\n` +
      `PASS bar: aesthetic >= 7 AND complete AND zero JS errors AND no serious visual defect (overlap, clipping, unreadable text, broken layout, placeholder/lorem, or visually identical to a generic template).\n\n` +
      `You MUST finish by calling the StructuredOutput tool with: directionId(${c.directionId}), lookId(${c.lookId}), aesthetic, complete, missing[], jsErrors[], issues[] (concrete + specific), verdict ('pass'|'fix'), fixInstructions (precise, actionable when fixing). Do NOT end your turn with a prose summary — the StructuredOutput call is your only deliverable.`,
      { label: `review:${tag}`, phase: 'Review', schema: REVIEW_SCHEMA }
    ).then((r) => ({ c, review: r }))
  },
  // stage 2: fix this concept if flagged or has known JS errors
  (prev) => {
    if (!prev) return null
    const { c, review } = prev
    const NN = pad(c.directionId)
    const tag = `D${NN}-L${c.lookId}`
    const needsFix = review.verdict === 'fix' || (c.knownErrors && c.knownErrors.length) || (review.jsErrors && review.jsErrors.length)
    if (!needsFix) {
      return { directionId: c.directionId, lookId: c.lookId, fixed: true, passedClean: true, aesthetic: review.aesthetic, remaining: [], note: 'passed review' }
    }
    return agent(
      `You are a senior front-end designer-engineer. Bring ONE AI-assistant concept mockup up to a 100% bar (aesthetic >= 8, fully complete, ZERO JS/console errors, zero visual defects).\n\n` +
      `File: ${DIR}/concept-${tag}.html — direction "${c.directionName}" (D${NN}), visual look "${c.lookName}".\n` +
      `PRESERVE the UX direction and the visual look; only fix defects + fill missing checklist items + raise polish. Constraints: vanilla HTML/CSS/JS only, no network/CDN/frameworks, must render via file://.\n\n` +
      `Captured JS errors (MUST be eliminated — these are usually unescaped apostrophes inside JS strings, e.g. 'it's' breaking a single-quoted string, or duplicate const declarations, or onclick referencing an undefined function because the <script> failed to parse): ${JSON.stringify(c.knownErrors || [])}\n` +
      `Reviewer issues: ${JSON.stringify(review.issues || [])}\n` +
      `Reviewer missing: ${JSON.stringify(review.missing || [])}\n` +
      `Reviewer fixInstructions: ${review.fixInstructions || ''}\n\n` +
      `Checklist every file must satisfy:\n${CHECKLIST.map((x, i) => `  ${i + 1}. ${x}`).join('\n')}\n\n` +
      `WORKFLOW:\n` +
      `1) Read ${DIR}/concept-${tag}.html and its screenshot ${DIR}/_review/shots/${tag}.png.\n` +
      `2) Edit to resolve EVERY JS error and listed issue/missing item, and raise polish. For apostrophe bugs, prefer template literals or escape properly; scan ALL inline JS strings for stray quotes.\n` +
      `3) Re-screenshot: run \`node ${SHOOT} --only=${tag}\` (writes fresh ${tag}.png and, if a demo trigger is found, ${tag}.active.png; it also reports JS errors at the end).\n` +
      `4) Read the regenerated PNG(s) AND check the shoot output reported 0 errors for ${tag}. If errors remain or it still looks off, iterate (edit -> re-shoot -> re-read).\n\n` +
      `Do NOT touch any other file. You MUST finish by calling StructuredOutput with: directionId(${c.directionId}), lookId(${c.lookId}), fixed(bool — true only if it now passes with 0 JS errors), remaining[] (anything unresolved), note. The StructuredOutput call is your only deliverable.`,
      { label: `fix:${tag}`, phase: 'Fix', schema: FIX_SCHEMA }
    ).then((fx) => ({ ...fx, aesthetic: review.aesthetic, wasFixed: true }))
  }
)

const flat = results.filter(Boolean)
const passedClean = flat.filter((r) => r.passedClean).length
const fixedNow = flat.filter((r) => r.wasFixed).length
const stillBroken = flat.filter((r) => r.fixed === false || (r.remaining && r.remaining.length))
  .map((r) => ({ tag: `D${pad(r.directionId)}-L${r.lookId}`, remaining: r.remaining, note: r.note }))
const aests = flat.map((r) => r.aesthetic).filter((n) => typeof n === 'number')

log(`Done. reviewed ${flat.length} | passed clean ${passedClean} | fixed ${fixedNow} | still-broken ${stillBroken.length}`)

return {
  reviewed: flat.length,
  passedClean,
  fixedNow,
  stillBroken,
  aestheticAvg: aests.length ? Math.round((aests.reduce((s, n) => s + n, 0) / aests.length) * 10) / 10 : 0,
  perConcept: flat.map((r) => ({ tag: `D${pad(r.directionId)}-L${r.lookId}`, aesthetic: r.aesthetic, fixed: r.fixed !== false, fixedNow: !!r.wasFixed })),
}
