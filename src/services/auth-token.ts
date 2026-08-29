import { DatabaseSync as Database } from "node:sqlite";
import { AUTH_DB_PATH, MAIN_DB_PATH } from "../constants.js";

function readToken(dbPath: string, sql: string): string | null {
  let db: InstanceType<typeof Database> | undefined;
  try {
    db = new Database(dbPath, { readOnly: true });
    const row = db.prepare(sql).get() as { token?: string } | undefined;
    return row?.token ?? null;
  } catch {
    // Missing file, missing table, or schema drift. Try the next candidate.
    return null;
  } finally {
    db?.close();
  }
}

export function readFlightyAuthToken(
  mainDbPath: string = MAIN_DB_PATH,
  legacyDbPath: string = AUTH_DB_PATH
): string | null {
  return (
    readToken(
      mainDbPath,
      "SELECT authToken AS token FROM Account WHERE authToken IS NOT NULL AND authToken != '' LIMIT 1"
    ) ??
    readToken(
      legacyDbPath,
      "SELECT ZTOKEN AS token FROM ZUSER WHERE ZTOKEN IS NOT NULL AND ZTOKEN != '' LIMIT 1"
    )
  );
}

export function readJwtSubject(token: string): string | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const decoded = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf-8")
    ) as { sub?: unknown };
    return typeof decoded.sub === "string" && decoded.sub
      ? decoded.sub
      : null;
  } catch {
    return null;
  }
}
