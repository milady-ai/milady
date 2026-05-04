# API shape

The endpoints this skill calls, in canonical order.

## `POST /api/v1/domains/search`

Availability + price discovery for proactive offers. Does NOT debit credits and
does not require an app id. Use this after an app build to suggest 1-2 domains
before the user has chosen one.

**Request:**
```json
{ "query": "myapp", "limit": 5 }
```

**Response:**
```json
{
  "success": true,
  "query": "myapp",
  "candidates": [
    {
      "domain": "myapp.com",
      "available": true,
      "currency": "USD",
      "years": 1,
      "price": {
        "wholesaleUsdCents": 1099,
        "marginUsdCents": 396,
        "totalUsdCents": 1495,
        "marginBps": 3600
      }
    }
  ]
}
```

Filter to available `.com`, `.io`, `.dev`, or `.app` candidates where possible,
sort by `price.totalUsdCents` ascending, and show prices as annual USD. Older
Cloud responses may use `results[].priceUsdCents`; accept that as a fallback,
but prefer the current `candidates[].price.totalUsdCents` shape. Search is only
for quoting options; use `/apps/{appId}/domains/check` before a paid buy.

## `POST /api/v1/apps/{appId}/domains/check`

Dry-run availability + price quote. Does NOT debit credits.

**Request:**
```json
{ "domain": "myapp.com" }
```

**Response (available):**
```json
{
  "success": true,
  "domain": "myapp.com",
  "available": true,
  "currency": "USD",
  "years": 1,
  "price": {
    "wholesaleUsdCents": 1099,
    "marginUsdCents": 396,
    "totalUsdCents": 1495,
    "marginBps": 3600
  }
}
```

**Response (unavailable):**
```json
{ "success": true, "domain": "myapp.com", "available": false }
```

`totalUsdCents` is what the user's cloud balance will be debited if they proceed to `/buy`. `marginBps` is the eliza cloud margin in basis points (3600 = 36% by default).

## `POST /api/v1/apps/{appId}/domains/buy`

Atomic buy: check → debit → register → DNS → attach. Refunds credits on registration failure.

**Request:**
```json
{ "domain": "myapp.com" }
```

**Response (success):**
```json
{
  "success": true,
  "domain": "myapp.com",
  "appDomainId": "uuid",
  "zoneId": "<cloudflare-zone-id>",
  "expiresAt": "2027-05-03T...",
  "debited": { "totalUsdCents": 1495, "currency": "USD" }
}
```

**Errors:**
- 400 `Invalid domain format`
- 402 `Insufficient credit balance for this domain`
- 404 `App not found`
- 409 `Domain is not available for registration`
- 502 (cloudflare-side error; credits refunded automatically)

## `POST /api/v1/apps/{appId}/domains/status`

Read current verification + SSL status.

**Request:**
```json
{ "domain": "myapp.com" }
```

**Response:**
```json
{
  "success": true,
  "domain": "myapp.com",
  "registrar": "cloudflare",
  "status": "active",
  "verified": true,
  "sslStatus": "active",
  "expiresAt": "2027-05-03T...",
  "live": { "status": "active", "completedAt": "...", "failureReason": null }
}
```

`sslStatus` progresses `pending → provisioning → active` over the first ~1–2 minutes after registration.
