#!/usr/bin/env bun
import { existsSync } from "node:fs";

const buildDir = process.env.ELECTROBUN_BUILD_DIR;
if (buildDir && !existsSync(buildDir)) {
  console.warn(`postBuild: ELECTROBUN_BUILD_DIR does not exist yet: ${buildDir}`);
}
console.log(`postBuild OK: buildDir=${buildDir ?? "<unset>"}`);
