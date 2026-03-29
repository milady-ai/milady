# Provisioning Investigation: Agent `miladyx` (c42bbc2b)

**Date of incident:** 2026-03-29 17:29:47 UTC  
**Agent:** miladyx (`c42bbc2b-b7cb-491f-99b3-8bcd4a96be70`)  
**Org:** `5aedfd05-8ef0-4866-9ae3-71c7bd91e03f`  
**Investigated by:** Sol (subagent)  
**Timestamp of investigation:** 2026-03-29 ~18:10 UTC

---

## Summary

The agent **was running normally** (confirmed healthy in heartbeat at 17:28:57 UTC).
At **17:29:47 UTC**, the Docker container on node `milady-core-2` (178.63.251.122) **crashed**,
and simultaneously the DB status changed to `provisioning`.

The agent is now **stuck in "provisioning" state with no active job** — it will not recover automatically.

---

## Timeline

| Time (UTC)      | Event |
|-----------------|-------|
| 01:21:35        | Agent created |
| 01:21:37        | Job `d2210c47` enqueued |
| 01:22:08        | Initial provision completed → status = `running` |
| 17:28:57        | Last successful heartbeat (worker: "30 healthy") |
| **17:29:27**    | **Container still responding:** nginx `GET /api/coding-agents/coordinator/status → 200` |
| **17:29:44**    | **User WebSocket connected** to container (`101 Switching Protocols`, 102KB transferred) |
| **17:29:47**    | **Container DIED** — nginx WebSocket → `502` |
| **17:29:47.242**| **DB `updated_at` changed** — status flipped to `provisioning`, bridge_url/health_url cleared |
| 17:31:00        | Worker heartbeat: "29 healthy" (miladyx now excluded from running pool) |
| 17:55+          | Worker processes unrelated jobs only (different agent `bobby`/`407ce13a`) |

---

## Root Cause Analysis

### What definitely happened

1. **Container crash at 17:29:47 UTC** — the Docker container on `milady-core-2` died mid-session
   (user had an active WebSocket connection that went 101 → 502 in a single second).

2. **DB updated at the same second (17:29:47.242 UTC)** — someone or something called a DB write
   that set `status = 'provisioning'` and cleared `bridge_url`/`health_url`.

3. **Container is gone** — `docker ps` on `milady-core-2` (178.63.251.122) shows no miladyx container.

4. **No new provisioning job was created** — the `jobs` table has only the original `d2210c47` job
   from 01:21:37, which completed. No job was enqueued after 17:29.

5. **The provisioning worker did nothing** — its logs show only heartbeat activity between 17:20
   and 17:31. No job was claimed or processed for this agent.

### How the status changed to "provisioning"

This is where certainty decreases. Two code paths can set `status = 'provisioning'`:

**Path A — Next.js `miladySandboxService.provision()`** (called directly, no job created):
- Lives in `packages/lib/services/milady-sandbox.ts`
- Calls `miladySandboxesRepository.trySetProvisioning()` which only allows:
  `status IN ('pending', 'stopped', 'disconnected', 'error')`
- The agent was `running` → this path **cannot directly transition from running**

**Path B — Standalone worker `trySetProvisioning()`** (in `/opt/milady-cloud/provisioning-worker/provisioning-worker.ts`):
- Allows: `status IN ('pending', 'provisioning', 'error', 'stopped', 'disconnected')`
- Also excludes `running`
- Worker only runs when claiming a job → **no job = no worker action**

### The most likely scenario (best explanation)

Since neither trySetProvisioning can directly change a **running** agent, one of these must have happened:

**Option 1: Two-step transition (high confidence)**
1. Something set the agent to `stopped`/`error`/`disconnected` AND cleared `bridge_url`/`health_url`
2. Then `provision()` was called immediately after (or the worker polled and found a pending job)

The only code that sets `stopped` + clears bridge_url/health_url is:
- `miladySandboxService.shutdown()` → sets `status='stopped', bridge_url=NULL, health_url=NULL`
- Billing cron → but only for `billing_status='shutdown_pending'` (agent has `billing_status='active'`)

The user at IP `95.173.221.156` was actively using the agent AND had a local dev environment running at `localhost:3003` (their browser sent requests with Referer: http://localhost:3003/). This developer may have triggered a stop+reprovision through local tooling.

**Option 2: Direct API call with unusual state (medium confidence)**
The container crashed at the exact same second. If the agent's `status` in the DB was read as `running` BUT `bridge_url` or `health_url` was somehow null at that moment (e.g., a concurrent update had just cleared them), then:
- `provision()` would be called
- `trySetProvisioning` would FAIL (running state excluded)
- But `rec.bridge_url` being null means it doesn't short-circuit to "already running"
- Returns "Agent is already being provisioned" error

This path still doesn't explain the status change.

**Option 3: Admin/manual intervention**
The elizacloud.ai management UI may have auto-provision logic that triggered when the container died. No audit log exists in the DB to confirm this.

### What we CAN say with confidence

- The **container crashed** (not manually stopped — Docker `--restart unless-stopped` should have restarted it but didn't, which is unusual)
- The **DB status change was triggered externally** (not by the provisioning worker, not by any cron job — nothing in worker logs, no new job in queue)
- The most likely trigger was a **user/developer action** (the IP 95.173.221.156 was actively using the agent and had a local dev environment)
- The trigger set `status = 'provisioning'` but did NOT create a job in the `jobs` table
- This suggests it went through **`miladySandboxService.provision()` in the Next.js sync path** (`?sync=true`) which does NOT create a job

---

## Current State (as of investigation)

```
status:             provisioning        ← stuck here
bridge_url:         NULL                ← cleared
health_url:         NULL                ← cleared
node_id:            milady-core-2       ← preserved
container_name:     milady-c42bbc2b-... ← preserved
bridge_port:        19781               ← preserved
web_ui_port:        20419               ← preserved
last_heartbeat_at:  2026-03-29 17:28:57 ← frozen
error_message:      (none)
jobs (pending):     NONE
```

Container status on `milady-core-2` (178.63.251.122): **GONE** — not in `docker ps`.

The agent is **stuck** — it will not self-heal. The provisioning worker only processes jobs from the `jobs` table; since there's no pending job for this agent, the worker ignores it.

---

## Secondary Finding: Systemic "Provisioning Limbo" Issue

A second agent `Pleasures` (3597d6f9) has been stuck in `provisioning` state since 07:51:05 (10+ hours) with **no job, no node, no heartbeat**. It was never successfully provisioned. This represents the same pattern — agents ending up in `provisioning` state with no active job to complete the transition.

This is a reliability gap: if an agent enters `provisioning` state (via sync provision call) and the provision fails before completion, it gets stuck forever with no recovery mechanism.

---

## Fix Required

To recover `miladyx`:

**Option 1 — Re-enqueue via provision API:**
```
POST https://elizacloud.ai/api/v1/milady/agents/c42bbc2b-b7cb-491f-99b3-8bcd4a96be70/provision
Authorization: Bearer <user_api_key>
```
Note: The Next.js repo's `trySetProvisioning` doesn't include `provisioning` in allowed states,
so this may return "already being provisioned". Use the `?sync=true` parameter instead OR:

**Option 2 — Reset status in DB and re-provision:**
```sql
-- First reset to stopped
UPDATE milady_sandboxes 
SET status = 'stopped', bridge_url = NULL, health_url = NULL, sandbox_id = NULL, updated_at = NOW()
WHERE id = 'c42bbc2b-b7cb-491f-99b3-8bcd4a96be70';

-- Then call POST .../provision to create a new job
```

**Option 3 — Direct job insert:**
```sql
INSERT INTO jobs (type, status, data, organization_id, user_id, max_attempts)
VALUES (
  'milady_provision', 'pending',
  '{"agentId":"c42bbc2b-b7cb-491f-99b3-8bcd4a96be70","organizationId":"5aedfd05-8ef0-4866-9ae3-71c7bd91e03f","userId":"36f0d45c-ff07-425e-ae02-422d57a8bb87","agentName":"miladyx"}',
  '5aedfd05-8ef0-4866-9ae3-71c7bd91e03f',
  '36f0d45c-ff07-425e-ae02-422d57a8bb87',
  3
);
-- Worker will pick this up within 30s and trySetProvisioning will succeed (provisioning → provisioning)
```

---

## Recommended Follow-up

1. **Add a watchdog query** that alerts on agents stuck in `provisioning` for >5 minutes with no active job
2. **Add a recovery cron** that resets stale-provisioning agents to `error` after N minutes, allowing normal re-provision
3. **Add DB-level logging/trigger** on `milady_sandboxes.status` changes to enable forensic analysis
4. **Investigate why the Docker container died** — check container logs on `milady-core-2` for OOM, crash, or external signal
5. **The concurrent issue**: two operations ran at the exact same second (container crash + DB status change). Determine if ElizaOS cloud integration triggers a provision callback on container shutdown

---

## Key Files Referenced

- `/opt/milady-cloud/provisioning-worker/provisioning-worker.ts` — standalone worker (running)
- `/home/shad0w/projects/eliza-cloud-v2-milady-ui/packages/lib/services/milady-sandbox.ts` — provision logic
- `/home/shad0w/projects/eliza-cloud-v2-milady-ui/packages/db/repositories/milady-sandboxes.ts` — trySetProvisioning
- `/home/shad0w/projects/eliza-cloud-v2-milady-ui/packages/lib/services/milady-managed-launch.ts` — auto-provision on startup
- `/home/shad0w/projects/eliza-cloud-v2-milady-ui/app/api/v1/milady/agents/[agentId]/provision/route.ts`
- `/var/log/nginx/access.log` — shows container was alive at 17:29:27, died at 17:29:47
