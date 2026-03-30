/**
 * Stub for @lookingglass/webxr — the real package has a broken ESM import
 * chain that crashes under Node's strict module resolver.  This provides a
 * no-op LookingGlassWebXRPolyfill class so tests can import VrmEngine.ts
 * without hitting module resolution errors.
 */
export class LookingGlassWebXRPolyfill {
  constructor(_options?: Record<string, unknown>) {}
}
