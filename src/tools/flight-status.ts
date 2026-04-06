import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { FlightyDatabase } from "../services/database.js";

export function registerFlightStatusTools(
  server: McpServer,
  db: FlightyDatabase
): void {
  server.registerTool(
    "flighty_get_flight_status",
    {
      title: "Get Flight Status",
      description: `Get the current operational status of a flight already in the user's Flighty database, including delay information, gate assignments, weather, and aircraft details. This only works for flights the user has added to Flighty. Looks up the MOST RECENT instance of the given flight number.

Status values: "scheduled", "delayed" (departure delay > 15 min), "in_air" (departed but not arrived), "landed", or "cancelled".

Data freshness depends on the Flighty app's last sync — this does NOT make live API calls. All timestamps are UTC.

Returns: flight_number, status, is_cancelled, departure/arrival airports, scheduled/estimated/actual times, delay minutes, gate info, weather, aircraft.`,
      inputSchema: {
        flight_number: z
          .string()
          .describe('Flight number, e.g. "UA194", "BA930"'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params) => {
      const status = db.getFlightStatus(params.flight_number);
      if (!status) {
        return {
          content: [
            {
              type: "text",
              text: `No flight found for '${params.flight_number}'. Use flighty_list_flights to see available flights.`,
            },
          ],
        };
      }
      const wrapped = {
        note: "All timestamps are UTC.",
        result: status,
      };
      return {
        content: [{ type: "text", text: JSON.stringify(wrapped, null, 2) }],
      };
    }
  );

  server.registerTool(
    "flighty_get_delay_forecast",
    {
      title: "Get Delay Forecast",
      description: `Get historical delay statistics for a flight already in the user's Flighty database — how often it is early, on-time, late, cancelled, or diverted. This data is attached by Flighty when a flight is added to the user's account. It cannot look up forecasts for arbitrary flights not in the database.

Looks up the MOST RECENT instance of the flight to retrieve its stored delay forecast data. All timestamps are UTC.

Returns: flight_number, route (e.g. "SFO -> EWR"), observations (sample size), mean_delay_minutes, and percentage breakdowns (early_pct, ontime_pct, late_15/30/45_pct, cancelled_pct, diverted_pct). Returns null if no forecast data is available.`,
      inputSchema: {
        flight_number: z
          .string()
          .describe('Flight number, e.g. "UA194"'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params) => {
      const forecast = db.getDelayForecast(params.flight_number);
      if (!forecast) {
        return {
          content: [
            {
              type: "text",
              text: `No delay forecast data available for '${params.flight_number}'.`,
            },
          ],
        };
      }
      return {
        content: [
          { type: "text", text: JSON.stringify(forecast, null, 2) },
        ],
      };
    }
  );
}
