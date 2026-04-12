/**
 * GBA ROM Cache — IndexedDB storage for previously loaded ROMs.
 *
 * Stores ROM ArrayBuffers keyed by a sanitised filename so users can
 * re-select games from a menu without re-uploading.
 */

const DB_NAME = "gba-rom-cache";
const DB_VERSION = 1;
const STORE_NAME = "roms";
const META_STORE = "meta";

export interface CachedRomMeta {
  /** Key used in the object store (sanitised filename) */
  id: string;
  /** Original filename shown in the UI */
  name: string;
  /** Byte size of the ROM */
  size: number;
  /** Timestamp of when the ROM was cached */
  cachedAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function romId(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, "_").toLowerCase();
}

export async function cacheRom(
  filename: string,
  bytes: ArrayBuffer,
): Promise<CachedRomMeta> {
  const db = await openDb();
  const id = romId(filename);
  const meta: CachedRomMeta = {
    id,
    name: filename,
    size: bytes.byteLength,
    cachedAt: Date.now(),
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME, META_STORE], "readwrite");
    tx.objectStore(STORE_NAME).put(bytes, id);
    tx.objectStore(META_STORE).put(meta, id);
    tx.oncomplete = () => resolve(meta);
    tx.onerror = () => reject(tx.error);
  });
}

export async function getCachedRom(
  id: string,
): Promise<ArrayBuffer | null> {
  const db = await openDb();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(id);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => resolve(null);
  });
}

export async function listCachedRoms(): Promise<CachedRomMeta[]> {
  const db = await openDb();
  return new Promise((resolve) => {
    const tx = db.transaction(META_STORE, "readonly");
    const req = tx.objectStore(META_STORE).getAll();
    req.onsuccess = () => {
      const metas = (req.result ?? []) as CachedRomMeta[];
      metas.sort((a, b) => b.cachedAt - a.cachedAt);
      resolve(metas);
    };
    req.onerror = () => resolve([]);
  });
}

export async function removeCachedRom(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME, META_STORE], "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.objectStore(META_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
