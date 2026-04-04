# Discord Commands Enhancement Plan

> **Status:** Draft — 2026-03-30
> **Author:** Sol (automated audit)
> **Branch:** `feature/discord-commands` (off `develop`)

---

## 1. Audit Summary

### ElizaOS `@elizaos/plugin-discord` v2.0.0-alpha.10

**Source size:** 14,144 lines (dist/index.js)
**Slash command refs:** 99 occurrences

**Architecture (key findings):**

1. **Event-driven command registration.** The Discord service listens for
   `DISCORD_REGISTER_COMMANDS` events on the runtime. Any plugin can emit this
   event to register slash commands:
   ```ts
   runtime.emitEvent("DISCORD_REGISTER_COMMANDS", {
     commands: [{ name: "balance", description: "Show wallet balances", ... }],
   });
   ```

2. **Event-driven command dispatch.** When a slash command is received, the
   service emits `DISCORD_SLASH_COMMAND` with the interaction object. Any plugin
   can listen for this event and handle matching commands:
   ```ts
   runtime.registerEvent("DISCORD_SLASH_COMMAND", async (payload) => {
     if (payload.interaction.commandName === "balance") { ... }
   });
   ```

3. **Built-in utilities** (all exported):
   - `buildDiscordSlashCommand(spec: NativeCommandSpec)` — converts spec → Discord API JSON
   - `buildDiscordCommandOptions(args)` — argument definitions → option objects
   - `buildCommandArgMenu(params)` — button menus for argument selection
   - `buildCommandArgCustomId` / `parseCommandArgCustomId` — button custom ID encoding
   - `safeInteractionCall(fn)` — catches expired interaction errors
   - `DiscordPermissionTiers` — BASIC / MODERATOR / ADMIN permission bitfields
   - `hasElevatedPermissions(perms)` — checks for elevated Discord permissions

4. **Validator support.** Each command can have a `validator` function that
   receives `(interaction, runtime)` and returns `boolean`. If false, the
   interaction is rejected with "You do not have permission."

5. **Guild-scoped & global commands.** Commands support `guildIds` for targeted
   registration, `guildOnly` flag, and `bypassChannelWhitelist`.

6. **Modal & component support.** The service also dispatches
   `DISCORD_MODAL_SUBMIT` and handles button/select interactions with
   `userSelections` state tracking.

### Milady Agent (`packages/agent`)

**Existing API routes (the backend we'll call from Discord commands):**

| Route file | Relevant endpoints |
|---|---|
| `wallet-routes.ts` | GET/POST wallet addresses, balances (EVM + Solana), generate, import, export |
| `wallet-trade-routes.ts` | Trade execution, preflight, quotes |
| `agent-admin-routes.ts` | Agent status, restart, config, model switching |
| `knowledge-routes.ts` | Knowledge CRUD, URL import, bulk operations |
| `character-routes.ts` | Character get/switch |
| `models-routes.ts` | Model listing, switching |
| `signal-routes.ts` | Agent lifecycle signals |
| `wallet.ts` | Core wallet functions, Steward integration |

**Plugin system:** Milady uses `@miladyai/plugin-*` namespace. See `plugin-roles`
for the pattern (exports a `Plugin` object with `init()`, `providers`, `actions`).

**Core plugins** loaded from `packages/agent/src/runtime/core-plugins.ts` — includes
`@elizaos/plugin-discord` already.

---

## 2. Recommended Approach: **Option B — `@miladyai/plugin-discord-commands`**

### Why Option B

| Criterion | A (Fork) | **B (Separate plugin)** | C (Action system) |
|---|---|---|---|
| Maintenance burden | High — must track upstream | **Low — additive only** | Low |
| Access to Discord.js | Via fork | **Via runtime events + interaction object** | No direct access |
| Embeds, buttons, modals | Yes | **Yes (interaction object is passed through)** | No |
| ElizaOS upgrade path | Must rebase | **Just bump dependency** | Just bump |
| Milady-specific logic | Pollutes upstream | **Clean separation** | Scattered across actions |
| Code review | Large fork diff | **Small focused package** | Hard to audit |

**Option B wins.** The `DISCORD_REGISTER_COMMANDS` / `DISCORD_SLASH_COMMAND`
event pattern is specifically designed for this — it's a plugin hook. We get
full access to the `Interaction` object (embeds, buttons, ephemeral replies,
modals) without touching upstream code.

---

## 3. File Structure

```
packages/plugin-discord-commands/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── src/
│   ├── index.ts                    # Plugin entry — registers commands on init
│   ├── types.ts                    # Shared types, command registry interface
│   ├── auth.ts                     # Owner/admin auth using plugin-roles
│   ├── registry.ts                 # Command registry + dispatch loop
│   ├── embeds.ts                   # Embed builder helpers (balances, status, etc.)
│   ├── commands/
│   │   ├── index.ts                # Re-exports all command modules
│   │   ├── wallet/
│   │   │   ├── balance.ts          # /balance
│   │   │   ├── send.ts             # /send <address> <amount> <token>
│   │   │   ├── approve.ts          # /approve (pending Steward approvals)
│   │   │   ├── wallet.ts           # /wallet (show addresses)
│   │   │   └── policies.ts         # /policies
│   │   ├── agent/
│   │   │   ├── status.ts           # /status
│   │   │   ├── config.ts           # /config <key> <value>
│   │   │   ├── character.ts        # /character
│   │   │   ├── voice.ts            # /voice <preset>
│   │   │   └── model.ts            # /model <provider>
│   │   ├── knowledge/
│   │   │   ├── learn.ts            # /learn <text>
│   │   │   ├── forget.ts           # /forget <query>
│   │   │   └── knowledge.ts        # /knowledge (list)
│   │   └── system/
│   │       ├── restart.ts          # /restart
│   │       ├── logs.ts             # /logs
│   │       └── plugins.ts          # /plugins
│   └── test/
│       ├── auth.test.ts
│       ├── registry.test.ts
│       └── commands/
│           ├── balance.test.ts
│           └── status.test.ts
```

---

## 4. Implementation Details

### 4.1 Package Setup

```jsonc
// packages/plugin-discord-commands/package.json
{
  "name": "@miladyai/plugin-discord-commands",
  "version": "0.1.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run"
  },
  "dependencies": {
    "@elizaos/core": "workspace:*",
    "@elizaos/plugin-discord": "^2.0.0-alpha.10",
    "@miladyai/plugin-roles": "workspace:*",
    "discord.js": "^14.16.3"
  },
  "devDependencies": {
    "vitest": "^2.0.0",
    "typescript": "^5.5.0"
  }
}
```

Add to monorepo root `package.json` workspaces:
```jsonc
"packages/plugin-discord-commands"
```

Add to `packages/agent/src/runtime/core-plugins.ts`:
```ts
"@miladyai/plugin-discord-commands", // Discord slash commands for wallet, admin, knowledge
```

### 4.2 Command Definition Interface

```ts
// src/types.ts
import type { IAgentRuntime } from "@elizaos/core";
import type {
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
} from "discord.js";
import type {
  NativeCommandSpec,
  DiscordSlashCommand,
} from "@elizaos/plugin-discord";

/** Permission level required for a command */
export type CommandPermission = "PUBLIC" | "ADMIN" | "OWNER";

/** A milady Discord command definition */
export interface MiladyCommand {
  /** The NativeCommandSpec used to build the slash command */
  spec: NativeCommandSpec;

  /** Permission level (checked against plugin-roles) */
  permission: CommandPermission;

  /** Whether responses should be ephemeral by default */
  ephemeral?: boolean;

  /** Guild-only (not available in DMs) */
  guildOnly?: boolean;

  /** Bypass channel whitelist (admin commands should work anywhere) */
  bypassChannelWhitelist?: boolean;

  /** The handler function */
  execute: (ctx: CommandContext) => Promise<void>;
}

/** Context passed to command handlers */
export interface CommandContext {
  interaction: ChatInputCommandInteraction;
  runtime: IAgentRuntime;
  /** The Discord user's role from plugin-roles: "OWNER" | "ADMIN" | "NONE" */
  role: string;
}
```

### 4.3 Auth Layer (using plugin-roles)

```ts
// src/auth.ts
import type { IAgentRuntime } from "@elizaos/core";
import type { Interaction } from "discord.js";
import type { CommandPermission } from "./types";

// Import from the co-located plugin-roles
import { checkSenderRole, resolveWorldForMessage } from "@miladyai/plugin-roles";

const ROLE_RANK: Record<string, number> = {
  OWNER: 3,
  ADMIN: 2,
  NONE: 0,
};

const PERMISSION_RANK: Record<CommandPermission, number> = {
  PUBLIC: 0,
  ADMIN: 2,
  OWNER: 3,
};

/**
 * Build a validator function for a command's permission level.
 * Returns a function compatible with DiscordSlashCommand.validator.
 */
export function buildPermissionValidator(
  permission: CommandPermission,
): (interaction: Interaction, runtime: IAgentRuntime) => Promise<boolean> {
  if (permission === "PUBLIC") {
    return async () => true;
  }

  return async (interaction: Interaction, runtime: IAgentRuntime) => {
    if (!interaction.guild) return false;

    // Resolve the world for this guild
    const worldId = await resolveWorldForMessage(runtime, {
      source: "discord",
      serverId: interaction.guild.id,
    });
    if (!worldId) return false;

    // Check the sender's role
    const result = await checkSenderRole(runtime, {
      entityId: interaction.user.id,
      worldId,
      source: "discord",
    });

    const userRank = ROLE_RANK[result.role] ?? 0;
    const requiredRank = PERMISSION_RANK[permission];

    return userRank >= requiredRank;
  };
}

/**
 * Resolve a Discord user's role for a given interaction.
 */
export async function resolveUserRole(
  runtime: IAgentRuntime,
  interaction: Interaction,
): Promise<string> {
  if (!interaction.guild) return "NONE";

  try {
    const worldId = await resolveWorldForMessage(runtime, {
      source: "discord",
      serverId: interaction.guild.id,
    });
    if (!worldId) return "NONE";

    const result = await checkSenderRole(runtime, {
      entityId: interaction.user.id,
      worldId,
      source: "discord",
    });

    return result.role ?? "NONE";
  } catch {
    return "NONE";
  }
}
```

### 4.4 Command Registry & Dispatch

```ts
// src/registry.ts
import { logger, type IAgentRuntime } from "@elizaos/core";
import {
  buildDiscordSlashCommand,
  type DiscordSlashCommand,
  type DiscordSlashCommandPayload,
} from "@elizaos/plugin-discord";
import type { ChatInputCommandInteraction } from "discord.js";
import type { MiladyCommand } from "./types";
import { buildPermissionValidator, resolveUserRole } from "./auth";

const commands = new Map<string, MiladyCommand>();

/** Register a command definition */
export function registerCommand(cmd: MiladyCommand): void {
  commands.set(cmd.spec.name, cmd);
}

/** Build DiscordSlashCommand objects for registration with the Discord service */
export function buildSlashCommands(): DiscordSlashCommand[] {
  return Array.from(commands.values()).map((cmd) => {
    const base = buildDiscordSlashCommand(cmd.spec);
    return {
      ...base,
      guildOnly: cmd.guildOnly ?? true,
      bypassChannelWhitelist: cmd.bypassChannelWhitelist ?? true,
      validator: buildPermissionValidator(cmd.permission),
    };
  });
}

/** Handle an incoming slash command interaction */
export async function handleSlashCommand(
  payload: DiscordSlashCommandPayload,
): Promise<void> {
  const interaction = payload.interaction;
  if (!interaction.isCommand()) return;

  const chatInteraction = interaction as ChatInputCommandInteraction;
  const cmd = commands.get(chatInteraction.commandName);
  if (!cmd) return; // Not one of our commands — let other handlers deal with it

  const runtime = payload.runtime;

  try {
    // Defer reply if the command might take a while
    if (!chatInteraction.replied && !chatInteraction.deferred) {
      await chatInteraction.deferReply({
        ephemeral: cmd.ephemeral ?? true,
      });
    }

    const role = await resolveUserRole(runtime, interaction);

    await cmd.execute({
      interaction: chatInteraction,
      runtime,
      role,
    });
  } catch (error) {
    logger.error(
      `[discord-commands] Error executing /${chatInteraction.commandName}: ${error}`,
    );

    const errorMsg = "An error occurred while executing this command.";
    try {
      if (chatInteraction.deferred) {
        await chatInteraction.editReply({ content: errorMsg });
      } else if (!chatInteraction.replied) {
        await chatInteraction.reply({ content: errorMsg, ephemeral: true });
      }
    } catch {
      // Interaction expired — nothing we can do
    }
  }
}

/** Get all registered commands (for introspection) */
export function getRegisteredCommands(): Map<string, MiladyCommand> {
  return commands;
}
```

### 4.5 Plugin Entry Point

```ts
// src/index.ts
import { logger, type IAgentRuntime, type Plugin } from "@elizaos/core";
import { registerCommand, buildSlashCommands, handleSlashCommand } from "./registry";

// Import all command definitions
import { balanceCommand } from "./commands/wallet/balance";
import { sendCommand } from "./commands/wallet/send";
import { approveCommand } from "./commands/wallet/approve";
import { walletCommand } from "./commands/wallet/wallet";
import { policiesCommand } from "./commands/wallet/policies";
import { statusCommand } from "./commands/agent/status";
import { configCommand } from "./commands/agent/config";
import { characterCommand } from "./commands/agent/character";
import { voiceCommand } from "./commands/agent/voice";
import { modelCommand } from "./commands/agent/model";
import { learnCommand } from "./commands/knowledge/learn";
import { forgetCommand } from "./commands/knowledge/forget";
import { knowledgeCommand } from "./commands/knowledge/knowledge";
import { restartCommand } from "./commands/system/restart";
import { logsCommand } from "./commands/system/logs";
import { pluginsCommand } from "./commands/system/plugins";

const ALL_COMMANDS = [
  // Wallet (PUBLIC — balances are read-only, send/approve have their own checks)
  balanceCommand,
  walletCommand,
  // Wallet (ADMIN — financial operations)
  sendCommand,
  approveCommand,
  policiesCommand,
  // Agent management (ADMIN)
  statusCommand,
  configCommand,
  characterCommand,
  voiceCommand,
  modelCommand,
  // Knowledge (ADMIN)
  learnCommand,
  forgetCommand,
  knowledgeCommand,
  // System (OWNER only)
  restartCommand,
  logsCommand,
  pluginsCommand,
];

const discordCommandsPlugin: Plugin = {
  name: "@miladyai/plugin-discord-commands",
  description:
    "Discord slash commands for milady agent management — wallet, " +
    "knowledge, config, and system administration.",

  async init(_config: Record<string, unknown>, runtime: IAgentRuntime) {
    logger.info("[discord-commands] Initializing plugin");

    // Register all command definitions
    for (const cmd of ALL_COMMANDS) {
      registerCommand(cmd);
    }

    // Listen for slash command events from the Discord service
    runtime.registerEvent("DISCORD_SLASH_COMMAND", handleSlashCommand);

    // Wait a moment for the Discord service to be ready, then register commands
    // The Discord service sets up the DISCORD_REGISTER_COMMANDS listener in onReady
    setTimeout(() => {
      const slashCommands = buildSlashCommands();
      logger.info(
        `[discord-commands] Registering ${slashCommands.length} slash commands`,
      );
      runtime.emitEvent("DISCORD_REGISTER_COMMANDS", {
        commands: slashCommands,
      });
    }, 5000); // 5s delay to ensure Discord service is connected

    logger.info("[discord-commands] Plugin initialized");
  },
};

export default discordCommandsPlugin;
```

### 4.6 Example Command Implementations

#### `/balance` — Show wallet balances

```ts
// src/commands/wallet/balance.ts
import { logger } from "@elizaos/core";
import { EmbedBuilder } from "discord.js";
import type { MiladyCommand, CommandContext } from "../../types";

export const balanceCommand: MiladyCommand = {
  spec: {
    name: "balance",
    description: "Show EVM and Solana wallet balances",
    ephemeralDefault: true,
  },
  permission: "PUBLIC",
  ephemeral: true,

  async execute(ctx: CommandContext) {
    const { interaction, runtime } = ctx;

    try {
      // Call the agent's internal wallet API
      // These functions are in packages/agent/src/api/wallet.ts
      const { getWalletAddresses, fetchEvmBalances, fetchSolanaBalances } =
        await import("../../api-bridge");

      const addresses = await getWalletAddresses(runtime);
      if (!addresses.evm && !addresses.solana) {
        await interaction.editReply({
          content: "⚠️ No wallets configured. Use `/wallet` to set up.",
        });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle("💰 Wallet Balances")
        .setColor(0x7c3aed) // milady purple
        .setTimestamp();

      // EVM balances
      if (addresses.evm) {
        const evmBalances = await fetchEvmBalances(runtime, addresses.evm);
        const evmLines = evmBalances.tokens
          .filter((t) => Number(t.balance) > 0)
          .map((t) => `${t.symbol}: ${Number(t.balance).toFixed(4)}`)
          .slice(0, 10);

        embed.addFields({
          name: "🔷 EVM",
          value: evmLines.length > 0
            ? `\`${addresses.evm.slice(0, 6)}...${addresses.evm.slice(-4)}\`\n${evmLines.join("\n")}`
            : `\`${addresses.evm.slice(0, 6)}...${addresses.evm.slice(-4)}\`\nNo tokens found`,
          inline: true,
        });
      }

      // Solana balances
      if (addresses.solana) {
        const solBalances = await fetchSolanaBalances(runtime, addresses.solana);
        const solLines = solBalances.tokens
          .filter((t) => Number(t.amount) > 0)
          .map((t) => `${t.symbol}: ${Number(t.amount).toFixed(4)}`)
          .slice(0, 10);

        embed.addFields({
          name: "☀️ Solana",
          value: solLines.length > 0
            ? `\`${addresses.solana.slice(0, 6)}...${addresses.solana.slice(-4)}\`\n${solLines.join("\n")}`
            : `\`${addresses.solana.slice(0, 6)}...${addresses.solana.slice(-4)}\`\nNo tokens found`,
          inline: true,
        });
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      logger.error(`[discord-commands] /balance error: ${error}`);
      await interaction.editReply({
        content: "❌ Failed to fetch balances. Check logs.",
      });
    }
  },
};
```

#### `/status` — Agent status

```ts
// src/commands/agent/status.ts
import { EmbedBuilder } from "discord.js";
import type { MiladyCommand, CommandContext } from "../../types";

export const statusCommand: MiladyCommand = {
  spec: {
    name: "status",
    description: "Show agent status, uptime, model, and memory count",
    ephemeralDefault: true,
  },
  permission: "ADMIN",
  ephemeral: true,

  async execute(ctx: CommandContext) {
    const { interaction, runtime } = ctx;

    const character = runtime.character;
    const agentId = runtime.agentId;
    const uptime = process.uptime();

    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const uptimeStr = `${hours}h ${minutes}m`;

    // Get memory count (approximate)
    let memoryCount = "unknown";
    try {
      const rooms = await runtime.getRooms(agentId);
      let total = 0;
      for (const room of rooms.slice(0, 10)) {
        const memories = await runtime.getMemories({
          roomId: room.id,
          count: 1,
        });
        total += memories.length;
      }
      memoryCount = `~${total}+ (sampled)`;
    } catch {
      // ignore
    }

    const embed = new EmbedBuilder()
      .setTitle(`🤖 ${character.name || "Agent"} Status`)
      .setColor(0x22c55e) // green
      .addFields(
        { name: "Character", value: character.name || "Default", inline: true },
        { name: "Agent ID", value: `\`${agentId.slice(0, 8)}...\``, inline: true },
        { name: "Uptime", value: uptimeStr, inline: true },
        { name: "Model", value: String(runtime.getSetting("MODEL_PROVIDER") || "unknown"), inline: true },
        { name: "Memories", value: memoryCount, inline: true },
        { name: "Your Role", value: ctx.role, inline: true },
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};
```

#### `/send` — Initiate a transfer

```ts
// src/commands/wallet/send.ts
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import type { MiladyCommand, CommandContext } from "../../types";

export const sendCommand: MiladyCommand = {
  spec: {
    name: "send",
    description: "Send tokens to an address",
    args: [
      { name: "address", description: "Recipient address", type: "string", required: true },
      { name: "amount", description: "Amount to send", type: "string", required: true },
      { name: "token", description: "Token symbol (ETH, SOL, USDC, etc.)", type: "string", required: true },
      {
        name: "chain",
        description: "Chain to send on",
        type: "string",
        required: false,
        choices: [
          { label: "Ethereum", value: "ethereum" },
          { label: "Base", value: "base" },
          { label: "BSC", value: "bsc" },
          { label: "Solana", value: "solana" },
        ],
      },
    ],
  },
  permission: "OWNER", // Only owner can initiate transfers
  ephemeral: true,

  async execute(ctx: CommandContext) {
    const { interaction } = ctx;

    const address = interaction.options.getString("address", true);
    const amount = interaction.options.getString("amount", true);
    const token = interaction.options.getString("token", true);
    const chain = interaction.options.getString("chain") || "auto";

    // Build confirmation embed with approve/deny buttons
    const embed = new EmbedBuilder()
      .setTitle("📤 Confirm Transfer")
      .setColor(0xf59e0b) // amber warning
      .addFields(
        { name: "To", value: `\`${address}\``, inline: false },
        { name: "Amount", value: `${amount} ${token.toUpperCase()}`, inline: true },
        { name: "Chain", value: chain, inline: true },
      )
      .setFooter({ text: "This transfer will be submitted to Steward for execution." });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`milady:send:confirm:${interaction.user.id}`)
        .setLabel("✅ Confirm")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`milady:send:cancel:${interaction.user.id}`)
        .setLabel("❌ Cancel")
        .setStyle(ButtonStyle.Danger),
    );

    await interaction.editReply({
      embeds: [embed],
      components: [row],
    });

    // Note: Button handling would be done via DISCORD_MODAL_SUBMIT or
    // component interaction handling in a separate listener
  },
};
```

#### `/learn` — Add knowledge

```ts
// src/commands/knowledge/learn.ts
import type { MiladyCommand, CommandContext } from "../../types";

export const learnCommand: MiladyCommand = {
  spec: {
    name: "learn",
    description: "Add knowledge to the agent's memory",
    args: [
      { name: "text", description: "Knowledge text to learn", type: "string", required: true },
    ],
  },
  permission: "ADMIN",
  ephemeral: true,

  async execute(ctx: CommandContext) {
    const { interaction, runtime } = ctx;
    const text = interaction.options.getString("text", true);

    try {
      // Use the knowledge service
      const knowledgeService = runtime.getService("knowledge");
      if (!knowledgeService) {
        await interaction.editReply({
          content: "⚠️ Knowledge service not available.",
        });
        return;
      }

      // Create a knowledge memory entry
      await runtime.createMemory({
        content: { text },
        entityId: runtime.agentId,
        roomId: runtime.agentId, // Agent's own knowledge room
        unique: true,
      });

      await interaction.editReply({
        content: `✅ Learned: "${text.slice(0, 100)}${text.length > 100 ? "..." : ""}"`,
      });
    } catch (error) {
      await interaction.editReply({
        content: `❌ Failed to learn: ${error}`,
      });
    }
  },
};
```

#### `/restart` — Restart agent (OWNER only)

```ts
// src/commands/system/restart.ts
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from "discord.js";
import type { MiladyCommand, CommandContext } from "../../types";

export const restartCommand: MiladyCommand = {
  spec: {
    name: "restart",
    description: "Restart the agent (owner only)",
  },
  permission: "OWNER",
  ephemeral: true,
  bypassChannelWhitelist: true,

  async execute(ctx: CommandContext) {
    const { interaction } = ctx;

    const embed = new EmbedBuilder()
      .setTitle("🔄 Restart Agent?")
      .setDescription("This will restart the agent process. It will be unavailable for ~30 seconds.")
      .setColor(0xef4444);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`milady:restart:confirm:${interaction.user.id}`)
        .setLabel("Restart")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`milady:restart:cancel:${interaction.user.id}`)
        .setLabel("Cancel")
        .setStyle(ButtonStyle.Secondary),
    );

    await interaction.editReply({ embeds: [embed], components: [row] });
  },
};
```

### 4.7 API Bridge

The command handlers need to call the agent's internal API functions. Since
both the commands plugin and the agent package run in the same process, we
can create a bridge that calls the API functions directly (not over HTTP):

```ts
// src/api-bridge.ts
/**
 * Bridge to milady agent API internals.
 *
 * Commands run in-process with the agent, so we can import and call
 * the API functions directly rather than making HTTP requests.
 * If the agent restructures its API, only this file needs updating.
 */
import type { IAgentRuntime } from "@elizaos/core";

// Dynamic imports to avoid hard coupling — the agent package may not be
// available at build time for the plugin, but it will be at runtime.

export async function getWalletAddresses(
  runtime: IAgentRuntime,
): Promise<{ evm: string | null; solana: string | null }> {
  try {
    const wallet = await import("@miladyai/agent/api/wallet");
    return wallet.getWalletAddresses(runtime);
  } catch {
    // Fallback: read from runtime settings
    return {
      evm: runtime.getSetting("EVM_WALLET_ADDRESS") as string | null,
      solana: runtime.getSetting("SOLANA_WALLET_ADDRESS") as string | null,
    };
  }
}

export async function fetchEvmBalances(
  runtime: IAgentRuntime,
  address: string,
): Promise<{ tokens: Array<{ symbol: string; balance: string }> }> {
  try {
    const wallet = await import("@miladyai/agent/api/wallet");
    return wallet.fetchEvmBalances(runtime, address);
  } catch {
    return { tokens: [] };
  }
}

export async function fetchSolanaBalances(
  runtime: IAgentRuntime,
  address: string,
): Promise<{ tokens: Array<{ symbol: string; amount: string }> }> {
  try {
    const wallet = await import("@miladyai/agent/api/wallet");
    const result = await wallet.fetchSolanaBalances(address);
    return { tokens: result ?? [] };
  } catch {
    return { tokens: [] };
  }
}
```

### 4.8 Embed Helpers

```ts
// src/embeds.ts
import { EmbedBuilder } from "discord.js";

export const MILADY_COLOR = 0x7c3aed; // Purple
export const SUCCESS_COLOR = 0x22c55e; // Green
export const WARNING_COLOR = 0xf59e0b; // Amber
export const ERROR_COLOR = 0xef4444; // Red
export const INFO_COLOR = 0x3b82f6; // Blue

export function errorEmbed(title: string, description: string): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(`❌ ${title}`)
    .setDescription(description)
    .setColor(ERROR_COLOR)
    .setTimestamp();
}

export function successEmbed(title: string, description: string): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(`✅ ${title}`)
    .setDescription(description)
    .setColor(SUCCESS_COLOR)
    .setTimestamp();
}

export function infoEmbed(title: string, description?: string): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(INFO_COLOR)
    .setTimestamp();
  if (description) embed.setDescription(description);
  return embed;
}

/** Truncate a string for embed field values (max 1024 chars) */
export function truncField(text: string, max = 1024): string {
  return text.length > max ? text.slice(0, max - 3) + "..." : text;
}

/** Format an address for display */
export function fmtAddr(addr: string): string {
  return `\`${addr.slice(0, 6)}…${addr.slice(-4)}\``;
}
```

---

## 5. Command Registration Flow

```
┌──────────────────────────────┐
│  plugin-discord-commands     │
│  init() called by ElizaOS    │
└──────────┬───────────────────┘
           │
           │  1. Register all MiladyCommand definitions
           │  2. runtime.registerEvent("DISCORD_SLASH_COMMAND", handler)
           │  3. setTimeout → runtime.emitEvent("DISCORD_REGISTER_COMMANDS", {commands})
           │
           ▼
┌──────────────────────────────┐
│  @elizaos/plugin-discord     │
│  DiscordService              │
│                              │
│  Receives DISCORD_REGISTER_  │
│  COMMANDS event              │
│                              │
│  → registerSlashCommands()   │
│  → Merges into slashCommands │
│  → Registers with Discord    │
│    API (global + per-guild)  │
└──────────┬───────────────────┘
           │
           │  User types /balance in Discord
           │
           ▼
┌──────────────────────────────┐
│  Discord API → interactionCreate
│                              │
│  1. Channel whitelist check  │
│  2. Validator check (auth)   │
│  3. Emit DISCORD_SLASH_      │
│     COMMAND event            │
└──────────┬───────────────────┘
           │
           ▼
┌──────────────────────────────┐
│  plugin-discord-commands     │
│  handleSlashCommand()        │
│                              │
│  1. Match command by name    │
│  2. Defer reply (ephemeral)  │
│  3. Resolve user role        │
│  4. Call cmd.execute(ctx)    │
│  5. Handle errors gracefully │
└──────────────────────────────┘
```

---

## 6. Command Permission Matrix

| Command | Permission | Ephemeral | Notes |
|---|---|---|---|
| `/balance` | PUBLIC | ✅ | Read-only, anyone can check |
| `/wallet` | PUBLIC | ✅ | Shows addresses (public info) |
| `/status` | ADMIN | ✅ | Agent introspection |
| `/send` | OWNER | ✅ | Financial — confirmation buttons |
| `/approve` | OWNER | ✅ | Steward approval queue |
| `/policies` | OWNER | ✅ | Steward policy management |
| `/config` | ADMIN | ✅ | Runtime config changes |
| `/character` | ADMIN | ✅ | Character switching |
| `/voice` | ADMIN | ✅ | Voice preset changes |
| `/model` | ADMIN | ✅ | Model provider switching |
| `/learn` | ADMIN | ✅ | Knowledge addition |
| `/forget` | ADMIN | ✅ | Knowledge deletion |
| `/knowledge` | ADMIN | ✅ | Knowledge listing |
| `/restart` | OWNER | ✅ | Destructive — confirmation required |
| `/logs` | OWNER | ✅ | May contain sensitive info |
| `/plugins` | OWNER | ✅ | Plugin management |

---

## 7. Response Formatting Guidelines

### Embeds
- All command responses use Discord embeds (not plain text)
- Color coding: purple (default), green (success), amber (warning), red (error)
- Addresses displayed as inline code with truncation: `` `0xC984...9EC` ``
- Token amounts formatted with 4 decimal places max
- Field values limited to 1024 chars (Discord limit)

### Buttons
- Confirmation flows (send, restart) use approve/cancel button pairs
- Buttons encode the invoking user's ID to prevent other users from clicking
- Custom IDs follow format: `milady:<command>:<action>:<userId>`

### Ephemeral Messages
- All admin/owner commands are ephemeral by default (only visible to invoker)
- `/balance` and `/wallet` are ephemeral to protect financial privacy
- Error messages are always ephemeral

### Pagination
- `/knowledge` and `/logs` use button-based pagination
- 10 items per page, with Previous/Next buttons

---

## 8. Button & Component Interaction Handling

The `DISCORD_SLASH_COMMAND` event only fires for slash commands. For button
clicks (e.g., confirming a transfer), we need to also listen for component
interactions. The Discord service handles these via the `interactionCreate`
listener and tracks `userSelections`.

**Approach:** Register a separate event listener for component interactions
using a custom event, or hook into the existing component handling:

```ts
// In init(), also register for component interactions
runtime.registerEvent("DISCORD_COMPONENT_INTERACTION", async (payload) => {
  const interaction = payload.interaction;
  if (!interaction.isButton()) return;

  const customId = interaction.customId;
  if (!customId.startsWith("milady:")) return;

  const [, command, action, userId] = customId.split(":");

  // Only the original invoker can click the button
  if (interaction.user.id !== userId) {
    await interaction.reply({
      content: "This button isn't for you.",
      ephemeral: true,
    });
    return;
  }

  // Route to the appropriate handler
  const handler = componentHandlers.get(command);
  if (handler) {
    await handler(interaction, action, runtime);
  }
});
```

> **Note:** If `DISCORD_COMPONENT_INTERACTION` doesn't exist as an event yet,
> we may need to use `DISCORD_MODAL_SUBMIT` for modals or find another hook.
> Worst case, we can register our own `interactionCreate` listener on the
> Discord client directly (accessible via the Discord service).

---

## 9. Testing Strategy

### Unit Tests
- Each command's `execute()` function tested with mocked `CommandContext`
- Auth layer tested with mock roles
- Registry tested for correct command building

### Integration Tests
- Use Discord.js's `InteractionMock` utilities
- Test full flow: register → receive → dispatch → respond
- Test permission rejection for unauthorized users

### Manual Testing
- Deploy to a test Discord server
- Verify all commands appear in the slash command menu
- Test permission tiers with different user roles

---

## 10. Timeline Estimate

| Phase | Duration | Tasks |
|---|---|---|
| **Phase 1: Scaffold** | 1 day | Package setup, types, registry, auth, embeds |
| **Phase 2: Core commands** | 2 days | `/balance`, `/wallet`, `/status`, `/config` |
| **Phase 3: Knowledge commands** | 1 day | `/learn`, `/forget`, `/knowledge` |
| **Phase 4: Wallet commands** | 2 days | `/send` (with confirmation), `/approve`, `/policies` |
| **Phase 5: System commands** | 1 day | `/restart`, `/logs`, `/plugins` |
| **Phase 6: Component interactions** | 1 day | Button handlers, pagination |
| **Phase 7: Testing** | 2 days | Unit tests, integration, manual |
| **Total** | **~10 days** | |

### Priority Order
1. `/status` + `/balance` + `/wallet` (immediate value, low risk)
2. `/config` + `/model` + `/character` (agent management)
3. `/learn` + `/forget` + `/knowledge` (knowledge ops)
4. `/send` + `/approve` (financial — needs Steward integration)
5. `/restart` + `/logs` + `/plugins` (system admin)

---

## 11. Open Questions

1. **Component interaction events:** Does the Discord plugin emit a separate
   event for button/select interactions, or do we need to hook into the Discord
   client directly? Need to verify `DISCORD_COMPONENT_INTERACTION` exists.

2. **Steward API contract:** The `/send` and `/approve` commands need to call
   Steward APIs. Need to finalize the Steward SDK interface for:
   - Listing pending approvals
   - Submitting approval decisions
   - Initiating transfers

3. **Plugin-roles integration:** The `checkSenderRole` and `resolveWorldForMessage`
   functions need to accept Discord user IDs and map them to ElizaOS entity IDs.
   Need to verify the plugin-roles API handles this mapping.

4. **Command deregistration:** If the plugin is disabled, should we deregister
   commands from Discord? The current `registerSlashCommands` merges but doesn't
   support removal.

5. **Rate limiting:** Should we add per-user rate limiting for commands like
   `/balance` that call external APIs?

---

## 12. Dependencies

```
@elizaos/core              — runtime, logger, types
@elizaos/plugin-discord    — event types, command builders, permission utils
@miladyai/plugin-roles     — role checking (OWNER/ADMIN/NONE)
discord.js                 — EmbedBuilder, ActionRowBuilder, ButtonBuilder
```

All already available in the monorepo. No new external dependencies required.
