# Failure modes

Recovery table for the failures you'll actually hit.

| Failure | Symptom | Recovery |
|---|---|---|
| Invalid domain | 400 from `/check` or `/buy` | Re-prompt user. Validate format client-side: `/^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/` |
| Insufficient credits | 402 from `/buy` | Quote with `/check` first so you know the cost. If 402, link user to `/dashboard/billing` to top up. |
| Domain unavailable | `available: false` from `/check`, OR 409 from `/buy` if availability changed between check and buy | Suggest 2-3 alternates (different TLD or short suffix). Don't try the same domain again. |
| Cloudflare registration error | 502 from `/buy` | Credits already refunded automatically. Surface the error message; suggest retry with a different domain. |
| Partial failure: registered but DNS not set | 500 from `/buy` (rare, registry-side issue) | User owns the domain. Do NOT auto-retry the buy (that would double-charge). Tell user the domain is owned but DNS needs attention; they can set it manually via the cloudflare dashboard or `POST /domains/sync`. |
| App not found | 404 | Confirm the appId is right and belongs to the calling user's org. |

## Idempotency

Each step boundary is idempotent on its own:

- `/check` is read-only; safe to call repeatedly.
- `/buy` is atomic: either credits debited + domain registered + DB row created, or credits refunded.
- `/status` is read-only.
- `/sync` is read-only (in v1; future versions may write back).

## What never to do

- **Never call `/buy` in a retry loop without exponential backoff** — a 502 may be a transient cloudflare issue, but retrying immediately wastes credits if the buy actually succeeded and the response was lost.
- **Never assume a 500 means "not registered"** — a partial-failure 500 means the domain IS registered but post-registration DB/DNS work failed. Re-running `/buy` would attempt to register a domain that's already yours.
- **Never debit credits manually** — the cloud handles all credit movement. Your job is to call the cloud endpoint and read the result.
