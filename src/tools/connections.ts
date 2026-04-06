import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { FlightyDatabase } from "../services/database.js";

export function registerConnectionTools(
  server: McpServer,
  db: FlightyDatabase
): void {
  server.registerTool(
    "flighty_get_connections",
    {
      title: "Get Flight Connections",
      description: `Get layover/connection information for the user's flights. Shows pairs of connecting flights, the connection airport, layover duration, and minimum connection time.

Results sorted by the first leg's departure time descending (most recent first). All timestamps are UTC.

Returns: id, inbound_flight (first leg, e.g. "AA1449"), from_airport, connection_airport, connection_airport_name, outbound_flight (second leg, e.g. "AA1166"), to_airport, arrival_time, departure_time, layover_minutes, min_connection_time_min.`,
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      const connections = db.getConnections();
      const wrapped = {
        note: "Sorted by first leg departure, most recent first. All timestamps are UTC.",
        count: connections.length,
        results: connections,
      };
      return {
        content: [
          { type: "text", text: JSON.stringify(wrapped, null, 2) },
        ],
      };
    }
  );
}
