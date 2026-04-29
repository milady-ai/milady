#!/usr/bin/env node
/**
 * Cloud image import smoke contract.
 *
 * Keep this list in sync with /home/shad0w/.moltbot/docs/cloud-vendoring-audit.md
 * and with optional cloud-provider plugins that are loaded by Nyx config.
 */
const criticalImports = [
  '@elizaos/core',
  '@elizaos/shared',
  '@elizaos/agent',
  '@elizaos/app-core',
  '@elizaos/app-companion',
  '@elizaos/app-lifeops',
  '@elizaos/app-lifeops/plugin',
  '@elizaos/app-steward',
  '@elizaos/app-task-coordinator',
  '@elizaos/app-training',
  '@elizaos/app-vincent',
  '@elizaos/app-elizamaker',
  '@elizaos/app-knowledge',
  '@elizaos/plugin-sql',
  '@elizaos/plugin-discord',
  '@elizaos/plugin-openai',
  '@elizaos/plugin-evm',
  '@elizaos/plugin-pdf',
  '@elizaos/plugin-agent-orchestrator',
  '@elizaos/plugin-agent-skills',
  '@elizaos/plugin-cli',
  '@elizaos/plugin-cron',
  '@elizaos/plugin-anthropic',
  '@elizaos/plugin-local-embedding',
  '@elizaos/plugin-ollama',
  '@elizaos/plugin-browser-bridge',
  '@elizaos/plugin-telegram',
  '@elizaos/plugin-elizacloud',
  '@elizaos/cloud-sdk',
  '@elizaos/plugin-edge-tts',
  '@elizaos/plugin-n8n-workflow',
  '@stwd/sdk',
  '@node-rs/argon2',
];

const repoRoot = new URL('../', import.meta.url);
const localImports = [
  new URL('dist/services/auth-store.js', repoRoot).href,
  new URL('dist/api/auth/bootstrap-token.js', repoRoot).href,
];

const failures = [];
for (const spec of [...criticalImports, ...localImports]) {
  try {
    await import(spec);
    console.log(`[cloud-smoke] ok ${spec}`);
  } catch (error) {
    failures.push({ spec, error });
    console.error(`[cloud-smoke] FAIL ${spec}`);
    console.error(error?.stack || error?.message || error);
  }
}

if (failures.length > 0) {
  console.error(`[cloud-smoke] ${failures.length} import(s) failed`);
  process.exit(1);
}
console.log(`[cloud-smoke] all ${criticalImports.length} imports passed`);
