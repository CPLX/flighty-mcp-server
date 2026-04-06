import Database from "better-sqlite3";
import { execSync } from "child_process";
import {
  AUTH_DB_PATH,
  PREFS_PLIST_PATH,
  FLIGHTY_API_BASE,
  FLIGHTY_USER_AGENT,
  FLIGHTY_BUILD_TOKEN,
} from "../constants.js";

// --- Protobuf encoding helpers ---
// These construct tiny, well-understood protobuf messages without a library dependency.

function encodeVarint(value: number): Buffer {
  const bytes: number[] = [];
  while (value > 0x7f) {
    bytes.push(0x80 | (value & 0x7f));
    value >>>= 7;
  }
  bytes.push(value & 0x7f);
  return Buffer.from(bytes);
}

function encodeStringField(fieldNum: number, value: string): Buffer {
  const tag = encodeVarint((fieldNum << 3) | 2);
  const data = Buffer.from(value, "utf-8");
  const len = encodeVarint(data.length);
  return Buffer.concat([tag, len, data]);
}

function encodeVarintField(fieldNum: number, value: number): Buffer {
  const tag = encodeVarint((fieldNum << 3) | 0);
  return Buffer.concat([tag, encodeVarint(value)]);
}

function encodeMessageField(fieldNum: number, data: Buffer): Buffer {
  const tag = encodeVarint((fieldNum << 3) | 2);
  const len = encodeVarint(data.length);
  return Buffer.concat([tag, len, data]);
}

// --- API Client ---

export class FlightyApi {
  private jwt: string | null = null;

  private getJwt(): string {
    if (this.jwt) return this.jwt;

    const db = new Database(AUTH_DB_PATH, {
      readonly: true,
      fileMustExist: true,
    });
    try {
      const row = db
        .prepare("SELECT ZTOKEN FROM ZUSER LIMIT 1")
        .get() as { ZTOKEN: string } | undefined;
      if (!row?.ZTOKEN) {
        throw new Error(
          "Could not read Flighty auth token from Flighty.sqlite. Is the Flighty app installed and logged in?"
        );
      }
      this.jwt = row.ZTOKEN;
      return this.jwt;
    } finally {
      db.close();
    }
  }

  private getHeaders(): Record<string, string> {
    if (!FLIGHTY_BUILD_TOKEN) {
      throw new Error(
        "Could not read Flighty build token. Is the Flighty app installed at /Applications/Flighty.app?"
      );
    }
    return {
      Authorization: `Bearer ${this.getJwt()}`,
      "x-flighty-build-token": FLIGHTY_BUILD_TOKEN,
      "Content-Type": "application/x-protobuf",
      Accept: "application/x-protobuf",
      "user-agent": FLIGHTY_USER_AGENT,
      "x-flighty-locale": "en_US",
    };
  }

  /**
   * Search for a flight by airline UUID, flight number, and date.
   * Returns the server-side flight UUID, or null if not found.
   */
  async searchFlight(
    airlineUuid: string,
    flightNumber: string,
    date: string
  ): Promise<string | null> {
    // Build protobuf: { 1: { 1: airlineUuid, 2: flightNumber }, 3: date, 4: "FLIGHT_NUMBER" }
    const innerMsg = Buffer.concat([
      encodeStringField(1, airlineUuid),
      encodeStringField(2, flightNumber),
    ]);
    const body = Buffer.concat([
      encodeMessageField(1, innerMsg),
      encodeStringField(3, date),
      encodeStringField(4, "FLIGHT_NUMBER"),
    ]);

    const resp = await fetch(`${FLIGHTY_API_BASE}/v1/search`, {
      method: "POST",
      headers: this.getHeaders(),
      body,
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Flighty search failed (${resp.status}): ${text}`);
    }

    const data = Buffer.from(await resp.arrayBuffer());
    return this.extractFlightUuid(data);
  }

  /**
   * Subscribe to a flight — adds it to the user's account and triggers cross-device sync.
   */
  async subscribeFlight(serverFlightUuid: string): Promise<void> {
    const resp = await fetch(
      `${FLIGHTY_API_BASE}/v1/flight/${serverFlightUuid}/subscribe?is_passenger=true&source`,
      {
        method: "POST",
        headers: {
          ...this.getHeaders(),
          "content-length": "0",
        },
      }
    );

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(
        `Flighty subscribe failed (${resp.status}): ${text}`
      );
    }
  }

  /**
   * Delete a flight from the user's account via sync/full.
   */
  async deleteFlight(flightUuid: string): Promise<void> {
    const syncUrl = this.readSyncTokenUrl();
    if (!syncUrl) {
      throw new Error(
        "Could not read Flighty sync token. Is the Flighty app installed?"
      );
    }

    // Build protobuf: { 1: { 1: { 1: timestamp, 2: seqId }, 11: { 1: flightUuid } } }
    const tsMsg = Buffer.concat([
      encodeVarintField(1, Math.floor(Date.now() / 1000)),
      encodeVarintField(2, Math.floor(Math.random() * 1000000000)),
    ]);
    const delMsg = encodeStringField(1, flightUuid);
    const entryMsg = Buffer.concat([
      encodeMessageField(1, tsMsg),
      encodeMessageField(11, delMsg),
    ]);
    const body = encodeMessageField(1, entryMsg);

    const url = syncUrl.includes("?")
      ? `${syncUrl}&fast_flight_sync=true`
      : `${syncUrl}?fast_flight_sync=true`;

    const resp = await fetch(url, {
      method: "POST",
      headers: this.getHeaders(),
      body,
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Flighty delete failed (${resp.status}): ${text}`);
    }
  }

  /**
   * Read the sync token URL from Flighty's UserDefaults plist.
   */
  private readSyncTokenUrl(): string | null {
    try {
      const raw = execSync(
        `plutil -extract syncInfoV2 raw "${PREFS_PLIST_PATH}"`,
        { encoding: "utf-8" }
      ).trim();

      const decoded = Buffer.from(raw, "base64").toString("utf-8");
      const obj = JSON.parse(decoded) as {
        full?: { nextURL?: string };
      };
      return obj.full?.nextURL ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Extract the flight UUID from a search response protobuf.
   * The UUID is at response.2.1.1 — a string field nested 3 levels deep.
   */
  private extractFlightUuid(data: Buffer): string | null {
    // Look for UUID pattern in the response bytes.
    // UUIDs are 36 bytes: 8-4-4-4-12 hex characters with dashes.
    const str = data.toString("utf-8");
    const match = str.match(
      /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/
    );
    return match ? match[1] : null;
  }
}

/**
 * Parse a flight code like "UA194" into { airlineIata: "UA", flightNumber: "194" }.
 */
export function parseFlightCode(flightCode: string): {
  airlineIata: string;
  flightNumber: string;
} {
  const code = flightCode.trim().toUpperCase().replace(/[-\s]/g, "");
  const m = code.match(/^([A-Z]{2}|\d[A-Z]|[A-Z]\d)(\d+)$/);
  if (!m) {
    throw new Error(
      `Invalid flight code '${flightCode}'. Expected format like 'UA194' or 'BA930'.`
    );
  }
  return { airlineIata: m[1], flightNumber: m[2] };
}
