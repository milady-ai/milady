import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const templatesDir = path.join(__dirname, "..", "templates");

export const TSCONFIG_TEMPLATES = {
  packages: path.join(templatesDir, "tsconfig.packages-mode.json"),
  local: path.join(templatesDir, "tsconfig.local-mode.json"),
};

export const ROOT_TSCONFIG_RELATIVE = "tsconfig.json";

function readFileTrimmedTrailingNewline(filePath) {
  return fs.readFileSync(filePath, "utf8").replace(/\n+$/, "");
}

export function readRootTsconfig(repoRoot) {
  const tsconfigPath = path.join(repoRoot, ROOT_TSCONFIG_RELATIVE);
  if (!fs.existsSync(tsconfigPath)) {
    return null;
  }
  return readFileTrimmedTrailingNewline(tsconfigPath);
}

export function readTsconfigTemplate(mode) {
  const templatePath = TSCONFIG_TEMPLATES[mode];
  if (!templatePath) {
    throw new Error(
      `[tsconfig-mode] Unsupported mode "${mode}". Use "packages" or "local".`,
    );
  }
  return readFileTrimmedTrailingNewline(templatePath);
}

export function tsconfigMatchesMode(repoRoot, mode) {
  const current = readRootTsconfig(repoRoot);
  if (current === null) return false;
  const expected = readTsconfigTemplate(mode);
  return current === expected;
}

export function applyTsconfigMode(repoRoot, mode, { log = console.log } = {}) {
  const tsconfigPath = path.join(repoRoot, ROOT_TSCONFIG_RELATIVE);
  const template = readTsconfigTemplate(mode);
  const current = fs.existsSync(tsconfigPath)
    ? fs.readFileSync(tsconfigPath, "utf8")
    : null;
  const desired = `${template}\n`;
  if (current === desired) {
    return { changed: false, mode };
  }
  fs.writeFileSync(tsconfigPath, desired);
  log(
    `[tsconfig-mode] Wrote ${ROOT_TSCONFIG_RELATIVE} from ${path.relative(repoRoot, TSCONFIG_TEMPLATES[mode])}`,
  );
  return { changed: true, mode };
}
