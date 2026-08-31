import { execSync } from "node:child_process";
import { DatabaseSync as Database } from "node:sqlite";
import { MAIN_DB_PATH, PREFS_PLIST_PATH } from "../constants.js";

function readSyncUrlFromDatabase(dbPath: string): string | null {
  let db: InstanceType<typeof Database> | undefined;
  try {
    db = new Database(dbPath, { readOnly: true });
    const row = db
      .prepare(
        "SELECT nextURL FROM SyncInfo WHERE nextURL IS NOT NULL AND nextURL != '' ORDER BY lastSync DESC LIMIT 1"
      )
      .get() as { nextURL?: string } | undefined;
    return row?.nextURL ?? null;
  } catch {
    return null;
  } finally {
    db?.close();
  }
}

function readLegacySyncUrl(): string | null {
  try {
    const raw = execSync(
      `plutil -extract syncInfoV2 raw "${PREFS_PLIST_PATH}"`,
      { encoding: "utf-8" }
    ).trim();
    const decoded = Buffer.from(raw, "base64").toString("utf-8");
    const value = JSON.parse(decoded) as { full?: { nextURL?: string } };
    return value.full?.nextURL ?? null;
  } catch {
    return null;
  }
}

export function readFlightySyncUrl(
  mainDbPath: string = MAIN_DB_PATH,
  legacyReader: () => string | null = readLegacySyncUrl
): string | null {
  return readSyncUrlFromDatabase(mainDbPath) ?? legacyReader();
}
