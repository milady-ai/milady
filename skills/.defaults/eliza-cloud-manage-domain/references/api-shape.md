# api shapes — manage-domain skill

All endpoints assume `Authorization: Bearer <ELIZAOS_CLOUD_API_KEY>` and return `{ success: true, ... }` on the happy path; failures return `{ success: false, error: <message> }` with a 4xx/5xx status.

## GET /api/v1/domains

Org-wide list of every managed domain.

Response:
```json
{
  "success": true,
  "domains": [
    {
      "id": "...",
      "domain": "myapp.com",
      "registrar": "cloudflare",            // or "external"
      "status": "active",                    // pending | active | expired | suspended | transferring
      "verified": true,
      "sslStatus": "active",                 // pending | provisioning | active | error
      "expiresAt": "2027-01-01T00:00:00Z",
      "autoRenew": true,
      "resourceType": "app",                 // app | container | agent | mcp | null (detached)
      "appId": "...",
      "containerId": null,
      "agentId": null,
      "mcpId": null,
      "cloudflareZoneId": "..."
    }
  ]
}
```

## GET /api/v1/apps/:appId/domains

Per-app list. Same shape as the org-wide list but only domains attached to that app.

## GET /api/v1/apps/:appId/domains/:domain/dns

List dns records on a cloudflare-managed zone. Returns 409 for external-registrar domains.

Response:
```json
{
  "success": true,
  "domain": "myapp.com",
  "records": [
    {
      "id": "abc...",
      "type": "A",
      "name": "myapp.com",
      "content": "203.0.113.5",
      "ttl": 1,
      "proxied": true,
      "createdOn": "2026-...",
      "modifiedOn": "2026-..."
    }
  ]
}
```

## POST /api/v1/apps/:appId/domains/:domain/dns

Add a record. Body:
```json
{
  "type": "A",                  // A | AAAA | CNAME | TXT | MX | SRV | CAA
  "name": "www",                // subdomain or "@" for apex
  "content": "203.0.113.5",
  "ttl": 1,                     // 1 = automatic
  "proxied": true,              // false = grey cloud (DNS only)
  "priority": 10                // MX records only
}
```
Response: `{ success: true, record: { ...new record... } }` (status 201)

## GET /api/v1/apps/:appId/domains/:domain/dns/:recordId

Read one record. Same shape as the list entries above.

## PATCH /api/v1/apps/:appId/domains/:domain/dns/:recordId

Edit one record. Body is a partial — include only the fields you want to change.

## DELETE /api/v1/apps/:appId/domains/:domain/dns/:recordId

Remove a record. Response:
```json
{ "success": true, "recordId": "abc..." }
```

## POST /api/v1/apps/:appId/domains/sync

Refresh registrar status into the managed_domains row from cloudflare.

Body: `{ "domain": "myapp.com" }`

Response: `{ success: true, domain, status, sslStatus, ... }`

## POST /api/v1/apps/:appId/domains/verify

For external domains only. Re-check the user's `_eliza-cloud-verify.<domain>` TXT record.

Body: `{ "domain": "myapp.com" }`

Response: `{ success: true, verified: boolean, ... }`

## DELETE /api/v1/apps/:appId/domains

Detach a domain from the app. Body: `{ "domain": "myapp.com" }`. The registration itself stays active until expiration.
