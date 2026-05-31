# 22 — Data Subject Request (DSR) Procedure

**Owner:** Security Lead + Legal
**Review cadence:** Annual
**SOC2 mapping:** Privacy (P5 if Privacy TSC included); C1.2

## Purpose

Define how Eliza receives, validates, fulfills, and records data-subject requests (access, rectification, erasure, portability, restriction, objection, consent withdrawal).

## Scope

Personal data processed by Eliza Cloud. For data processed by Eliza as a processor on behalf of a customer, requests are routed to that customer (data controller).

## Standard Targets

- Acknowledge: ≤ 3 business days.
- Fulfill: ≤ 30 days (extensions for complexity per applicable law, with notice to the subject).

## Procedure

1. **Intake** — request received at `privacy@elizaos.ai` or via in-product account settings.
2. **Identity verification** — confirm the requester via account login or out-of-band token. Refuse anonymous requests except where law permits.
3. **Scope determination** — identify Eliza-controlled records vs records held on behalf of a customer.
4. **Fulfillment** —
   - Access / portability → JSON export of profile + linked records.
   - Rectification → update through admin tool with audit-event row.
   - Erasure → trigger the hard-delete pipeline per [`11-data-retention.md`](11-data-retention.md); destroy the per-record DEK; log to `audit_events`.
   - Restriction / objection → tag the account; processing pipelines respect the flag.
   - Consent withdrawal → revoke at the consent service; downstream pipelines stop within 24h.
5. **Notification to processors** — for erasure, propagate to subprocessors that hold copies (per DPA).
6. **Record** — DSR ticket archived with timestamps, scope, and outcome.

## Policy Statements

1. **No fee** for the first request in a 12-month period unless law permits otherwise (manifestly unfounded / excessive).
2. **No retaliation** — exercising rights does not affect account standing.
3. **Records** retained 3 years to demonstrate compliance.

## Evidence

- DSR ticket queue with timestamps.
- Audit-event rows for erasures.
- DPO / Security Lead sign-off per ticket.

## Open Items For Human Sign-Off

Track privacy intake decisions in [`../docs/security/SOC2-OPERATOR-CHECKLIST.md`](../docs/security/SOC2-OPERATOR-CHECKLIST.md) before patching this procedure.

- Confirm `privacy@elizaos.ai` inbox owner.
- Decide in-product DSR form vs email-only.
