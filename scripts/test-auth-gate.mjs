#!/usr/bin/env node

import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { exportJWK, generateKeyPair, SignJWT } from "jose";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function loadVerifyBootstrapToken() {
  const require = createRequire(import.meta.url);
  const packageJsonPath = require.resolve("@elizaos/app-core/package.json");
  const appCoreRoot = path.dirname(packageJsonPath);
  const modulePath = path.join(
    appCoreRoot,
    "packages",
    "app-core",
    "src",
    "api",
    "auth",
    "bootstrap-token.js",
  );
  const moduleUrl = pathToFileURL(modulePath).href;
  const module = await import(moduleUrl);
  if (typeof module.verifyBootstrapToken !== "function") {
    throw new Error("verifyBootstrapToken export is missing");
  }
  return module.verifyBootstrapToken;
}

async function main() {
  const verifyBootstrapToken = await loadVerifyBootstrapToken();
  const nowMs = Date.now();
  const nowSeconds = Math.floor(nowMs / 1000);
  const issuer = `https://issuer.milady.local/${nowMs.toString(36)}`;
  const containerId = "container-1";

  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwk = await exportJWK(publicKey);
  jwk.kid = "smoke-key";
  jwk.alg = "RS256";
  jwk.use = "sig";

  const token = await new SignJWT({
    sub: "cloud-user-123",
    containerId,
    scope: "bootstrap",
    jti: "jti-1",
  })
    .setProtectedHeader({ alg: "RS256", kid: "smoke-key" })
    .setIssuer(issuer)
    .setIssuedAt(nowSeconds)
    .setExpirationTime(nowSeconds + 300)
    .sign(privateKey);

  const seen = new Set();
  const authStore = {
    async recordJtiSeen(jti) {
      if (seen.has(jti)) return false;
      seen.add(jti);
      return true;
    },
  };

  const fetchImpl = async () => ({
    ok: true,
    async json() {
      return { keys: [jwk] };
    },
  });

  const baseOptions = {
    authStore,
    fetchImpl,
    now: () => nowMs,
  };

  const success = await verifyBootstrapToken(token, {
    ...baseOptions,
    env: {
      ELIZA_CLOUD_ISSUER: issuer,
      ELIZA_CLOUD_CONTAINER_ID: containerId,
    },
  });
  assert(
    success.ok === true,
    `expected success, got ${JSON.stringify(success)}`,
  );

  const replay = await verifyBootstrapToken(token, {
    ...baseOptions,
    env: {
      ELIZA_CLOUD_ISSUER: issuer,
      ELIZA_CLOUD_CONTAINER_ID: containerId,
    },
  });
  assert(
    replay.ok === false && replay.reason === "replay",
    `expected replay failure, got ${JSON.stringify(replay)}`,
  );

  const containerMismatch = await verifyBootstrapToken(token, {
    ...baseOptions,
    authStore: {
      async recordJtiSeen() {
        return true;
      },
    },
    env: {
      ELIZA_CLOUD_ISSUER: issuer,
      ELIZA_CLOUD_CONTAINER_ID: "wrong-container",
    },
  });
  assert(
    containerMismatch.ok === false &&
      containerMismatch.reason === "container_mismatch",
    `expected container mismatch, got ${JSON.stringify(containerMismatch)}`,
  );

  console.log("[test-auth-gate] PASS");
}

main().catch((error) => {
  console.error(
    `[test-auth-gate] FAIL: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  process.exit(1);
});
