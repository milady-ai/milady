#!/usr/bin/env bash
# Top-level convenience wrapper: runs the SOC2 verification harness
# from the eliza/ workspace and stores evidence under ./soc2-evidence/.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
out_dir="${SOC2_OUT_DIR:-${repo_root}/soc2-evidence}"

cd "${repo_root}/eliza"
bun run packages/soc2-verify/src/cli.ts --out "${out_dir}" "$@"
