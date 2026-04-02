import ambientData from "@/data/ambient-audio.json";

interface ZoneBound {
  stateId: string;
  latMin: number;
  latMax: number;
  lngMin: number;
  lngMax: number;
}

interface AmbientZone {
  id: string;
  label: string;
  audioFile: string;
  bounds: ZoneBound[];
}

const PRIORITY_ORDER = [
  "tropical_rainforest",
  "coastal",
  "temperate_forest",
  "savanna",
  "outback_desert",
];

export function getZoneIdForCoordinate(
  lat: number,
  lng: number,
  stateId: string | null
): string {
  if (!stateId) return "ocean";

  const zones = ambientData.zones as AmbientZone[];
  for (const zoneId of PRIORITY_ORDER) {
    const zone = zones.find((z) => z.id === zoneId);
    if (!zone) continue;

    for (const bound of zone.bounds) {
      if (
        bound.stateId === stateId &&
        lat >= bound.latMin &&
        lat <= bound.latMax &&
        lng >= bound.lngMin &&
        lng <= bound.lngMax
      ) {
        return zone.id;
      }
    }
  }

  return ambientData.fallbackZoneId;
}

export function getZoneAudioFile(zoneId: string): string | null {
  const zones = ambientData.zones as AmbientZone[];
  const zone = zones.find((z) => z.id === zoneId);
  return zone?.audioFile ?? null;
}

export function getZoneLabel(zoneId: string): string {
  const zones = ambientData.zones as AmbientZone[];
  const zone = zones.find((z) => z.id === zoneId);
  return zone?.label ?? "";
}
