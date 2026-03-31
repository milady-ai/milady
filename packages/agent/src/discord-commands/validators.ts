/**
 * Permission validators for Discord slash commands.
 *
 * Uses @miladyai/plugin-roles to check OWNER/ADMIN roles on the
 * interaction user within the guild's world metadata.
 */

import {
  createUniqueUuid,
  type IAgentRuntime,
  type UUID,
} from "@elizaos/core";
import { getEntityRole, type RoleName, type RolesWorldMetadata } from "@miladyai/plugin-roles";
import type { Interaction } from "discord.js";

/**
 * Resolve the entity's role for a Discord interaction user in the given guild.
 *
 * Uses the same UUID derivation as the Discord plugin so that world metadata
 * roles (set by plugin-roles) match up correctly.
 */
export async function getInteractionUserRole(
  interaction: Interaction,
  runtime: IAgentRuntime,
): Promise<RoleName> {
  if (!interaction.guild) return "NONE";

  const worldId = createUniqueUuid(runtime, interaction.guild.id) as UUID;
  const entityId = createUniqueUuid(runtime, interaction.user.id);

  const world = await runtime.getWorld(worldId);
  if (!world) return "NONE";

  const metadata = (world.metadata ?? {}) as RolesWorldMetadata;
  return getEntityRole(metadata, entityId);
}

/**
 * Validator: requires ADMIN or OWNER role.
 */
export async function requireAdmin(
  interaction: Interaction,
  runtime: IAgentRuntime,
): Promise<boolean> {
  const role = await getInteractionUserRole(interaction, runtime);
  return role === "ADMIN" || role === "OWNER";
}

/**
 * Validator: requires OWNER role only.
 */
export async function requireOwner(
  interaction: Interaction,
  runtime: IAgentRuntime,
): Promise<boolean> {
  const role = await getInteractionUserRole(interaction, runtime);
  return role === "OWNER";
}

/**
 * Validator: allows everyone (no restriction).
 */
export async function allowAll(
  _interaction: Interaction,
  _runtime: IAgentRuntime,
): Promise<boolean> {
  return true;
}
