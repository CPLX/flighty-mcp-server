# Changelog

All notable changes to this project will be documented in this file.

The format is loosely based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[1.6.1]: https://github.com/CPLX/flighty-mcp-server/releases/tag/v1.6.1
[1.6.0]: https://github.com/CPLX/flighty-mcp-server/releases/tag/v1.6.0
[1.5.0]: https://github.com/CPLX/flighty-mcp-server/releases/tag/v1.5.0
[1.3.0]: https://github.com/CPLX/flighty-mcp-server/releases/tag/v1.3.0
