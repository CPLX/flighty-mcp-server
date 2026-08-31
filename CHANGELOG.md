# Changelog

All notable changes to this project will be documented in this file.

The format is loosely based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.10.1] — 2026-08-31

### Changed

- Rebuilt `dist/flighty-mcp-server.mcpb` from a clean checkout of `main` after `#15` merged, using `scripts/build-extension.sh` with `npm ci` for reproducibility. No source changes beyond the version bump.

## [1.10.0] - 2026-08-29

### Changed

- Add and follow operations now try every local airline record matching the supplied IATA code, prioritizing airlines already present in the local flight database. This handles non-unique IATA codes without silently searching the wrong operator.

### Fixed

- **Current Flighty credentials are discovered reliably.** Write tools failed with "Is the Flighty app installed and logged in?" even on a freshly signed-in install. Flighty migrated both credentials out of their old homes (see the `migratedUserToStatic` / `migratedProfileToStatic` UserDefaults keys), leaving the legacy locations present but empty, which made the failure look like a login problem:
  - The auth token moved from `Flighty.sqlite` → `ZUSER.ZTOKEN` (Core Data store, now created but with zero rows) to `MainFlightyDatabase.db` → `Account.authToken`.
  - The sync token URL moved from the `syncInfoV2` UserDefaults key (now absent entirely) to `MainFlightyDatabase.db` → `SyncInfo.nextURL`.

  Both reads now try the main database first and fall back to the legacy location, so old and new installs work. Owner-ID resolution uses the same migrated auth-token lookup instead of dropping immediately to its frequency heuristic. The auth-token error message now names both paths it tried instead of blaming the user's login.

## [1.9.0] — 2026-08-25

### Added

- **Friend-share install support.** New `FLIGHTY_OWNER_USER_ID` environment variable lets an operator pin the userId whose flights the server surfaces. Primary use case: installs where the locally signed-in Flighty account owns no flights and all data belongs to a Flighty Friend whose Pro account is being shared.
- Owner-ID resolution is now three-tier: (1) `FLIGHTY_OWNER_USER_ID` env var, (2) JWT `sub` from `Flighty.sqlite` (but only if that userId actually has flights in the local DB), (3) frequency fallback across `UserFlight ∪ UserManualFlight`.

### Fixed

- **Friend-share installs no longer return empty results.** Previously, the JWT lookup returned the locally signed-in userId even when that user owned no flights in the local DB, causing every "your flights" query to filter to zero rows. The JWT tier now checks that the resolved userId has at least one flight; if not, it falls through to the frequency fallback, which picks up the friend whose flights actually populate the local DB.
- **Frequency fallback now unions `UserFlight` and `UserManualFlight`.** A friend-share install whose only synced flights are manually-entered would previously fail owner-picking entirely. Manual flights arrived in 1.5.0 but the fallback wasn't updated at the time.

### Credits

- The friend-share install scenario was originally reported and diagnosed by @brijones in #4, which we've now closed as superseded by this PR.

## [1.8.0] — 2026-08-25

### Added

- **Read-Only Mode.** New `FLIGHTY_READ_ONLY` environment variable disables the three write tools (`flighty_add_flight`, `flighty_follow_flight`, `flighty_remove_flight`) so they don't appear in `tools/list` at all. Users who only want travel context in AI conversations can cap the blast radius without relying on client-side permission settings. Accepted truthy values: `1`, `true`, `yes` (case-insensitive).
- `.mcpb` Desktop installs now expose Read-Only Mode as a checkbox during install (via `manifest.json` `user_config.read_only` mapped to the env var). Users can toggle it later from extension settings.
- `flighty_about` now reports the current mode (`read-only` or `read-write`) and lists write tools as disabled when the env var is set.

## [1.7.2] — 2026-08-25

### Changed

- Rebuilt `dist/flighty-mcp-server.mcpb` from a clean checkout of `main` after `#12` merged, using `scripts/build-extension.sh` with `npm ci` for reproducibility. No source changes beyond the version bump.

## [1.7.1] — 2026-06-09

### Changed

- `flighty_list_friend_flights` tool description now instructs Claude to render results as a formatted markdown table or list rather than pasting raw JSON.

## [1.7.0] — 2026-06-09

### Added

- `flighty_follow_flight` tool: follow a flight without being a passenger (e.g. to track a family member's flight). Calls `POST /v1/flight/{uuid}/subscribe?is_passenger=false`, which creates a `UserFlight` row with `isMyFlight=0` and syncs to all devices.
- `flighty_list_friend_flights` now surfaces followed flights (the owner's `isMyFlight=0` rows) alongside connected friends' flights. Previously those rows were invisible to all read tools. The `friend_name` field is `null` for followed flights (there is no Flighty friend connection involved) and the friend's name for true social flights.
- Test suite using Node.js built-in `node:test`. Run with `npm test`.

## [1.6.3] — 2026-06-10

### Fixed

- Every query built on `FLIGHT_BASE_QUERY` (`flighty_list_flights`, `flighty_list_friend_flights`, `flighty_current_flights`, `flighty_get_flight`, `flighty_search_flights`, `flighty_get_flight_status`, `flighty_get_delay_forecast`) failed to prepare with `no such column: arrivalWeatherCondition` against current Flighty installs. Newer Flighty builds replace that column with `arrivalWeatherConditionName` (older builds carry both, with only the new one still populated); the `Flight` / `ManualFlight` branches of the union CTE now select the new column under the existing alias so downstream code is unchanged. As a side effect, `arrival_weather` values switch from enum-style strings (`mostlyCloudy`) to display names (`Mostly Cloudy`), and flights whose legacy column had gone stale get weather values back.


## [1.6.2] — 2026-06-08

### Changed

- Replaced `better-sqlite3` (native addon) with Node.js's built-in `node:sqlite` module. This eliminates a macOS code-signature mismatch (`different Team IDs`) that prevented the extension from loading when installed via Claude Desktop's `.mcpb` bundle, because Claude Desktop's Electron runtime enforces that loaded native addons share its Team ID (`Q6L2SF6YDW`). The built-in `node:sqlite` module has no native addon and is therefore not subject to this check.
- Removed `better-sqlite3` and `@types/better-sqlite3` from dependencies.
- Updated minimum Node.js requirement from `>=18` to `>=24.0.0` (`node:sqlite` became stable and flag-free in Node.js 24).

## [1.6.1] — 2026-05-18

### Changed

- Rebuilt `dist/flighty-mcp-server.mcpb` from a clean checkout of `main` using `scripts/build-extension.sh` with `npm ci` for reproducibility. No source changes beyond the version bump.

## [1.6.0] — 2026-05-18

### Changed

- **Breaking (JSON):** `flighty_get_flight_stats` response field `approximate_countries` renamed to `countries_visited`. The previous value summed two `COUNT(DISTINCT)`s and double-counted any country that appeared as both a departure and an arrival; the new value is a deduplicated count.

### Fixed

- `flighty_get_flight_stats` `countries_visited` now reports the correct number of distinct countries the user has visited.

## [1.5.0] — 2026-05-18

### Added

- Queries now `UNION` Flighty's `Flight` + `ManualFlight` and `UserFlight` + `UserManualFlight` tables, so manually-entered flights (private/charter operators not in Flighty's commercial database, or commercial flights the user added by hand) appear in:
  - `flighty_list_flights`
  - `flighty_search_flights`
  - `flighty_get_flight`
  - `flighty_current_flights`
  - `flighty_get_flight_status`
  - `flighty_get_delay_forecast`
  - `flighty_get_flight_stats`
  - `flighty_get_connections`

### Fixed

- `flighty_get_flight_stats` and `flighty_get_connections` now filter on `UserFlight.isMyFlight = 1`, so flights the user is following from friends (`isMyFlight = 0`) no longer leak into stats totals or the connections list.
- `flighty_get_connections` now also filters on `UserFlight.deleted IS NULL`.

## [1.4.0] — superseded

Filter `isMyFlight = 1` so friend-followed flights stop leaking into own-flight queries. Superseded by 1.5.0, which includes the same filter as part of a broader change.

## [1.3.0] — 2026-04-06

Initial public release.

[1.10.1]: https://github.com/CPLX/flighty-mcp-server/releases/tag/v1.10.1
[1.10.0]: https://github.com/CPLX/flighty-mcp-server/releases/tag/v1.10.0
[1.9.0]: https://github.com/CPLX/flighty-mcp-server/releases/tag/v1.9.0
[1.8.0]: https://github.com/CPLX/flighty-mcp-server/releases/tag/v1.8.0
[1.7.2]: https://github.com/CPLX/flighty-mcp-server/releases/tag/v1.7.2
[1.7.1]: https://github.com/CPLX/flighty-mcp-server/releases/tag/v1.7.1
[1.7.0]: https://github.com/CPLX/flighty-mcp-server/releases/tag/v1.7.0
[1.6.3]: https://github.com/CPLX/flighty-mcp-server/releases/tag/v1.6.3
[1.6.2]: https://github.com/CPLX/flighty-mcp-server/releases/tag/v1.6.2
[1.6.1]: https://github.com/CPLX/flighty-mcp-server/releases/tag/v1.6.1
[1.6.0]: https://github.com/CPLX/flighty-mcp-server/releases/tag/v1.6.0
[1.5.0]: https://github.com/CPLX/flighty-mcp-server/releases/tag/v1.5.0
[1.3.0]: https://github.com/CPLX/flighty-mcp-server/releases/tag/v1.3.0
