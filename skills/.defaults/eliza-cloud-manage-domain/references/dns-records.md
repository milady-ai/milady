# dns records — when to use which

Default rule: if the user just wants their app to work at `myapp.com` and they bought the domain through us, the buy flow already created the right A/CNAME records pointing at the app's container. Don't add records unless asked.

| Type | Use for | Common content |
|---|---|---|
| A | Point a name at an IPv4 | `203.0.113.5` |
| AAAA | Point a name at an IPv6 | `2001:db8::1` |
| CNAME | Alias one name to another | `app.elizacloud.ai` |
| TXT | Verification, SPF, DKIM, arbitrary text | `v=spf1 include:_spf.google.com ~all` |
| MX | Mail routing | `aspmx.l.google.com` (set priority) |
| SRV | Service location (sip, xmpp, etc.) | `_proto._service.target` |
| CAA | Restrict who can issue SSL certs | `0 issue "letsencrypt.org"` |

## Naming conventions

- Apex (`myapp.com` itself): `name: "@"` or `name: "myapp.com"`
- Subdomain (`www.myapp.com`): `name: "www"` (cloudflare auto-appends the zone)
- Wildcard (`*.myapp.com`): `name: "*"`

## TTL

Cloudflare's TTL field is in seconds. **`1` is special and means "automatic"** — cloudflare picks the TTL based on whether the record is proxied. Default to `1` unless the user has a reason for a fixed TTL.

## proxied (orange cloud vs grey cloud)

- `proxied: true` (orange cloud) — cloudflare's edge sits in front. SSL, DDoS protection, caching. Use for HTTP/HTTPS records pointing at an origin.
- `proxied: false` (grey cloud, "DNS only") — bare DNS, no proxy. Use for records that need direct address resolution: MX, SRV, TXT, mail/IMAP A records, SSH targets, etc.

If the user is not sure, default `true` for A/AAAA/CNAME on web subdomains and `false` for everything else.

## priority

Only MX records use `priority`. Lower number = higher priority. Common values: 1, 5, 10, 20.
