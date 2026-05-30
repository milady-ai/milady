# Validation

Performed during package generation:

- Parsed `agent-plugin.json`, `.claude/settings.json`, and `templates/electrobun/package.json.template` as JSON.
- Parsed `automations/agent-automation.yaml` and GitHub workflow YAML files.
- Ran `bash -n` over shell hooks and automation scripts.
- Removed transient Python bytecode and cache directories.

Project-level TypeScript compilation requires installing the target repository dependencies and copying templates into an actual Electrobun app.
