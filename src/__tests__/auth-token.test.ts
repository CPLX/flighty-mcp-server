import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmdirSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync as Database } from "node:sqlite";
import {
  readFlightyAuthToken,
  readJwtSubject,
} from "../services/auth-token.js";

function createJwt(subject: string): string {
  const payload = Buffer.from(JSON.stringify({ sub: subject })).toString(
    "base64url"
  );
  return `header.${payload}.signature`;
}

function withTokenDatabases(
  mainToken: string | null,
  legacyToken: string | null,
  callback: (mainPath: string, legacyPath: string) => void
): void {
  const directory = mkdtempSync(join(tmpdir(), "flighty-auth-test-"));
  const mainPath = join(directory, "MainFlightyDatabase.db");
  const legacyPath = join(directory, "Flighty.sqlite");

  const mainDb = new Database(mainPath);
  mainDb.exec("CREATE TABLE Account (authToken TEXT)");
  if (mainToken) {
    mainDb.prepare("INSERT INTO Account (authToken) VALUES (?)").run(mainToken);
  }
  mainDb.close();

  const legacyDb = new Database(legacyPath);
  legacyDb.exec("CREATE TABLE ZUSER (ZTOKEN TEXT)");
  if (legacyToken) {
    legacyDb.prepare("INSERT INTO ZUSER (ZTOKEN) VALUES (?)").run(legacyToken);
  }
  legacyDb.close();

  try {
    callback(mainPath, legacyPath);
  } finally {
    unlinkSync(mainPath);
    unlinkSync(legacyPath);
    rmdirSync(directory);
  }
}

describe("readFlightyAuthToken", () => {
  it("prefers the current main-database token", () => {
    withTokenDatabases("current-token", "legacy-token", (main, legacy) => {
      assert.equal(readFlightyAuthToken(main, legacy), "current-token");
    });
  });

  it("falls back to the legacy token", () => {
    withTokenDatabases(null, "legacy-token", (main, legacy) => {
      assert.equal(readFlightyAuthToken(main, legacy), "legacy-token");
    });
  });

  it("returns null when neither schema is readable", () => {
    assert.equal(
      readFlightyAuthToken("/missing/main.db", "/missing/legacy.db"),
      null
    );
  });
});

describe("readJwtSubject", () => {
  it("extracts the owner ID from a JWT", () => {
    assert.equal(readJwtSubject(createJwt("owner-user-id")), "owner-user-id");
  });

  it("returns null for malformed tokens", () => {
    assert.equal(readJwtSubject("not-a-jwt"), null);
  });
});
