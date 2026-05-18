# Flighty MCP Server

A zero-config [MCP](https://modelcontextprotocol.io/) server that connects AI assistants to the [Flighty](https://www.flightyapp.com/) flight tracking app. Ask about your flights, check statuses, look up delay forecasts, and add or remove flights — all through natural conversation.

Just install Flighty on your Mac and connect the server. It reads all credentials and configuration directly from the app — no API keys, no tokens, no setup.

## What it does

This server gives any MCP-compatible AI assistant (Claude, etc.) full read/write access to your Flighty data:

- **"What's my current flight?"** — shows in-progress, recently landed, and about-to-depart flights
- **"What's my next flight?"** — returns the soonest upcoming flight first
- **"How often is AA179 delayed?"** — historical on-time performance with percentage breakdowns
- **"Show my flight stats for 2025"** — total flights, miles, top airlines, top routes
- **"Add DL10 on April 20"** — adds the flight to your Flighty account, syncs to all devices within seconds
- **"Remove that flight"** — deletes it from your account across all devices
- **"Are any friends flying soon?"** — checks connected friends' upcoming flights
- **"What version of the Flighty tool is this?"** — server info, capabilities, and version

Read operations query Flighty's local SQLite database directly (fast, offline-capable). Write operations call Flighty's API so changes sync to your phone, watch, and widgets. All responses include contextual metadata (sort order, timestamp format) to help AI assistants interpret results correctly.

## Requirements

- **macOS** — Flighty stores its database in the macOS app sandbox
- **Flighty macOS app** — installed and signed in
- **Flighty Pro** — required for the add/remove flight features
- **Node.js 18+** (only for manual install; the .mcpb bundle includes its own runtime)

## Installation

### Claude Desktop (.mcpb) — recommended

Download `flighty-mcp-server.mcpb` from the [dist/](dist/) folder and double-click it. Claude Desktop installs it automatically. No configuration needed.

### Claude Code

```bash
git clone https://github.com/CPLX/flighty-mcp-server.git
cd flighty-mcp-server
npm install
npm run build
```

Add to your MCP config (`~/.claude/settings.local.json` or project `.mcp.json`):

```json
{
  "mcpServers": {
    "flighty": {
      "command": "node",
      "args": ["/absolute/path/to/flighty-mcp-server/build/index.js"]
    }
  }
}
```

### Claude Desktop (manual)

Build from source as above, then add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "flighty": {
      "command": "node",
      "args": ["/absolute/path/to/flighty-mcp-server/build/index.js"]
    }
  }
}
```

Restart the client after adding the config.

## Tools

14 tools organized into four categories.

### Flight Management

| Tool | Description |
|------|-------------|
| `flighty_list_flights` | List your flights — upcoming (sorted soonest first), by year, or all (sorted most recent first) |
| `flighty_current_flights` | Active travel context: flights departing within ±24 hours of now |
| `flighty_get_flight` | Get details for a single flight by UUID or flight number (e.g., "AA179") |
| `flighty_search_flights` | Search your flight history by airline, airports, or date range |
| `flighty_add_flight` | Add a flight by code and date (e.g., "DL10" on "2026-04-20"). Syncs to all devices |
| `flighty_remove_flight` | Remove a flight by UUID. Permanent deletion across all devices |

### Flight Intelligence

| Tool | Description |
|------|-------------|
| `flighty_get_flight_status` | Current status (scheduled/delayed/in_air/landed/cancelled), gate, delay, weather |
| `flighty_get_delay_forecast` | Historical on-time stats: % early, on-time, late, cancelled, diverted |
| `flighty_get_flight_stats` | Aggregate stats: total flights, miles, circumnavigations, top airlines and routes |
| `flighty_get_connections` | Layover info for connecting flights: airports, duration, minimum connection time |

### Social and Reference

| Tool | Description |
|------|-------------|
| `flighty_list_friend_flights` | Connected friends' flights, filterable by name, upcoming, or year |
| `flighty_search_airports` | Search airports by IATA/ICAO code, city, or name |
| `flighty_search_airlines` | Search airlines by IATA/ICAO code, name, or alliance |

### Server Info

| Tool | Description |
|------|-------------|
| `flighty_about` | Version, author, repository, capabilities, and requirements |

## Tool details

### flighty_list_flights

Lists your flights with smart sort order based on the filter:

- **`upcoming_only=true`**: sorted soonest first — the first result is your next flight
- **No filter or `year`**: sorted most recent departure first (natural browsing order)

**Parameters:**
- `upcoming_only` (boolean, default: false) — only flights with future departures, sorted soonest first
- `year` (integer, optional) — filter to a specific year
- `limit` (integer, 1-200, default: 50)
- `offset` (integer, default: 0)

For flights currently in progress or recently landed, use `flighty_current_flights` instead.

Includes both auto-detected commercial flights and manually-entered flights (private/charter operators not in Flighty's commercial database, or commercial flights the user added by hand). Same applies to `flighty_search_flights`, `flighty_get_flight`, `flighty_current_flights`, `flighty_get_flight_status`, `flighty_get_delay_forecast`, `flighty_get_flight_stats`, and `flighty_get_connections`.

---

### flighty_current_flights

Returns flights departing within 24 hours in either direction from now. Captures in-progress flights, recently landed flights (baggage claim, layovers), and flights about to depart.

**No parameters.** Sorted by departure time ascending (earliest first).

---

### flighty_get_flight

Looks up a single flight by UUID or flight number.

**Parameters (provide one):**
- `flight_id` (string) — internal Flighty UUID
- `flight_number` (string) — e.g., "AA179", "DL10". If flown multiple times, returns the most recent instance

---

### flighty_search_flights

Searches your flight history with combinable AND filters. Sorted most recent departure first.

**Parameters (all optional):**
- `airline` — IATA code ("AA") or partial name ("American")
- `departure_airport` — IATA code ("JFK") or city ("New York")
- `arrival_airport` — IATA code ("SFO") or city ("San Francisco")
- `after` — flights departing on or after this date ("2025-01-01")
- `before` — flights departing on or before this date ("2025-12-31")
- `limit` (integer, 1-200, default: 50)

---

### flighty_get_flight_status

Returns the operational status of a flight that is already in the user's Flighty database. This only works for flights the user has added to Flighty — it cannot look up arbitrary flight numbers.

**Parameters:**
- `flight_number` (string) — a flight in the user's database, e.g., "UA194"

**Returns:** Status ("scheduled", "delayed", "in_air", "landed", "cancelled"), departure/arrival delay in minutes, gate assignments, baggage belt, weather conditions, aircraft type, and tail number.

Data freshness depends on the Flighty app's last sync — this does not make live API calls for status.

---

### flighty_get_delay_forecast

Historical on-time performance for a flight that is already in the user's Flighty database. Flighty attaches delay forecast data when a flight is added to the user's account — this tool reads that stored data. It cannot look up forecasts for arbitrary flight numbers that aren't in the database.

**Parameters:**
- `flight_number` (string) — a flight in the user's database, e.g., "AA179"

**Returns:** Number of observations (sample size), mean delay in minutes, and percentage breakdowns: early, on-time, late (15/30/45+ min), cancelled, diverted. Returns null if no forecast data is available.

---

### flighty_search_airports

Searches Flighty's airport database. Exact IATA/ICAO matches are prioritized over fuzzy name/city matches.

**Parameters:**
- `query` (string) — IATA code, ICAO code, city name, or airport name
- `limit` (integer, 1-50, default: 10)

---

### flighty_search_airlines

Searches Flighty's airline database.

**Parameters:**
- `query` (string) — IATA code, ICAO code, airline name, or alliance name
- `limit` (integer, 1-50, default: 10)

---

### flighty_get_flight_stats

Aggregate statistics across your flight history.

**Parameters:**
- `year` (integer, optional) — filter to a specific year; omit for all-time

**Returns:** Total flights, distance (km and miles), earth circumnavigations, unique departure/arrival airports, unique airlines, `countries_visited` (deduped across departure and arrival countries), cancelled flight count, top 5 airlines, top 5 routes.

Includes both auto-detected commercial flights and manually-entered flights (e.g., private/charter operators not in Flighty's commercial database).

---

### flighty_get_connections

Layover information for connecting flight pairs. Sorted by first leg departure time descending.

**No parameters.**

**Returns:** For each connection: inbound flight (first leg, e.g., "AA1449"), origin airport, connection airport, outbound flight (second leg, e.g., "AA1166"), destination airport, arrival/departure times, layover duration in minutes, and minimum connection time.

---

### flighty_list_friend_flights

Flights from your Flighty-connected friends. Same sort behavior as `list_flights` — upcoming sorted soonest first, otherwise most recent first.

**Parameters:**
- `friend_name` (string, optional) — partial match on name
- `upcoming_only` (boolean, default: false) — future flights only, sorted soonest first
- `year` (integer, optional)
- `limit` (integer, 1-200, default: 50)
- `offset` (integer, default: 0)

---

### flighty_add_flight

Adds a flight to your Flighty account via the Flighty API. The flight syncs to all your devices (phone, watch, widgets) within seconds.

**Parameters:**
- `flight_code` (string) — e.g., "DL10", "UA194". The 2-character airline prefix is parsed automatically
- `date` (string) — departure date in YYYY-MM-DD format

**Returns:** The server-side flight UUID on success, or an error if the flight isn't found for that date.

---

### flighty_remove_flight

Permanently removes a flight from your Flighty account across all devices.

**Parameters:**
- `flight_id` (string) — the flight UUID (from `list_flights` or `add_flight` results)

**Warning:** This cannot be undone. You would need to re-add the flight.

---

### flighty_about

Returns server version, author, repository link, tool inventory, and requirements.

**No parameters.**

## How it works

Flighty stores all flight data in a local SQLite database on macOS at:
```
~/Library/Containers/com.flightyapp.flighty/Data/Documents/MainFlightyDatabase.db
```

This server opens that database in read-only mode to answer queries. Queries `UNION` Flighty's `Flight` + `ManualFlight` and `UserFlight` + `UserManualFlight` tables so manually-entered flights surface alongside auto-detected commercial ones, and filter on `UserFlight.isMyFlight = 1` so flights the user is following from friends (`isMyFlight = 0`) don't leak into "your flights" queries. It reads all necessary credentials directly from the installed Flighty app:

- **User identity** — JWT auth token from `Flighty.sqlite` (identifies the user to the API)
- **API access** — build token from the app's `Info.plist` (identifies the app version)
- **Sync token** — from the app's UserDefaults plist (for flight deletion)

For write operations (add/remove flights), the server makes the same API calls the Flighty app itself makes. Added flights get full enrichment from Flighty's servers — gate assignments, weather, delay forecasts, codeshare data — and sync to all devices. No manual configuration is needed.

All tool responses include a `note` field with contextual metadata (sort order, timestamp format) to help AI assistants interpret results correctly. All timestamps are UTC.

## Architecture

```
src/
  index.ts              # Entry point, tool registration, flighty_about
  constants.ts          # Database paths, API config, build token (read from app)
  types.ts              # TypeScript interfaces
  services/
    database.ts         # FlightyDatabase — all SQLite read queries
    flighty-api.ts      # FlightyApi — search, subscribe, delete via Flighty API
  tools/
    flights.ts          # list, current, get, search flights
    flight-status.ts    # status, delay forecast
    friends.ts          # friend flights
    reference.ts        # airport/airline search
    stats.ts            # aggregate statistics
    connections.ts      # layover/connection info
    write.ts            # add_flight, remove_flight (API-backed)
```

## Limitations

- **macOS only** — relies on the Flighty macOS app's sandboxed data
- **Flighty app must be installed and signed in** — the server reads its local databases for both flight data and authentication
- **Read data freshness** — flight status data is as fresh as the Flighty app's last sync, not real-time
- **Write operations require network** — add/remove flights call the Flighty API
- **Flighty API is private** — this server uses Flighty's undocumented API, which could change in future app updates
- **Build token is read from the installed app** — updates automatically when the app updates, but if Flighty changes where it stores the token, the server will need updating

## License

MIT
