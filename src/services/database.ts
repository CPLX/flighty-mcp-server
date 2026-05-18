import Database from "better-sqlite3";
import { existsSync } from "fs";
import {
  MAIN_DB_PATH,
  TIMESTAMP_COLUMNS,
  KM_TO_MILES,
  EARTH_CIRCUMFERENCE_KM,
} from "../constants.js";
import type {
  FlightRecord,
  AirportRecord,
  AirlineRecord,
  FlightStatusRecord,
  DelayForecastRecord,
  ConnectionRecord,
  FlightStatsRecord,
  ListFlightsParams,
  ListFriendFlightsParams,
  GetFlightParams,
  SearchFlightsParams,
} from "../types.js";

function tsToIso(ts: number | null | undefined): string | null {
  if (ts == null || ts <= 0) return null;
  return new Date(ts * 1000).toISOString();
}

function buildFlightDict(row: Record<string, unknown>): FlightRecord {
  const d = { ...row };
  for (const key of TIMESTAMP_COLUMNS) {
    if (key in d && d[key] != null) {
      d[key] = tsToIso(d[key] as number);
    }
  }
  return d as unknown as FlightRecord;
}

// Unifies Flight + ManualFlight and UserFlight + UserManualFlight via CTEs.
// ManualFlight lacks "Estimated" schedule timestamps and check-in schedule
// columns, so those are mapped to NULL so both branches share a column shape.
// CTE aliases (flights_combined, user_flights_combined) are then aliased back
// to `f` / `uf` so all consumer queries keep their existing column references.
const FLIGHT_UNION_CTE = `
WITH flights_combined AS (
    SELECT
        id, number, airlineId, departureAirportId, scheduledArrivalAirportId,
        departureTerminal, departureGate,
        departureScheduleGateOriginal, departureScheduleGateEstimated, departureScheduleGateActual,
        departureScheduleRunwayOriginal, departureScheduleRunwayEstimated, departureScheduleRunwayActual,
        arrivalTerminal, arrivalGate, arrivalBaggageBelt,
        arrivalScheduleGateOriginal, arrivalScheduleGateEstimated, arrivalScheduleGateActual,
        arrivalScheduleRunwayOriginal, arrivalScheduleRunwayEstimated, arrivalScheduleRunwayActual,
        isCancelled, distance,
        equipmentTailNumber, equipmentModelName, equipmentManufacturer, equipmentPlaneName, equipmentCruisingSpeed,
        arrivalWeatherCondition, arrivalWeatherTemperature,
        delayForecastDelayMean, delayForecastObservations,
        delayForecastEarlyCount, delayForecastOntimeCount,
        delayForecastLate15Count, delayForecastLate30Count, delayForecastLate45Count,
        delayForecastCanceledCount, delayForecastDivertedCount,
        checkInScheduleOpen, checkInScheduleClose,
        deleted
    FROM Flight
    UNION ALL
    SELECT
        id, number, airlineId, departureAirportId, scheduledArrivalAirportId,
        departureTerminal, departureGate,
        departureScheduleGateOriginal, NULL AS departureScheduleGateEstimated, departureScheduleGateActual,
        departureScheduleRunwayOriginal, NULL AS departureScheduleRunwayEstimated, departureScheduleRunwayActual,
        arrivalTerminal, arrivalGate, arrivalBaggageBelt,
        arrivalScheduleGateOriginal, NULL AS arrivalScheduleGateEstimated, arrivalScheduleGateActual,
        arrivalScheduleRunwayOriginal, NULL AS arrivalScheduleRunwayEstimated, arrivalScheduleRunwayActual,
        isCancelled, distance,
        equipmentTailNumber, equipmentModelName, equipmentManufacturer, equipmentPlaneName, equipmentCruisingSpeed,
        arrivalWeatherCondition, arrivalWeatherTemperature,
        delayForecastDelayMean, delayForecastObservations,
        delayForecastEarlyCount, delayForecastOntimeCount,
        delayForecastLate15Count, delayForecastLate30Count, delayForecastLate45Count,
        delayForecastCanceledCount, delayForecastDivertedCount,
        NULL AS checkInScheduleOpen, NULL AS checkInScheduleClose,
        deleted
    FROM ManualFlight
),
user_flights_combined AS (
    SELECT userId, flightId, importSource, deleted, isMyFlight FROM UserFlight
    UNION ALL
    SELECT userId, flightId, importSource, deleted, isMyFlight FROM UserManualFlight
)`;

const FLIGHT_BASE_QUERY = `${FLIGHT_UNION_CTE}
SELECT
    f.id,
    f.number AS flight_number,
    al.name AS airline_name,
    al.iata AS airline_iata,
    dep.iata AS departure_airport_iata,
    dep.name AS departure_airport_name,
    dep.city AS departure_city,
    dep.country AS departure_country,
    dep.timeZoneIdentifier AS departure_timezone,
    f.departureTerminal AS departure_terminal,
    f.departureGate AS departure_gate,
    f.departureScheduleGateOriginal,
    f.departureScheduleGateEstimated,
    f.departureScheduleGateActual,
    f.departureScheduleRunwayOriginal,
    f.departureScheduleRunwayEstimated,
    f.departureScheduleRunwayActual,
    arr.iata AS arrival_airport_iata,
    arr.name AS arrival_airport_name,
    arr.city AS arrival_city,
    arr.country AS arrival_country,
    arr.timeZoneIdentifier AS arrival_timezone,
    f.arrivalTerminal AS arrival_terminal,
    f.arrivalGate AS arrival_gate,
    f.arrivalBaggageBelt AS arrival_baggage_belt,
    f.arrivalScheduleGateOriginal,
    f.arrivalScheduleGateEstimated,
    f.arrivalScheduleGateActual,
    f.arrivalScheduleRunwayOriginal,
    f.arrivalScheduleRunwayEstimated,
    f.arrivalScheduleRunwayActual,
    f.isCancelled AS is_cancelled,
    f.distance AS distance_km,
    f.equipmentTailNumber AS tail_number,
    f.equipmentModelName AS aircraft_model,
    f.equipmentManufacturer AS aircraft_manufacturer,
    f.equipmentPlaneName AS aircraft_name,
    f.equipmentCruisingSpeed AS cruising_speed_kmh,
    f.arrivalWeatherConditionName AS arrival_weather,
    f.arrivalWeatherTemperature AS arrival_temp_c,
    f.delayForecastDelayMean AS delay_forecast_mean_min,
    f.delayForecastObservations AS delay_forecast_observations,
    f.delayForecastEarlyCount,
    f.delayForecastOntimeCount,
    f.delayForecastLate15Count,
    f.delayForecastLate30Count,
    f.delayForecastLate45Count,
    f.delayForecastCanceledCount,
    f.delayForecastDivertedCount,
    f.checkInScheduleOpen,
    f.checkInScheduleClose,
    t.seatNumber AS seat_number,
    t.seatPosition AS seat_position,
    t.cabinClass AS cabin_class,
    t.pnr AS booking_reference,
    t.flightReason AS flight_reason,
    uf.importSource AS import_source
FROM flights_combined f
JOIN Airport dep ON f.departureAirportId = dep.id
JOIN Airport arr ON f.scheduledArrivalAirportId = arr.id
JOIN Airline al ON f.airlineId = al.id
JOIN user_flights_combined uf ON f.id = uf.flightId
LEFT JOIN Ticket t ON f.id = t.flightId AND uf.userId = t.userId
WHERE uf.deleted IS NULL AND f.deleted IS NULL AND uf.isMyFlight = 1
`;

export class FlightyDatabase {
  private dbPath: string;
  private cachedOwnerId: string | null = null;

  constructor(dbPath: string = MAIN_DB_PATH) {
    this.dbPath = dbPath;
  }

  private getDb(): Database.Database {
    if (!existsSync(this.dbPath)) {
      throw new Error(
        `Flighty database not found at ${this.dbPath}. Make sure the Flighty app is installed.`
      );
    }
    return new Database(this.dbPath, { readonly: true, fileMustExist: true });
  }

  private getOwnerUserId(db: Database.Database): string {
    if (this.cachedOwnerId) return this.cachedOwnerId;

    // FLIGHTY_OWNER_USER_ID lets the operator pin the owner userId explicitly.
    // Useful for friend-share installs where the locally signed-in Flighty
    // account does not own any flight records itself — all flights in the
    // local DB belong to a Flighty Friend's userId. The previous JWT-based
    // lookup returned the signed-in account's userId, which filters out
    // every shared flight and returns zero rows.
    const envOwner = process.env.FLIGHTY_OWNER_USER_ID;
    if (envOwner) {
      this.cachedOwnerId = envOwner;
      return envOwner;
    }

    // Otherwise pick the userId with the most non-deleted flights in
    // UserFlight. For single-account installs this matches the JWT-derived
    // userId (the signed-in account owns all of its own flights). For
    // friend-share installs it picks the friend whose flights are actually
    // synced into the local database. Same fallback that previously fired
    // only on JWT parse failures; now it is the default path.
    const fallback = db
      .prepare(
        "SELECT userId, COUNT(*) as cnt FROM UserFlight WHERE deleted IS NULL GROUP BY userId ORDER BY cnt DESC LIMIT 1"
      )
      .get() as { userId: string; cnt: number } | undefined;

    if (!fallback) {
      throw new Error("Could not determine Flighty user ID.");
    }

    this.cachedOwnerId = fallback.userId;
    return fallback.userId;
  }

  listFlights(params: ListFlightsParams = {}): FlightRecord[] {
    const db = this.getDb();
    try {
      const ownerId = this.getOwnerUserId(db);
      let query = FLIGHT_BASE_QUERY + " AND uf.userId = ?";
      const binds: unknown[] = [ownerId];

      const now = Math.floor(Date.now() / 1000);
      if (params.upcoming_only) {
        query += " AND f.departureScheduleGateOriginal >= ?";
        binds.push(now);
      } else if (params.year) {
        const start = Math.floor(new Date(Date.UTC(params.year, 0, 1)).getTime() / 1000);
        const end = Math.floor(new Date(Date.UTC(params.year + 1, 0, 1)).getTime() / 1000);
        query += " AND f.departureScheduleGateOriginal >= ? AND f.departureScheduleGateOriginal < ?";
        binds.push(start, end);
      }

      const sortDir = params.upcoming_only ? "ASC" : "DESC";
      query += ` ORDER BY f.departureScheduleGateOriginal ${sortDir} LIMIT ? OFFSET ?`;
      binds.push(params.limit ?? 50, params.offset ?? 0);

      const rows = db.prepare(query).all(...binds) as Record<string, unknown>[];
      return rows.map(buildFlightDict);
    } finally {
      db.close();
    }
  }

  currentFlights(): FlightRecord[] {
    const db = this.getDb();
    try {
      const ownerId = this.getOwnerUserId(db);
      const now = Math.floor(Date.now() / 1000);
      const windowSeconds = 24 * 60 * 60;
      let query = FLIGHT_BASE_QUERY + " AND uf.userId = ?";
      query += " AND f.departureScheduleGateOriginal >= ? AND f.departureScheduleGateOriginal <= ?";
      query += " ORDER BY f.departureScheduleGateOriginal ASC";
      const binds = [ownerId, now - windowSeconds, now + windowSeconds];
      const rows = db.prepare(query).all(...binds) as Record<string, unknown>[];
      return rows.map(buildFlightDict);
    } finally {
      db.close();
    }
  }

  listFriendFlights(params: ListFriendFlightsParams = {}): FlightRecord[] {
    const db = this.getDb();
    try {
      const ownerId = this.getOwnerUserId(db);

      let query = FLIGHT_BASE_QUERY.replace(
        "LEFT JOIN Ticket t ON f.id = t.flightId AND uf.userId = t.userId",
        "LEFT JOIN Ticket t ON f.id = t.flightId AND uf.userId = t.userId\nLEFT JOIN Profile p ON uf.userId = p.userId"
      );

      // Add friend_name to SELECT
      query = query.replace(
        "SELECT\n    f.id,",
        "SELECT\n    p.fullName AS friend_name,\n    f.id,"
      );

      query += " AND uf.userId != ?";
      const binds: unknown[] = [ownerId];

      if (params.friend_name) {
        query +=
          " AND (UPPER(p.fullName) LIKE UPPER(?) OR UPPER(p.firstName) LIKE UPPER(?))";
        binds.push(`%${params.friend_name}%`, `%${params.friend_name}%`);
      }

      const now = Math.floor(Date.now() / 1000);
      if (params.upcoming_only) {
        query += " AND f.departureScheduleGateOriginal >= ?";
        binds.push(now);
      } else if (params.year) {
        const start = Math.floor(new Date(Date.UTC(params.year, 0, 1)).getTime() / 1000);
        const end = Math.floor(new Date(Date.UTC(params.year + 1, 0, 1)).getTime() / 1000);
        query += " AND f.departureScheduleGateOriginal >= ? AND f.departureScheduleGateOriginal < ?";
        binds.push(start, end);
      }

      const sortDir = params.upcoming_only ? "ASC" : "DESC";
      query += ` ORDER BY f.departureScheduleGateOriginal ${sortDir} LIMIT ? OFFSET ?`;
      binds.push(params.limit ?? 50, params.offset ?? 0);

      const rows = db.prepare(query).all(...binds) as Record<string, unknown>[];
      return rows.map(buildFlightDict);
    } finally {
      db.close();
    }
  }

  getFlight(params: GetFlightParams): FlightRecord | null {
    if (!params.flight_id && !params.flight_number) return null;

    const db = this.getDb();
    try {
      const ownerId = this.getOwnerUserId(db);
      let query = FLIGHT_BASE_QUERY + " AND uf.userId = ?";
      let binds: unknown[] = [ownerId];

      if (params.flight_id) {
        query += " AND f.id = ?";
        binds.push(params.flight_id);
      } else {
        // Users pass "AA179" or "179" — database stores just "179" with airline in a separate table.
        // Try matching as airline_iata + number first, fall back to number-only.
        const raw = params.flight_number!.trim().toUpperCase().replace(/[-\s]/g, "");
        const m = raw.match(/^([A-Z]{2}|\d[A-Z]|[A-Z]\d)(\d+)$/);
        if (m) {
          query += " AND UPPER(al.iata) = ? AND f.number = ?";
          binds.push(m[1], m[2]);
        } else {
          query += " AND f.number = ?";
          binds.push(raw);
        }
        query += " ORDER BY f.departureScheduleGateOriginal DESC LIMIT 1";
      }

      const row = db.prepare(query).get(...binds) as
        | Record<string, unknown>
        | undefined;
      return row ? buildFlightDict(row) : null;
    } finally {
      db.close();
    }
  }

  searchFlights(params: SearchFlightsParams = {}): FlightRecord[] {
    const db = this.getDb();
    try {
      const ownerId = this.getOwnerUserId(db);
      let query = FLIGHT_BASE_QUERY + " AND uf.userId = ?";
      const binds: unknown[] = [ownerId];

      if (params.airline) {
        query +=
          " AND (UPPER(al.iata) = UPPER(?) OR UPPER(al.name) LIKE UPPER(?))";
        binds.push(params.airline, `%${params.airline}%`);
      }
      if (params.departure_airport) {
        query +=
          " AND (UPPER(dep.iata) = UPPER(?) OR UPPER(dep.city) LIKE UPPER(?))";
        binds.push(
          params.departure_airport,
          `%${params.departure_airport}%`
        );
      }
      if (params.arrival_airport) {
        query +=
          " AND (UPPER(arr.iata) = UPPER(?) OR UPPER(arr.city) LIKE UPPER(?))";
        binds.push(params.arrival_airport, `%${params.arrival_airport}%`);
      }
      if (params.after) {
        const ts = Math.floor(new Date(params.after).getTime() / 1000);
        query += " AND f.departureScheduleGateOriginal >= ?";
        binds.push(ts);
      }
      if (params.before) {
        // "on or before" means up to the end of the given date (next day midnight UTC)
        const nextDay = new Date(params.before);
        nextDay.setUTCDate(nextDay.getUTCDate() + 1);
        const ts = Math.floor(nextDay.getTime() / 1000);
        query += " AND f.departureScheduleGateOriginal < ?";
        binds.push(ts);
      }

      query += " ORDER BY f.departureScheduleGateOriginal DESC LIMIT ?";
      binds.push(params.limit ?? 50);

      const rows = db.prepare(query).all(...binds) as Record<string, unknown>[];
      return rows.map(buildFlightDict);
    } finally {
      db.close();
    }
  }

  getFlightStatus(flightNumber: string): FlightStatusRecord | null {
    const flight = this.getFlight({ flight_number: flightNumber });
    if (!flight) return null;

    let depDelayMin: number | null = null;
    let arrDelayMin: number | null = null;

    if (flight.departureScheduleGateOriginal && flight.departureScheduleGateEstimated) {
      const d1 = new Date(flight.departureScheduleGateOriginal).getTime();
      const d2 = new Date(flight.departureScheduleGateEstimated).getTime();
      if (!isNaN(d1) && !isNaN(d2)) {
        depDelayMin = Math.round((d2 - d1) / 60000);
      }
    }
    if (flight.arrivalScheduleGateOriginal && flight.arrivalScheduleGateEstimated) {
      const d1 = new Date(flight.arrivalScheduleGateOriginal).getTime();
      const d2 = new Date(flight.arrivalScheduleGateEstimated).getTime();
      if (!isNaN(d1) && !isNaN(d2)) {
        arrDelayMin = Math.round((d2 - d1) / 60000);
      }
    }

    let status: FlightStatusRecord["status"];
    if (flight.is_cancelled) {
      status = "cancelled";
    } else if (
      flight.departureScheduleGateActual &&
      flight.arrivalScheduleGateActual
    ) {
      status = "landed";
    } else if (flight.departureScheduleGateActual) {
      status = "in_air";
    } else if (depDelayMin != null && depDelayMin > 15) {
      status = "delayed";
    } else {
      status = "scheduled";
    }

    return {
      flight_number: flight.flight_number,
      status,
      is_cancelled: Boolean(flight.is_cancelled),
      departure_airport: flight.departure_airport_iata,
      arrival_airport: flight.arrival_airport_iata,
      scheduled_departure: flight.departureScheduleGateOriginal,
      estimated_departure: flight.departureScheduleGateEstimated,
      actual_departure: flight.departureScheduleGateActual,
      scheduled_arrival: flight.arrivalScheduleGateOriginal,
      estimated_arrival: flight.arrivalScheduleGateEstimated,
      actual_arrival: flight.arrivalScheduleGateActual,
      departure_delay_minutes: depDelayMin,
      arrival_delay_minutes: arrDelayMin,
      departure_gate: flight.departure_gate,
      arrival_gate: flight.arrival_gate,
      arrival_baggage_belt: flight.arrival_baggage_belt,
      arrival_weather: flight.arrival_weather,
      arrival_temp_c: flight.arrival_temp_c,
      delay_forecast_mean_min: flight.delay_forecast_mean_min,
      aircraft: flight.aircraft_model,
      tail_number: flight.tail_number,
    };
  }

  getDelayForecast(flightNumber: string): DelayForecastRecord | null {
    const flight = this.getFlight({ flight_number: flightNumber });
    if (!flight) return null;

    const obs = flight.delay_forecast_observations ?? 0;
    if (obs === 0) return null;

    const pct = (count: number | null) =>
      Math.round((1000 * (count ?? 0)) / obs) / 10;

    return {
      flight_number: flight.flight_number,
      route: `${flight.departure_airport_iata} -> ${flight.arrival_airport_iata}`,
      observations: obs,
      mean_delay_minutes: flight.delay_forecast_mean_min,
      early_pct: pct(flight.delayForecastEarlyCount),
      ontime_pct: pct(flight.delayForecastOntimeCount),
      late_15_pct: pct(flight.delayForecastLate15Count),
      late_30_pct: pct(flight.delayForecastLate30Count),
      late_45_pct: pct(flight.delayForecastLate45Count),
      cancelled_pct: pct(flight.delayForecastCanceledCount),
      diverted_pct: pct(flight.delayForecastDivertedCount),
    };
  }

  searchAirports(query: string, limit: number = 10): AirportRecord[] {
    const db = this.getDb();
    try {
      return db
        .prepare(
          `SELECT id, name, iata, icao, city, country, countryCode, timeZoneIdentifier,
                  latitude, longitude, website
           FROM Airport
           WHERE deleted IS NULL
             AND (UPPER(iata) = UPPER(?)
                  OR UPPER(icao) = UPPER(?)
                  OR UPPER(name) LIKE UPPER(?)
                  OR UPPER(city) LIKE UPPER(?))
           ORDER BY
             CASE WHEN UPPER(iata) = UPPER(?) THEN 0
                  WHEN UPPER(icao) = UPPER(?) THEN 1
                  WHEN UPPER(city) = UPPER(?) THEN 2
                  ELSE 3 END,
             relevance DESC
           LIMIT ?`
        )
        .all(query, query, `%${query}%`, `%${query}%`, query, query, query, limit) as AirportRecord[];
    } finally {
      db.close();
    }
  }

  searchAirlines(query: string, limit: number = 10): AirlineRecord[] {
    const db = this.getDb();
    try {
      return db
        .prepare(
          `SELECT id, name, iata, icao, alliance, website, callsign, formattedPhone
           FROM Airline
           WHERE deleted IS NULL
             AND (UPPER(iata) = UPPER(?)
                  OR UPPER(icao) = UPPER(?)
                  OR UPPER(name) LIKE UPPER(?)
                  OR UPPER(alliance) LIKE UPPER(?))
           ORDER BY relevance DESC
           LIMIT ?`
        )
        .all(query, query, `%${query}%`, `%${query}%`, limit) as AirlineRecord[];
    } finally {
      db.close();
    }
  }

  getFlightStats(year?: number): FlightStatsRecord {
    const db = this.getDb();
    try {
      const ownerId = this.getOwnerUserId(db);
      let where =
        "WHERE uf.deleted IS NULL AND f.deleted IS NULL AND uf.isMyFlight = 1 AND uf.userId = ?";
      const binds: unknown[] = [ownerId];

      if (year) {
        const start = Math.floor(
          new Date(Date.UTC(year, 0, 1)).getTime() / 1000
        );
        const end = Math.floor(
          new Date(Date.UTC(year + 1, 0, 1)).getTime() / 1000
        );
        where +=
          " AND f.departureScheduleGateOriginal >= ? AND f.departureScheduleGateOriginal < ?";
        binds.push(start, end);
      }

      const totals = db
        .prepare(
          `${FLIGHT_UNION_CTE}
           SELECT
              COUNT(*) as total_flights,
              COALESCE(SUM(f.distance), 0) as total_distance_km,
              COUNT(DISTINCT dep.id) as unique_departure_airports,
              COUNT(DISTINCT arr.id) as unique_arrival_airports,
              COUNT(DISTINCT al.id) as unique_airlines,
              SUM(CASE WHEN f.isCancelled THEN 1 ELSE 0 END) as cancelled_flights,
              COALESCE(AVG(f.distance), 0) as avg_distance_km
           FROM flights_combined f
           JOIN Airport dep ON f.departureAirportId = dep.id
           JOIN Airport arr ON f.scheduledArrivalAirportId = arr.id
           JOIN Airline al ON f.airlineId = al.id
           JOIN user_flights_combined uf ON f.id = uf.flightId
           ${where}`
        )
        .get(...binds) as Record<string, number>;

      const topAirlines = db
        .prepare(
          `${FLIGHT_UNION_CTE}
           SELECT al.name, al.iata, COUNT(*) as flight_count
           FROM flights_combined f
           JOIN Airline al ON f.airlineId = al.id
           JOIN user_flights_combined uf ON f.id = uf.flightId
           ${where}
           GROUP BY al.id
           ORDER BY flight_count DESC
           LIMIT 5`
        )
        .all(...binds) as Array<{
        name: string;
        iata: string;
        flight_count: number;
      }>;

      const topRoutes = db
        .prepare(
          `${FLIGHT_UNION_CTE}
           SELECT dep.iata || ' -> ' || arr.iata as route, COUNT(*) as flight_count
           FROM flights_combined f
           JOIN Airport dep ON f.departureAirportId = dep.id
           JOIN Airport arr ON f.scheduledArrivalAirportId = arr.id
           JOIN user_flights_combined uf ON f.id = uf.flightId
           ${where}
           GROUP BY dep.id, arr.id
           ORDER BY flight_count DESC
           LIMIT 5`
        )
        .all(...binds) as Array<{ route: string; flight_count: number }>;

      // Countries visited = distinct set of departure and arrival countries.
      // Previous implementation summed two COUNT(DISTINCT)s, double-counting
      // any country that appeared as both origin and destination.
      const countries = db
        .prepare(
          `${FLIGHT_UNION_CTE}
           SELECT COUNT(*) AS countries_visited FROM (
             SELECT dep.country AS country
             FROM flights_combined f
             JOIN Airport dep ON f.departureAirportId = dep.id
             JOIN user_flights_combined uf ON f.id = uf.flightId
             ${where}
             UNION
             SELECT arr.country AS country
             FROM flights_combined f
             JOIN Airport arr ON f.scheduledArrivalAirportId = arr.id
             JOIN user_flights_combined uf ON f.id = uf.flightId
             ${where}
           ) WHERE country IS NOT NULL`
        )
        .get(...binds, ...binds) as { countries_visited: number };

      const distKm = totals.total_distance_km ?? 0;
      const avgKm = totals.avg_distance_km ?? 0;

      return {
        year: year ?? "all_time",
        total_flights: totals.total_flights,
        total_distance_km: distKm,
        total_distance_miles: Math.round(distKm * KM_TO_MILES),
        avg_distance_km: Math.round(avgKm),
        avg_distance_miles: Math.round(avgKm * KM_TO_MILES),
        earth_circumnavigations: Math.round((distKm / EARTH_CIRCUMFERENCE_KM) * 100) / 100,
        unique_departure_airports: totals.unique_departure_airports,
        unique_arrival_airports: totals.unique_arrival_airports,
        unique_airlines: totals.unique_airlines,
        countries_visited: countries.countries_visited,
        cancelled_flights: totals.cancelled_flights,
        top_airlines: topAirlines,
        top_routes: topRoutes,
      };
    } finally {
      db.close();
    }
  }

  getConnections(): ConnectionRecord[] {
    const db = this.getDb();
    try {
      const ownerId = this.getOwnerUserId(db);
      const rows = db
        .prepare(
          `${FLIGHT_UNION_CTE}
           SELECT
              c.id,
              al_in.iata || f_in.number AS inbound_flight,
              dep_in.iata AS from_airport,
              wait.iata AS connection_airport,
              wait.name AS connection_airport_name,
              al_out.iata || f_out.number AS outbound_flight,
              arr_out.iata AS to_airport,
              f_in.arrivalScheduleGateOriginal AS arrival_time,
              f_out.departureScheduleGateOriginal AS departure_time,
              c.mctMinutes AS min_connection_time_min
           FROM Connection c
           JOIN flights_combined f_in ON c.arrivingFlightId = f_in.id
           JOIN flights_combined f_out ON c.departingFlightId = f_out.id
           JOIN Airline al_in ON f_in.airlineId = al_in.id
           JOIN Airline al_out ON f_out.airlineId = al_out.id
           JOIN Airport dep_in ON f_in.departureAirportId = dep_in.id
           JOIN Airport arr_out ON f_out.scheduledArrivalAirportId = arr_out.id
           JOIN Airport wait ON c.waitingAirportId = wait.id
           JOIN user_flights_combined uf ON f_in.id = uf.flightId
           WHERE c.deleted IS NULL AND uf.deleted IS NULL AND uf.isMyFlight = 1 AND uf.userId = ?
           ORDER BY f_in.departureScheduleGateOriginal DESC`
        )
        .all(ownerId) as Array<Record<string, unknown>>;

      return rows.map((r) => {
        const arrTs = r.arrival_time as number | null;
        const depTs = r.departure_time as number | null;
        return {
          id: r.id as string,
          inbound_flight: r.inbound_flight as string,
          from_airport: r.from_airport as string,
          connection_airport: r.connection_airport as string,
          connection_airport_name: r.connection_airport_name as string,
          outbound_flight: r.outbound_flight as string,
          to_airport: r.to_airport as string,
          arrival_time: tsToIso(arrTs),
          departure_time: tsToIso(depTs),
          layover_minutes:
            arrTs != null && depTs != null
              ? Math.floor((depTs - arrTs) / 60)
              : 0,
          min_connection_time_min: r.min_connection_time_min as number | null,
        };
      });
    } finally {
      db.close();
    }
  }

  lookupAirline(iata: string): { id: string; name: string; iata: string } {
    const db = this.getDb();
    try {
      const row = db
        .prepare(
          "SELECT id, name, iata FROM Airline WHERE UPPER(iata) = ? AND deleted IS NULL LIMIT 1"
        )
        .get(iata.toUpperCase()) as
        | { id: string; name: string; iata: string }
        | undefined;
      if (!row) {
        throw new Error(
          `Airline with IATA code '${iata}' not found in Flighty database.`
        );
      }
      return row;
    } finally {
      db.close();
    }
  }
}
