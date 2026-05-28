#!/usr/bin/env python3
"""Offline prompt/tool eval harness skeleton.
Use synthetic cases only. Do not put private user data here.
"""
from __future__ import annotations
import json
import pathlib
import sys

path = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "eval_cases.json")
if not path.exists():
    print("No eval_cases.json found. Create synthetic eval cases before release.")
    raise SystemExit(0)

cases = json.loads(path.read_text())
for case in cases:
    required = {"name", "input", "expected", "risk"}
    missing = required - set(case)
    if missing:
        print(f"FAIL {case.get('name','<unnamed>')}: missing {sorted(missing)}")
        raise SystemExit(1)
    print(f"CASE {case['name']}: ready for model/tool evaluation [{case['risk']}]")
