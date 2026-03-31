"""
Milady benchmark adapter for the elizaOS benchmarks orchestrator.

This adapter allows the benchmarks suite to evaluate the Milady agent
by invoking the ``milady benchmark`` CLI subcommand.

Usage:
    Copy this file to the elizaOS/benchmarks repo's orchestrator/adapters/
    directory, or add it to the adapter discovery path.

    The adapter expects the Milady repo root to be passed as
    ``milady_root`` in the config, or set via the ``MILADY_ROOT``
    environment variable.
"""

from __future__ import annotations

import json
import os
import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional


@dataclass
class MiladyBenchmarkConfig:
    """Configuration for running Milady benchmarks."""

    milady_root: str = ""
    model: str = "claude-sonnet-4-20250514"
    provider: str = "anthropic"
    timeout_seconds: int = 120
    server_mode: bool = False

    def __post_init__(self) -> None:
        if not self.milady_root:
            self.milady_root = os.environ.get("MILADY_ROOT", "")
        if not self.milady_root:
            raise ValueError(
                "milady_root must be set via config or MILADY_ROOT env var"
            )


def build_milady_command(
    task_file: str,
    config: MiladyBenchmarkConfig,
) -> list[str]:
    """Build the CLI command to run a benchmark task against Milady."""
    root = Path(config.milady_root)
    cmd = [
        "bun",
        "run",
        str(root / "packages" / "agent" / "src" / "bin.ts"),
        "benchmark",
        "--task",
        task_file,
        "--timeout",
        str(config.timeout_seconds * 1000),
    ]
    return cmd


def _build_env(config: MiladyBenchmarkConfig) -> dict[str, str]:
    """Build the subprocess environment, forwarding relevant API keys."""
    env = os.environ.copy()
    env["MILADY_HEADLESS"] = "1"
    env["NODE_ENV"] = "production"
    if config.provider == "anthropic":
        env.setdefault("ANTHROPIC_API_KEY", os.environ.get("ANTHROPIC_API_KEY", ""))
    elif config.provider == "openai":
        env.setdefault("OPENAI_API_KEY", os.environ.get("OPENAI_API_KEY", ""))
    return env


def run_milady_benchmark(
    task: dict[str, Any],
    config: MiladyBenchmarkConfig,
    output_dir: str,
) -> dict[str, Any]:
    """
    Run a single benchmark task against the Milady agent.

    Args:
        task: Task dictionary with 'id', 'prompt', and optional 'context'.
        config: Milady benchmark configuration.
        output_dir: Directory to write temporary task files.

    Returns:
        Result dictionary with 'id', 'response', 'actions_taken',
        'duration_ms', and 'success'.
    """
    task_file = Path(output_dir) / f"task-{task['id']}.json"
    task_file.parent.mkdir(parents=True, exist_ok=True)
    task_file.write_text(json.dumps(task))

    cmd = build_milady_command(str(task_file), config)
    env = _build_env(config)

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=config.timeout_seconds + 30,  # Extra buffer for startup
            env=env,
            cwd=config.milady_root,
        )

        if result.returncode == 0:
            # Parse JSON from stdout (last line should be the result)
            lines = result.stdout.strip().split("\n")
            for line in reversed(lines):
                line = line.strip()
                if line.startswith("{"):
                    try:
                        return json.loads(line)
                    except json.JSONDecodeError:
                        continue

            return {
                "id": task["id"],
                "response": result.stdout,
                "actions_taken": [],
                "duration_ms": 0,
                "success": False,
                "error": "No JSON result found in output",
            }
        else:
            return {
                "id": task["id"],
                "response": "",
                "actions_taken": [],
                "duration_ms": 0,
                "success": False,
                "error": (
                    f"Process exited with code {result.returncode}: "
                    f"{result.stderr[:500]}"
                ),
            }
    except subprocess.TimeoutExpired:
        return {
            "id": task["id"],
            "response": "",
            "actions_taken": [],
            "duration_ms": config.timeout_seconds * 1000,
            "success": False,
            "error": "Timeout",
        }
    except Exception as e:
        return {
            "id": task["id"],
            "response": "",
            "actions_taken": [],
            "duration_ms": 0,
            "success": False,
            "error": str(e),
        }


def run_milady_benchmark_batch(
    tasks: list[dict[str, Any]],
    config: MiladyBenchmarkConfig,
    output_dir: str,
) -> list[dict[str, Any]]:
    """
    Run multiple benchmark tasks using server mode for efficiency.

    Boots the runtime once and streams tasks via stdin.

    Args:
        tasks: List of task dictionaries.
        config: Milady benchmark configuration.
        output_dir: Directory to write temporary task files.

    Returns:
        List of result dictionaries.
    """
    root = Path(config.milady_root)
    cmd = [
        "bun",
        "run",
        str(root / "packages" / "agent" / "src" / "bin.ts"),
        "benchmark",
        "--server",
        "--timeout",
        str(config.timeout_seconds * 1000),
    ]
    env = _build_env(config)

    # Total timeout: startup buffer + per-task timeout
    total_timeout = 60 + (config.timeout_seconds + 5) * len(tasks)

    try:
        stdin_data = "\n".join(json.dumps(t) for t in tasks) + "\n"
        result = subprocess.run(
            cmd,
            input=stdin_data,
            capture_output=True,
            text=True,
            timeout=total_timeout,
            env=env,
            cwd=config.milady_root,
        )

        results: list[dict[str, Any]] = []
        for line in result.stdout.strip().split("\n"):
            line = line.strip()
            if line.startswith("{"):
                try:
                    results.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
        return results

    except subprocess.TimeoutExpired:
        return [
            {
                "id": t.get("id", "unknown"),
                "response": "",
                "actions_taken": [],
                "duration_ms": config.timeout_seconds * 1000,
                "success": False,
                "error": "Batch timeout",
            }
            for t in tasks
        ]
    except Exception as e:
        return [
            {
                "id": t.get("id", "unknown"),
                "response": "",
                "actions_taken": [],
                "duration_ms": 0,
                "success": False,
                "error": str(e),
            }
            for t in tasks
        ]


def extract_score(result_path: str) -> dict[str, Any]:
    """
    Extract a normalized score from Milady benchmark results.

    Compatible with the elizaOS benchmarks ScoreExtraction format.
    """
    with open(result_path) as f:
        data = json.load(f)

    if isinstance(data, list):
        total = len(data)
        passed = sum(1 for r in data if r.get("success"))
        score = passed / total if total > 0 else 0.0
        return {
            "score": score,
            "unit": "ratio",
            "higher_is_better": True,
            "metrics": {
                "total_tasks": total,
                "passed_tasks": passed,
                "failed_tasks": total - passed,
                "overall_success_rate": score,
            },
        }
    elif isinstance(data, dict):
        return {
            "score": 1.0 if data.get("success") else 0.0,
            "unit": "ratio",
            "higher_is_better": True,
            "metrics": {
                "success": data.get("success", False),
                "duration_ms": data.get("duration_ms", 0),
                "actions_taken": len(data.get("actions_taken", [])),
            },
        }

    return {"score": 0.0, "unit": "ratio", "higher_is_better": True, "metrics": {}}


# Adapter registration for elizaOS benchmarks orchestrator
MILADY_ADAPTER: dict[str, Any] = {
    "id": "milady",
    "display_name": "Milady Agent",
    "description": "Evaluate the Milady AI assistant on benchmark tasks",
    "command_builder": build_milady_command,
    "runner": run_milady_benchmark,
    "batch_runner": run_milady_benchmark_batch,
    "score_extractor": extract_score,
    "required_env": [],
    "default_timeout_seconds": 120,
    "default_extra_config": {
        "model": "claude-sonnet-4-20250514",
        "provider": "anthropic",
    },
}
