import path from "node:path";
import { fileURLToPath } from "node:url";

/** Directory containing this file (`test/vitest/`). */
export const vitestConfigDir = path.dirname(fileURLToPath(import.meta.url));

/** Repository root (parent of `test/`). */
export const repoRoot = path.resolve(vitestConfigDir, "..", "..");
