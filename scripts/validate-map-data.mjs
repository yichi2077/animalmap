import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

const statesPath = path.join(projectRoot, "data/geo/australian-states.min.json");
const speciesPath = path.join(projectRoot, "data/species.json");

const MAX_STATE_BYTES = 500 * 1024;

const REGION_NAME_BY_ID = {
  nsw: "New South Wales",
  vic: "Victoria",
  qld: "Queensland",
  sa: "South Australia",
  wa: "Western Australia",
  tas: "Tasmania",
  nt: "Northern Territory",
  act: "Australian Capital Territory",
};

const statesRaw = await fs.readFile(statesPath, "utf8");
const speciesRaw = await fs.readFile(speciesPath, "utf8");

const stateBytes = Buffer.byteLength(statesRaw, "utf8");
if (stateBytes > MAX_STATE_BYTES) {
  throw new Error(`State boundary asset is ${stateBytes} bytes, expected <= ${MAX_STATE_BYTES} bytes.`);
}

const stateGeoJson = JSON.parse(statesRaw);
const species = JSON.parse(speciesRaw);

const stateByName = new Map(
  stateGeoJson.features.map((feature) => [feature.properties.STATE_NAME, feature])
);

for (const entry of species) {
  if (
    typeof entry.geoPoint?.lng !== "number" ||
    !Number.isFinite(entry.geoPoint.lng) ||
    typeof entry.geoPoint?.lat !== "number" ||
    !Number.isFinite(entry.geoPoint.lat)
  ) {
    throw new Error(`Species ${entry.id} is missing a valid geoPoint.`);
  }

  const primaryRegionId = entry.states?.[0];
  if (!primaryRegionId || !(primaryRegionId in REGION_NAME_BY_ID)) {
    throw new Error(`Species ${entry.id} is missing a valid primary region.`);
  }

  const feature = stateByName.get(REGION_NAME_BY_ID[primaryRegionId]);
  if (!feature) {
    throw new Error(`Missing state geometry for ${primaryRegionId}.`);
  }

  const point = {
    type: "Feature",
    properties: {},
    geometry: {
      type: "Point",
      coordinates: [entry.geoPoint.lng, entry.geoPoint.lat],
    },
  };
  const isInsidePrimaryRegion = booleanPointInPolygon(point, feature);
  if (!isInsidePrimaryRegion) {
    throw new Error(
      `Species ${entry.id} geoPoint ${entry.geoPoint.lng},${entry.geoPoint.lat} is outside primary region ${primaryRegionId}.`
    );
  }
}

console.log(`Validated ${species.length} species geoPoints and ${stateBytes} bytes of state geometry.`);
