import { chmodSync, copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(rootDir, "..");

const distDir = path.join(projectDir, "dist");

const aliasPairs: Array<[string, string]> = [
  [path.join(distDir, "index.js"), path.join(distDir, "index")],
  [path.join(distDir, "entry.js"), path.join(distDir, "entry")],
  [
    path.join(distDir, "runtime", "eliza.js"),
    path.join(distDir, "runtime", "eliza"),
  ],
];

function copyWithMode(
  source: string,
  target: string,
  executable = false,
): void {
  if (!existsSync(source)) {
    return;
  }

  mkdirSync(path.dirname(target), { recursive: true });
  copyFileSync(source, target);
  if (executable) {
    chmodSync(target, 0o755);
  }
}

for (const [source, target] of aliasPairs) {
  copyWithMode(source, target);
}
