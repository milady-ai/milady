# Provisioning Fix Plan

**Date:** 2026-03-29  
**Author:** Sol (subagent)  
**Branch:** `fix/dashboard-deslop`  
**Relates to:** PROVISIONING_INVESTIGATION.md

---

## 1. Root Cause Analysis

### The Core Gap

The provisioning system has two paths for setting an agent to `provisioning` status:

| Path | Where | Creates Job? | Transition Allowed From |
|------|-------|-------------|-------------------------|
| `miladySandboxService.provision()` (sync) | Next.js API handler | **No** | `pending, stopped, disconnected, error` |
| `provisioningJobService.enqueueMiladyProvision()` | Next.js API handler → cron worker | **Yes** | (job worker handles the DB transition) |

The sync path (`?sync=true` or direct service call) sets `status = 'provisioning'` in the DB **without** creating a job record. If anything fails after that point (network error, Vercel function timeout, crash), the agent is orphaned:

- Status is `provisioning`
- No job exists in `pending` or `in_progress` state
- The cron worker (`process-provisioning-jobs`) only processes existing jobs — it does **not** scan for orphaned provisioning agents
- The billing cron ignores `provisioning` agents
- No other watchdog exists

### Observed Incidents

**Agent `miladyx` (2026-03-29)**
- Container was running and healthy (heartbeat at 17:28:57)
- Container on `milady-core-2` crashed at 17:29:47 (active WebSocket → 502)
- At the exact same second, DB `status` flipped to `provisioning`, `bridge_url`/`health_url` cleared
- No provisioning job was created
- Agent stuck in provisioning for 40+ minutes until manually fixed

**Agent `Pleasures`**
- Stuck in `provisioning` for 10+ hours with no node, no heartbeat, no job
- Never successfully provisioned — represents the "initial provision failed silently" variant of the same bug

### What Triggers the Re-Provisioning Without a Job

The most likely trigger for `miladyx` was the sync provision path in Next.js:

```
POST /api/v1/milady/agents/{agentId}/provision?sync=true
```

This calls `miladySandboxService.provision()` directly, which:
1. Calls `miladySandboxesRepository.trySetProvisioning()` — writes `status = 'provisioning'` to DB
2. Then proceeds to provision the container inline
3. If the function times out, throws, or the connection drops **after** step 1 but **before** completing — the agent is stuck

The container crash at 17:29:47 and the DB write at 17:29:47.242 (250ms later) strongly suggest something detected the crash and triggered `provision()` — most likely the `milady-managed-launch.ts` auto-provision-on-startup flow or a user/developer action from `localhost:3003`.

### Why the Health-Check and Deployment-Monitor Crons Are Not Involved

- `deployment-monitor` (`/api/v1/cron/deployment-monitor`) monitors **containers** (CloudFormation stacks) — does not touch `milady_sandboxes`
- `health-check` (`/api/v1/cron/health-check`) calls `monitorAllContainers` — also scoped to the ECS containers table, not milady sandboxes

Neither cron can cause or fix the stuck provisioning issue.

---

## 2. The Fix: Cleanup Cron

### Location

```
/home/shad0w/projects/eliza-cloud-v2-milady-ui/app/api/cron/cleanup-stuck-provisioning/route.ts
```

### Schedule

Every 5 minutes (`*/5 * * * *`) — added to `vercel.json`.

### Logic

```sql
UPDATE milady_sandboxes
SET    status        = 'error',
       error_message = 'Agent was stuck in provisioning state with no active provisioning job...',
       updated_at    = NOW()
WHERE  status     = 'provisioning'
  AND  updated_at < NOW() - INTERVAL '10 minutes'
  AND  NOT EXISTS (
         SELECT 1 FROM jobs
         WHERE  jobs.data->>'agentId' = milady_sandboxes.id::text
           AND  jobs.status IN ('pending', 'in_progress')
       )
RETURNING id, agent_name, organization_id
```

**Threshold:** 10 minutes — well beyond the longest legitimate provisioning time (typically 30-90 seconds). Leaves plenty of room for slow provisions without false positives.

**Target status:** `error` (not `stopped`) — because:
- `error` surfaces as an actionable state to the user in the dashboard
- The user can see the error message explaining what happened
- The user can click "Start" or "Provision" to retry
- `stopped` implies the user intentionally stopped it; `error` implies something failed

**Safety:**
- Uses `NOT EXISTS` subquery scoped to `data->>'agentId'` — only clears agents with *no* active job
- If a job *does* exist (even if it's taking a long time), the agent is left alone
- The process-provisioning-jobs cron handles stale jobs (stuck `in_progress` > 5 min) independently

---

## 3. Preventing the Race Condition

### Short-term (already done above)

The cleanup cron provides a recovery mechanism. Without it, stuck agents require manual DB intervention.

### Medium-term: Always Use the Job Queue

**Recommendation:** Remove or gate the sync provision path. When a provision is requested:

1. Always create a job in the `jobs` table first (status = `pending`)
2. Set `status = 'provisioning'` only when the worker claims the job
3. Never set `status = 'provisioning'` without a job record

This makes the state machine consistent: `status = 'provisioning'` ↔ active job exists.

```typescript
// In provision route — before setting status:
const job = await provisioningJobService.enqueueMiladyProvision({
  agentId,
  organizationId,
  userId,
  agentName,
});
// Worker will set status=provisioning when it claims the job
return NextResponse.json({ jobId: job.id }, { status: 202 });
```

### Long-term: Atomic State Machine

**Recommendation:** Add a `provisioning_job_id` foreign key to `milady_sandboxes`:

```sql
ALTER TABLE milady_sandboxes
  ADD COLUMN provisioning_job_id uuid REFERENCES jobs(id);
```

Then in `trySetProvisioning()`, require `provisioning_job_id` to be set atomically with the status change. The cleanup cron can then use a simple JOIN instead of a JSONB subquery:

```sql
WHERE status = 'provisioning'
  AND provisioning_job_id IS NULL  -- legacy/sync path
  OR provisioning_job_id IN (
    SELECT id FROM jobs WHERE status NOT IN ('pending', 'in_progress')
  )
```

### Operational: Add DB-Level Audit Log

Add a trigger on `milady_sandboxes` to log status transitions:

```sql
CREATE TABLE milady_sandbox_status_log (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  sandbox_id  uuid        NOT NULL REFERENCES milady_sandboxes(id) ON DELETE CASCADE,
  old_status  text,
  new_status  text        NOT NULL,
  changed_at  timestamptz NOT NULL DEFAULT NOW(),
  changed_by  text        -- 'cron:cleanup', 'api:provision', etc.
);
```

This would have revealed exactly what code path triggered the `miladyx` status change at 17:29:47.

---

## 4. Summary of Changes Made

### New File
- `app/api/cron/cleanup-stuck-provisioning/route.ts` — the cleanup cron (GET + POST, CRON_SECRET auth)

### Modified File
- `vercel.json` — added `cleanup-stuck-provisioning` cron entry (schedule: `*/5 * * * *`)

### Not Modified (recommendations only)
- `packages/lib/services/milady-sandbox.ts` — sync provision path
- `packages/db/repositories/milady-sandboxes.ts` — `trySetProvisioning`
- `app/api/v1/milady/agents/[agentId]/provision/route.ts` — provision endpoint

---

## 5. Testing

### Manual trigger (after deploy)

```bash
curl -X POST https://elizacloud.ai/api/cron/cleanup-stuck-provisioning \
  -H "Authorization: Bearer $CRON_SECRET"
```

Expected response when no stuck agents:
```json
{ "success": true, "data": { "cleaned": 0, "thresholdMinutes": 10, ... } }
```

### Simulate a stuck agent

```sql
-- Insert a fake stuck provisioning agent (use a real org/user UUID)
INSERT INTO milady_sandboxes (organization_id, user_id, status, agent_name, updated_at)
VALUES (
  '<your-org-id>',
  '<your-user-id>',
  'provisioning',
  'test-stuck-agent',
  NOW() - INTERVAL '15 minutes'
);
```

Then trigger the cron and verify the agent transitions to `status = 'error'` with the expected `error_message`.

---

## 6. Monitoring Queries

```sql
-- Count agents currently stuck in provisioning with no job
SELECT COUNT(*) as stuck_count
FROM milady_sandboxes ms
WHERE ms.status = 'provisioning'
  AND ms.updated_at < NOW() - INTERVAL '10 minutes'
  AND NOT EXISTS (
    SELECT 1 FROM jobs j
    WHERE j.data->>'agentId' = ms.id::text
      AND j.status IN ('pending', 'in_progress')
  );

-- List them with details
SELECT
  ms.id,
  ms.agent_name,
  ms.organization_id,
  ms.updated_at,
  EXTRACT(EPOCH FROM (NOW() - ms.updated_at)) / 60 AS stuck_minutes
FROM milady_sandboxes ms
WHERE ms.status = 'provisioning'
  AND ms.updated_at < NOW() - INTERVAL '10 minutes'
  AND NOT EXISTS (
    SELECT 1 FROM jobs j
    WHERE j.data->>'agentId' = ms.id::text
      AND j.status IN ('pending', 'in_progress')
  )
ORDER BY ms.updated_at ASC;
```
