/**
 * Resolve a module namespace to its default export when present.
 * Falls back to the namespace itself for CJS/dual package interop.
 *
 * Bun canary sometimes exposes CJS modules as `{ default: { parse, ... } }`
 * instead of directly as `{ parse, ... }`. This helper normalizes both shapes.
 */
export function resolveModuleDefault(namespace) {
  if (namespace && typeof namespace === "object" && "default" in namespace) {
    return namespace.default;
  }
  return namespace;
}
