# @elizaos/plugin-pi-ai

pi-ai credential bridge plugin for ElizaOS.

This plugin reads credentials from pi's auth/settings files and registers model handlers for:

- `TEXT_SMALL`
- `TEXT_LARGE`
- `TEXT_REASONING_SMALL`
- `TEXT_REASONING_LARGE`
- `IMAGE_DESCRIPTION`

## Configuration

Set via plugin config or environment variables:

- `PI_CODING_AGENT_DIR` (default: `~/.pi/agent`)
- `PI_AI_MODEL_SPEC` (optional, format: `provider/modelId`)
- `PI_AI_SMALL_MODEL_SPEC` (optional)
- `PI_AI_LARGE_MODEL_SPEC` (optional)
- `PI_AI_PRIORITY` (default: `10000`)

When `PI_AI_MODEL_SPEC` is not set, the plugin will:

1. Check runtime `MODEL_PROVIDER` when it looks like `provider/model`.
2. Validate the provider has credentials in pi auth.
3. Fall back to pi settings default (`settings.json`) and then a safe built-in default.

## Security notes

- No shell execution
- Reads credentials from local files or process env only
- Uses provider allow-by-credential behavior before honoring model overrides
