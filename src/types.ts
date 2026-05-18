export interface FlightRecord {
  id: string;
  flight_number: string;
  airline_name: string;
  airline_iata: string;
  departure_airport_iata: string;
  departure_airport_name: string;
  departure_city: string;
  departure_country: string;
  departure_timezone: string;
  departure_terminal: string | null;
  departure_gate: string | null;
  departureScheduleGateOriginal: string | null;
  departureScheduleGateEstimated: string | null;
  departureScheduleGateActual: string | null;
  departureScheduleRunwayOriginal: string | null;
  departureScheduleRunwayEstimated: string | null;
  departureScheduleRunwayActual: string | null;
  arrival_airport_iata: string;
  arrival_airport_name: string;
  arrival_city: string;
  arrival_country: string;
  arrival_timezone: string;
  arrival_terminal: string | null;
  arrival_gate: string | null;
  arrival_baggage_belt: string | null;
  arrivalScheduleGateOriginal: string | null;
  arrivalScheduleGateEstimated: string | null;
  arrivalScheduleGateActual: string | null;
  arrivalScheduleRunwayOriginal: string | null;
  arrivalScheduleRunwayEstimated: string | null;
  arrivalScheduleRunwayActual: string | null;
  is_cancelled: number;
  distance_km: number | null;
  tail_number: string | null;
  aircraft_model: string | null;
  aircraft_manufacturer: string | null;
  aircraft_name: string | null;
  cruising_speed_kmh: number | null;
  arrival_weather: string | null;
  arrival_temp_c: number | null;
  delay_forecast_mean_min: number | null;
  delay_forecast_observations: number | null;
  delayForecastEarlyCount: number | null;
  delayForecastOntimeCount: number | null;
  delayForecastLate15Count: number | null;
  delayForecastLate30Count: number | null;
  delayForecastLate45Count: number | null;
  delayForecastCanceledCount: number | null;
  delayForecastDivertedCount: number | null;
  checkInScheduleOpen: string | null;
  checkInScheduleClose: string | null;
  seat_number: string | null;
  seat_position: string | null;
  cabin_class: string | null;
  booking_reference: string | null;
  flight_reason: string | null;
  import_source: string | null;
  friend_name?: string;
}

export interface AirportRecord {
  id: string;
  name: string;
  iata: string;
  icao: string;
  city: string;
  country: string;
  countryCode: string;
  timeZoneIdentifier: string;
  latitude: number;
  longitude: number;
  website: string | null;
}

export interface AirlineRecord {
  id: string;
  name: string;
  iata: string;
  icao: string;
  alliance: string | null;
  website: string | null;
  callsign: string | null;
  formattedPhone: string | null;
}

export interface FlightStatusRecord {
  flight_number: string;
  status: "scheduled" | "delayed" | "in_air" | "landed" | "cancelled";
  is_cancelled: boolean;
  departure_airport: string;
  arrival_airport: string;
  scheduled_departure: string | null;
  estimated_departure: string | null;
  actual_departure: string | null;
  scheduled_arrival: string | null;
  estimated_arrival: string | null;
  actual_arrival: string | null;
  departure_delay_minutes: number | null;
  arrival_delay_minutes: number | null;
  departure_gate: string | null;
  arrival_gate: string | null;
  arrival_baggage_belt: string | null;
  arrival_weather: string | null;
  arrival_temp_c: number | null;
  delay_forecast_mean_min: number | null;
  aircraft: string | null;
  tail_number: string | null;
}

export interface DelayForecastRecord {
  flight_number: string;
  route: string;
  observations: number;
  mean_delay_minutes: number | null;
  early_pct: number;
  ontime_pct: number;
  late_15_pct: number;
  late_30_pct: number;
  late_45_pct: number;
  cancelled_pct: number;
  diverted_pct: number;
}

export interface ConnectionRecord {
  id: string;
  inbound_flight: string;
  from_airport: string;
  connection_airport: string;
  connection_airport_name: string;
  outbound_flight: string;
  to_airport: string;
  arrival_time: string | null;
  departure_time: string | null;
  layover_minutes: number;
  min_connection_time_min: number | null;
}

export interface FlightStatsRecord {
  year: number | "all_time";
  total_flights: number;
  total_distance_km: number;
  total_distance_miles: number;
  avg_distance_km: number;
  avg_distance_miles: number;
  earth_circumnavigations: number;
  unique_departure_airports: number;
  unique_arrival_airports: number;
  unique_airlines: number;
  countries_visited: number;
  cancelled_flights: number;
  top_airlines: Array<{ name: string; iata: string; flight_count: number }>;
  top_routes: Array<{ route: string; flight_count: number }>;
}

export interface ListFlightsParams {
  upcoming_only?: boolean;
  year?: number;
  limit?: number;
  offset?: number;
}

export interface ListFriendFlightsParams {
  friend_name?: string;
  upcoming_only?: boolean;
  year?: number;
  limit?: number;
  offset?: number;
}

export interface GetFlightParams {
  flight_id?: string;
  flight_number?: string;
}

export interface SearchFlightsParams {
  airline?: string;
  departure_airport?: string;
  arrival_airport?: string;
  after?: string;
  before?: string;
  limit?: number;
}
