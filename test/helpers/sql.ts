/**
 * Shared SQL parsing helpers for trajectory/database tests.
 *
 * These utilities parse raw SQL query objects from the in-memory database
 * adapter, enabling tests to inspect query structure without coupling to
 * the adapter's internal representation.
 */

export type RawSqlQuery = {
  queryChunks?: Array<{
    value?: string[];
  }>;
};

/** Extract the raw SQL text from a query chunk array. */
export function sqlText(query: RawSqlQuery): string {
  const chunks = query.queryChunks ?? [];
  return chunks
    .map((chunk) => (Array.isArray(chunk.value) ? chunk.value.join("") : ""))
    .join("")
    .trim();
}

/** Split a SQL VALUES tuple into individual value tokens, respecting string escaping. */
export function splitSqlTuple(valueList: string): string[] {
  const values: string[] = [];
  let current = "";
  let inString = false;
  for (let i = 0; i < valueList.length; i += 1) {
    const char = valueList[i];
    if (char === "'") {
      current += char;
      if (inString && valueList[i + 1] === "'") {
        current += "'";
        i += 1;
        continue;
      }
      inString = !inString;
      continue;
    }
    if (char === "," && !inString) {
      values.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim().length > 0) values.push(current.trim());
  return values;
}

/** Parse a SQL scalar token into a typed value. */
export function parseSqlScalar(token: string): string | number | null {
  if (token.toUpperCase() === "NULL") return null;
  if (token.startsWith("'") && token.endsWith("'")) {
    return token.slice(1, -1).replace(/''/g, "'");
  }
  const asNumber = Number(token);
  return Number.isFinite(asNumber) ? asNumber : token;
}
