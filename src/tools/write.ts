import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { FlightyDatabase } from "../services/database.js";
import { FlightyApi, parseFlightCode } from "../services/flighty-api.js";

export function registerWriteTools(
  server: McpServer,
  db: FlightyDatabase,
  api: FlightyApi
): void {
  server.registerTool(
    "flighty_add_flight",
    {
      title: "Add Flight",
      description: `Add a flight to the user's Flighty account by flight code and date. The flight is registered with Flighty's server and syncs to all devices (phone, watch, etc.) within seconds.

The airline is detected from the flight code prefix (e.g. "DL" from "DL10"). The Flighty API provides full enrichment: gate assignments, weather, equipment, delay forecast, codeshare partners.

This tool calls the Flighty API — it requires the Flighty app to be installed and signed in.

Returns the server-side flight UUID on success.`,
      inputSchema: {
        flight_code: z
          .string()
          .describe(
            'Flight code, e.g. "DL10", "UA194", "BA930". The 2-character airline prefix is parsed automatically.'
          ),
        date: z
          .string()
          .describe(
            'Departure date in YYYY-MM-DD format, e.g. "2026-04-15"'
          ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const { airlineIata, flightNumber } = parseFlightCode(
          params.flight_code
        );

        const airline = db.lookupAirline(airlineIata);

        const serverUuid = await api.searchFlight(
          airline.id,
          flightNumber,
          params.date
        );

        if (!serverUuid) {
          return {
            content: [
              {
                type: "text",
                text: `No flight found for ${params.flight_code} on ${params.date}. Check the flight number and date.`,
              },
            ],
            isError: true,
          };
        }

        await api.subscribeFlight(serverUuid);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: "added",
                  flight_code: params.flight_code,
                  date: params.date,
                  airline: airline.name,
                  server_flight_uuid: serverUuid,
                  message:
                    "Flight added to your Flighty account. It will appear on all your devices within seconds.",
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `Error adding flight: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "flighty_remove_flight",
    {
      title: "Remove Flight",
      description: `Remove a flight from the user's Flighty account. The flight is deleted from the server and the deletion syncs to all devices.

Provide the flight UUID (from flighty_list_flights or flighty_add_flight results). This is the server-side UUID, not the flight number.

WARNING: This permanently removes the flight from your Flighty account across all devices. This cannot be undone — you would need to re-add the flight.`,
      inputSchema: {
        flight_id: z
          .string()
          .describe("The flight UUID to remove (from list_flights results)"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        await api.deleteFlight(params.flight_id);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: "removed",
                  flight_id: params.flight_id,
                  message:
                    "Flight removed from your Flighty account. Deletion will sync to all devices.",
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `Error removing flight: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
