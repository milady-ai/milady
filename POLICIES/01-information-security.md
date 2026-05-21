# 01 — Information Security Policy (Master)

**Owner:** Security Lead (CISO function)
**Review cadence:** Annual, plus on material change
**SOC2 mapping:** CC1.1–CC1.5, CC2.1, CC5.1–CC5.3

## Purpose

Establish the master security policy for the Eliza stack — Eliza Cloud, agent runtime, plugin system, clients, training pipeline, and supporting infrastructure — and define how subordinate policies are governed.

## Scope

All Eliza-controlled systems, employees, contractors, and infrastructure. Customer self-hosted local-only deployments are out of scope for control operation, but in-scope for the design of customer-facing safeguards (signed releases, plugin manifests, opt-in telemetry).

## Roles & Responsibilities

- **Security Lead** — owns this policy, maintains the risk register, chairs incident response, signs off on subordinate policies.
- **Engineering Leads** — implement technical controls; enforce SDLC policy on their packages.
- **People Ops** — own onboarding/offboarding, code of conduct, signed acknowledgments.
- **All personnel** — acknowledge this policy annually; report security concerns to `security@elizaos.ai`.

## Policy Statements

1. Security is a first-class engineering concern. No production change ships without passing the SDLC gates defined in [`16-secure-development.md`](16-secure-development.md).
2. All subordinate policies in this directory are binding. A code change that conflicts with a policy requires a policy PR first.
3. Customer data confidentiality, integrity, and availability are the three primary objectives. When in tension, confidentiality wins for customer credentials and conversation content; availability wins for billing and authentication.
4. The hybrid local + cloud architecture is acknowledged: the audit boundary is whatever Eliza Cloud touches. Anything that ships back to Cloud (telemetry, trajectories, training feed) is in scope and must be opt-in.
5. AI-authored code is subject to the same review gates as human-authored code (see [`16-secure-development.md`](16-secure-development.md)).
6. Zero customer conversation, connector, or memory data is used for model training unless the customer has given explicit, revocable, per-purpose opt-in.

## Procedures

- Policies are stored in `POLICIES/` in the milady monorepo. Every change is a PR with at least one reviewer from the Security Lead's delegate list.
- Annual review: Security Lead opens an issue 30 days before the anniversary of the last review and confirms each policy is current.
- Onboarding: each new hire reads and acknowledges this policy plus [`17-code-of-conduct.md`](17-code-of-conduct.md), [`03-acceptable-use.md`](03-acceptable-use.md), and the role-specific subset within their first week.

## Evidence

- Git history of `POLICIES/` showing periodic review commits.
- Signed acknowledgments (HR system) per employee per year.
- Risk register entries linking risks to specific policies.

## Open Items For Human Sign-Off

- Designated Security Lead (named officer).
- Board / governance oversight cadence (CC1.2).
