# @elizaos/plugin-repoprompt

RepoPrompt CLI integration plugin for ElizaOS.

This plugin adds:

- **Service**: `repoprompt` (`RepoPromptService`)
- **Action**: `REPOPROMPT_RUN`
- **Provider**: `REPOPROMPT_STATUS`
- **Routes**:
  - `GET /repoprompt/status`
  - `POST /repoprompt/run`

## Configuration

Set via environment variables or plugin config:

- `REPOPROMPT_CLI_PATH` (default: `rp-cli`)
- `REPOPROMPT_DEFAULT_WINDOW` (optional)
- `REPOPROMPT_DEFAULT_TAB` (optional)
- `REPOPROMPT_TIMEOUT_MS` (default: `45000`)
- `REPOPROMPT_MAX_OUTPUT_CHARS` (default: `20000`)
- `REPOPROMPT_ALLOWED_COMMANDS` (default: `context_builder,read_file,file_search,tree`)

`REPOPROMPT_ALLOWED_COMMANDS` accepts a comma-separated allowlist. Example:

```bash
REPOPROMPT_ALLOWED_COMMANDS=context_builder,read_file,file_search
```

## Action usage

The action supports explicit options:

- `command`: command name
- `args`: array or string of arguments
- `window`, `tab`, `cwd`, `stdin`: optional execution settings

It also accepts message text in the form:

```text
rp-cli <command> <args...>
```

## Security notes

- Uses `spawn` with `shell: false`
- Applies command allowlist checks
- Enforces timeout per command
- Caps captured stdout/stderr
- Serializes runs to avoid overlapping CLI execution
