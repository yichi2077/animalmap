import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

const statesPath = path.join(projectRoot, "data/geo/australian-states.min.json");
const statesRaw = await fs.readFile(statesPath, "utf8");
const stateGeoJson = JSON.parse(statesRaw);

const representativePoints = {
  wa: [121.6, -26.4],
  nt: [133.1, -19.2],
  sa: [134.4, -30.1],
  qld: [144.9, -22.2],
  nsw: [146.7, -32.4],
  vic: [144.6, -36.9],
  tas: [146.8, -42.0],
  act: [149.13, -35.32],
};

const regionNameToId = {
  "New South Wales": "nsw",
  Victoria: "vic",
  Queensland: "qld",
  "South Australia": "sa",
  "Western Australia": "wa",
  Tasmania: "tas",
  "Northern Territory": "nt",
  "Australian Capital Territory": "act",
};

function findRegion(pointCoordinates) {
  const point = {
    type: "Feature",
    properties: {},
    geometry: {
      type: "Point",
      coordinates: pointCoordinates,
    },
  };

  const matches = stateGeoJson.features
    .filter((feature) => booleanPointInPolygon(point, feature))
    .map((feature) => regionNameToId[feature.properties.STATE_NAME]);

  return matches;
}

for (const [expectedRegionId, point] of Object.entries(representativePoints)) {
  const matches = findRegion(point);
  if (matches.length !== 1 || matches[0] !== expectedRegionId) {
    throw new Error(
      `Representative point ${point.join(",")} expected ${expectedRegionId} but matched ${matches.join(",") || "none"}.`
    );
  }
}

console.log(`Validated region hit mapping for ${Object.keys(representativePoints).length} representative points.`);
