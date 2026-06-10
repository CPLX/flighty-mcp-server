# Changelog

All notable changes to this project will be documented in this file.

The format is loosely based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[1.6.3]: https://github.com/CPLX/flighty-mcp-server/releases/tag/v1.6.3
[1.6.2]: https://github.com/CPLX/flighty-mcp-server/releases/tag/v1.6.2
[1.6.1]: https://github.com/CPLX/flighty-mcp-server/releases/tag/v1.6.1
[1.6.0]: https://github.com/CPLX/flighty-mcp-server/releases/tag/v1.6.0
[1.5.0]: https://github.com/CPLX/flighty-mcp-server/releases/tag/v1.5.0
[1.3.0]: https://github.com/CPLX/flighty-mcp-server/releases/tag/v1.3.0
