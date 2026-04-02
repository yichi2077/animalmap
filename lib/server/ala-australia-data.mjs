import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import booleanPointInPolygon from "@turf/boolean-point-in-polygon";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
const regionsPath = join(repoRoot, "data", "regions.json");
const statesGeoPath = join(repoRoot, "data", "geo", "australian-states.min.json");

export const ALA_BIOCACHE_URL =
  process.env.ALA_BIOCACHE_URL || "https://biocache.ala.org.au/ws";
export const AUSTRALIA_YEAR_RANGE = { from: 1770, to: 2024 };
export const AUSTRALIA_BOUNDS = { west: 112, east: 154, south: -44, north: -10 };

const regions = JSON.parse(readFileSync(regionsPath, "utf8"));
const statesGeo = JSON.parse(readFileSync(statesGeoPath, "utf8"));
const regionIdByName = new Map(regions.map((region) => [region.nameEn, region.id]));

const STATE_ALIAS_MAP = new Map([
  ["new south wales", "nsw"],
  ["nsw", "nsw"],
  ["state of new south wales", "nsw"],
  ["victoria", "vic"],
  ["vic", "vic"],
  ["state of victoria", "vic"],
  ["queensland", "qld"],
  ["qld", "qld"],
  ["state of queensland", "qld"],
  ["south australia", "sa"],
  ["sa", "sa"],
  ["state of south australia", "sa"],
  ["western australia", "wa"],
  ["wa", "wa"],
  ["state of western australia", "wa"],
  ["tasmania", "tas"],
  ["tas", "tas"],
  ["state of tasmania", "tas"],
  ["northern territory", "nt"],
  ["nt", "nt"],
  ["state of northern territory", "nt"],
  ["australian capital territory", "act"],
  ["act", "act"],
  ["state of australian capital territory", "act"],
]);

const stateFeatures = (statesGeo.features ?? [])
  .map((feature) => {
    const stateName = feature?.properties?.STATE_NAME;
    const regionId = typeof stateName === "string" ? regionIdByName.get(stateName) : null;
    if (!regionId) return null;

    return {
      type: "Feature",
      geometry: feature.geometry,
      properties: {
        regionId,
        stateName,
      },
    };
  })
  .filter(Boolean);

export function scientificNameQuery(scientificName) {
  return `scientificName:\"${scientificName}\"`;
}

export function isInAustralia(lat, lng) {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    lat >= AUSTRALIA_BOUNDS.south &&
    lat <= AUSTRALIA_BOUNDS.north &&
    lng >= AUSTRALIA_BOUNDS.west &&
    lng <= AUSTRALIA_BOUNDS.east
  );
}

export function normalizeStateId(value) {
  if (!value || typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase().replace(/\./g, "");
  return STATE_ALIAS_MAP.get(normalized) ?? null;
}

export function inferStateIdFromCoordinate(lat, lng) {
  if (!isInAustralia(lat, lng)) return null;
  const point = {
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: [lng, lat],
    },
    properties: {},
  };

  for (const feature of stateFeatures) {
    if (booleanPointInPolygon(point, feature)) {
      return feature.properties.regionId;
    }
  }

  return null;
}

export function resolveStateId(value, lat, lng) {
  return normalizeStateId(value) ?? inferStateIdFromCoordinate(lat, lng);
}

async function fetchJson(pathname, params) {
  const url = new URL(`${ALA_BIOCACHE_URL}${pathname}`);

  Object.entries(params).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((entry) => url.searchParams.append(key, String(entry)));
      return;
    }
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  });

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`ALA request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export async function fetchAustralianOccurrencesByScientificName(
  scientificName,
  {
    yearFrom = AUSTRALIA_YEAR_RANGE.from,
    yearTo = AUSTRALIA_YEAR_RANGE.to,
    pageSize = 500,
    maxPages = 20,
  } = {}
) {
  const occurrences = [];
  let start = 0;
  let page = 0;
  let totalRecords = null;

  while (page < maxPages) {
    const data = await fetchJson("/occurrences/search", {
      q: scientificNameQuery(scientificName),
      fq: `year:[${yearFrom} TO ${yearTo}]`,
      fields: "decimalLatitude,decimalLongitude,year,stateProvince",
      pageSize,
      start,
      sort: "year",
      dir: "asc",
    });

    const batch = (data?.occurrences ?? [])
      .filter(
        (entry) =>
          typeof entry.decimalLatitude === "number" &&
          typeof entry.decimalLongitude === "number" &&
          typeof entry.year === "number" &&
          entry.year >= yearFrom &&
          entry.year <= yearTo &&
          isInAustralia(entry.decimalLatitude, entry.decimalLongitude)
      )
      .map((entry) => ({
        lat: Math.round(entry.decimalLatitude * 10000) / 10000,
        lng: Math.round(entry.decimalLongitude * 10000) / 10000,
        year: entry.year,
        rawState: typeof entry.stateProvince === "string" ? entry.stateProvince : null,
        stateId: resolveStateId(entry.stateProvince, entry.decimalLatitude, entry.decimalLongitude),
      }));

    occurrences.push(...batch);
    totalRecords = typeof data?.totalRecords === "number" ? data.totalRecords : totalRecords;

    if ((data?.occurrences?.length ?? 0) < pageSize) break;

    start += pageSize;
    page += 1;

    if (totalRecords !== null && start >= totalRecords) break;
  }

  return occurrences.sort((a, b) => a.year - b.year);
}

export function buildYearlyCounts(occurrences) {
  const byYear = new Map();
  for (const occurrence of occurrences) {
    byYear.set(occurrence.year, (byYear.get(occurrence.year) ?? 0) + 1);
  }

  return Array.from(byYear.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([year, count]) => ({ year, count }));
}

export function buildYearlyStateCoverage(occurrences) {
  const byYear = new Map();
  for (const occurrence of occurrences) {
    if (!byYear.has(occurrence.year)) {
      byYear.set(occurrence.year, new Set());
    }
    if (occurrence.stateId) {
      byYear.get(occurrence.year).add(occurrence.stateId);
    }
  }

  return Array.from(byYear.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([year, states]) => ({
      year,
      states: Array.from(states).sort(),
    }));
}

export function getFirstReliableAustralianYear(yearlyCounts) {
  if (!Array.isArray(yearlyCounts) || yearlyCounts.length === 0) return null;

  const countByYear = new Map(yearlyCounts.map((entry) => [entry.year, entry.count]));
  const startYear = yearlyCounts[0].year;
  const endYear = yearlyCounts[yearlyCounts.length - 1].year;

  for (let year = startYear; year <= endYear; year += 1) {
    const singleYearCount = countByYear.get(year) ?? 0;
    if (singleYearCount >= 3) return year;

    let windowCount = 0;
    for (let offset = 0; offset < 5; offset += 1) {
      windowCount += countByYear.get(year + offset) ?? 0;
    }

    if (windowCount >= 5) {
      return year;
    }
  }

  return null;
}

export function buildStateOverlap(curatedStates, observedStates) {
  const curated = new Set(curatedStates);
  const observed = new Set(observedStates);
  const shared = curatedStates.filter((stateId) => observed.has(stateId));

  return {
    curatedStates,
    observedStates,
    sharedStates: shared,
    overlapRatio: curated.size === 0 ? 0 : Number((shared.length / curated.size).toFixed(2)),
  };
}

export function buildYearlyGridSnapshots(
  speciesId,
  occurrences,
  {
    gridSize = 2.5,
    maxPoints = 6,
    minWeight = 0.14,
    maxWeight = 0.34,
  } = {}
) {
  const byYear = new Map();

  for (const occurrence of occurrences) {
    if (!byYear.has(occurrence.year)) {
      byYear.set(occurrence.year, []);
    }
    byYear.get(occurrence.year).push(occurrence);
  }

  return Array.from(byYear.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([year, entries]) => {
      const gridMap = new Map();
      const states = new Set();

      for (const entry of entries) {
        const latBucket = Math.floor(entry.lat / gridSize);
        const lngBucket = Math.floor(entry.lng / gridSize);
        const key = `${latBucket}:${lngBucket}`;

        if (!gridMap.has(key)) {
          gridMap.set(key, {
            count: 0,
            sumLat: 0,
            sumLng: 0,
            states: new Set(),
            latBucket,
            lngBucket,
          });
        }

        const bucket = gridMap.get(key);
        bucket.count += 1;
        bucket.sumLat += entry.lat;
        bucket.sumLng += entry.lng;

        if (entry.stateId) {
          bucket.states.add(entry.stateId);
          states.add(entry.stateId);
        }
      }

      const cells = Array.from(gridMap.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, maxPoints);
      const maxCount = cells[0]?.count ?? 1;

      return {
        year,
        provenance: "ala_yearly",
        states: Array.from(states).sort(),
        points: cells.map((cell, index) => {
          const normalized = maxCount <= 1 ? 1 : (cell.count - 1) / (maxCount - 1);

          return {
            pointId: `${speciesId}-y${year}-g${index + 1}`,
            lat: Number((cell.sumLat / cell.count).toFixed(4)),
            lng: Number((cell.sumLng / cell.count).toFixed(4)),
            weight: Number((minWeight + normalized * (maxWeight - minWeight)).toFixed(3)),
            count: cell.count,
          };
        }),
      };
    });
}
