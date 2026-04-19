import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { resolveOAuthDir } from "@elizaos/agent/config/paths";
import {
  googleCapabilitiesToScopes,
  normalizeGoogleCapabilities,
} from "@elizaos/app-lifeops/lifeops/google-scopes";
import {
  createLifeOpsConnectorGrant,
  LifeOpsRepository,
} from "@elizaos/app-lifeops/lifeops/repository";
import type { IAgentRuntime } from "@elizaos/core";
import type {
  LifeOpsConnectorSide,
  LifeOpsGoogleCapability,
} from "@elizaos/shared/contracts/lifeops";

function sanitizePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function buildMockGoogleTokenRef(
  agentId: string,
  side: LifeOpsConnectorSide,
): string {
  return path.join(
    sanitizePathSegment(agentId),
    sanitizePathSegment(side),
    "local.mocked-tests.json",
  );
}

function writeMockGoogleToken(args: {
  agentId: string;
  side: LifeOpsConnectorSide;
  grantedScopes: string[];
}): string {
  const tokenRef = buildMockGoogleTokenRef(args.agentId, args.side);
  const filePath = path.join(
    resolveOAuthDir(process.env),
    "lifeops",
    "google",
    tokenRef,
  );
  const now = Date.now();
  const token = {
    provider: "google" as const,
    agentId: args.agentId,
    side: args.side,
    mode: "local" as const,
    clientId: "mock-google-client",
    redirectUri: "http://127.0.0.1/mock-google/callback",
    accessToken: "mock-google-access-token",
    refreshToken: "mock-google-refresh-token",
    tokenType: "Bearer",
    grantedScopes: args.grantedScopes,
    expiresAt: now + 24 * 60 * 60 * 1000,
    refreshTokenExpiresAt: now + 30 * 24 * 60 * 60 * 1000,
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
  };

  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(filePath, JSON.stringify(token, null, 2), {
    encoding: "utf-8",
    mode: 0o600,
  });

  return tokenRef;
}

export async function ensureLifeOpsSchema(
  runtime: IAgentRuntime,
): Promise<void> {
  const repoClass = LifeOpsRepository as unknown as {
    bootstrapSchema?: (r: IAgentRuntime) => Promise<void>;
  };
  if (typeof repoClass.bootstrapSchema === "function") {
    await repoClass.bootstrapSchema(runtime);
  }
}

export async function seedGoogleConnectorGrant(
  runtime: IAgentRuntime,
  opts?: {
    capabilities?: LifeOpsGoogleCapability[];
    email?: string;
    side?: LifeOpsConnectorSide;
  },
): Promise<void> {
  await ensureLifeOpsSchema(runtime);

  const repo = new LifeOpsRepository(runtime);
  const side = opts?.side ?? "owner";
  const capabilities = normalizeGoogleCapabilities(
    opts?.capabilities ?? [
      "google.calendar.read",
      "google.calendar.write",
      "google.gmail.triage",
      "google.gmail.send",
    ],
  );
  const grantedScopes = googleCapabilitiesToScopes(capabilities);
  const tokenRef = writeMockGoogleToken({
    agentId: runtime.agentId,
    side,
    grantedScopes,
  });
  const now = new Date().toISOString();

  await repo.upsertConnectorGrant({
    ...createLifeOpsConnectorGrant({
      agentId: runtime.agentId,
      provider: "google",
      side,
      mode: "local",
      identity: { email: opts?.email ?? "owner@example.test" },
      grantedScopes,
      capabilities,
      tokenRef,
      metadata: { mocked: true },
      lastRefreshAt: now,
    }),
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
  });
}

export async function seedXConnectorGrant(
  runtime: IAgentRuntime,
  opts?: {
    capabilities?: Array<"x.read" | "x.write">;
    side?: LifeOpsConnectorSide;
    handle?: string;
  },
): Promise<void> {
  await ensureLifeOpsSchema(runtime);

  const repo = new LifeOpsRepository(runtime);
  const capabilities = Array.from(
    new Set(opts?.capabilities ?? ["x.read", "x.write"]),
  ).filter(
    (capability): capability is "x.read" | "x.write" =>
      capability === "x.read" || capability === "x.write",
  );

  await repo.upsertConnectorGrant(
    createLifeOpsConnectorGrant({
      agentId: runtime.agentId,
      provider: "x",
      side: opts?.side ?? "owner",
      mode: "local",
      identity: { handle: opts?.handle ?? "@mocked-lifeops" },
      grantedScopes: [],
      capabilities,
      tokenRef: null,
      metadata: { mocked: true },
      lastRefreshAt: new Date().toISOString(),
    }),
  );
}
