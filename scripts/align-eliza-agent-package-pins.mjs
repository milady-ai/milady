#!/usr/bin/env node
import fs from "node:fs";

const rootPackagePath = "package.json";
const agentPackagePath = "eliza/packages/agent/package.json";

function isExactVersionSpecifier(specifier) {
  return /^\d+\.\d+\.\d+/.test(specifier) && !/^[~^>=<*]/.test(specifier);
}

if (!fs.existsSync(rootPackagePath) || !fs.existsSync(agentPackagePath)) {
  process.exit(0);
}

const rootPackage = JSON.parse(fs.readFileSync(rootPackagePath, "utf8"));
const agentPackage = JSON.parse(fs.readFileSync(agentPackagePath, "utf8"));
const rootDependencies = rootPackage.dependencies ?? {};
const agentDependencies = agentPackage.dependencies ?? {};
const aligned = [];

for (const [name, rootSpecifier] of Object.entries(rootDependencies)) {
  if (
    !name.startsWith("@elizaos/") ||
    typeof rootSpecifier !== "string" ||
    !isExactVersionSpecifier(rootSpecifier) ||
    typeof agentDependencies[name] !== "string" ||
    agentDependencies[name] === rootSpecifier
  ) {
    continue;
  }

  agentDependencies[name] = rootSpecifier;
  aligned.push(name);
}

if (aligned.length > 0) {
  fs.writeFileSync(
    agentPackagePath,
    `${JSON.stringify(agentPackage, null, 2)}\n`,
  );
  console.log(
    `[align-eliza-agent-package-pins] aligned ${aligned.length} dependency pin(s): ${aligned.join(", ")}`,
  );
}
