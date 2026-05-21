/**
 * One-time migration: move legacy plaintext localStorage values for
 * sensitive keys into SecureStore. Emits an audit event so the move is
 * observable in the SOC2 evidence trail.
 *
 * Idempotent — a successful migration sets a sentinel that suppresses
 * future runs.
 */

import { emitClientAudit } from "./audit.js";
import { SENSITIVE_KEYS, type SecureStore } from "./types.js";

const MIGRATION_SENTINEL_KEY = "eliza.secure.migration.v1.complete";

export interface MigrationResult {
  moved: string[];
  skipped: string[];
}

export async function migrateLegacyLocalStorage(
  store: SecureStore,
  storage: Storage = typeof window !== "undefined"
    ? window.localStorage
    : (undefined as unknown as Storage),
): Promise<MigrationResult> {
  if (!storage) {
    return { moved: [], skipped: [...SENSITIVE_KEYS] };
  }
  if (storage.getItem(MIGRATION_SENTINEL_KEY) === "1") {
    return { moved: [], skipped: [...SENSITIVE_KEYS] };
  }
  const moved: string[] = [];
  const skipped: string[] = [];
  for (const key of SENSITIVE_KEYS) {
    const legacy = storage.getItem(key);
    if (legacy === null) {
      skipped.push(key);
      continue;
    }
    await store.set(key, legacy);
    storage.removeItem(key);
    moved.push(key);
    emitClientAudit({
      action: "secret.update",
      result: "success",
      resource: { type: "secure_store_entry", id: key },
      metadata: { reason: "legacy_localstorage_migration" },
    });
  }
  storage.setItem(MIGRATION_SENTINEL_KEY, "1");
  return { moved, skipped };
}

export function _resetMigrationSentinelForTests(
  storage: Storage = window.localStorage,
): void {
  storage.removeItem(MIGRATION_SENTINEL_KEY);
}
