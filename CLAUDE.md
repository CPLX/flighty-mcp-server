# flighty-mcp-server

MCP server for the Flighty flight tracking app. 14 tools (12 read, 2 write) covering flights, status, stats, connections, friends, airports, airlines, and add/remove via Flighty API.

## Version Numbering

**Every commit that changes code must bump the version number.** The version lives in three places that must stay in sync:

1. `package.json` — `"version"`
2. `manifest.json` — `"version"`
3. `src/index.ts` — `const VERSION`

Claude Desktop and Claude Code cache MCP tool definitions. Without a version bump, users will not see updated tool descriptions or new tools even after rebuilding.

After bumping, always rebuild the .mcpb: `scripts/build-extension.sh`

## Build & Package

- `npm run build` — compile TypeScript
- `scripts/build-extension.sh` — build, then pack into `dist/flighty-mcp-server.mcpb`
- The .mcpb uses the lockfile (`npm ci`) for reproducible builds

## Key Constraints

- **macOS only** — reads from Flighty's app sandbox
- **No console.log()** — stdout is the MCP JSON-RPC transport. Use `console.error()` for logging.
- **All timestamps are UTC** — converted from Unix timestamps via `tsToIso()`. Tool responses include a `note` field reminding AI callers of this.
- **Owner ID comes from the JWT** in `Flighty.sqlite`, not from a heuristic. Fallback to frequency-based lookup if auth DB is unavailable.
- **Build token read from Info.plist** at runtime — updates automatically when user updates Flighty.
- **Write tools call Flighty's private API** — protobuf encoding, no library dependency.

## Git & GitHub

- PR-based workflow, never commit directly to main

## File Layout

- `src/services/database.ts` — all SQLite read queries
- `src/services/flighty-api.ts` — Flighty API client (search, subscribe, delete)
- `src/tools/` — one file per tool group (flights, flight-status, friends, reference, stats, connections, write)
- `src/index.ts` — entry point, registers all tools including `flighty_about`
- `internal/` — gitignored working docs (test results, system analysis, session handoffs)
