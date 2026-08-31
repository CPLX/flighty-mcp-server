import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmdirSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync as Database } from "node:sqlite";
import { readFlightySyncUrl } from "../services/sync-token.js";

function withSyncDatabase(
  rows: Array<{ nextURL: string | null; lastSync: number }>,
  callback: (dbPath: string) => void
): void {
  const directory = mkdtempSync(join(tmpdir(), "flighty-sync-test-"));
  const dbPath = join(directory, "MainFlightyDatabase.db");
  const db = new Database(dbPath);
  db.exec("CREATE TABLE SyncInfo (nextURL TEXT, lastSync INTEGER)");
  const insert = db.prepare(
    "INSERT INTO SyncInfo (nextURL, lastSync) VALUES (?, ?)"
  );
  for (const row of rows) insert.run(row.nextURL, row.lastSync);
  db.close();

  try {
    callback(dbPath);
  } finally {
    unlinkSync(dbPath);
    rmdirSync(directory);
  }
}

describe("readFlightySyncUrl", () => {
  it("reads the newest current-database sync URL", () => {
    withSyncDatabase(
      [
        { nextURL: "https://sync.example/old", lastSync: 1 },
        { nextURL: "https://sync.example/new", lastSync: 2 },
      ],
      (dbPath) => {
        assert.equal(
          readFlightySyncUrl(dbPath, () => "https://sync.example/legacy"),
          "https://sync.example/new"
        );
      }
    );
  });

  it("falls back to the legacy reader", () => {
    assert.equal(
      readFlightySyncUrl("/missing/main.db", () => "legacy-sync-url"),
      "legacy-sync-url"
    );
  });

  it("returns null when neither source has a URL", () => {
    withSyncDatabase([], (dbPath) => {
      assert.equal(readFlightySyncUrl(dbPath, () => null), null);
    });
  });
});
