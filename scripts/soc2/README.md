# scripts/soc2

Top-level wrappers for the SOC2 verification harness that lives in
`eliza/packages/soc2-verify`.

```
./scripts/soc2/verify.sh                # default: writes to ./soc2-evidence
./scripts/soc2/verify.sh --strict-fail  # exits non-zero on critical failures
SOC2_OUT_DIR=/tmp/evidence ./scripts/soc2/verify.sh
```

See `docs/security/EVIDENCE.md` for the auditor protocol.
