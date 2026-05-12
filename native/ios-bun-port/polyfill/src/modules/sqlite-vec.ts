// Convenience wrapper around the `sqlite-vec` extension (https://github.com/asg017/sqlite-vec).
//
// `sqlite-vec` ships as a SQLite extension that registers a `vec0` virtual
// table module plus a set of helper SQL functions:
//   vec_distance_l2(a, b)
//   vec_distance_cosine(a, b)
//   vec_distance_hamming(a, b)
//   vec_length(a)
//
// The Swift host links the extension statically and calls `sqlite3_vec_init`
// on each DB during open. From JS we just emit the right SQL.
//
// If the extension is not present at runtime, calls into these helpers fail
// with a clear SQLite error from the bridge (`no such module: vec0`).

import { Database, SQLiteError, SqliteValue } from "./sqlite.js";

/**
 * Returns true if the host reported that sqlite-vec is linked.
 *
 * Note: a `true` answer does not guarantee that the extension was initialized
 * for the specific DB handle (we initialize on every `sqlite_open`), but it's
 * a useful pre-check for callers that want to avoid CREATE TABLE failures.
 */
export function isVecAvailable(db: Database): boolean {
  return typeof db.version().sqlite_vec === "string";
}

export interface VecTableOptions {
  /**
   * Number of dimensions for the embedding column.
   */
  dimensions: number;
  /**
   * Optional auxiliary columns to store alongside each vector.
   * Each entry is `name TYPE` (e.g. `"memory_id TEXT"`).
   */
  auxColumns?: string[];
}

/**
 * Encodes a JS number array into the raw little-endian Float32Array bytes
 * that sqlite-vec expects when binding `vector` parameters as BLOBs.
 *
 * Example:
 *   db.exec(`INSERT INTO embeddings (vec) VALUES (?)`, [encodeVector([...])]);
 */
export function encodeVector(values: ArrayLike<number>): Uint8Array {
  const f = new Float32Array(values.length);
  for (let i = 0; i < values.length; i++) f[i] = values[i] ?? 0;
  return new Uint8Array(f.buffer, f.byteOffset, f.byteLength);
}

/**
 * Decodes a sqlite-vec BLOB column back into a Float32Array.
 *
 * The bridge returns BLOB columns as `Uint8Array`. Vector columns are stored
 * as little-endian Float32 sequences, so a no-copy view does the trick.
 */
export function decodeVector(blob: Uint8Array): Float32Array {
  // Float32 view requires 4-byte alignment. Most allocations from the bridge
  // are aligned but the safe path copies when they aren't.
  if (blob.byteOffset % 4 === 0) {
    return new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4);
  }
  const copy = new Uint8Array(blob.byteLength);
  copy.set(blob);
  return new Float32Array(copy.buffer, copy.byteOffset, copy.byteLength / 4);
}

/**
 * Creates a `vec0` virtual table for storing fixed-dimension vectors.
 *
 * The schema reflects sqlite-vec's grammar:
 *   CREATE VIRTUAL TABLE <name> USING vec0(
 *     embedding float[<dim>],
 *     <auxColumn1>,
 *     ...
 *   );
 */
export function createVecTable(
  db: Database,
  name: string,
  opts: VecTableOptions,
): void {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new SQLiteError(`Invalid vec table name: ${name}`, "SQLITE_MISUSE");
  }
  if (!Number.isInteger(opts.dimensions) || opts.dimensions <= 0) {
    throw new SQLiteError(`Invalid dimensions: ${opts.dimensions}`, "SQLITE_MISUSE");
  }
  const cols = [`embedding float[${opts.dimensions}]`, ...(opts.auxColumns ?? [])];
  const sql = `CREATE VIRTUAL TABLE IF NOT EXISTS ${name} USING vec0(${cols.join(", ")});`;
  db.exec(sql);
}

export interface VecSearchResult {
  rowid: number;
  distance: number;
  /**
   * Auxiliary columns are surfaced flat (e.g. `memory_id` if you defined it).
   * Their types follow sqlite-vec's storage rules; we forward them as-is.
   */
  [auxColumn: string]: SqliteValue;
}

/**
 * KNN search over a vec0 table. Returns the top-k nearest neighbors by
 * Euclidean distance.
 *
 * Example:
 *   knnSearch(db, "embeddings", queryVec, 10, ["memory_id"]);
 */
export function knnSearch(
  db: Database,
  table: string,
  query: ArrayLike<number>,
  k: number,
  selectColumns: string[] = [],
): VecSearchResult[] {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(table)) {
    throw new SQLiteError(`Invalid table name: ${table}`, "SQLITE_MISUSE");
  }
  if (!Number.isInteger(k) || k <= 0) {
    throw new SQLiteError(`Invalid k: ${k}`, "SQLITE_MISUSE");
  }
  const safeCols = selectColumns
    .filter((c) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(c))
    .map((c) => `, ${c}`)
    .join("");
  const sql = `SELECT rowid, distance${safeCols} FROM ${table} WHERE embedding MATCH ? AND k = ? ORDER BY distance`;
  const blob = encodeVector(query);
  const result = db.query<VecSearchResult>(sql, [blob, k]);
  return result.rows;
}

/**
 * Bulk-insert vectors. Accepts `{ vector, ...aux }` objects; the aux columns
 * must match the schema of the target table. Wraps the inserts in a
 * transaction for speed.
 */
export function insertVectors(
  db: Database,
  table: string,
  records: Array<{ vector: ArrayLike<number>; [key: string]: unknown }>,
): void {
  if (records.length === 0) return;
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(table)) {
    throw new SQLiteError(`Invalid table name: ${table}`, "SQLITE_MISUSE");
  }
  const first = records[0]!;
  const auxColumns = Object.keys(first).filter((k) => k !== "vector");
  for (const c of auxColumns) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(c)) {
      throw new SQLiteError(`Invalid aux column name: ${c}`, "SQLITE_MISUSE");
    }
  }
  const cols = ["embedding", ...auxColumns];
  const placeholders = cols.map(() => "?").join(", ");
  const sql = `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${placeholders})`;
  db.transaction((tx) => {
    const stmt = tx.prepare(sql);
    try {
      for (const r of records) {
        const params: Array<string | number | boolean | null | Uint8Array> = [
          encodeVector(r.vector),
        ];
        for (const c of auxColumns) {
          const v = r[c];
          if (v === null || v === undefined) params.push(null);
          else if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") params.push(v);
          else if (v instanceof Uint8Array) params.push(v);
          else params.push(JSON.stringify(v));
        }
        stmt.run(params);
      }
    } finally {
      stmt.finalize();
    }
  });
}

export default {
  isVecAvailable,
  encodeVector,
  decodeVector,
  createVecTable,
  knnSearch,
  insertVectors,
};
