#!/usr/bin/env python3
"""Generate a small synthetic RPC contract fixture for tests."""
from __future__ import annotations
import json
import pathlib

fixture = {
    "request": "agent.run",
    "params": {"prompt": "Summarize the selected note", "mode": "dry-run"},
    "expected": {"ok": True, "requiresConfirmation": False},
}
path = pathlib.Path("tests/fixtures/rpc-agent-run.json")
path.parent.mkdir(parents=True, exist_ok=True)
path.write_text(json.dumps(fixture, indent=2) + "\n")
print(path)
