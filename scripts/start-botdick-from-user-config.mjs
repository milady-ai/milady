import fs from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";

const configPath = "/Users/binkyfishai/.milady/milady.json";
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const stateDir = path.dirname(configPath);
const runtimeConfigPath = path.join(stateDir, "botdick-runtime.json");
const pgliteDataDir =
  process.env.BOTDICK_PGLITE_DATA_DIR ||
  path.join(stateDir, ".elizadb-botdick");

const runtimeConfig = {
  ...config,
  database: {
    ...(config.database || {}),
    provider: "pglite",
    pglite: {
      ...((config.database && config.database.pglite) || {}),
      dataDir: pgliteDataDir,
    },
  },
};

fs.mkdirSync(pgliteDataDir, { recursive: true });
fs.writeFileSync(runtimeConfigPath, JSON.stringify(runtimeConfig, null, 2));

const env = {
  ...process.env,
  MILADY_NAMESPACE: "milady",
  ELIZA_NAMESPACE: "milady",
  MILADY_STATE_DIR: stateDir,
  ELIZA_STATE_DIR: stateDir,
  MILADY_CONFIG_PATH: runtimeConfigPath,
  ELIZA_CONFIG_PATH: runtimeConfigPath,
  PGLITE_DATA_DIR: pgliteDataDir,
  ...(config.env || {}),
};

const bunPath =
  process.env.BUN_BIN ||
  (fs.existsSync("/Users/binkyfishai/.bun/bin/bun")
    ? "/Users/binkyfishai/.bun/bin/bun"
    : "bun");

const child = spawn(bunPath, ["run", "start"], {
  cwd: "/Users/binkyfishai/milady-fisbat",
  env,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});
