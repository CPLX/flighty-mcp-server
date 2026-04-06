import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { FlightyDatabase } from "../services/database.js";

export function registerFriendTools(
  server: McpServer,
  db: FlightyDatabase
): void {
  server.registerTool(
    "flighty_list_friend_flights",
    {
      title: "List Friend Flights",
      description: `List flights belonging to the user's connected friends in Flighty. Excludes the user's own flights (use flighty_list_flights for those).

Same filtering as flighty_list_flights:
- No filter: all friend flights, sorted descending (most recent first)
- upcoming_only=true: future flights only, sorted soonest first — the first result is the friend's next flight
- year=2025: flights from that year, sorted descending

All timestamps are UTC. Returns the same flight schema as flighty_list_flights, plus a friend_name field.`,
      inputSchema: {
        friend_name: z
          .string()
          .optional()
          .describe(
            "Filter by friend's name (partial, case-insensitive match on full name or first name)"
          ),
        upcoming_only: z
          .boolean()
          .default(false)
          .describe("Only future flights (sorted soonest first)"),
        year: z
          .number()
          .int()
          .optional()
          .describe("Filter to a specific year (e.g. 2025)"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(200)
          .default(50)
          .describe("Maximum results"),
        offset: z
          .number()
          .int()
          .min(0)
          .default(0)
          .describe("Pagination offset"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params) => {
      const flights = db.listFriendFlights(params);
      const note = params.upcoming_only
        ? "Sorted soonest first. The first result is the next flight. All timestamps are UTC."
        : "Sorted most recent departure first. All timestamps are UTC.";
      const wrapped = {
        note,
        count: flights.length,
        results: flights,
      };
      return {
        content: [{ type: "text", text: JSON.stringify(wrapped, null, 2) }],
      };
    }
  );
}
