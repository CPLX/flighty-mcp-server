import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { FlightyDatabase } from "../services/database.js";

export function registerReferenceTools(
  server: McpServer,
  db: FlightyDatabase
): void {
  server.registerTool(
    "flighty_search_airports",
    {
      title: "Search Airports",
      description: `Search the Flighty airport database by IATA code, ICAO code, airport name, or city name. Sorted by relevance (major airports first).

Returns: id, name, iata, icao, city, country, countryCode, timeZoneIdentifier, latitude, longitude, website.`,
      inputSchema: {
        query: z
          .string()
          .describe(
            'Search term — IATA code (e.g. "SFO"), ICAO (e.g. "KSFO"), city (e.g. "San Francisco"), or name (e.g. "Heathrow")'
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .default(10)
          .describe("Maximum results"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params) => {
      const airports = db.searchAirports(params.query, params.limit);
      const wrapped = {
        note: "Sorted by relevance. Exact IATA/ICAO matches appear first.",
        count: airports.length,
        results: airports,
      };
      return {
        content: [{ type: "text", text: JSON.stringify(wrapped, null, 2) }],
      };
    }
  );

  server.registerTool(
    "flighty_search_airlines",
    {
      title: "Search Airlines",
      description: `Search the Flighty airline database by IATA code, ICAO code, airline name, or alliance. Sorted by relevance.

Returns: id, name, iata, icao, alliance, website, callsign, formattedPhone.`,
      inputSchema: {
        query: z
          .string()
          .describe(
            'Search term — IATA code (e.g. "UA"), ICAO (e.g. "UAL"), name (e.g. "United"), or alliance (e.g. "Star Alliance")'
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .default(10)
          .describe("Maximum results"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params) => {
      const airlines = db.searchAirlines(params.query, params.limit);
      const wrapped = {
        note: "Sorted by relevance.",
        count: airlines.length,
        results: airlines,
      };
      return {
        content: [{ type: "text", text: JSON.stringify(wrapped, null, 2) }],
      };
    }
  );
}
