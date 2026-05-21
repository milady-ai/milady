# 20 — Terms / DPA / Subprocessors

**Owner:** Legal + Security Lead
**Review cadence:** Annual; subprocessor list on each change
**SOC2 mapping:** CC2.3, CC9.2

## Purpose

Track the customer-facing legal commitments (Terms of Service, Data Processing Agreement) and the current subprocessor list.

## Scope

All Eliza Cloud customers and their end-users (where Eliza is data processor on behalf of the customer).

## Documents

- **Terms of Service** — public, linked from product surfaces.
- **Privacy Policy** — public; aligned with [`19-privacy.md`](19-privacy.md).
- **Data Processing Agreement (DPA)** — offered to customers requesting one; references the subprocessor list below.
- **Subprocessor List** — public URL; customers can subscribe to change notifications.

## Subprocessor List (initial snapshot)

| Subprocessor | Purpose | Region |
|---|---|---|
| AWS / GCP (hosting provider) | Compute, storage, network | TBD |
| Anthropic | LLM inference | US |
| OpenAI | LLM inference | US |
| HuggingFace | Model registry / artifact host | US/EU |
| Nebius | GPU training | EU |
| Stripe (or payment processor) | Billing / payment processing | US/EU |
| GitHub | Source control (internal use; not customer data) | US |
| Sentry / log aggregator | Observability (redacted) | TBD |
| Sigstore Public-Good | Release signing | Public |

Maintained authoritatively at the public subprocessor URL. Each row links to the vendor SOC2 / equivalent on file (see [`06-vendor-management.md`](06-vendor-management.md)).

## Policy Statements

1. **Notice window** — customers receive ≥ 30 days notice of new subprocessors via email or in-product banner; objection process documented in the DPA.
2. **Onward transfer** — subprocessors are contractually bound to equivalent confidentiality and security obligations.
3. **Change control** — adding a subprocessor requires Security Lead approval and triggers the notice window.

## Evidence

- Public ToS / Privacy / Subprocessor URLs.
- DPA template version-tracked.
- Notification audit trail (email send log) for subprocessor changes.

## Open Items For Human Sign-Off

- Confirm hosting provider, payment processor, and observability-vendor identities.
- Finalize subprocessor URL.
