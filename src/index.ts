#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { FlightyDatabase } from "./services/database.js";
import { FlightyApi } from "./services/flighty-api.js";
import { registerFlightTools } from "./tools/flights.js";
import { registerFlightStatusTools } from "./tools/flight-status.js";
import { registerFriendTools } from "./tools/friends.js";
import { registerReferenceTools } from "./tools/reference.js";
import { registerStatsTools } from "./tools/stats.js";
import { registerConnectionTools } from "./tools/connections.js";
import { registerWriteTools } from "./tools/write.js";

const VERSION = "1.8.0";

// Accept any truthy string ("1", "true", "yes") case-insensitively.
// Empty string / unset / "0" / "false" / "no" all mean write tools stay enabled.
const READ_ONLY = /^(1|true|yes)$/i.test(process.env.FLIGHTY_READ_ONLY ?? "");

const server = new McpServer({
  name: "flighty-mcp-server",
  version: VERSION,
});

const db = new FlightyDatabase();
const api = new FlightyApi();

registerFlightTools(server, db);
registerFlightStatusTools(server, db);
registerFriendTools(server, db);
registerReferenceTools(server, db);
registerStatsTools(server, db);
registerConnectionTools(server, db);
if (!READ_ONLY) {
  registerWriteTools(server, db, api);
}

server.registerTool(
  "flighty_about",
  {
    title: "About Flighty MCP",
    description: "Returns version, author, and capability information about this Flighty MCP server.",
    inputSchema: {},
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async () => {
    const about = {
      name: "Flighty MCP Server",
      version: VERSION,
      author: "CPLX",
      repository: "https://github.com/CPLX/flighty-mcp-server",
      description:
        "MCP server for the Flighty flight tracking app. Reads flight data from Flighty's local database and syncs changes via Flighty's API.",
      mode: READ_ONLY ? "read-only" : "read-write",
      tools: {
        read: [
          "flighty_list_flights — list your flights (upcoming, by year, or all)",
          "flighty_current_flights — active travel context (±24 hours from now)",
          "flighty_get_flight — look up a single flight by ID or flight number",
          "flighty_search_flights — search by airline, airport, or date range",
          "flighty_get_flight_status — current status, gate, delay, weather",
          "flighty_get_delay_forecast — historical on-time performance",
          "flighty_get_flight_stats — aggregate stats (miles, airlines, routes)",
          "flighty_get_connections — layover and connection info",
          "flighty_list_friend_flights — connected friends' flights",
          "flighty_search_airports — airport lookup by code, city, or name",
          "flighty_search_airlines — airline lookup by code, name, or alliance",
        ],
        write: READ_ONLY
          ? [
              "(disabled — FLIGHTY_READ_ONLY is set. Unset it or uncheck the Read-Only Mode option in Claude Desktop to enable.)",
            ]
          : [
              "flighty_add_flight — add a flight (syncs to all devices)",
              "flighty_follow_flight — follow a flight without being a passenger (syncs to all devices)",
              "flighty_remove_flight — remove a flight (permanent, syncs to all devices)",
            ],
      },
      requirements: "macOS with Flighty app installed and signed in",
    };
    return {
      content: [{ type: "text", text: JSON.stringify(about, null, 2) }],
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `Flighty MCP server running via stdio (${READ_ONLY ? "read-only" : "read-write"} mode)`
  );
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
