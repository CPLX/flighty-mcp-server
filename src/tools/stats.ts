import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { FlightyDatabase } from "../services/database.js";

export function registerStatsTools(
  server: McpServer,
  db: FlightyDatabase
): void {
  server.registerTool(
    "flighty_get_flight_stats",
    {
      title: "Get Flight Statistics",
      description: `Get aggregate statistics about the user's flight history: total flights, distance traveled, unique airports and airlines, top routes, and top airlines. Optionally filter to a specific year.

Includes all flights (past and upcoming). Distance is provided in both kilometers and miles.`,
      inputSchema: {
        year: z
          .number()
          .int()
          .optional()
          .describe(
            "Filter to a specific year (e.g. 2025). Omit for all-time stats."
          ),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params) => {
      const stats = db.getFlightStats(params.year);
      return {
        content: [{ type: "text", text: JSON.stringify(stats, null, 2) }],
      };
    }
  );
}
