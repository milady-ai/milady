---
name: cloudflare-pages-deploy
description: "Create static projects and deploy them live to Cloudflare Pages subdomains named with both bot and project, like botdick.sketchpad.milaidy.agency. Use when asked to publish, ship, host, deploy, make live, or put a generated project on a subdomain."
metadata:
  otto:
    emoji: "C"
    requires:
      bins: ["node"]
      env:
        - "CLOUDFLARE_ACCOUNT_ID or wrangler login"
        - "CLOUDFLARE_API_TOKEN or wrangler login"
---

# Cloudflare Pages Deploy Skill

Use this skill when the user asks you to make a project, website, demo, app, static output, or generated artifact live on a Cloudflare Pages URL under `milaidy.agency`.

## Behavior

- Build or generate the project first.
- Identify the static output directory. Common examples: `dist`, `build`, `out`, `public`, or the project root for plain HTML.
- Pick a short lowercase bot slug and project slug.
- Default public URLs should include both bot name and project title: `<bot>.<project>.milaidy.agency`, for example `botdick.sketchpad.milaidy.agency`.
- Deploy with the repo script:

```bash
node scripts/deploy-cloudflare-pages-subdomain.mjs --input-dir <output-dir> --bot-name <bot> --project-title <project>
```

- `--subdomain` remains a backward-compatible alias for the project title.
- If the Pages project name should be explicit:

```bash
node scripts/deploy-cloudflare-pages-subdomain.mjs --input-dir <output-dir> --subdomain <slug> --project-name <project-name>
```

- The script creates the Pages project if it does not exist, deploys the static directory with Wrangler, and attaches `<bot>.<project>.milaidy.agency` as a custom domain through the Cloudflare Pages API.
- If `wrangler whoami` is logged in, treat Cloudflare auth as available. Do not block on `CLOUDFLARE_API_TOKEN` just because it is absent; the deploy script can use Wrangler's local OAuth session for the Pages API fallback.
- The matching DNS record must be a DNS-only CNAME from `<bot>.<project>` to `<pages-project>.pages.dev`. Do not leave this nested hostname proxied unless Advanced Certificate Manager/Total TLS is configured, because the normal zone wildcard certificate does not cover two-label hostnames like `botdick.sketchpad.milaidy.agency`.
- Reply with the live URL and any domain status. If nameserver propagation is still pending, say the Pages URL is live first and the custom domain may activate shortly.

## Required Environment

The runtime or shell must have an active `wrangler login`, or:

```bash
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_API_TOKEN
PAGES_BASE_DOMAIN=milaidy.agency
```

Do not ask the user to paste tokens into chat. Ask for the token to be stored in the runtime environment or a local env file only when `wrangler whoami` is not logged in or cannot see the target account.

## Safety

- Never print API tokens or Cloudflare secrets.
- Do not overwrite an existing project folder unless the user asked for it.
- Prefer direct upload for generated one-off projects.
- Use `--dry-run` first if the target slug could collide or if the user asked only for a plan.
