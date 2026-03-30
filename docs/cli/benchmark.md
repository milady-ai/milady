---
title: "milady benchmark"
sidebarTitle: "benchmark"
description: "Run benchmark tasks headlessly against the Milady agent."
---

Run a benchmark task headlessly against the Milady agent runtime. Useful for evaluating agent performance, running automated test suites, and CI/CD pipelines.

## Usage

```bash
milady benchmark [options]
```

## Options

| Flag | Description | Default |
|------|-------------|---------|
| `--task <path>` | Path to a task JSON file describing the benchmark to run | (none) |
| `--server` | Keep the runtime alive and accept tasks via stdin (line-delimited JSON) | `false` |
| `--timeout <ms>` | Timeout per task in milliseconds | `120000` (2 min) |

## Examples

### Run a single benchmark task

```bash
milady benchmark --task ./benchmarks/simple-chat.json
```

### Run in server mode (streaming tasks via stdin)

```bash
milady benchmark --server
```

In server mode, the agent runtime starts and waits for line-delimited JSON task objects on stdin. Each line is processed as an independent benchmark task. This is useful for running multiple benchmarks in sequence without restarting the runtime.

### Custom timeout

```bash
milady benchmark --task ./benchmarks/complex-reasoning.json --timeout 300000
```

## Related

- [milady start](/cli/start) -- start the agent runtime interactively
- [milady doctor](/cli/doctor) -- diagnose runtime issues
