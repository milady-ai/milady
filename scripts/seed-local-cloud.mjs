#!/usr/bin/env node
// @ts-check
/**
 * seed-local-cloud.mjs
 *
 * Phase 1: delegates to the eliza/cloud workspace's seed script
 *          (bun run db:local:seed) to set up org/user/credit-packs.
 * Phase 2: inserts three fixture user_characters via direct SQL so the
 *          homepage's character list has something to render.
 *
 * Reads .milady/cache/local-cloud-ports.json (written by dev-local-cloud.mjs)
 * for connection details, falling back to defaults.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "..");

const PORTS_FILE = resolve(REPO_ROOT, ".milady/cache/local-cloud-ports.json");
const CLOUD_DIR = resolve(REPO_ROOT, "eliza/cloud");

/**
 * @typedef {{
 *   services: {
 *     postgres: { host: string, port: number, user: string, password: string, database: string, url: string },
 *     redis: { url: string },
 *     "redis-rest": { url: string, token: string },
 *   }
 * }} PortsFile
 */

/** @returns {PortsFile["services"]["postgres"]} */
function loadPostgresConfig() {
  if (!existsSync(PORTS_FILE)) {
    return {
      host: "localhost",
      port: 5432,
      user: "eliza_dev",
      password: "local_dev_password",
      database: "eliza_dev",
      url: "postgresql://eliza_dev:local_dev_password@localhost:5432/eliza_dev",
    };
  }
  /** @type {PortsFile} */
  const parsed = JSON.parse(readFileSync(PORTS_FILE, "utf8"));
  return parsed.services.postgres;
}

/**
 * @param {string} msg
 */
function log(msg) {
  process.stdout.write(`[seed-cloud] ${msg}\n`);
}

/**
 * @param {string} msg
 */
function fail(msg) {
  process.stderr.write(`[seed-cloud] ERROR: ${msg}\n`);
  process.exit(1);
}

/**
 * @param {string} cmd
 * @param {readonly string[]} args
 * @param {{ cwd: string, env: NodeJS.ProcessEnv }} opts
 */
function runInherit(cmd, args, opts) {
  return spawnSync(cmd, args, {
    cwd: opts.cwd,
    env: opts.env,
    stdio: "inherit",
    encoding: "utf8",
  });
}

/**
 * Phase 1: invoke the cloud workspace's existing seed script.
 * @param {PortsFile["services"]["postgres"]} pg
 */
function runPhase1Seed(pg) {
  log("Phase 1: running cloud workspace seed (bun run db:local:seed)...");
  const env = {
    ...process.env,
    DATABASE_URL: pg.url,
  };
  const result = runInherit("bun", ["run", "db:local:seed"], {
    cwd: CLOUD_DIR,
    env,
  });
  if (result.status !== 0) {
    fail(
      `cloud seed script failed (exit ${result.status}). ` +
        "Make sure migrations have run: cd eliza/cloud && bun install && bun run db:migrate",
    );
  }
  log("Phase 1 complete.");
}

/**
 * Phase 2: insert three fixture user_characters via direct pg.
 * Status flavor is encoded by inserting a paired containers row when
 * the character has been "deployed" (running/paused/provisioning).
 * @param {PortsFile["services"]["postgres"]} pg
 */
async function runPhase2Seed(pg) {
  log("Phase 2: inserting fixture user_characters via direct SQL...");

  const { Client } = await import("pg");
  const client = new Client({ connectionString: pg.url });
  await client.connect();

  try {
    const orgRes = await client.query(
      "SELECT id FROM organizations WHERE slug = $1 LIMIT 1",
      ["local-dev-org"],
    );
    const organizationId = orgRes.rows[0]?.id;
    if (!organizationId) {
      fail(
        "could not find organization slug=local-dev-org. Phase 1 (cloud seed) likely failed.",
      );
      return;
    }

    const userRes = await client.query(
      "SELECT id FROM users WHERE email = $1 LIMIT 1",
      ["dev@local.test"],
    );
    const userId = userRes.rows[0]?.id;
    if (!userId) {
      fail("could not find user email=dev@local.test. Phase 1 likely failed.");
      return;
    }

    /** @type {Array<{ id: string, name: string, username: string, status: "running" | "paused" | "provisioning" }>} */
    const fixtures = [
      {
        id: "11111111-1111-4111-8111-111111111111",
        name: "Astra (running)",
        username: "astra-dev",
        status: "running",
      },
      {
        id: "22222222-2222-4222-8222-222222222222",
        name: "Bramble (paused)",
        username: "bramble-dev",
        status: "paused",
      },
      {
        id: "33333333-3333-4333-8333-333333333333",
        name: "Cobalt (provisioning)",
        username: "cobalt-dev",
        status: "provisioning",
      },
    ];

    for (const fx of fixtures) {
      const characterData = {
        name: fx.name,
        bio: [`${fx.name} is a local-dev fixture character.`],
        system: "You are a local-dev fixture. Be terse.",
      };
      await client.query(
        `INSERT INTO user_characters (
           id, organization_id, user_id, name, username, system,
           bio, character_data, source
         )
         VALUES ($1, $2, $3, $4, $5, $6,
           $7::jsonb, $8::jsonb, 'cloud')
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           username = EXCLUDED.username,
           updated_at = NOW()`,
        [
          fx.id,
          organizationId,
          userId,
          fx.name,
          fx.username,
          characterData.system,
          JSON.stringify(characterData.bio),
          JSON.stringify(characterData),
        ],
      );

      // Pair with a containers row so the homepage can show a status pill.
      await client.query(
        `INSERT INTO containers (
           id, name, project_name, organization_id, user_id, character_id, status
         )
         VALUES (
           $1, $2, $3, $4, $5, $6, $7
         )
         ON CONFLICT (id) DO UPDATE SET
           status = EXCLUDED.status,
           updated_at = NOW()`,
        [
          // Container ids are deterministic siblings of character ids.
          fx.id.replace(/^.{8}/, "aaaaaaaa"),
          fx.username,
          fx.username,
          organizationId,
          userId,
          fx.id,
          fx.status,
        ],
      );

      log(`  seeded ${fx.name} (status=${fx.status})`);
    }
  } finally {
    await client.end();
  }

  log("Phase 2 complete.");
}

async function main() {
  const pg = loadPostgresConfig();
  log(
    `Using DATABASE_URL=postgresql://${pg.user}:***@${pg.host}:${pg.port}/${pg.database}`,
  );
  runPhase1Seed(pg);
  await runPhase2Seed(pg);
  log("Done.");
}

main().catch((err) => {
  if (err instanceof Error) {
    fail(err.message);
  } else {
    fail(String(err));
  }
});
