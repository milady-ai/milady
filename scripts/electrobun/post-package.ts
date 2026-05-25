#!/usr/bin/env bun
import { readdirSync, existsSync } from "node:fs";

const artifactDir = process.env.ELECTROBUN_ARTIFACT_DIR ?? "artifacts";
if (existsSync(artifactDir)) {
  const files = readdirSync(artifactDir).slice(0, 50);
  console.log(`postPackage OK: ${files.length} artifact(s) visible in ${artifactDir}`);
  for (const file of files) console.log(`artifact: ${file}`);
} else {
  console.warn(`postPackage: artifact directory not found: ${artifactDir}`);
}
