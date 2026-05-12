#!/usr/bin/env node
/**
 * Pull every MILADY_E2E_* credential from the `milady-e2e` 1Password vault
 * and write them to `.env.scenarios` at the repo root.
 *
 * Requires the 1Password CLI (`op`) to be installed and signed in with an
 * account that has read access to the `milady-e2e` vault.
 *
 * Usage:
 *   bun run scenarios:creds:pull
 *   bun run scenarios:creds:pull -- --vault milady-e2e --out .env.scenarios
 *
 * The mapping from vault items to env var names is maintained in
 * `docs/scenario-credentials.md` under "Env vars" for each service. This
 * script reads a declarative mapping table embedded below and translates
 * each (service, field) pair into the corresponding `MILADY_E2E_*` env var.
 *
 * Items missing from the vault are skipped with a WARN log. Items present
 * in the vault but NOT in the mapping are also logged so the mapping can
 * be kept up to date as new services are added.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// Parse flags
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
function getFlag(name, defaultValue) {
  const idx = args.indexOf(name);
  if (idx === -1) return defaultValue;
  return args[idx + 1] ?? defaultValue;
}
const vault = getFlag("--vault", "milady-e2e");
const outFile = path.resolve(REPO_ROOT, getFlag("--out", ".env.scenarios"));

// ---------------------------------------------------------------------------
// Mapping: (service, item, field) → MILADY_E2E_* env var
// ---------------------------------------------------------------------------

/**
 * Each entry is [vaultItemTitle, fieldLabel, envVarName].
 * vaultItemTitle is the item title inside the `milady-e2e` vault.
 * fieldLabel is the label on the field inside the item.
 * envVarName is the target env var.
 */
const MAPPING = [
  // LLM providers. Written under the upstream-scoped `ELIZA_E2E_*` names so
  // the scenario-runner's live-provider helper picks them up via alias
  // discovery (canonical `GROQ_API_KEY` in the shell still wins if set).
  ["llm / groq-api-key", "credential", "ELIZA_E2E_GROQ_API_KEY"],
  ["llm / openai-api-key", "credential", "ELIZA_E2E_OPENAI_API_KEY"],
  ["llm / anthropic-api-key", "credential", "ELIZA_E2E_ANTHROPIC_API_KEY"],

  // Gmail test-owner
  [
    "gmail / test-owner / client-id",
    "credential",
    "MILADY_E2E_GMAIL_TESTOWNER_CLIENT_ID",
  ],
  [
    "gmail / test-owner / client-secret",
    "credential",
    "MILADY_E2E_GMAIL_TESTOWNER_CLIENT_SECRET",
  ],
  [
    "gmail / test-owner / refresh-token",
    "credential",
    "MILADY_E2E_GMAIL_TESTOWNER_REFRESH_TOKEN",
  ],
  [
    "gmail / test-owner / address",
    "value",
    "MILADY_E2E_GMAIL_TESTOWNER_ADDRESS",
  ],
  [
    "gmail / test-agent / client-id",
    "credential",
    "MILADY_E2E_GMAIL_TESTAGENT_CLIENT_ID",
  ],
  [
    "gmail / test-agent / client-secret",
    "credential",
    "MILADY_E2E_GMAIL_TESTAGENT_CLIENT_SECRET",
  ],
  [
    "gmail / test-agent / refresh-token",
    "credential",
    "MILADY_E2E_GMAIL_TESTAGENT_REFRESH_TOKEN",
  ],
  [
    "gmail / test-agent / address",
    "value",
    "MILADY_E2E_GMAIL_TESTAGENT_ADDRESS",
  ],

  // Discord
  ["discord / bot-token", "credential", "MILADY_E2E_DISCORD_BOT_TOKEN"],
  ["discord / client-id", "credential", "MILADY_E2E_DISCORD_CLIENT_ID"],
  ["discord / client-secret", "credential", "MILADY_E2E_DISCORD_CLIENT_SECRET"],
  ["discord / qa-guild-id", "value", "MILADY_E2E_DISCORD_QA_GUILD_ID"],
  ["discord / qa-channel-id", "value", "MILADY_E2E_DISCORD_QA_CHANNEL_ID"],
  [
    "discord / user-relay-token",
    "credential",
    "MILADY_E2E_DISCORD_USER_RELAY_TOKEN",
  ],

  // Telegram
  ["telegram / bot-token", "credential", "MILADY_E2E_TELEGRAM_BOT_TOKEN"],
  ["telegram / app-id", "value", "MILADY_E2E_TELEGRAM_APP_ID"],
  ["telegram / app-hash", "credential", "MILADY_E2E_TELEGRAM_APP_HASH"],
  [
    "telegram / userbot-phone-number",
    "value",
    "MILADY_E2E_TELEGRAM_USERBOT_PHONE_NUMBER",
  ],
  [
    "telegram / userbot-session-string",
    "credential",
    "MILADY_E2E_TELEGRAM_USERBOT_SESSION_STRING",
  ],
  ["telegram / chat-id", "value", "MILADY_E2E_TELEGRAM_CHAT_ID"],

  // Twitter / X
  ["twitter / client-id", "credential", "MILADY_E2E_TWITTER_CLIENT_ID"],
  ["twitter / client-secret", "credential", "MILADY_E2E_TWITTER_CLIENT_SECRET"],
  [
    "twitter / user-refresh-token",
    "credential",
    "MILADY_E2E_TWITTER_USER_REFRESH_TOKEN",
  ],
  [
    "twitter / friend-refresh-token",
    "credential",
    "MILADY_E2E_TWITTER_FRIEND_REFRESH_TOKEN",
  ],
  ["twitter / user-handle", "value", "MILADY_E2E_TWITTER_USER_HANDLE"],
  ["twitter / friend-handle", "value", "MILADY_E2E_TWITTER_FRIEND_HANDLE"],

  // Signal
  ["signal / phone-number", "value", "MILADY_E2E_SIGNAL_PHONE_NUMBER"],
  [
    "signal / recipient-phone-number",
    "value",
    "MILADY_E2E_SIGNAL_RECIPIENT_PHONE_NUMBER",
  ],
  ["signal / data-dir", "value", "MILADY_E2E_SIGNAL_DATA_DIR"],

  // WhatsApp
  ["whatsapp / access-token", "credential", "MILADY_E2E_WHATSAPP_ACCESS_TOKEN"],
  [
    "whatsapp / phone-number-id",
    "value",
    "MILADY_E2E_WHATSAPP_PHONE_NUMBER_ID",
  ],
  [
    "whatsapp / business-account-id",
    "value",
    "MILADY_E2E_WHATSAPP_BUSINESS_ACCOUNT_ID",
  ],
  [
    "whatsapp / webhook-verify-token",
    "credential",
    "MILADY_E2E_WHATSAPP_WEBHOOK_VERIFY_TOKEN",
  ],
  [
    "whatsapp / recipient-phone-number",
    "value",
    "MILADY_E2E_WHATSAPP_RECIPIENT_PHONE_NUMBER",
  ],

  // Twilio
  ["twilio / account-sid", "credential", "MILADY_E2E_TWILIO_ACCOUNT_SID"],
  ["twilio / api-key-sid", "credential", "MILADY_E2E_TWILIO_API_KEY_SID"],
  ["twilio / api-key-secret", "credential", "MILADY_E2E_TWILIO_API_KEY_SECRET"],
  ["twilio / sms-from-number", "value", "MILADY_E2E_TWILIO_SMS_FROM"],
  ["twilio / voice-from-number", "value", "MILADY_E2E_TWILIO_VOICE_FROM"],
  [
    "twilio / messaging-service-sid",
    "credential",
    "MILADY_E2E_TWILIO_MESSAGING_SERVICE_SID",
  ],
  ["twilio / recipient-number", "value", "MILADY_E2E_TWILIO_RECIPIENT"],

  // BlueBubbles
  ["bluebubbles / server-url", "value", "MILADY_E2E_BLUEBUBBLES_SERVER_URL"],
  ["bluebubbles / password", "credential", "MILADY_E2E_BLUEBUBBLES_PASSWORD"],
  [
    "bluebubbles / recipient-handle",
    "value",
    "MILADY_E2E_BLUEBUBBLES_RECIPIENT_HANDLE",
  ],

  // Calendly
  ["calendly / access-token", "credential", "MILADY_E2E_CALENDLY_ACCESS_TOKEN"],
  ["calendly / host-uri", "value", "MILADY_E2E_CALENDLY_HOST_URI"],
  ["calendly / event-type-uri", "value", "MILADY_E2E_CALENDLY_EVENT_TYPE_URI"],

  // GitHub
  ["github / user-pat", "credential", "MILADY_E2E_GITHUB_USER_PAT"],
  ["github / agent-pat", "credential", "MILADY_E2E_GITHUB_AGENT_PAT"],
  ["github / org-name", "value", "MILADY_E2E_GITHUB_ORG"],
  ["github / template-repo", "value", "MILADY_E2E_GITHUB_TEMPLATE_REPO"],

  // 1Password autofill vault
  [
    "1password-autofill / service-account-token",
    "credential",
    "MILADY_E2E_ONEPASS_SA_TOKEN",
  ],
  ["1password-autofill / vault-id", "value", "MILADY_E2E_ONEPASS_VAULT_ID"],

  // Eliza Cloud
  ["elizacloud / api-key", "credential", "MILADY_E2E_ELIZACLOUD_API_KEY"],
  ["elizacloud / base-url", "value", "MILADY_E2E_ELIZACLOUD_BASE_URL"],

  // Apple
  ["apple / team-id", "value", "MILADY_E2E_APPLE_TEAM_ID"],
  ["apple / apns-key-id", "value", "MILADY_E2E_APPLE_APNS_KEY_ID"],
  ["apple / apns-key.p8", "credential", "MILADY_E2E_APPLE_APNS_KEY_P8"],
  ["apple / apns-topic", "value", "MILADY_E2E_APPLE_APNS_TOPIC"],
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function opRead(itemTitle, fieldLabel) {
  try {
    const output = execFileSync(
      "op",
      [
        "item",
        "get",
        itemTitle,
        "--vault",
        vault,
        "--fields",
        `label=${fieldLabel}`,
        "--reveal",
        "--format",
        "json",
      ],
      { encoding: "utf8" },
    );
    const field = JSON.parse(output);
    if (Array.isArray(field)) {
      return String(field[0]?.value ?? "").trim();
    }
    return String(field?.value ?? "").trim();
  } catch (err) {
    if (
      err.stderr?.includes("isn't an item") ||
      err.stderr?.includes("not found") ||
      err.stderr?.includes("could not find")
    ) {
      return null;
    }
    throw err;
  }
}

function ensureServiceAccount() {
  if (!process.env.OP_SERVICE_ACCOUNT_TOKEN) {
    return null;
  }
  return process.env.OP_SERVICE_ACCOUNT_TOKEN;
}

async function ensureOp() {
  try {
    execFileSync("op", ["--version"], { stdio: "ignore" });
  } catch {
    console.error(
      "❌ 1Password CLI (`op`) is not installed or not on PATH. See https://developer.1password.com/docs/cli/get-started/",
    );
    process.exit(1);
  }
  if (!ensureServiceAccount()) {
    console.error(
      "OP_SERVICE_ACCOUNT_TOKEN is required to read the milady-e2e 1Password vault.",
    );
    process.exit(1);
  }
}

async function main() {
  await ensureOp();

  const lines = [
    "# Generated by scripts/scenario-creds-pull.mjs — do not edit by hand.",
    `# Source of truth: 1Password vault \`${vault}\`.`,
    `# Generated at: ${new Date().toISOString()}`,
    "",
  ];
  let pulled = 0;
  let missing = 0;

  for (const [itemTitle, fieldLabel, envVarName] of MAPPING) {
    const value = opRead(itemTitle, fieldLabel);
    if (value === null || value.length === 0) {
      console.warn(
        `[warn] ${envVarName}: not found (${itemTitle}/${fieldLabel})`,
      );
      missing += 1;
      continue;
    }
    const escaped = value.replace(/"/g, '\\"').replace(/\n/g, "\\n");
    lines.push(`${envVarName}="${escaped}"`);
    pulled += 1;
  }

  await fs.writeFile(outFile, `${lines.join("\n")}\n`, { mode: 0o600 });
  console.log(`\n✅ Wrote ${pulled} env vars to ${outFile}`);
  if (missing > 0) {
    console.log(`⚠️  ${missing} vault items were missing — see warnings above.`);
  }
  console.log(
    "\nLoad them into your shell with:  set -a; . " +
      path.relative(process.cwd(), outFile) +
      "; set +a",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
