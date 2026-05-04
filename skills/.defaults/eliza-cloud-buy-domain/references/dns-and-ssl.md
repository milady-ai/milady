# DNS and SSL behavior

When `/buy` succeeds, the cloud:

1. Registers `myapp.com` via cloudflare's Registrar API. Cloudflare creates a managed zone for the domain.
2. Inserts the domain into eliza cloud's `managed_domains` table with `registrar='cloudflare'`, `nameserver_mode='cloudflare'`, `verified=true`, `paymentMethod='credits'`. The `cloudflare_zone_id` is stored for future DNS edits.
3. Assigns the domain to the app row (polymorphic — sets `appId`, leaves container/agent/mcp pointers null).
4. Adds a CNAME record on the new cloudflare zone pointing the apex at the app's container public URL (the `app_url` field on the app record). DNS failure here is non-fatal: the domain is owned, the app_url just won't resolve through the new domain until DNS is fixed manually.

## SSL provisioning timing

Because the domain is on cloudflare's nameservers from the moment of registration, cloudflare's automatic SSL kicks in immediately. The progression is:

- `pending` (right after registration; domain registered, cert not requested yet)
- `provisioning` (cert request in flight)
- `active` (cert issued, domain live over HTTPS)

Typical end-to-end time from `/buy` returning to `sslStatus: active`: **30 seconds to 2 minutes**. Polling `/status` every 10s is reasonable.

## What if the user wants a non-cloudflare nameserver?

Not supported in v1 — every domain bought through this skill stays on cloudflare's nameservers. If a future user wants to use external DNS, that requires the (also-unimplemented) external-domain attach flow, not this skill.
