/**
 * Database management API handlers for the Milaidy Control UI.
 *
 * Provides endpoints for:
 * - Database provider configuration (PGLite vs Postgres)
 * - Connection testing for remote Postgres
 * - Table browsing and introspection
 * - Row-level CRUD operations
 * - Raw SQL query execution
 * - Database status and health
 *
 * All data endpoints use the active runtime's database adapter (Drizzle ORM)
 * so they work identically for both PGLite and Postgres.
 */

import http from "node:http";
import { type AgentRuntime, logger } from "@elizaos/core";
import {
  loadMilaidyConfig,
  saveMilaidyConfig,
} from "../config/config.js";
import type {
  DatabaseConfig,
  DatabaseProviderType,
  PostgresCredentials,
} from "../config/types.milaidy.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DatabaseStatus {
  provider: DatabaseProviderType;
  connected: boolean;
  serverVersion: string | null;
  tableCount: number;
  pgliteDataDir: string | null;
  postgresHost: string | null;
}

interface TableInfo {
  name: string;
  schema: string;
  rowCount: number;
  columns: ColumnInfo[];
}

interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue: string | null;
  isPrimaryKey: boolean;
}

interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  durationMs: number;
}

interface ConnectionTestResult {
  success: boolean;
  serverVersion: string | null;
  error: string | null;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonResponse(
  res: http.ServerResponse,
  data: unknown,
  status = 200,
): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}

function errorResponse(
  res: http.ServerResponse,
  message: string,
  status = 400,
): void {
  jsonResponse(res, { error: message }, status);
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    req.on("data", (c: Buffer) => {
      totalBytes += c.length;
      if (totalBytes > 2 * 1024 * 1024) {
        reject(new Error("Request body too large"));
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}

/**
 * Safely quote a SQL identifier (table or column name).
 * Postgres uses double-quote escaping: embedded " becomes "".
 */
function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * Build a Postgres connection string from individual credential fields.
 */
function buildConnectionString(creds: PostgresCredentials): string {
  if (creds.connectionString) return creds.connectionString;
  const host = creds.host ?? "localhost";
  const port = creds.port ?? 5432;
  const user = encodeURIComponent(creds.user ?? "postgres");
  const password = creds.password ? encodeURIComponent(creds.password) : "";
  const database = creds.database ?? "postgres";
  const auth = password ? `${user}:${password}` : user;
  const sslParam = creds.ssl ? "?sslmode=require" : "";
  return `postgresql://${auth}@${host}:${port}/${database}${sslParam}`;
}

/** Convert a JS value to a SQL literal for use in raw queries. */
function sqlLiteral(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (typeof v === "object") return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

/** Build a "col = val" SQL assignment clause. */
function sqlAssign(col: string, val: unknown): string {
  if (val === null || val === undefined) return `${quoteIdent(col)} = NULL`;
  return `${quoteIdent(col)} = ${sqlLiteral(val)}`;
}

/** Build a "col = val" or "col IS NULL" SQL WHERE predicate. */
function sqlPredicate(col: string, val: unknown): string {
  if (val === null || val === undefined) return `${quoteIdent(col)} IS NULL`;
  return `${quoteIdent(col)} = ${sqlLiteral(val)}`;
}


// Cached drizzle-orm sql helper; resolved once on first call.
let _sqlHelper: { raw: (query: string) => { queryChunks: unknown[] } } | null = null;
async function getDrizzleSql(): Promise<typeof _sqlHelper> {
  if (!_sqlHelper) {
    const drizzle = await import("drizzle-orm");
    _sqlHelper = drizzle.sql;
  }
  return _sqlHelper;
}

/** Execute raw SQL via the runtime's Drizzle adapter. */
async function executeRawSql(
  runtime: AgentRuntime,
  sqlText: string,
): Promise<{ rows: Record<string, unknown>[]; columns: string[] }> {
  const drizzleSql = await getDrizzleSql();
  const db = runtime.adapter.db as {
    execute(query: { queryChunks: unknown[] }): Promise<{
      rows: Record<string, unknown>[];
      fields?: Array<{ name: string }>;
    }>;
  };
  const result = await db.execute(drizzleSql!.raw(sqlText));
  const rows = Array.isArray(result.rows)
    ? result.rows
    : (result as unknown as Record<string, unknown>[]);

  let columns: string[] = [];
  if (result.fields && Array.isArray(result.fields)) {
    columns = result.fields.map((f: { name: string }) => f.name);
  } else if (rows.length > 0) {
    columns = Object.keys(rows[0]);
  }

  return { rows, columns };
}

/**
 * Detect the current database provider from environment / runtime state.
 */
function detectCurrentProvider(): DatabaseProviderType {
  return process.env.POSTGRES_URL ? "postgres" : "pglite";
}

/** Verify a table name refers to a real user table. */
async function assertTableExists(
  runtime: AgentRuntime,
  tableName: string,
): Promise<boolean> {
  const safe = tableName.replace(/'/g, "''");
  const { rows } = await executeRawSql(
    runtime,
    `SELECT 1 FROM information_schema.tables
     WHERE table_name = '${safe}'
       AND table_schema NOT IN ('pg_catalog', 'information_schema')
       AND table_type = 'BASE TABLE'
     LIMIT 1`,
  );
  return rows.length > 0;
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

/**
 * GET /api/database/status
 * Returns current connection status, provider, table count, version.
 */
async function handleGetStatus(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  runtime: AgentRuntime | null,
): Promise<void> {
  const provider = detectCurrentProvider();
  if (!runtime?.adapter) {
    jsonResponse(res, {
      provider,
      connected: false,
      serverVersion: null,
      tableCount: 0,
      pgliteDataDir: process.env.PGLITE_DATA_DIR ?? null,
      postgresHost: null,
    } satisfies DatabaseStatus);
    return;
  }

  const { rows } = await executeRawSql(runtime, "SELECT version()");
  const serverVersion =
    rows.length > 0
      ? String((rows[0] as Record<string, unknown>).version ?? "")
      : null;

  const tableResult = await executeRawSql(
    runtime,
    `SELECT count(*)::int AS cnt
       FROM information_schema.tables
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
        AND table_type = 'BASE TABLE'`,
  );
  const tableCount =
    tableResult.rows.length > 0
      ? Number((tableResult.rows[0] as Record<string, unknown>).cnt ?? 0)
      : 0;

  const status: DatabaseStatus = {
    provider,
    connected: true,
    serverVersion,
    tableCount,
    pgliteDataDir:
      provider === "pglite" ? (process.env.PGLITE_DATA_DIR ?? null) : null,
    postgresHost:
      provider === "postgres"
        ? (process.env.POSTGRES_URL?.replace(
            /^postgresql:\/\/[^@]*@/,
            "",
          ).replace(/\/.*$/, "") ?? null)
        : null,
  };

  jsonResponse(res, status);
}

/**
 * GET /api/database/config
 * Returns the persisted database configuration from milaidy.json.
 */
function handleGetConfig(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
): void {
  const config = loadMilaidyConfig();
  const dbConfig: DatabaseConfig = config.database ?? { provider: "pglite" };
  // Mask the password in the response
  const sanitized = { ...dbConfig };
  if (sanitized.postgres?.password) {
    sanitized.postgres = {
      ...sanitized.postgres,
      password: "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022",
    };
  }
  if (sanitized.postgres?.connectionString) {
    // Mask password in connection string
    sanitized.postgres = {
      ...sanitized.postgres,
      connectionString: sanitized.postgres.connectionString.replace(
        /:([^@]+)@/,
        ":\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022@",
      ),
    };
  }
  jsonResponse(res, {
    config: sanitized,
    activeProvider: detectCurrentProvider(),
    needsRestart: (dbConfig.provider ?? "pglite") !== detectCurrentProvider(),
  });
}

/**
 * PUT /api/database/config
 * Saves new database configuration. Does NOT restart the agent automatically;
 * the UI prompts the user to restart.
 */
async function handlePutConfig(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const body = JSON.parse(await readBody(req)) as DatabaseConfig;

  // Validate
  if (
    body.provider &&
    body.provider !== "pglite" &&
    body.provider !== "postgres"
  ) {
    errorResponse(
      res,
      `Invalid provider: ${String(body.provider)}. Must be "pglite" or "postgres".`,
    );
    return;
  }

  if (body.provider === "postgres" && body.postgres) {
    const pg = body.postgres;
    if (!pg.connectionString && !pg.host) {
      errorResponse(
        res,
        "Postgres configuration requires either a connectionString or at least a host.",
      );
      return;
    }
  }

  // Load current config, merge database section, save
  const config = loadMilaidyConfig();
  const existingDb = config.database ?? {};

  // Merge: keep existing postgres/pglite sub-configs unless explicitly provided
  const merged: DatabaseConfig = {
    ...existingDb,
    ...body,
  };

  // If switching to postgres, ensure postgres config is present
  if (merged.provider === "postgres" && body.postgres) {
    merged.postgres = { ...existingDb.postgres, ...body.postgres };
  }
  // If switching to pglite, ensure pglite config is present
  if (merged.provider === "pglite" && body.pglite) {
    merged.pglite = { ...existingDb.pglite, ...body.pglite };
  }

  config.database = merged;
  saveMilaidyConfig(config);

  logger.info(
    { src: "database-api", provider: merged.provider },
    "Database configuration saved",
  );

  jsonResponse(res, {
    saved: true,
    config: merged,
    needsRestart: (merged.provider ?? "pglite") !== detectCurrentProvider(),
  });
}

/**
 * POST /api/database/test
 * Tests a Postgres connection without persisting anything.
 * Body: { connectionString?, host?, port?, user?, password?, database?, ssl? }
 */
async function handleTestConnection(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const body = JSON.parse(await readBody(req)) as PostgresCredentials;
  const connectionString = buildConnectionString(body);
  const start = Date.now();

  // Dynamically import pg to avoid hard-coupling (it is a peer dep via plugin-sql)
  let Pool: typeof import("pg").Pool;
  try {
    const pgModule = await import("pg");
    Pool = pgModule.default?.Pool ?? pgModule.Pool;
  } catch {
    errorResponse(
      res,
      "PostgreSQL client library (pg) is not available. Ensure @elizaos/plugin-sql is installed.",
      500,
    );
    return;
  }

  const pool = new Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 5000,
  });

  let client: import("pg").PoolClient | null = null;
  try {
    client = await pool.connect();
    const versionResult = await client.query("SELECT version()");
    const serverVersion = String(versionResult.rows[0]?.version ?? "");
    const durationMs = Date.now() - start;

    jsonResponse(res, {
      success: true,
      serverVersion,
      error: null,
      durationMs,
    } satisfies ConnectionTestResult);
  } catch (err) {
    const durationMs = Date.now() - start;
    const message = err instanceof Error ? err.message : String(err);
    jsonResponse(res, {
      success: false,
      serverVersion: null,
      error: message,
      durationMs,
    } satisfies ConnectionTestResult);
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

/**
 * GET /api/database/tables
 * Lists all user tables with column metadata and approximate row counts.
 */
async function handleGetTables(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  runtime: AgentRuntime,
): Promise<void> {
  // Get all user tables
  const tablesResult = await executeRawSql(
    runtime,
    `SELECT
       t.table_schema AS schema,
       t.table_name AS name,
       COALESCE(s.n_live_tup, 0)::int AS row_count
     FROM information_schema.tables t
     LEFT JOIN pg_stat_user_tables s
       ON s.schemaname = t.table_schema
       AND s.relname = t.table_name
     WHERE t.table_schema NOT IN ('pg_catalog', 'information_schema')
       AND t.table_type = 'BASE TABLE'
     ORDER BY t.table_schema, t.table_name`,
  );

  // Get columns for all tables in one query
  const columnsResult = await executeRawSql(
    runtime,
    `SELECT
       c.table_schema AS schema,
       c.table_name AS table_name,
       c.column_name AS name,
       c.data_type AS type,
       (c.is_nullable = 'YES') AS nullable,
       c.column_default AS default_value,
       COALESCE(
         (SELECT true
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
           AND tc.table_schema = kcu.table_schema
          WHERE tc.constraint_type = 'PRIMARY KEY'
            AND tc.table_schema = c.table_schema
            AND tc.table_name = c.table_name
            AND kcu.column_name = c.column_name),
         false
       ) AS is_primary_key
     FROM information_schema.columns c
     WHERE c.table_schema NOT IN ('pg_catalog', 'information_schema')
     ORDER BY c.table_schema, c.table_name, c.ordinal_position`,
  );

  // Group columns by table
  const columnsByTable = new Map<string, ColumnInfo[]>();
  for (const row of columnsResult.rows) {
    const key = `${String(row.schema)}.${String(row.table_name)}`;
    const cols = columnsByTable.get(key) ?? [];
    cols.push({
      name: String(row.name),
      type: String(row.type),
      nullable: Boolean(row.nullable),
      defaultValue:
        row.default_value != null ? String(row.default_value) : null,
      isPrimaryKey: Boolean(row.is_primary_key),
    });
    columnsByTable.set(key, cols);
  }

  const tables: TableInfo[] = tablesResult.rows.map((row) => {
    const key = `${String(row.schema)}.${String(row.name)}`;
    return {
      name: String(row.name),
      schema: String(row.schema),
      rowCount: Number(row.row_count ?? 0),
      columns: columnsByTable.get(key) ?? [],
    };
  });

  jsonResponse(res, { tables });
}

/**
 * GET /api/database/tables/:table/rows?offset=0&limit=50&sort=col&order=asc&search=term
 * Paginated row retrieval for a specific table.
 */
async function handleGetRows(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  runtime: AgentRuntime,
  tableName: string,
): Promise<void> {
  const url = new URL(
    req.url ?? "/",
    `http://${req.headers.host ?? "localhost"}`,
  );
  const offset = Math.max(
    0,
    Number(url.searchParams.get("offset") ?? "0"),
  );
  const limit = Math.min(
    500,
    Math.max(1, Number(url.searchParams.get("limit") ?? "50")),
  );
  const sortCol = url.searchParams.get("sort") ?? "";
  const sortOrder =
    url.searchParams.get("order") === "desc" ? "DESC" : "ASC";
  const search = url.searchParams.get("search") ?? "";

  if (!(await assertTableExists(runtime, tableName))) {
    errorResponse(res, `Table "${tableName}" not found`, 404);
    return;
  }

  // Get column names for this table (for search and sort validation)
  const safeTableName = tableName.replace(/'/g, "''");
  const colResult = await executeRawSql(
    runtime,
    `SELECT column_name, data_type
     FROM information_schema.columns
     WHERE table_name = '${safeTableName}'
       AND table_schema NOT IN ('pg_catalog', 'information_schema')
     ORDER BY ordinal_position`,
  );
  const columnNames = colResult.rows.map((r) => String(r.column_name));
  const columnTypes = new Map(
    colResult.rows.map((r) => [
      String(r.column_name),
      String(r.data_type),
    ]),
  );

  // Validate sort column
  const validSort =
    sortCol && columnNames.includes(sortCol) ? sortCol : "";

  // Build search clause: search across all text-castable columns
  let whereClause = "";
  if (search.trim()) {
    const escapedSearch = search
      .replace(/'/g, "''")
      .replace(/%/g, "\\%")
      .replace(/_/g, "\\_");
    const textColumns = columnNames.filter((col) => {
      const t = columnTypes.get(col) ?? "";
      return (
        t.includes("char") ||
        t.includes("text") ||
        t === "uuid" ||
        t === "jsonb" ||
        t === "json" ||
        t === "integer" ||
        t === "bigint" ||
        t === "numeric" ||
        t === "timestamp" ||
        t.includes("timestamp")
      );
    });
    if (textColumns.length > 0) {
      const conditions = textColumns.map(
        (col) => `${quoteIdent(col)}::text ILIKE '%${escapedSearch}%' ESCAPE '\'`,
      );
      whereClause = `WHERE (${conditions.join(" OR ")})`;
    }
  }

  // Count total (with search filter)
  const countResult = await executeRawSql(
    runtime,
    `SELECT count(*)::int AS total FROM ${quoteIdent(tableName)} ${whereClause}`,
  );
  const total = Number(
    (countResult.rows[0] as Record<string, unknown>)?.total ?? 0,
  );

  // Fetch rows
  const orderClause = validSort
    ? `ORDER BY ${quoteIdent(validSort)} ${sortOrder}`
    : "";
  const query = `SELECT * FROM ${quoteIdent(tableName)} ${whereClause} ${orderClause} LIMIT ${limit} OFFSET ${offset}`;

  const result = await executeRawSql(runtime, query);

  jsonResponse(res, {
    table: tableName,
    rows: result.rows,
    columns: result.columns,
    total,
    offset,
    limit,
  });
}

/**
 * POST /api/database/tables/:table/rows
 * Insert a new row. Body: { data: Record<string, unknown> }
 */
async function handleInsertRow(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  runtime: AgentRuntime,
  tableName: string,
): Promise<void> {
  const body = JSON.parse(await readBody(req)) as {
    data: Record<string, unknown>;
  };

  if (
    !body.data ||
    typeof body.data !== "object" ||
    Object.keys(body.data).length === 0
  ) {
    errorResponse(
      res,
      "Request body must include a non-empty 'data' object.",
    );
    return;
  }

  if (!(await assertTableExists(runtime, tableName))) {
    errorResponse(res, `Table "${tableName}" not found`, 404);
    return;
  }

  const columns = Object.keys(body.data);
  const values = Object.values(body.data);
  const colList = columns.map((c) => quoteIdent(c)).join(", ");
  const valList = values.map(sqlLiteral).join(", ");

  const result = await executeRawSql(
    runtime,
    `INSERT INTO ${quoteIdent(tableName)} (${colList}) VALUES (${valList}) RETURNING *`,
  );

  jsonResponse(res, { inserted: true, row: result.rows[0] ?? null }, 201);
}

/**
 * PUT /api/database/tables/:table/rows
 * Update a row. Body: { where: Record<string, unknown>, data: Record<string, unknown> }
 */
async function handleUpdateRow(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  runtime: AgentRuntime,
  tableName: string,
): Promise<void> {
  const body = JSON.parse(await readBody(req)) as {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  };

  if (!body.where || Object.keys(body.where).length === 0) {
    errorResponse(
      res,
      "Request body must include a non-empty 'where' object for row identification.",
    );
    return;
  }
  if (!body.data || Object.keys(body.data).length === 0) {
    errorResponse(
      res,
      "Request body must include a non-empty 'data' object with fields to update.",
    );
    return;
  }

  const setClauses = Object.entries(body.data).map(([col, val]) => sqlAssign(col, val));
  const whereClauses = Object.entries(body.where).map(([col, val]) => sqlPredicate(col, val));

  const result = await executeRawSql(
    runtime,
    `UPDATE ${quoteIdent(tableName)}
        SET ${setClauses.join(", ")}
      WHERE ${whereClauses.join(" AND ")}
      RETURNING *`,
  );

  if (result.rows.length === 0) {
    errorResponse(res, "No matching row found to update.", 404);
    return;
  }

  jsonResponse(res, { updated: true, row: result.rows[0] });
}

/**
 * DELETE /api/database/tables/:table/rows
 * Delete a row. Body: { where: Record<string, unknown> }
 */
async function handleDeleteRow(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  runtime: AgentRuntime,
  tableName: string,
): Promise<void> {
  const body = JSON.parse(await readBody(req)) as {
    where: Record<string, unknown>;
  };

  if (!body.where || Object.keys(body.where).length === 0) {
    errorResponse(
      res,
      "Request body must include a non-empty 'where' object for row identification.",
    );
    return;
  }

  const whereClauses = Object.entries(body.where).map(([col, val]) => sqlPredicate(col, val));

  const result = await executeRawSql(
    runtime,
    `DELETE FROM ${quoteIdent(tableName)}
      WHERE ${whereClauses.join(" AND ")}
      RETURNING *`,
  );

  if (result.rows.length === 0) {
    errorResponse(res, "No matching row found to delete.", 404);
    return;
  }

  jsonResponse(res, { deleted: true, row: result.rows[0] });
}

/**
 * POST /api/database/query
 * Execute a raw SQL query. Body: { sql: string, readOnly?: boolean }
 */
async function handleQuery(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  runtime: AgentRuntime,
): Promise<void> {
  const body = JSON.parse(await readBody(req)) as {
    sql: string;
    readOnly?: boolean;
  };

  if (
    !body.sql ||
    typeof body.sql !== "string" ||
    body.sql.trim().length === 0
  ) {
    errorResponse(
      res,
      "Request body must include a non-empty 'sql' string.",
    );
    return;
  }

  const sqlText = body.sql.trim();

  // If readOnly mode, reject mutation statements.
  // Strip SQL comments and check the leading keyword after normalization.
  // Also reject multi-statement queries (semicolons outside quotes).
  if (body.readOnly !== false) {
    // Strip block comments (/* ... */) and line comments (-- ...)
    const stripped = sqlText
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/--.*$/gm, " ")
      .trim();
    const firstWord = stripped.split(/\s+/)[0].toUpperCase();
    const mutationKeywords = new Set([
      "INSERT", "UPDATE", "DELETE", "DROP", "ALTER",
      "TRUNCATE", "CREATE", "GRANT", "REVOKE",
    ]);
    if (mutationKeywords.has(firstWord)) {
      errorResponse(
        res,
        `Query rejected: "${firstWord}" is a mutation statement. Set readOnly: false to execute mutations.`,
      );
      return;
    }
    // Reject multi-statement queries (naive: any semicolon not at the very end)
    const trimmedForSemicolon = stripped.replace(/;\s*$/, "");
    if (trimmedForSemicolon.includes(";")) {
      errorResponse(
        res,
        "Query rejected: multi-statement queries are not allowed in read-only mode.",
      );
      return;
    }
  }

  const start = Date.now();
  const result = await executeRawSql(runtime, sqlText);
  const durationMs = Date.now() - start;

  const queryResult: QueryResult = {
    columns: result.columns,
    rows: result.rows,
    rowCount: result.rows.length,
    durationMs,
  };

  jsonResponse(res, queryResult);
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

/**
 * Route a database API request. Returns true if handled, false if not matched.
 *
 * Expected URL patterns:
 *   GET    /api/database/status
 *   GET    /api/database/config
 *   PUT    /api/database/config
 *   POST   /api/database/test
 *   GET    /api/database/tables
 *   GET    /api/database/tables/:table/rows
 *   POST   /api/database/tables/:table/rows
 *   PUT    /api/database/tables/:table/rows
 *   DELETE /api/database/tables/:table/rows
 *   POST   /api/database/query
 */
export async function handleDatabaseRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  runtime: AgentRuntime | null,
  pathname: string,
): Promise<boolean> {
  const method = req.method ?? "GET";

  // ── GET /api/database/status ──────────────────────────────────────────
  if (method === "GET" && pathname === "/api/database/status") {
    await handleGetStatus(req, res, runtime);
    return true;
  }

  // ── GET /api/database/config ──────────────────────────────────────────
  if (method === "GET" && pathname === "/api/database/config") {
    handleGetConfig(req, res);
    return true;
  }

  // ── PUT /api/database/config ──────────────────────────────────────────
  if (method === "PUT" && pathname === "/api/database/config") {
    await handlePutConfig(req, res);
    return true;
  }

  // ── POST /api/database/test ───────────────────────────────────────────
  if (method === "POST" && pathname === "/api/database/test") {
    await handleTestConnection(req, res);
    return true;
  }

  // Routes below require a live runtime with a database adapter
  if (!runtime?.adapter) {
    errorResponse(
      res,
      "Database not available. The agent may not be running or the database adapter is not initialized.",
      503,
    );
    return true;
  }

  // ── GET /api/database/tables ──────────────────────────────────────────
  if (method === "GET" && pathname === "/api/database/tables") {
    await handleGetTables(req, res, runtime);
    return true;
  }

  // ── POST /api/database/query ──────────────────────────────────────────
  if (method === "POST" && pathname === "/api/database/query") {
    await handleQuery(req, res, runtime);
    return true;
  }

  // ── Table row operations: /api/database/tables/:table/rows ────────────
  const rowsMatch = pathname.match(
    /^\/api\/database\/tables\/([^/]+)\/rows$/,
  );
  if (rowsMatch) {
    const tableNameDecoded = decodeURIComponent(rowsMatch[1]);

    if (method === "GET") {
      await handleGetRows(req, res, runtime, tableNameDecoded);
      return true;
    }
    if (method === "POST") {
      await handleInsertRow(req, res, runtime, tableNameDecoded);
      return true;
    }
    if (method === "PUT") {
      await handleUpdateRow(req, res, runtime, tableNameDecoded);
      return true;
    }
    if (method === "DELETE") {
      await handleDeleteRow(req, res, runtime, tableNameDecoded);
      return true;
    }
  }

  return false;
}
