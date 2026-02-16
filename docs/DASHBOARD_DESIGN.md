# Milaidy Contributor Dashboard — Design Document

*Created: 2026-02-14*

---

## 1. Architecture Overview

```
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│  GitHub Actions   │    │  Dashboard CLI    │    │  Next.js 15 App  │
│  (trust-scoring)  │───▶│  (data pipeline)  │───▶│  (SSG on Vercel) │
│                   │    │                   │    │                   │
│  PR events →      │    │  GitHub API →     │    │  SQLite → pages  │
│  repo variable    │    │  SQLite + scores  │    │  at build time   │
└──────────────────┘    └──────────────────┘    └──────────────────┘
```

### Tech Stack
- **Framework**: Next.js 15 (App Router, TypeScript, React Server Components)
- **Styling**: Tailwind CSS 4 + shadcn/ui
- **Database**: SQLite + Drizzle ORM (embedded, no external deps)
- **Scoring**: `trust-scoring.js` ported to TypeScript
- **Data**: GitHub GraphQL API for activity, repo variables for trust state
- **Deployment**: Vercel (static export, rebuilt on cron)
- **Package manager**: Bun

---

## 2. Pages

### 2.1 Leaderboard (`/` → `/leaderboard`)

The main page. Shows all contributors ranked by trust score.

**Features:**
- Trust tier filter tabs: All | Legendary | Trusted | Established | Contributing | Probationary+
- Search by username
- Sort by: trust score (default), recent activity, PR count, streak length
- Period view: All-time | This month | This week
- Virtualized list for performance (reuse ElizaOS pattern with @tanstack/react-virtual)

**Each row shows:**
- Rank (#)
- Avatar + username (link to profile)
- Trust tier badge (color-coded)
- Trust score (0-100) with mini progress bar
- Current streak indicator (🔥 × N for approvals, ⚠️ × N for rejections)
- Last active (relative time)
- Wallet address (truncated, if linked)

### 2.2 Contributor Profile (`/contributor/[username]`)

Deep dive into a single contributor.

**Header:**
- Avatar, username, GitHub link
- Trust tier badge (large, prominent)
- Trust score with gauge visualization (0-100)
- "Next tier" indicator: "23 points to trusted"
- Auto-merge eligibility badge
- Wallet address (if linked)
- Member since / last active

**Trust Score Breakdown** (accordion/tabs):
- **Diminishing Returns**: Curve graph showing contributor's position. X=approval count, Y=multiplier %.
- **Recency Timeline**: Horizontal timeline of events, brightness = recency weight.
- **Complexity Profile**: Bar chart of PR sizes across complexity buckets.
- **Category Distribution**: Donut chart of contribution categories (security/core/feature/docs/chore).
- **Streak Status**: Current streak type + length, historical longest streak.
- **Inactivity Status**: Days since last event, decay status, grace period indicator.
- **Velocity**: Gauge of PRs in last 7 days vs caps.
- **Daily Cap**: Today's points earned vs 35-point limit.

**Activity Feed:**
- Chronological list of all events (approve/reject/close/selfClose)
- Each shows: PR title, date, complexity bucket, category, weighted points earned
- Color-coded by outcome (green=approve, red=reject, orange=close)
- Filterable by type and time range

**Stats Summary:**
- Total PRs submitted / merged / rejected / closed
- Approval rate (%)
- Average PR complexity
- Most common categories
- Score trajectory graph (score over time)

### 2.3 PR Review History (`/reviews`)

Overview of all PR review decisions across the repo.

**Features:**
- Table/list of recent PR events
- Columns: PR #, Title, Author (with tier badge), Verdict, Reviewer, Complexity, Category, Points Impact, Date
- Filter by: verdict type, author, reviewer, complexity, date range
- Stats bar: approval rate, average complexity, busiest reviewers

### 2.4 Trust Score Explorer (`/scoring`)

Interactive explanation of the trust scoring algorithm.

**Features:**
- Algorithm documentation with live examples
- Interactive calculator: adjust parameters and see score impact
- Example scenarios (from trust-scoring.js runExamples):
  - Steady Eddie, Speed Demon, Security Hero, Rough Start, Gone Ghost, Typo Farmer, Brand New
- Current config values displayed

---

## 3. Data Model

### Extended Schema (building on ElizaOS patterns)

```sql
-- Core: contributor trust state
CREATE TABLE contributors (
  username TEXT PRIMARY KEY,
  avatar_url TEXT,
  trust_score REAL NOT NULL DEFAULT 35,
  trust_tier TEXT NOT NULL DEFAULT 'probationary',
  current_streak_type TEXT,          -- 'approve' | 'negative' | null
  current_streak_length INTEGER DEFAULT 0,
  total_approvals INTEGER DEFAULT 0,
  total_rejections INTEGER DEFAULT 0,
  total_closes INTEGER DEFAULT 0,
  last_event_at TEXT,
  first_seen_at TEXT NOT NULL,
  manual_adjustment REAL DEFAULT 0,
  wallet_address TEXT,               -- Base chain address
  wallet_chain TEXT DEFAULT 'base',
  auto_merge_eligible INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Event history (mirrors trust-scoring.js event shape)
CREATE TABLE trust_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL REFERENCES contributors(username),
  type TEXT NOT NULL,                -- 'approve' | 'reject' | 'close' | 'selfClose'
  pr_number INTEGER NOT NULL,
  pr_title TEXT,
  lines_changed INTEGER DEFAULT 0,
  files_changed INTEGER DEFAULT 0,
  labels TEXT DEFAULT '[]',          -- JSON array
  review_severity TEXT,              -- for rejections
  reviewer TEXT,                     -- who reviewed
  complexity_bucket TEXT,            -- computed: trivial/small/medium/large/xlarge/massive
  category_weight REAL,              -- computed: highest label weight
  base_points REAL,
  weighted_points REAL,              -- after all multipliers
  final_points REAL,                 -- after caps
  timestamp INTEGER NOT NULL,        -- Unix ms
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Score snapshots (for historical graphs)
CREATE TABLE score_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL REFERENCES contributors(username),
  score REAL NOT NULL,
  tier TEXT NOT NULL,
  snapshot_date TEXT NOT NULL,        -- YYYY-MM-DD
  breakdown TEXT NOT NULL DEFAULT '{}', -- JSON: full breakdown object
  UNIQUE(username, snapshot_date)
);

-- Raw GitHub data (subset of ElizaOS schema, what we need)
CREATE TABLE pull_requests (
  id TEXT PRIMARY KEY,
  number INTEGER NOT NULL,
  title TEXT NOT NULL,
  state TEXT NOT NULL,
  merged INTEGER DEFAULT 0,
  author TEXT NOT NULL,
  created_at TEXT NOT NULL,
  merged_at TEXT,
  closed_at TEXT,
  additions INTEGER DEFAULT 0,
  deletions INTEGER DEFAULT 0,
  changed_files INTEGER DEFAULT 0,
  labels TEXT DEFAULT '[]',          -- JSON array
  body TEXT
);

CREATE TABLE reviews (
  id TEXT PRIMARY KEY,
  pr_number INTEGER NOT NULL,
  state TEXT NOT NULL,               -- APPROVED, CHANGES_REQUESTED, COMMENTED
  author TEXT,
  body TEXT,
  created_at TEXT NOT NULL
);
```

### Trust Tier Mapping

```typescript
const TIER_CONFIG = {
  legendary:    { min: 90, color: '#F59E0B', bg: '#78350F', icon: '👑', autoMerge: true },
  trusted:      { min: 75, color: '#10B981', bg: '#064E3B', icon: '✅', autoMerge: false },
  established:  { min: 60, color: '#3B82F6', bg: '#1E3A5F', icon: '🔷', autoMerge: false },
  contributing: { min: 45, color: '#06B6D4', bg: '#164E63', icon: '🔧', autoMerge: false },
  probationary: { min: 30, color: '#F97316', bg: '#7C2D12', icon: '⚡', autoMerge: false },
  untested:     { min: 15, color: '#6B7280', bg: '#1F2937', icon: '❓', autoMerge: false },
  restricted:   { min: 0,  color: '#EF4444', bg: '#7F1D1D', icon: '🚫', autoMerge: false },
} as const;
```

---

## 4. Unique Features

### 4.1 Diminishing Returns Graph
Interactive chart showing the logarithmic curve `1 / (1 + 0.2 * ln(1 + n))`.
- Highlight contributor's current position (n = their approval count)
- Show "next approval is worth X% of your first"
- Educates contributors on why consistent quality > volume

### 4.2 Velocity Gauge
Real-time gauge visualization:
- Green zone: 0-10 PRs/week (normal)
- Yellow zone: 10-25 PRs/week (penalty applied, percentage shown)
- Red zone: 25+ PRs/week (hard cap, points zeroed)
- Current PR count in window displayed

### 4.3 Streak Tracker
- Visual flame counter for approval streaks 🔥🔥🔥
- Warning counter for rejection streaks ⚠️⚠️
- Historical longest streak
- Multiplier displayed: "Your next approval gets +32% bonus"

### 4.4 Score Trajectory
- Line chart of trust score over time (from score_snapshots)
- Tier boundaries shown as horizontal bands
- Significant events annotated on the timeline
- Projection line: "At current pace, you'll reach trusted in ~X days"

### 4.5 Auto-Merge Status
- Clear badge: "Auto-merge eligible" or "Not eligible"
- If not eligible: exact requirements shown
- Score needed: 90 - current = gap
- Estimated timeline based on recent velocity

### 4.6 Review Verdict Heatmap
- GitHub-style contribution heatmap but for review verdicts
- Green = approved, red = rejected, orange = closed
- Shows consistency patterns at a glance

### 4.7 Comparative Rankings
- "You are ranked #X of Y contributors"
- Percentile indicator
- Score distribution histogram with contributor's position marked

---

## 5. Visual Design

### Theme: Dark + Milaidy Brand

```css
:root {
  /* Background layers */
  --bg-primary: #0A0A0F;        /* Near-black with slight purple */
  --bg-secondary: #111118;       /* Card backgrounds */
  --bg-tertiary: #1A1A25;        /* Hover states */
  
  /* Brand accent (milaidy pink/purple) */
  --accent-primary: #C084FC;     /* Purple-400 */
  --accent-secondary: #A855F7;   /* Purple-500 */
  --accent-glow: rgba(168, 85, 247, 0.15);
  
  /* Text */
  --text-primary: #F8FAFC;
  --text-secondary: #94A3B8;
  --text-muted: #64748B;
  
  /* Tier colors */
  --tier-legendary: #F59E0B;
  --tier-trusted: #10B981;
  --tier-established: #3B82F6;
  --tier-contributing: #06B6D4;
  --tier-probationary: #F97316;
  --tier-untested: #6B7280;
  --tier-restricted: #EF4444;
  
  /* Borders */
  --border: #1E293B;
  --border-hover: #334155;
}
```

### Design Principles
- Dark-first, no light mode (matches crypto/agent aesthetic)
- Subtle purple glow accents (milaidy brand)
- Cards with slight glass morphism (backdrop-blur)
- Trust tier colors are the primary visual language
- Monospace for scores and numbers
- Clean data density — lots of info without clutter

---

## 6. Data Pipeline

### Ingestion (cron, daily or on-demand)

```bash
# 1. Fetch PR data from GitHub API
bun run pipeline ingest --days 7

# 2. Compute trust scores from event history
bun run pipeline compute-scores

# 3. Take daily score snapshots
bun run pipeline snapshot

# 4. Rebuild and deploy
bun run build && vercel deploy --prod
```

### GitHub Actions Workflow

```yaml
name: Update Dashboard
on:
  schedule:
    - cron: '0 6 * * *'  # Daily at 6 AM UTC
  workflow_dispatch:

jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: bun run pipeline ingest --days 7
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      - run: bun run pipeline compute-scores
      - run: bun run build
      - uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          vercel-args: '--prod'
```

### Trust State Sync

The GitHub Actions trust-scoring workflow stores state in a repo variable. The dashboard pipeline reads this and syncs to SQLite:

```typescript
// Fetch contributor states from repo variable
const states = await github.rest.actions.getRepoVariable({
  owner: 'milady-ai', repo: 'milaidy',
  name: 'CONTRIBUTOR_TRUST_STATES'
});
const allStates = JSON.parse(states.data.value);

// Sync each contributor to SQLite
for (const [username, state] of Object.entries(allStates)) {
  const expanded = expandState(state);
  const result = computeTrustScore(expanded, DEFAULT_CONFIG);
  await upsertContributor(username, result, expanded.events);
}
```

---

## 7. Deployment

### Vercel Configuration
- **Build command**: `bun run build`
- **Output**: Static export (Next.js `output: 'export'`)
- **Domain**: `dashboard.milaidy.dev` or `contributors.milaidy.dev`
- **Cron**: Vercel cron or GitHub Actions trigger redeploy

### Static JSON API Endpoints
Generated at build time:
```
/api/leaderboard.json           # Full leaderboard
/api/contributor/[username].json # Per-contributor data
/api/stats.json                 # Aggregate stats
```

These can be consumed by other tools (Discord bots, GitHub Actions, etc.).

---

## 8. Implementation Phases

### Phase 1: MVP (This Sprint)
- [x] Bootstrap Next.js 15 + Tailwind + shadcn/ui
- [ ] Port trust-scoring.js to TypeScript
- [ ] SQLite schema + Drizzle setup
- [ ] Leaderboard page with mock data
- [ ] Contributor profile page (basic)
- [ ] Deploy to Vercel

### Phase 2: Data Pipeline
- [ ] GitHub API ingestion (PRs, reviews)
- [ ] Trust state sync from repo variable
- [ ] Daily score computation + snapshots
- [ ] GitHub Actions workflow

### Phase 3: Rich Visualizations
- [ ] Diminishing returns graph (recharts or d3)
- [ ] Velocity gauge
- [ ] Streak tracker
- [ ] Score trajectory chart
- [ ] Review verdict heatmap

### Phase 4: Polish
- [ ] Wallet linking
- [ ] Trust Score Explorer / interactive docs
- [ ] Comparative rankings
- [ ] Mobile optimization
- [ ] SEO + Open Graph
