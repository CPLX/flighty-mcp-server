import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerWriteTools } from "../tools/write.js";
import { parseFlightCode } from "../services/flighty-api.js";
import type { FlightyDatabase } from "../services/database.js";
import type { FlightyApi } from "../services/flighty-api.js";

type ToolResult = {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
};
type ToolHandler = (params: Record<string, string>) => Promise<ToolResult>;

function captureTools(
  db: Partial<FlightyDatabase>,
  api: Partial<FlightyApi>
): Map<string, ToolHandler> {
  const tools = new Map<string, ToolHandler>();
  const mockServer = {
    registerTool(_name: string, _schema: unknown, handler: ToolHandler) {
      tools.set(_name, handler);
    },
  } as unknown as McpServer;
  registerWriteTools(mockServer, db as FlightyDatabase, api as FlightyApi);
  return tools;
}

describe("parseFlightCode", () => {
  it("parses standard two-letter IATA prefix", () => {
    assert.deepEqual(parseFlightCode("UA194"), {
      airlineIata: "UA",
      flightNumber: "194",
    });
  });

  it("parses lowercase input", () => {
    assert.deepEqual(parseFlightCode("ba930"), {
      airlineIata: "BA",
      flightNumber: "930",
    });
  });

  it("strips spaces", () => {
    assert.deepEqual(parseFlightCode("DL 10"), {
      airlineIata: "DL",
      flightNumber: "10",
    });
  });

  it("strips hyphens", () => {
    assert.deepEqual(parseFlightCode("UA-194"), {
      airlineIata: "UA",
      flightNumber: "194",
    });
  });

  it("throws on invalid code", () => {
    assert.throws(
      () => parseFlightCode("INVALID"),
      /Invalid flight code/
    );
  });

  it("throws on number-only code", () => {
    assert.throws(
      () => parseFlightCode("194"),
      /Invalid flight code/
    );
  });
});

describe("flighty_follow_flight", () => {
  it("follows a flight successfully", async () => {
    const mockDb = {
      lookupAirlines: () => [{
        id: "airline-uuid",
        name: "United Airlines",
        iata: "UA",
      }],
    };
    const followFlight = mock.fn(async () => {});
    const mockApi = {
      searchFlight: async () => "flight-server-uuid",
      followFlight,
    };

    const tools = captureTools(mockDb, mockApi);
    const handler = tools.get("flighty_follow_flight")!;
    const result = await handler({ flight_code: "UA194", date: "2026-06-15" });

    assert.equal(result.isError, undefined);
    const body = JSON.parse(result.content[0].text);
    assert.equal(body.status, "followed");
    assert.equal(body.server_flight_uuid, "flight-server-uuid");
    assert.equal(body.airline, "United Airlines");
    assert.equal(body.flight_code, "UA194");
    assert.equal(followFlight.mock.calls.length, 1);
    assert.equal(followFlight.mock.calls[0].arguments[0], "flight-server-uuid");
  });

  it("returns error when flight not found", async () => {
    const mockDb = {
      lookupAirlines: () => [{
        id: "airline-uuid",
        name: "United Airlines",
        iata: "UA",
      }],
    };
    const followFlight = mock.fn(async () => {});
    const mockApi = {
      searchFlight: async () => null,
      followFlight,
    };

    const tools = captureTools(mockDb, mockApi);
    const handler = tools.get("flighty_follow_flight")!;
    const result = await handler({ flight_code: "UA999", date: "2026-06-15" });

    assert.equal(result.isError, true);
    assert.ok(result.content[0].text.includes("No flight found"));
    assert.equal(followFlight.mock.calls.length, 0);
  });

  it("returns error on invalid flight code", async () => {
    const mockDb = { lookupAirlines: mock.fn() };
    const mockApi = { searchFlight: mock.fn(), followFlight: mock.fn() };

    const tools = captureTools(mockDb, mockApi);
    const handler = tools.get("flighty_follow_flight")!;
    const result = await handler({ flight_code: "INVALID", date: "2026-06-15" });

    assert.equal(result.isError, true);
    assert.ok(result.content[0].text.includes("Error following flight"));
  });

  it("returns error when API throws", async () => {
    const mockDb = {
      lookupAirlines: () => [{
        id: "airline-uuid",
        name: "United Airlines",
        iata: "UA",
      }],
    };
    const mockApi = {
      searchFlight: async () => "flight-uuid",
      followFlight: async () => {
        throw new Error("Network error");
      },
    };

    const tools = captureTools(mockDb, mockApi);
    const handler = tools.get("flighty_follow_flight")!;
    const result = await handler({ flight_code: "UA194", date: "2026-06-15" });

    assert.equal(result.isError, true);
    assert.ok(result.content[0].text.includes("Network error"));
  });

  it("tries each airline that shares an IATA code", async () => {
    const mockDb = {
      lookupAirlines: () => [
        { id: "first-airline", name: "First Airline", iata: "ZZ" },
        { id: "second-airline", name: "Second Airline", iata: "ZZ" },
      ],
    };
    const searchFlight = mock.fn(async (airlineId: string) =>
      airlineId === "second-airline" ? "flight-server-uuid" : null
    );
    const followFlight = mock.fn(async () => {});

    const tools = captureTools(mockDb, { searchFlight, followFlight });
    const result = await tools.get("flighty_follow_flight")!({
      flight_code: "ZZ42",
      date: "2026-06-15",
    });

    assert.equal(result.isError, undefined);
    assert.equal(searchFlight.mock.calls.length, 2);
    assert.equal(searchFlight.mock.calls[0].arguments[0], "first-airline");
    assert.equal(searchFlight.mock.calls[1].arguments[0], "second-airline");
    assert.equal(followFlight.mock.calls.length, 1);
    assert.equal(JSON.parse(result.content[0].text).airline, "Second Airline");
  });
});

describe("flighty_add_flight", () => {
  it("adds a flight successfully", async () => {
    const mockDb = {
      lookupAirlines: () => [{
        id: "airline-uuid",
        name: "Delta Air Lines",
        iata: "DL",
      }],
    };
    const subscribeFlight = mock.fn(async () => {});
    const mockApi = {
      searchFlight: async () => "flight-uuid-123",
      subscribeFlight,
    };

    const tools = captureTools(mockDb, mockApi);
    const handler = tools.get("flighty_add_flight")!;
    const result = await handler({ flight_code: "DL10", date: "2026-07-01" });

    assert.equal(result.isError, undefined);
    const body = JSON.parse(result.content[0].text);
    assert.equal(body.status, "added");
    assert.equal(body.server_flight_uuid, "flight-uuid-123");
    assert.equal(body.airline, "Delta Air Lines");
    assert.equal(subscribeFlight.mock.calls.length, 1);
    assert.equal(
      subscribeFlight.mock.calls[0].arguments[0],
      "flight-uuid-123"
    );
  });

  it("returns error when flight not found", async () => {
    const mockDb = {
      lookupAirlines: () => [{
        id: "airline-uuid",
        name: "Delta Air Lines",
        iata: "DL",
      }],
    };
    const subscribeFlight = mock.fn(async () => {});
    const mockApi = {
      searchFlight: async () => null,
      subscribeFlight,
    };

    const tools = captureTools(mockDb, mockApi);
    const handler = tools.get("flighty_add_flight")!;
    const result = await handler({ flight_code: "DL999", date: "2026-07-01" });

    assert.equal(result.isError, true);
    assert.ok(result.content[0].text.includes("No flight found"));
    assert.equal(subscribeFlight.mock.calls.length, 0);
  });

  it("tries each airline that shares an IATA code", async () => {
    const mockDb = {
      lookupAirlines: () => [
        { id: "first-airline", name: "First Airline", iata: "ZZ" },
        { id: "second-airline", name: "Second Airline", iata: "ZZ" },
      ],
    };
    const searchFlight = mock.fn(async (airlineId: string) =>
      airlineId === "second-airline" ? "flight-uuid-123" : null
    );
    const subscribeFlight = mock.fn(async () => {});

    const tools = captureTools(mockDb, { searchFlight, subscribeFlight });
    const result = await tools.get("flighty_add_flight")!({
      flight_code: "ZZ42",
      date: "2026-07-01",
    });

    assert.equal(result.isError, undefined);
    assert.equal(searchFlight.mock.calls.length, 2);
    assert.equal(searchFlight.mock.calls[0].arguments[0], "first-airline");
    assert.equal(searchFlight.mock.calls[1].arguments[0], "second-airline");
    assert.equal(subscribeFlight.mock.calls.length, 1);
    assert.equal(JSON.parse(result.content[0].text).airline, "Second Airline");
  });
});
