#!/usr/bin/env bun
import { existsSync } from "node:fs";

const env = process.env.ELECTROBUN_BUILD_ENV ?? "dev";
const required = ["package.json", "electrobun.config.ts", "src/bun/index.ts"];
const missing = required.filter((file) => !existsSync(file));
if (missing.length > 0) {
  console.error(`Missing required build inputs: ${missing.join(", ")}`);
  process.exit(1);
}

if (env === "stable") {
  const releaseBaseUrl = process.env.RELEASE_BASE_URL;
  if (!releaseBaseUrl)
    console.warn(
      "Stable build has no RELEASE_BASE_URL; updater artifacts may not be reachable.",
    );
  if (process.platform === "darwin") {
    const signing = ["ELECTROBUN_DEVELOPER_ID", "ELECTROBUN_TEAMID"];
    const missingSigning = signing.filter((name) => !process.env[name]);
    if (missingSigning.length > 0) {
      console.warn(
        `Stable macOS build missing signing metadata: ${missingSigning.join(", ")}`,
      );
    }
  }
}

console.log(
  `preBuild OK: env=${env} os=${process.env.ELECTROBUN_OS ?? process.platform} arch=${process.env.ELECTROBUN_ARCH ?? process.arch}`,
);
