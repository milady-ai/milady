/**
 * Steward policy CRUD helpers.
 *
 * Split from steward-bridge.ts to stay within LOC limits.
 * @module api/steward-bridge-policies
 */

import type { PolicyRule } from "@stwd/sdk";
import { normalizeEnvValueOrNull } from "../utils/env";
import {
  buildStewardHeaders,
  createStewardClient,
} from "./steward-bridge-core";

const normalizeEnvValue = normalizeEnvValueOrNull;

/**
 * Fetch policy rules for the given agent.
 */
export async function getStewardPolicies(
  agentId: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<PolicyRule[]> {
  const client = createStewardClient({ env });
  if (!client) throw new Error("Steward not configured");
  return client.getPolicies(agentId);
}

/**
 * Set (replace) the policy rules for the given agent.
 */
export async function setStewardPolicies(
  agentId: string,
  rules: PolicyRule[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const client = createStewardClient({ env });
  if (!client) throw new Error("Steward not configured");
  await client.setPolicies(agentId, rules);
}

/**
 * Provision a steward wallet for a new agent.
 * Creates the agent identity + wallet on steward, optionally with default policies.
 */
export async function provisionStewardWallet(params: {
  agentId: string;
  agentName: string;
  platformId?: string;
  defaultPolicies?: PolicyRule[];
  env?: NodeJS.ProcessEnv;
}): Promise<{ walletAddress: string }> {
  const env = params.env ?? process.env;
  const client = createStewardClient({ env });
  if (!client) {
    throw new Error("Steward not configured — cannot provision wallet");
  }

  const identity = await client.createWallet(
    params.agentId,
    params.agentName,
    params.platformId,
  );

  // Apply default policies if provided
  if (params.defaultPolicies && params.defaultPolicies.length > 0) {
    await client.setPolicies(params.agentId, params.defaultPolicies);
  }

  return { walletAddress: identity.walletAddress };
}
