# Dashboard Research: ElizaOS Contributor Analytics vs Milaidy Trust Scoring

*Research date: 2026-02-14*
*Source: github.com/elizaOS/elizaos.github.io (cloned at /tmp/elizaos-dashboard)*

---

## 1. Scoring Systems Comparison

### ElizaOS Scoring (`scoreCalculator.ts`)

ElizaOS uses a **cumulative point-based** system. Activity earns unbounded XP points, which feed into levels and tag-based skill rankings.

**Scoring components:**
- **PR Score**: base(4) + merged(16) + description quality + complexity multiplier + optimal size bonus(100-500 LOC = +5, >1000 = -5) + daily cap (10 PRs/day)
- **Issue Score**: base(2) per issue + closed bonus(2) + per-comment(0.1)
- **Review Score**: base(4) + approved(1) / changes_requested(2) / commented(0.5)
- **Comment Score**: base(0.2) with diminishing returns (0.7 factor), max 3 per thread
- **Code Changes**: per-line additions(0.005), deletions(0.01), per-file(0.15), max 800 lines
- **Reactions**: base(0.5) with type multipliers (heart=1.5, rocket=1.5), diminishing returns

**Key characteristics:**
- Points are **additive and unbounded** (no ceiling)
- Aggregated into daily/weekly/monthly periods
- Tag-based skill tracking (AREA/ROLE/TECH tags via file path + commit message patterns)
- Level system derived from total XP
- No trust tiers, no penalties for bad behavior

### Milaidy Trust Scoring (`trust-scoring.js`)

Milaidy uses a **bounded 0-100 trust score** with 7 named tiers. Fundamentally different philosophy: trust is earned slowly, lost quickly.

**8 scoring components:**
1. **Diminishing returns**: `1 / (1 + 0.2 * ln(1 + priorApprovals))` — 50th approval worth ~49% of 1st
2. **Recency weighting**: Half-life 45 days — old contributions fade
3. **Complexity buckets**: trivial(0.4x) → medium(1.0x) → xlarge(1.5x) → massive(1.2x, suspicious cap)
4. **Category weights**: security(1.8x) → core(1.3x) → docs(0.6x) → chore(0.5x)
5. **Streak mechanics**: Consecutive approvals +8% each (max +50%); consecutive rejections compound 15% (max 2.5x penalty)
6. **Inactivity decay**: 10-day grace, then 0.5%/day toward floor of 30
7. **Velocity gates**: Soft cap 10 PRs/week (penalty), hard cap 25 PRs/week (zeroed)
8. **Daily point cap**: Max 35 raw positive points per calendar day

**7 tiers:**
| Tier | Min Score | Description |
|------|-----------|-------------|
| legendary | 90 | Auto-merge eligible |
| trusted | 75 | Expedited review |
| established | 60 | Proven track record |
| contributing | 45 | Standard review |
| probationary | 30 | Closer scrutiny |
| untested | 15 | New/low-activity |
| restricted | 0 | Trust deficit, needs sponsor |

**Key characteristics:**
- **Bounded** (0-100), not cumulative
- **Negative events matter**: rejections, closes, streaks of failure
- **Game-theory resistant**: velocity gates, daily caps, diminishing returns, suspicious size detection
- **Time-sensitive**: recency weighting + inactivity decay
- Starting score: 35 (probationary)

### Key Differences

| Aspect | ElizaOS | Milaidy |
|--------|---------|---------|
| Score range | Unbounded XP | 0-100 |
| Philosophy | Reward activity | Build trust |
| Negative events | None | Rejections compound |
| Anti-gaming | Daily PR cap only | 8 separate mechanisms |
| Time factor | Period-based snapshots | Continuous decay + recency |
| Output | Level + XP + skills | Tier + score + breakdown |
| Use case | Community recognition | Automated review policy |

---

## 2. Data Ingestion Pipeline

### ElizaOS Pipeline Architecture

```
GitHub API (GraphQL) → Ingest Pipeline → SQLite (Drizzle ORM) → Process Pipeline → Export Pipeline → Static JSON/Next.js SSG
```

**Pipeline stages:**
1. **Ingest** (`cli/analyze-pipeline.ts ingest`): Fetches PRs, issues, reviews, comments, commits, reactions from GitHub GraphQL API. Stores raw data in SQLite tables.
2. **Process** (`cli/analyze-pipeline.ts process`): Calculates per-user daily scores, tag scores, badges. Runs `contributorsPipeline`.
3. **Export** (`cli/analyze-pipeline.ts export`): Generates repository stats as JSON files.
4. **Export-Leaderboard** (`cli/analyze-pipeline.ts export-leaderboard`): Generates `/api/leaderboard-{period}.json` static endpoints.
5. **Summarize** (`cli/analyze-pipeline.ts summarize`): AI-powered summaries via OpenRouter (Gemini models).

**Automation:**
- GitHub Actions: daily at 23:00 UTC
- Data stored on `_data` branch (separate from code)
- `bun run data:sync` to pull production data locally

### Database Schema (Drizzle ORM + SQLite)

**Raw tables (ingested from GitHub):**
- `users` — username, avatar, isBot, walletDataUpdatedAt
- `wallet_addresses` — userId, chainId, accountAddress, isPrimary
- `repositories` — owner, name, stars, forks
- `raw_pull_requests` — full PR metadata including additions/deletions/changedFiles
- `raw_pr_files` — per-file changes in PRs
- `raw_issues` — issue metadata
- `raw_commits` — commit metadata with PR links
- `raw_commit_files` — per-file commit changes
- `pr_reviews` — review state (approved/changes_requested/commented)
- `pr_comments` / `issue_comments` — comment bodies
- `pr_reactions` / `issue_reactions` / `pr_comment_reactions` / `issue_comment_reactions`
- `pr_closing_issue_references` — PRs that close issues
- `labels` + junction tables for PR/issue labels

**Processed tables:**
- `user_daily_scores` — daily score breakdown (prScore, issueScore, reviewScore, commentScore + JSON metrics)
- `user_tag_scores` — per-tag XP with level and progress
- `user_summaries` — AI-generated contributor summaries (day/week/month/lifetime)
- `repo_summaries` — AI-generated repo summaries
- `overall_summaries` — AI-generated overall summaries
- `tags` — tag definitions with patterns and weights
- `user_badges` — achievement badges

**Key design decisions:**
- SQLite for simplicity and portability (no external DB dependency)
- Static site generation reads from SQLite at build time
- JSON metrics stored as text blobs in score tables
- Wallet addresses support multiple chains with primary flag

---

## 3. Component Architecture

### Worth Reusing

1. **Leaderboard component** (`leaderboard.tsx`):
   - Virtualized list with `@tanstack/react-virtual` (handles 100s of users)
   - Period tabs (all/weekly/monthly)
   - Search + skill filter with URL query params
   - Pagination controls
   - Clean pattern: data comes from server component, client handles UI state

2. **Contributor card** (`contributor-item.tsx`):
   - Avatar from GitHub, XP badge, stats slot
   - Link to contributor profile page
   - Simple, composable design

3. **shadcn/ui components**: Input, Tabs, Select, Avatar, Badge — all standard

4. **Pipeline runner** (`runPipeline.ts`):
   - Simple function composition: `pipeline(input, context) → output`
   - Logging, timing, error handling built in
   - Modular steps that can be composed

5. **Database schema patterns**:
   - Drizzle ORM table definitions with proper indexes
   - Relations defined separately from tables
   - Composite unique constraints for deduplication

### Worth Adapting

1. **Scoring calculator**: Replace their additive XP with our trust score computation
2. **Pipeline config**: Their JSON config pattern is clean; adapt for our trust-scoring config
3. **Tag system**: Their AREA/ROLE/TECH tags are useful but we need to add trust-tier as a primary dimension
4. **Static JSON API**: Good pattern for Vercel deployment; adapt endpoints for trust data

### Replace Entirely

1. **Scoring algorithm**: Their `scoreCalculator.ts` — replace with our `computeTrustScore()`
2. **AI summaries**: Unnecessary for our use case (adds complexity + cost)
3. **Badge system**: Replace with trust tier badges
4. **Untracked repos**: We only track milady-ai/milaidy

---

## 4. Integration Strategy: Trust Scoring → Dashboard UI

### Data Flow

```
GitHub Webhooks/Actions → trust-scoring.js → Repo Variable (JSON state)
                                                    ↓
                                        Dashboard Pipeline (cron)
                                                    ↓
                                    SQLite (contributor states + scores)
                                                    ↓
                                        Next.js SSG at build time
                                                    ↓
                                            Vercel deployment
```

### Trust Score Component Visualization

Each of the 8 scoring components can be visualized:

1. **Diminishing returns graph**: X-axis = approval count, Y-axis = multiplier. Show where current contributor sits on the curve.

2. **Recency timeline**: Horizontal bar showing events fading from bright → dim based on age. Half-life marker at 45 days.

3. **Complexity distribution**: Histogram of PR sizes in complexity buckets (trivial/small/medium/large/xlarge/massive).

4. **Category breakdown**: Pie chart or stacked bar of contribution categories with their weights.

5. **Streak indicator**: Current streak type (approval/rejection) and length. Visual streak counter.

6. **Inactivity status**: Days since last event, grace period remaining, current decay rate.

7. **Velocity meter**: PRs in last 7 days vs soft/hard caps. Gauge visualization.

8. **Daily cap usage**: Today's points earned vs 35-point cap.

### Trust Tier Display

- Large tier badge with color coding:
  - legendary: gold/amber glow
  - trusted: green
  - established: blue
  - contributing: teal
  - probationary: yellow/orange
  - untested: gray
  - restricted: red
- Score as progress bar within current tier band
- Points needed for next tier promotion

### Review Verdict History

- Timeline of all PR events (approve/reject/close/selfClose)
- Color-coded by outcome
- Show weighted point impact of each event
- Filterable by time period

### Auto-Merge Eligibility

- Clear indicator: eligible (legendary tier) or not
- If not, show requirements: score needed, tier gap, estimated events needed
- Historical: when was contributor last eligible (if ever)

---

## 5. Wallet Linking Feature

ElizaOS has a `wallet_addresses` table supporting:
- Multiple chains per user (chainId field)
- Multiple addresses per chain
- Primary address flag
- Active/inactive status

**How they populate it:** Via README.md parsing (`src/lib/walletLinking/readmeUtils.ts`) — users add wallet addresses to their GitHub profile README.

**For Milaidy:**
- Useful for crypto contributor rewards/airdrops
- Can track Base wallet addresses (matches our existing wallet infra)
- Display on contributor profile alongside trust score
- Potential integration: trust tier → airdrop eligibility

---

## 6. Key Takeaways

### What makes ElizaOS's dashboard good:
- Clean Next.js 15 architecture with static generation
- Virtualized leaderboard handles scale
- Modular pipeline with clear separation of concerns
- Tag-based skill tracking is engaging

### What we improve on:
- Our trust scoring is far more sophisticated (8 components vs simple additive XP)
- Anti-gaming mechanisms built in
- Meaningful tiers with real consequences (auto-merge, review policy)
- Bounded score creates urgency (can't just grind indefinitely)
- Time decay keeps scores fresh and relevant

### Biggest risks:
- Trust score computation is heavier than simple XP addition — may need caching
- State stored in GitHub repo variable (48KB limit) — dashboard needs its own copy
- Contributor state JSON needs to be synced to dashboard DB
