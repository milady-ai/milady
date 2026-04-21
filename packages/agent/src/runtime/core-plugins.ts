/**
 * Core plugin package lists shared by runtime startup and the API server.
 *
 * Keeping this in a standalone module avoids a circular dependency between
 * `api/server.ts` and `runtime/eliza.ts`.
 */

/**
 * Plugins that depend on PTY/native workspace tooling.
 * Keep them out of cloud images where those binaries are intentionally absent.
 */
export const DESKTOP_ONLY_PLUGINS: readonly string[] = [
  "@elizaos/plugin-agent-orchestrator",
];

/** Core plugins that should always be loaded. collectPluginNames() seeds from this list only. */
export const CORE_PLUGINS: readonly string[] = [
  "@elizaos/plugin-sql", // database adapter — required
  "@elizaos/plugin-local-embedding", // local embeddings — required for memory
  "@elizaos/plugin-form", // form handling for guided user journeys
  "@elizaos/plugin-agent-orchestrator", // task-agent orchestration (PTY, coordinator, workspace provisioning)
  "@elizaos/plugin-cron", // scheduled jobs and automation
  "@elizaos/plugin-shell", // shell command execution
  "@elizaos/plugin-agent-skills", // skill execution and marketplace runtime
  "@elizaos/plugin-commands", // slash command handling (skills auto-register as /commands)
  "@elizaos/plugin-plugin-manager", // dynamic plugin management for registry/plugin installs
  // Native runtime features live inside the runtime now:
  // knowledge, relationships/relationships, trajectories.
  // "@elizaos/plugin-secrets-manager", // secrets management — load early, other plugins depend on it
  // "@elizaos/plugin-trust", // trust scoring and policy signals
  "@elizaos/plugin-personality", // personality coherence
  // "@elizaos/plugin-experience", // learning from interactions
];

/**
 * Plugins that can be enabled from the admin panel.
 * Not loaded by default — require explicit configuration or have platform dependencies.
 */
export const OPTIONAL_CORE_PLUGINS: readonly string[] = [
  "@miladyai/plugin-selfcontrol", // cross-platform website blocker (hosts-file engine)
  "@elizaos/plugin-pdf", // PDF processing (published bundle broken in alpha.15)
  "@elizaos/plugin-cua", // CUA computer-use agent (cloud sandbox automation)
  "@elizaos/plugin-obsidian", // Obsidian vault CLI integration
  "@elizaos/plugin-code", // code writing and file operations
  "@elizaos/plugin-repoprompt", // RepoPrompt CLI integration and workflow orchestration
  "@elizaos/plugin-claude-code-workbench", // Claude Code companion workflows for this monorepo
  "@elizaos/plugin-computeruse", // computer use automation (requires platform-specific binaries)
  "@elizaos/plugin-browser", // browser automation (requires stagehand-server)
  "@elizaos/plugin-vision", // vision/image understanding (feature-gated)
  "@elizaos/plugin-cli", // CLI interface
  "@elizaos/plugin-discord", // Discord bot integration
  "@miladyai/plugin-discord-local", // Local Discord desktop integration for macOS
  "@elizaos/plugin-bluebubbles", // BlueBubbles-backed iMessage integration for macOS
  "@elizaos/plugin-telegram", // Telegram bot integration
  "@elizaos-plugins/client-telegram-account", // Telegram user-account client integration
  "@elizaos/plugin-signal", // Signal user-account integration
  "@elizaos/plugin-twitch", // Twitch integration
  "@elizaos/plugin-edge-tts", // text-to-speech (Microsoft Edge TTS)
  "@elizaos/plugin-elevenlabs", // ElevenLabs text-to-speech
  "@elizaos/plugin-music-library", // music metadata, library, playlists, YouTube search
  "@elizaos/plugin-music-player", // music playback engine + streaming routes
  // "@elizaos/plugin-directives", // directive processing - not yet ready
  // "@elizaos/plugin-mcp", // MCP protocol support - not yet ready
  // "@elizaos/plugin-scheduling", // scheduling - not yet ready
  // "@elizaos/plugin-scratchpad", // scratchpad notes - not yet ready
];
