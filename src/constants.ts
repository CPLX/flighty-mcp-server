import { homedir } from "os";
import { join } from "path";
import { execSync } from "child_process";

const FLIGHTY_CONTAINER = join(
  homedir(),
  "Library/Containers/com.flightyapp.flighty/Data"
);

export const MAIN_DB_PATH =
  process.env.FLIGHTY_DB_PATH ??
  join(FLIGHTY_CONTAINER, "Documents/MainFlightyDatabase.db");

export const AUTH_DB_PATH = join(
  FLIGHTY_CONTAINER,
  "Documents/Flighty.sqlite"
);

export const PREFS_PLIST_PATH = join(
  FLIGHTY_CONTAINER,
  "Library/Preferences/com.flightyapp.flighty.plist"
);

export const FLIGHTY_API_BASE = "https://api.flightyapp.com";

export const FLIGHTY_USER_AGENT = "Flighty 4.8.0 (4759) com.flightyapp.flighty";

// Read the build token from the installed Flighty app's Info.plist at runtime.
// This is an app version identifier (not user-specific) that updates automatically
// when the user updates Flighty.
export const FLIGHTY_BUILD_TOKEN = (() => {
  try {
    return execSync(
      'plutil -extract FlightyBuildToken raw "/Applications/Flighty.app/Contents/Info.plist"',
      { encoding: "utf-8" }
    ).trim();
  } catch {
    return "";
  }
})();

export const TIMESTAMP_COLUMNS = [
  "departureScheduleGateOriginal",
  "departureScheduleGateEstimated",
  "departureScheduleGateActual",
  "departureScheduleRunwayOriginal",
  "departureScheduleRunwayEstimated",
  "departureScheduleRunwayActual",
  "arrivalScheduleGateOriginal",
  "arrivalScheduleGateEstimated",
  "arrivalScheduleGateActual",
  "arrivalScheduleRunwayOriginal",
  "arrivalScheduleRunwayEstimated",
  "arrivalScheduleRunwayActual",
  "equipmentFirstFlightDate",
  "checkInScheduleOpen",
  "checkInScheduleClose",
  "departureScheduleGateInitial",
  "arrivalScheduleGateInitial",
] as const;

export const KM_TO_MILES = 0.621371;
export const EARTH_CIRCUMFERENCE_KM = 40075;
