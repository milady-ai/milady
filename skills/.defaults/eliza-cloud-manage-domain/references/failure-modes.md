# failure modes — manage-domain skill

| Status | Meaning | Action |
|---|---|---|
| 400 | invalid payload (bad record type, name too long, empty patch) | echo the validation error to the user verbatim and ask for a corrected value |
| 404 | domain not attached to this app, or app does not exist | re-check `appId` and `domain` strings; ensure the user actually owns this domain (call `GET /api/v1/domains` to confirm) |
| 409 (on dns endpoints) | domain is `registrar=external` | the user owns this domain elsewhere; tell them to make the dns change at the provider where they bought it (e.g. Namecheap dashboard) |
| 502 | cloudflare returned an error | retry once; if it persists, tell the user cloudflare is having an issue and to retry in a minute |
| 500 | unexpected | log the error id; don't loop |

## Detach is not delete

`DELETE /api/v1/apps/:id/domains` only **detaches** the domain from the app. The cloudflare registration itself stays active until its expiration date. To "actually delete" a domain the user has to wait for expiry (or transfer it out of cloudflare). Be clear about this if the user thinks they cancelled and got their money back.

## Patching a record that doesn't exist

`PATCH /api/v1/apps/:id/domains/:domain/dns/:recordId` returns 404 if `recordId` was never on this zone or was already deleted. Always list records first to get fresh ids.

## Sync after a manual cloudflare dashboard change

If the user edited a record directly in the cloudflare dashboard (outside Eliza Cloud), the managed_domains row may be stale. Call `POST /api/v1/apps/:id/domains/sync` to refresh status into our DB. (DNS records themselves are read live from cloudflare, so the next list call is always current.)
