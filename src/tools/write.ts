import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { FlightyDatabase } from "../services/database.js";
import { FlightyApi, parseFlightCode } from "../services/flighty-api.js";

type Airline = { id: string; name: string; iata: string };

async function findFlight(
  db: FlightyDatabase,
  api: FlightyApi,
  airlineIata: string,
  flightNumber: string,
  date: string
): Promise<{
  candidates: Airline[];
  match: { airline: Airline; serverUuid: string } | null;
}> {
  const candidates = db.lookupAirlines(airlineIata);
  for (const airline of candidates) {
    const serverUuid = await api.searchFlight(
      airline.id,
      flightNumber,
      date
    );
    if (serverUuid) return { candidates, match: { airline, serverUuid } };
  }
  return { candidates, match: null };
}

function notFoundMessage(
  flightCode: string,
  date: string,
  candidates: Airline[]
): string {
  const airlineNames = candidates.map((candidate) => candidate.name).join(", ");
  return `No flight found for ${flightCode} on ${date} (tried ${airlineNames}). Check the flight number and date.`;
}

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

        const { candidates, match } = await findFlight(
          db,
          api,
          airlineIata,
          flightNumber,
          params.date
        );

        if (!match) {
          return {
            content: [
              {
                type: "text",
                text: notFoundMessage(
                  params.flight_code,
                  params.date,
                  candidates
                ),
              },
            ],
            isError: true,
          };
        }

        await api.subscribeFlight(match.serverUuid);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: "added",
                  flight_code: params.flight_code,
                  date: params.date,
                  airline: match.airline.name,
                  server_flight_uuid: match.serverUuid,
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
    "flighty_follow_flight",
    {
      title: "Follow Flight",
      description: `Follow a flight without being a passenger — use this to track someone else's flight (e.g., a family member or friend). The flight is registered with Flighty's server and syncs to all devices within seconds. It will appear in flighty_list_friend_flights results (with friend_name as null, since no Flighty friend connection is involved).

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

        const { candidates, match } = await findFlight(
          db,
          api,
          airlineIata,
          flightNumber,
          params.date
        );

        if (!match) {
          return {
            content: [
              {
                type: "text",
                text: notFoundMessage(
                  params.flight_code,
                  params.date,
                  candidates
                ),
              },
            ],
            isError: true,
          };
        }

        await api.followFlight(match.serverUuid);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: "followed",
                  flight_code: params.flight_code,
                  date: params.date,
                  airline: match.airline.name,
                  server_flight_uuid: match.serverUuid,
                  message:
                    "Flight added to your Flighty tracking list. It will appear on all your devices within seconds.",
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
              text: `Error following flight: ${err instanceof Error ? err.message : String(err)}`,
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
