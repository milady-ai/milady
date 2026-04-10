/**
 * Plugin role gating — restricts plugin actions to specific roles.
 *
 * After plugins are registered, this module wraps the `validate` function
 * of every action belonging to gated plugins so only users with the
 * required role (e.g. ADMIN/OWNER) can invoke them.
 *
 * @module plugin-role-gating
 */
import type {
  Action,
  IAgentRuntime,
  Memory,
  Plugin,
  State,
} from "@elizaos/core";
import { logger } from "@elizaos/core";

type RoleGate = "admin" | "owner";

/**
 * Plugins whose actions require at least ADMIN role.
 * Map from plugin package name to the minimum role required.
 */
const ROLE_GATED_PLUGINS: Readonly<Record<string, RoleGate>> = {
  "@elizaos/plugin-evm": "admin",
  "@elizaos/plugin-solana": "admin",
};

/**
 * Wrap the validate function of every action in `plugin` so it rejects
 * callers without the required role.
 */
function gatePluginActions(plugin: Plugin, minRole: RoleGate): void {
  if (!plugin.actions?.length) return;

  for (const action of plugin.actions) {
    const originalValidate = action.validate;

    const gatedValidate: Action["validate"] = async (
      runtime: IAgentRuntime,
      message: Memory,
      state?: State,
    ): Promise<boolean> => {
      // Lazy import to avoid circular deps — roles module is pre-registered
      // before optional plugins load, so checkSenderRole is always available.
      const { checkSenderRole } = await import("./roles/src/index.js");

      const check = await checkSenderRole(runtime, message);
      if (!check) {
        // No world context (e.g. direct API call) — allow through
        // so local-only usage isn't blocked.
        return originalValidate
          ? originalValidate(runtime, message, state)
          : true;
      }

      const allowed = minRole === "owner" ? check.isOwner : check.isAdmin;

      if (!allowed) {
        logger.debug(
          `[role-gating] ${action.name} blocked for entity ${check.entityId} ` +
            `(role: ${check.role}, requires: ${minRole})`,
        );
        return false;
      }

      return originalValidate
        ? originalValidate(runtime, message, state)
        : true;
    };

    action.validate = gatedValidate;
  }

  logger.info(
    `[role-gating] ${plugin.name}: ${plugin.actions.length} action(s) gated to ${minRole}+`,
  );
}

/**
 * Apply role gating to all registered plugins that appear in
 * ROLE_GATED_PLUGINS. Call this after runtime.initialize().
 */
export function applyPluginRoleGating(plugins: Plugin[]): void {
  for (const plugin of plugins) {
    const gate = ROLE_GATED_PLUGINS[plugin.name ?? ""];
    if (gate) {
      gatePluginActions(plugin, gate);
    }
  }
}

/** Exported for testing. */
export { ROLE_GATED_PLUGINS };
