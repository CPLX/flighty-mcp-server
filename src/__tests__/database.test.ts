import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmdirSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync as Database } from "node:sqlite";
import { FlightyDatabase } from "../services/database.js";

function createJwt(subject: string): string {
  const payload = Buffer.from(JSON.stringify({ sub: subject })).toString(
    "base64url"
  );
  return `header.${payload}.signature`;
}

function withDatabases(
  callback: (mainPath: string, legacyPath: string, db: Database) => void
): void {
  const directory = mkdtempSync(join(tmpdir(), "flighty-database-test-"));
  const mainPath = join(directory, "MainFlightyDatabase.db");
  const legacyPath = join(directory, "Flighty.sqlite");
  const db = new Database(mainPath);
  db.exec(`
    CREATE TABLE Account (authToken TEXT);
    CREATE TABLE UserFlight (userId TEXT, deleted INTEGER);
    CREATE TABLE UserManualFlight (userId TEXT, deleted INTEGER);
    CREATE TABLE Airline (id TEXT, name TEXT, iata TEXT, deleted INTEGER);
    CREATE TABLE Flight (id TEXT, airlineId TEXT, deleted INTEGER);
    CREATE TABLE ManualFlight (id TEXT, airlineId TEXT, deleted INTEGER);
  `);
  const legacyDb = new Database(legacyPath);
  legacyDb.exec("CREATE TABLE ZUSER (ZTOKEN TEXT)");
  legacyDb.close();

  try {
    callback(mainPath, legacyPath, db);
  } finally {
    db.close();
    unlinkSync(mainPath);
    unlinkSync(legacyPath);
    rmdirSync(directory);
  }
}

function resolveOwnerId(
  database: FlightyDatabase,
  db: Database
): string {
  return (
    database as unknown as {
      getOwnerUserId(database: Database): string;
    }
  ).getOwnerUserId(db);
}

describe("FlightyDatabase owner resolution", () => {
  it("uses the main-database JWT before the frequency fallback", () => {
    withDatabases((mainPath, legacyPath, db) => {
      db.prepare("INSERT INTO Account (authToken) VALUES (?)").run(
        createJwt("signed-in-owner")
      );
      db.prepare("INSERT INTO UserFlight (userId) VALUES (?)").run(
        "signed-in-owner"
      );
      for (let index = 0; index < 3; index += 1) {
        db.prepare("INSERT INTO UserFlight (userId) VALUES (?)").run(
          "more-frequent-owner"
        );
      }

      assert.equal(
        resolveOwnerId(new FlightyDatabase(mainPath, legacyPath), db),
        "signed-in-owner"
      );
    });
  });

  it("falls back to the legacy JWT", () => {
    withDatabases((mainPath, legacyPath, db) => {
      const legacyDb = new Database(legacyPath);
      legacyDb.prepare("INSERT INTO ZUSER (ZTOKEN) VALUES (?)").run(
        createJwt("legacy-owner")
      );
      legacyDb.close();
      db.prepare("INSERT INTO UserFlight (userId) VALUES (?)").run(
        "legacy-owner"
      );

      assert.equal(
        resolveOwnerId(new FlightyDatabase(mainPath, legacyPath), db),
        "legacy-owner"
      );
    });
  });
});

describe("FlightyDatabase.lookupAirlines", () => {
  it("returns every matching airline ordered by local flight frequency", () => {
    withDatabases((mainPath, legacyPath, db) => {
      const insertAirline = db.prepare(
        "INSERT INTO Airline (id, name, iata) VALUES (?, ?, ?)"
      );
      insertAirline.run("first", "First Airline", "ZZ");
      insertAirline.run("second", "Second Airline", "ZZ");
      db.prepare("INSERT INTO Flight (id, airlineId) VALUES (?, ?)").run(
        "commercial-flight",
        "second"
      );
      db.prepare("INSERT INTO ManualFlight (id, airlineId) VALUES (?, ?)").run(
        "manual-flight",
        "second"
      );

      assert.deepEqual(
        new FlightyDatabase(mainPath, legacyPath).lookupAirlines("zz"),
        [
          { id: "second", name: "Second Airline", iata: "ZZ" },
          { id: "first", name: "First Airline", iata: "ZZ" },
        ]
      );
    });
  });
});
