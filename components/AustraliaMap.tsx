"use client";

import React from "react";
import { createPortal } from "react-dom";
import maplibregl, { GeoJSONSource, MapGeoJSONFeature, StyleSpecification } from "maplibre-gl";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { useAtlas } from "@/contexts/AtlasContext";
import { useExtendedSpecies } from "@/contexts/ExtendedSpeciesContext";
import { getAtlasMapConfig } from "@/lib/map-style";
import { interpolateKeyframes, KeyframeData } from "@/lib/interpolate";
import {
  getSpeciesDistributionPointsForYear,
  getSpeciesEffectiveIntroYear,
} from "@/lib/species-ui";
import { useAmbientAudio } from "@/hooks/useAmbientAudio";
import CloudEffectLayer from "@/components/CloudEffectLayer";
import speciesData from "@/data/species.json";
import timelineData from "@/data/timeline.json";
import regionsData from "@/data/regions.json";
import statesRaw from "@/data/geo/australian-states.min.json";

type SpeciesRecord = (typeof speciesData)[number] & {
  introYear?: number;
  extinctYear?: number;
};

type Geometry =
  | {
      type: "Polygon";
      coordinates: number[][][];
    }
  | {
      type: "MultiPolygon";
      coordinates: number[][][][];
    };

interface GeoFeature {
  type: "Feature";
  id?: string | number;
  geometry: Geometry;
  properties: Record<string, unknown>;
}

interface GeoFeatureCollection {
  type: "FeatureCollection";
  features: GeoFeature[];
}

type ProcessedSpecies = SpeciesRecord & {
  interpolated: ReturnType<typeof interpolateKeyframes>;
  isVisibleOnMap: boolean;
  isExtinct: boolean;
  isGhost: boolean;
  isSelected: boolean;
  inFocusRegion: boolean;
  matchesSearch: boolean;
  iconOpacity: number;
  auraOpacity: number;
  iconScale: number;
};

interface BoundsLike {
  west: number;
  south: number;
  east: number;
  north: number;
}

type CameraPadding = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

type CameraMode = "overview" | "region" | "species";

type SelectedDisplayPoint = {
  id: string;
  coordinates: [number, number];
  weight: number;
};

type CloudDistributionPoint = {
  id: string;
  lat: number;
  lng: number;
  weight: number;
};

const MAP_SOURCE_REGIONS = "atlas-regions";
const MAP_SOURCE_SPECIES = "atlas-species";
const MAP_SOURCE_COLONY = "atlas-colony";
const MAP_SOURCE_EXT = "atlas-ext-bubbles";
const MAP_LAYER_REGION_FILL = "atlas-region-fill";
const MAP_LAYER_REGION_AURA = "atlas-region-aura";
const MAP_LAYER_REGION_GLOW = "atlas-region-glow";
const MAP_LAYER_REGION_LINE = "atlas-region-line";
const MAP_LAYER_REGION_TRACE = "atlas-region-trace";
const MAP_LAYER_REGION_SELECTED_AURA = "atlas-region-selected-aura";
const MAP_LAYER_REGION_SELECTED_LINE = "atlas-region-selected-line";
const MAP_LAYER_SPECIES_AURA = "atlas-species-aura";
const MAP_LAYER_SPECIES_HIT = "atlas-species-hit";
const MAP_LAYER_SPECIES_SYMBOL = "atlas-species-symbol";
const MAP_LAYER_COLONY_AURA = "atlas-colony-aura";
const MAP_LAYER_COLONY_SYMBOL = "atlas-colony-symbol";
const MAP_LAYER_EXT_AURA = "atlas-ext-aura";
const MAP_LAYER_EXT_SYMBOL = "atlas-ext-symbol";
const MAP_LAYER_EXT_HIT = "atlas-ext-hit";

const TIMELINE = timelineData as Record<string, KeyframeData[]>;

const GROUP_ICON_PATHS: Record<string, string> = {
  extinct: "M12,2 C8,2 4,6 4,10 C4,14 8,18 12,22 C16,18 20,14 20,10 C20,6 16,2 12,2Z",
  endangered: "M12,3 L14,9 L20,9 L15,13 L17,19 L12,15 L7,19 L9,13 L4,9 L10,9Z",
  native: "M12,4 C8,4 5,7 5,11 C5,15 12,22 12,22 C12,22 19,15 19,11 C19,7 16,4 12,4Z",
  invasive: "M12,2 L15,8 L22,8 L16.5,12.5 L18.5,19 L12,15 L5.5,19 L7.5,12.5 L2,8 L9,8Z",
  marine: "M4,12 C4,12 8,6 12,6 C16,6 20,12 20,12 C20,12 16,18 12,18 C8,18 4,12 4,12Z",
};

const GROUP_BASE_RADIUS: Record<string, number> = {
  extinct: 10,
  endangered: 14,
  native: 16,
  invasive: 18,
  marine: 15,
};

const REGION_NAME_TO_ID = Object.fromEntries(
  regionsData.map((region) => [region.nameEn, region.id])
) as Record<string, string>;

const FALLBACK_CENTER: [number, number] = [133.7751, -25.2744];
const FALLBACK_ZOOM = 3.35;
const MAP_MAX_BOUNDS_PADDING = 18;

function visitGeometryCoordinates(geometry: Geometry, visitor: (coord: [number, number]) => void) {
  if (geometry.type === "Polygon") {
    geometry.coordinates.forEach((ring) => {
      ring.forEach((coord) => visitor([coord[0], coord[1]]));
    });
    return;
  }

  geometry.coordinates.forEach((polygon) => {
    polygon.forEach((ring) => {
      ring.forEach((coord) => visitor([coord[0], coord[1]]));
    });
  });
}

function buildBounds(feature: GeoFeature): BoundsLike {
  let west = Number.POSITIVE_INFINITY;
  let south = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;

  visitGeometryCoordinates(feature.geometry, ([lng, lat]) => {
    west = Math.min(west, lng);
    south = Math.min(south, lat);
    east = Math.max(east, lng);
    north = Math.max(north, lat);
  });

  return { west, south, east, north };
}

function extendBounds(bounds: BoundsLike, padding = 0): maplibregl.LngLatBoundsLike {
  return [
    [bounds.west - padding, bounds.south - padding],
    [bounds.east + padding, bounds.north + padding],
  ];
}

function getBoundsCenter(bounds: BoundsLike): [number, number] {
  return [(bounds.west + bounds.east) / 2, (bounds.south + bounds.north) / 2];
}

function mergeBounds(items: BoundsLike[]): BoundsLike {
  return items.reduce(
    (acc, bounds) => ({
      west: Math.min(acc.west, bounds.west),
      south: Math.min(acc.south, bounds.south),
      east: Math.max(acc.east, bounds.east),
      north: Math.max(acc.north, bounds.north),
    }),
    {
      west: Number.POSITIVE_INFINITY,
      south: Number.POSITIVE_INFINITY,
      east: Number.NEGATIVE_INFINITY,
      north: Number.NEGATIVE_INFINITY,
    }
  );
}

function getSpeciesDistributionBounds(speciesStates: string[]): BoundsLike | null {
  const stateBounds = speciesStates
    .map((stateId) => REGION_BOUNDS_LOOKUP.get(stateId))
    .filter((bounds): bounds is BoundsLike => bounds !== undefined);

  if (stateBounds.length === 0) return null;
  return mergeBounds(stateBounds);
}

const REGION_SOURCE_DATA = (() => {
  const features = (((statesRaw as unknown) as GeoFeatureCollection).features ?? [])
    .map((feature) => {
      const regionId = REGION_NAME_TO_ID[String(feature.properties.STATE_NAME || "")];
      const region = regionsData.find((entry) => entry.id === regionId);
      if (!region) return null;

      return {
        ...feature,
        id: region.id,
        properties: {
          ...feature.properties,
          regionId: region.id,
          nameZh: region.nameZh,
          nameEn: region.nameEn,
          abbr: region.abbr,
          color: region.color,
        },
      } satisfies GeoFeature;
    })
    .filter(Boolean) as GeoFeature[];

  return {
    type: "FeatureCollection",
    features,
  } satisfies GeoFeatureCollection;
})();

const REGION_BOUNDS_LOOKUP = new Map(
  REGION_SOURCE_DATA.features.map((feature) => [
    String(feature.id),
    buildBounds(feature),
  ])
);

const AUSTRALIA_BOUNDS = mergeBounds(Array.from(REGION_BOUNDS_LOOKUP.values()));

function buildRasterFallbackStyle(): StyleSpecification {
  return {
    version: 8,
    projection: { type: "mercator" },
    center: FALLBACK_CENTER,
    zoom: FALLBACK_ZOOM,
    sources: {
      osm: {
        type: "raster",
        tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        attribution: "© OpenStreetMap contributors",
      },
    },
    layers: [
      {
        id: "background",
        type: "background",
        paint: {
          "background-color": "#dfe8f1",
        },
      },
      {
        id: "osm",
        type: "raster",
        source: "osm",
      },
    ],
  };
}

async function resolveMapStyle(
  style: StyleSpecification | string,
  provider: "maptiler" | "openfreemap" | "fallback"
): Promise<StyleSpecification | string> {
  if (provider !== "openfreemap" || typeof style !== "string") {
    return style;
  }

  try {
    const response = await fetch(style);
    if (!response.ok) {
      throw new Error(`Failed to load style: ${response.status}`);
    }

    const remoteStyle = (await response.json()) as StyleSpecification & {
      center?: [number, number];
      zoom?: number;
      projection?: StyleSpecification["projection"];
    };

    return {
      ...remoteStyle,
      projection: remoteStyle.projection ?? { type: "mercator" },
      center: remoteStyle.center ?? FALLBACK_CENTER,
      zoom: remoteStyle.zoom ?? FALLBACK_ZOOM,
    };
  } catch {
    return buildRasterFallbackStyle();
  }
}

function findRegionIdByLngLat(lng: number, lat: number) {
  const point = {
    type: "Feature" as const,
    properties: {},
    geometry: {
      type: "Point" as const,
      coordinates: [lng, lat] as [number, number],
    },
  };

  const containingFeature = REGION_SOURCE_DATA.features.find((feature) =>
    booleanPointInPolygon(point, feature as never)
  );

  return containingFeature?.id ? String(containingFeature.id) : null;
}

function getCameraPadding(containerWidth: number, mode: CameraMode): CameraPadding {
  if (containerWidth >= 1180) {
    if (mode === "species") {
      return {
        top: 72,
        right: 430,
        bottom: 110,
        left: 72,
      };
    }

    if (mode === "region") {
      return {
        top: 72,
        right: 72,
        bottom: 110,
        left: 72,
      };
    }

    return {
      top: 72,
      right: 72,
      bottom: 110,
      left: 72,
    };
  }

  if (containerWidth >= 768) {
    if (mode === "species") {
      return {
        top: 68,
        right: 300,
        bottom: 112,
        left: 48,
      };
    }

    if (mode === "region") {
      return {
        top: 68,
        right: 48,
        bottom: 112,
        left: 48,
      };
    }

    return {
      top: 68,
      right: 48,
      bottom: 112,
      left: 48,
    };
  }

  if (mode === "species") {
    return {
      top: 56,
      right: 24,
      bottom: 220,
      left: 24,
    };
  }

  if (mode === "region") {
    return {
      top: 56,
      right: 24,
      bottom: 168,
      left: 24,
    };
  }

  return {
    top: 56,
    right: 24,
    bottom: 168,
    left: 24,
  };
}

function getFocusZoom(regionId: string | null) {
  if (regionId === "act") return 8.2;
  if (regionId === "tas") return 6.2;
  if (regionId === "vic") return 5.75;
  if (regionId === "nsw") return 5.35;
  if (regionId === "sa") return 5.05;
  if (regionId === "nt") return 4.95;
  if (regionId === "qld") return 4.8;
  if (regionId === "wa") return 4.65;
  return 4.95;
}

function getFocusZoomBoost(regionId: string | null) {
  if (regionId === "act") return 0.15;
  if (regionId === "tas") return 0.42;
  if (regionId === "vic") return 0.36;
  if (regionId === "nsw") return 0.34;
  if (regionId === "sa") return 0.32;
  if (regionId === "nt") return 0.3;
  if (regionId === "qld") return 0.34;
  if (regionId === "wa") return 0.48;
  return 0.32;
}

function getRegionGlowLineWidth(selectedWidth: number) {
  return [
    "case",
    ["boolean", ["feature-state", "selected"], false],
    selectedWidth,
    ["boolean", ["feature-state", "hover"], false],
    6,
    1,
  ] as maplibregl.ExpressionSpecification;
}

function getRegionGlowLineOpacity(selectedOpacity: number) {
  return [
    "case",
    ["boolean", ["feature-state", "selected"], false],
    selectedOpacity,
    ["boolean", ["feature-state", "hover"], false],
    0.14,
    0,
  ] as maplibregl.ExpressionSpecification;
}

function getRegionAuraLineWidth(selectedWidth: number) {
  return [
    "case",
    ["boolean", ["feature-state", "selected"], false],
    selectedWidth,
    ["boolean", ["feature-state", "hover"], false],
    11,
    0,
  ] as maplibregl.ExpressionSpecification;
}

function getRegionAuraLineOpacity(selectedOpacity: number) {
  return [
    "case",
    ["boolean", ["feature-state", "selected"], false],
    selectedOpacity,
    ["boolean", ["feature-state", "hover"], false],
    0.08,
    0,
  ] as maplibregl.ExpressionSpecification;
}

function getRegionAuraLineBlur(selectedBlur: number) {
  return [
    "case",
    ["boolean", ["feature-state", "selected"], false],
    selectedBlur,
    ["boolean", ["feature-state", "hover"], false],
    2.2,
    0.2,
  ] as maplibregl.ExpressionSpecification;
}

function getRegionGlowLineBlur(selectedBlur: number) {
  return [
    "case",
    ["boolean", ["feature-state", "selected"], false],
    selectedBlur,
    ["boolean", ["feature-state", "hover"], false],
    0.8,
    0.2,
  ] as maplibregl.ExpressionSpecification;
}

function getRegionTraceWidth(selectedWidth: number) {
  return [
    "case",
    ["boolean", ["feature-state", "selected"], false],
    selectedWidth,
    0,
  ] as maplibregl.ExpressionSpecification;
}

function getRegionTraceOpacity(selectedOpacity: number) {
  return [
    "case",
    ["boolean", ["feature-state", "selected"], false],
    selectedOpacity,
    0,
  ] as maplibregl.ExpressionSpecification;
}

function getMarkerSvg(color: string, group: string) {
  const iconPath = GROUP_ICON_PATHS[group] ?? GROUP_ICON_PATHS.native;

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="88" height="88" viewBox="0 0 88 88">
      <defs>
        <filter id="atlasShadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="8" stdDeviation="8" flood-color="rgba(96,74,47,0.18)"/>
        </filter>
      </defs>
      <g filter="url(#atlasShadow)">
        <circle cx="44" cy="44" r="29" fill="${color}" opacity="0.12" />
        <circle cx="44" cy="44" r="24.5" fill="rgba(255,250,243,0.96)" stroke="${color}" stroke-width="3.2" />
        <g transform="translate(22 22) scale(1.85)">
          <path d="${iconPath}" fill="${color}" opacity="0.94"/>
        </g>
      </g>
    </svg>
  `;
}

async function addSpeciesImages(map: maplibregl.Map) {
  await Promise.all(
    speciesData.map(
      (species) =>
        new Promise<void>((resolve, reject) => {
          if (map.hasImage(species.id)) {
            resolve();
            return;
          }

          const image = new Image(88, 88);
          image.onload = () => {
            if (!map.hasImage(species.id)) {
              map.addImage(species.id, image, { pixelRatio: 2 });
            }
            resolve();
          };
          image.onerror = () => reject(new Error(`Failed to load marker image for ${species.id}.`));
          image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
            getMarkerSvg(species.color, species.group)
          )}`;
        })
    )
  );
}

function buildSpeciesSourceData(
  species: ProcessedSpecies[],
  focusRegionId: string | null,
  selectedSpeciesId: string | null,
  currentYear: number
) {
  if (selectedSpeciesId) {
    return {
      type: "FeatureCollection" as const,
      features: [],
    };
  }

  const maxPerSpecies = focusRegionId ? 10 : 5;

  return {
    type: "FeatureCollection",
    features: species
      .filter((entry) => entry.isVisibleOnMap && !entry.isSelected)
      .flatMap((entry) => {
        const points = getSpeciesDistributionPointsForYear(entry, currentYear)
          .slice(0, maxPerSpecies);

        const baseRadius = GROUP_BASE_RADIUS[entry.group] ?? 16;
        const popFactor = 0.5 + entry.interpolated.populationScore * 0.8;

        if (!points || points.length === 0) {
          const radius = baseRadius * popFactor * 1.6;
          const iconSize = (radius * 2) / 88;
          const pointId = `geo-${entry.id}`;

          return [
            {
              type: "Feature" as const,
              geometry: {
                type: "Point" as const,
                coordinates: [entry.geoPoint.lng, entry.geoPoint.lat],
              },
              properties: {
                id: entry.id,
                pointId,
                nameZh: entry.nameZh,
                color: entry.color,
                iconId: entry.id,
                iconOpacity: entry.iconOpacity,
                iconScale: iconSize * entry.iconScale,
                auraOpacity: entry.auraOpacity,
              },
            },
          ];
        }

        return points.map((pt, idx) => {
          const isRep = idx === 0;
          const radius = baseRadius * popFactor * (isRep ? 1.6 : 1);
          const iconSize = (radius * 2) / 88;
          const pointId = `dist-${entry.id}-${idx}`;

          return {
            type: "Feature" as const,
            geometry: {
              type: "Point" as const,
              coordinates: [pt.lng, pt.lat],
            },
            properties: {
              id: entry.id,
              pointId,
              nameZh: entry.nameZh,
              color: entry.color,
              iconId: entry.id,
              iconOpacity: entry.iconOpacity * (isRep ? 1 : 0.65 + pt.weight * 0.25),
              iconScale: iconSize * entry.iconScale,
              auraOpacity: entry.auraOpacity * (isRep ? 1 : 0.5),
            },
          };
        });
      }),
  };
}

function buildSelectedDisplayPoints(
  selectedSpecies: ProcessedSpecies | null,
  currentYear: number
): SelectedDisplayPoint[] {
  if (!selectedSpecies || !selectedSpecies.isVisibleOnMap) {
    return [];
  }

  const distPoints = getSpeciesDistributionPointsForYear(selectedSpecies, currentYear);

  if (distPoints && distPoints.length > 0) {
    return distPoints.map((point, index) => ({
      id: `dist-${selectedSpecies.id}-${index}`,
      coordinates: [point.lng, point.lat],
      weight: point.weight,
    }));
  }

  const statePoints = selectedSpecies.states
    .map((stateId) => {
      const bounds = REGION_BOUNDS_LOOKUP.get(stateId);
      if (!bounds) return null;

      return {
        id: `state-${selectedSpecies.id}-${stateId}`,
        coordinates: getBoundsCenter(bounds),
        weight: 1,
      } satisfies SelectedDisplayPoint;
    })
    .filter(Boolean) as SelectedDisplayPoint[];

  if (statePoints.length > 0) {
    return statePoints;
  }

  return [
    {
      id: `geo-${selectedSpecies.id}`,
      coordinates: [selectedSpecies.geoPoint.lng, selectedSpecies.geoPoint.lat],
      weight: 1,
    },
  ];
}

function resolvePrimarySelectedPoint(
  points: SelectedDisplayPoint[],
  clickLngLat: [number, number] | null,
  preferredPointId: string | null
): SelectedDisplayPoint | null {
  if (points.length === 0) return null;
  if (preferredPointId) {
    const matchedPoint = points.find((point) => point.id === preferredPointId);
    if (matchedPoint) return matchedPoint;
  }
  if (!clickLngLat) return points[0];

  return points.reduce((closest, point) => {
    const [pointLng, pointLat] = point.coordinates;
    const lngDistance = pointLng - clickLngLat[0];
    const latDistance = pointLat - clickLngLat[1];
    const distance = lngDistance * lngDistance + latDistance * latDistance;

    if (!closest) {
      return { point, distance };
    }

    return distance < closest.distance ? { point, distance } : closest;
  }, null as { point: SelectedDisplayPoint; distance: number } | null)?.point ?? points[0];
}

function orderCloudDistributionPoints(
  points: CloudDistributionPoint[],
  clickLngLat: [number, number] | null,
  preferredPointId: string | null
): Array<{ lat: number; lng: number; weight: number }> {
  if (points.length === 0) return [];

  const primaryPoint =
    (preferredPointId
      ? points.find((point) => point.id === preferredPointId)
      : null) ??
    (clickLngLat
      ? points.reduce((closest, point) => {
          const lngDistance = point.lng - clickLngLat[0];
          const latDistance = point.lat - clickLngLat[1];
          const distance = lngDistance * lngDistance + latDistance * latDistance;

          if (!closest) {
            return { point, distance };
          }

          return distance < closest.distance ? { point, distance } : closest;
        }, null as { point: CloudDistributionPoint; distance: number } | null)?.point
      : null) ??
    points[0];

  return [primaryPoint, ...points.filter((point) => point.id !== primaryPoint.id)].map(
    ({ lat, lng, weight }) => ({ lat, lng, weight })
  );
}

function buildColonySourceData(
  selectedSpecies: ProcessedSpecies | null,
  points: SelectedDisplayPoint[],
  primaryPoint: SelectedDisplayPoint | null,
  pulseScale: number
): { type: "FeatureCollection"; features: GeoJSON.Feature[] } {
  void selectedSpecies;
  void points;
  void primaryPoint;
  void pulseScale;
  return { type: "FeatureCollection", features: [] };
}

const EXT_TAXON_COLORS: Record<string, string> = {
  bird: "#7da56c",
  mammal: "#b8a88a",
  reptile: "#e08a58",
  amphibian: "#64ba9c",
  marine: "#9ec3d8",
};

function getExtMarkerSvg(taxonomicClass: string) {
  const color = EXT_TAXON_COLORS[taxonomicClass] || "#b8a88a";
  const iconPath = GROUP_ICON_PATHS[taxonomicClass] ?? GROUP_ICON_PATHS.native;

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="88" height="88" viewBox="0 0 88 88">
      <circle cx="44" cy="44" r="22" fill="${color}" opacity="0.1" />
      <circle cx="44" cy="44" r="18" fill="rgba(255,250,243,0.82)" stroke="${color}" stroke-width="2" stroke-opacity="0.5" />
      <g transform="translate(26 26) scale(1.5)">
        <path d="${iconPath}" fill="${color}" opacity="0.65"/>
      </g>
    </svg>
  `;
}

async function addExtSpeciesImages(map: maplibregl.Map) {
  const classes = ["bird", "mammal", "reptile", "amphibian", "marine"];
  await Promise.all(
    classes.map(
      (cls) =>
        new Promise<void>((resolve) => {
          const imgId = `ext-${cls}`;
          if (map.hasImage(imgId)) { resolve(); return; }
          const image = new Image(88, 88);
          image.onload = () => {
            if (!map.hasImage(imgId)) {
              map.addImage(imgId, image, { pixelRatio: 2 });
            }
            resolve();
          };
          image.onerror = () => resolve();
          image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(getExtMarkerSvg(cls))}`;
        })
    )
  );
}

function buildExtSpeciesSourceData(
  extSpecies: Array<{
    id: string;
    taxonomicClass: string;
    distributionPoints?: Array<{ lat: number; lng: number; weight: number }>;
    populationScore?: number;
  }>,
  focusRegionId: string | null,
  selectedSpeciesId: string | null
) {
  if (selectedSpeciesId) {
    return { type: "FeatureCollection" as const, features: [] };
  }

  const features: GeoJSON.Feature[] = [];
  const maxPerSpecies = focusRegionId ? 5 : 2;

  for (const sp of extSpecies) {
    if (!sp.distributionPoints || sp.distributionPoints.length === 0) continue;
    const isSelected = sp.id === selectedSpeciesId;
    if (isSelected) continue;

    const points = sp.distributionPoints.slice(0, maxPerSpecies);
    points.forEach((pt, index) => {
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [pt.lng, pt.lat] },
        properties: {
          id: sp.id,
          pointId: `ext-dist-${sp.id}-${index}`,
          taxonomicClass: sp.taxonomicClass,
          iconId: `ext-${sp.taxonomicClass}`,
          weight: pt.weight,
          iconOpacity: selectedSpeciesId ? 0 : 0.55,
          iconScale: 0.28 + (sp.populationScore ?? 0.5) * 0.12,
        },
      });
    });
  }

  return { type: "FeatureCollection" as const, features };
}

function SelectedSpeciesMarker({
  species,
  onToggle,
}: {
  species: ProcessedSpecies;
  onToggle: () => void;
}) {
  const iconPath = GROUP_ICON_PATHS[species.group] ?? GROUP_ICON_PATHS.native;

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      className={`atlas-selected-marker ${species.isGhost ? "is-ghost" : ""} ${
        species.isExtinct ? "is-extinct" : ""
      }`}
      style={
        {
          "--selected-marker-color": species.color,
        } as React.CSSProperties
      }
      aria-label={`${species.nameZh}${species.isVisibleOnMap ? "，已聚焦" : "，当前时间地图上不可见"}`}
    >
      <span className="atlas-selected-marker__glyph" aria-hidden>
        <span className="atlas-selected-marker__ring" />
        <span className="atlas-selected-marker__core">
          <svg width="30" height="30" viewBox="0 0 24 24">
            <path d={iconPath} fill={species.color} opacity="0.94" />
          </svg>
        </span>
      </span>
      <span className="atlas-selected-marker__label">{species.nameZh}</span>
    </button>
  );
}

export default function AustraliaMap() {
  const {
    currentYear,
    focusRegionId,
    selectedSpeciesId,
    selectedSpeciesClickLngLat,
    searchKeyword,
    setFocusRegion,
    setSelectedSpecies,
    setMapReady,
    openSpecies,
    ambientAudioEnabled,
  } = useAtlas();
  const { loadedSpecies: extLoadedSpecies } = useExtendedSpecies();
  const ambientAudio = useAmbientAudio(ambientAudioEnabled);
  const shouldReduceMotion = useReducedMotion();

  const frameRef = React.useRef<HTMLDivElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const mapRef = React.useRef<maplibregl.Map | null>(null);
  const resizeObserverRef = React.useRef<ResizeObserver | null>(null);
  const resizeRafRef = React.useRef<number | null>(null);
  const isMapReadyRef = React.useRef(false);
  const selectedMarkerRef = React.useRef<maplibregl.Marker | null>(null);
  const regionFocusAnchorRef = React.useRef<{
    regionId: string;
    center: [number, number];
  } | null>(null);
  const latestFocusRegionIdRef = React.useRef<string | null>(focusRegionId);
  const latestSelectedSpeciesIdRef = React.useRef<string | null>(selectedSpeciesId);
  const setMapReadyRef = React.useRef(setMapReady);
  const cameraPositionedForSpeciesRef = React.useRef<string | null>(null);
  const selectedPrimaryPointIdRef = React.useRef<string | null>(null);
  const speciesClickOriginRef = React.useRef<[number, number] | null>(null);
  const speciesFitBoundsTimerRef = React.useRef<number | null>(null);
  const latestProcessedSpeciesRef = React.useRef<ProcessedSpecies[]>([]);
  const colonyPulseRafRef = React.useRef<number | null>(null);
  const latestSpeciesSourceDataRef = React.useRef<ReturnType<typeof buildSpeciesSourceData>>(
    buildSpeciesSourceData([], null, null, 1770)
  );
  const actionRefs = React.useRef({
    openSpecies,
    setFocusRegion,
    setSelectedSpecies,
    triggerAmbient: ambientAudio.triggerForCoordinate,
  });
  const previousFocusRegionIdRef = React.useRef<string | null>(focusRegionId);
  const [hoveredRegionId, setHoveredRegionId] = React.useState<string | null>(null);
  const [selectedMarkerHost, setSelectedMarkerHost] = React.useState<HTMLDivElement | null>(null);
  const [mapBooted, setMapBooted] = React.useState(false);
  const [regionTransitionLabel, setRegionTransitionLabel] = React.useState<string | null>(null);
  const [mapErrorMessage, setMapErrorMessage] = React.useState<string | null>(null);
  const [webGLUnsupported, setWebGLUnsupported] = React.useState(false);
  const [mapLoadTimeout, setMapLoadTimeout] = React.useState(false);
  const [colonyPulseScale, setColonyPulseScale] = React.useState(1);

  const mapConfig = React.useMemo(() => getAtlasMapConfig(), []);

  React.useEffect(() => {
    latestFocusRegionIdRef.current = focusRegionId;
  }, [focusRegionId]);

  React.useEffect(() => {
    latestSelectedSpeciesIdRef.current = selectedSpeciesId;
  }, [selectedSpeciesId]);

  React.useEffect(() => {
    setMapReadyRef.current = setMapReady;
  }, [setMapReady]);

  React.useEffect(() => {
    actionRefs.current = {
      openSpecies,
      setFocusRegion,
      setSelectedSpecies,
      triggerAmbient: ambientAudio.triggerForCoordinate,
    };
  }, [openSpecies, setFocusRegion, setSelectedSpecies, ambientAudio.triggerForCoordinate]);

  React.useEffect(() => {
    if (!mapBooted) {
      previousFocusRegionIdRef.current = focusRegionId;
      return;
    }

    if (previousFocusRegionIdRef.current === focusRegionId) {
      return;
    }

    const nextRegion = focusRegionId
      ? regionsData.find((entry) => entry.id === focusRegionId)
      : null;
    const nextLabel = nextRegion ? nextRegion.nameZh : "回到澳大利亚全域";

    setRegionTransitionLabel(nextLabel);
    previousFocusRegionIdRef.current = focusRegionId;

    const timer = window.setTimeout(() => {
      setRegionTransitionLabel(null);
    }, shouldReduceMotion ? 0 : 720);

    return () => window.clearTimeout(timer);
  }, [focusRegionId, mapBooted, shouldReduceMotion]);

  const processedSpecies = React.useMemo(() => {
    const normalizedQuery = searchKeyword.trim().toLowerCase();

    return (speciesData as SpeciesRecord[]).map((species) => {
      const interpolated = interpolateKeyframes(TIMELINE[species.id] || [], currentYear);
      const introYear = getSpeciesEffectiveIntroYear(species.id);
      const extinctYear = typeof species.extinctYear === "number" ? species.extinctYear : null;
      const isPreArrival = introYear !== null && currentYear < introYear;
      const isExtinct =
        interpolated.distributionType === "extinction" ||
        (extinctYear !== null && currentYear >= extinctYear);
      const isSelected = species.id === selectedSpeciesId;
      const inFocusRegion = !focusRegionId || species.states.includes(focusRegionId);
      const matchesSearch =
        !normalizedQuery ||
        species.nameZh.includes(searchKeyword) ||
        species.nameEn.toLowerCase().includes(normalizedQuery);

      const baseOpacity = matchesSearch
        ? inFocusRegion
          ? 0.36 + interpolated.populationScore * 0.52
          : 0.18
        : 0.08;

      const iconOpacity = isSelected ? 0 : selectedSpeciesId ? 0 : baseOpacity;
      const auraOpacity = selectedSpeciesId && !isSelected ? 0 : Math.min(iconOpacity * 0.48, 0.28);
      const iconScale = focusRegionId
        ? matchesSearch && inFocusRegion
          ? 0.98
          : 0.86
        : matchesSearch
        ? 0.9
        : 0.78;

      return {
        ...species,
        interpolated,
        isVisibleOnMap: !isPreArrival,
        isExtinct,
        isGhost: interpolated.populationScore < 0.1 && !isExtinct,
        isSelected,
        inFocusRegion,
        matchesSearch,
        iconOpacity,
        auraOpacity,
        iconScale,
      } satisfies ProcessedSpecies;
    });
  }, [currentYear, focusRegionId, searchKeyword, selectedSpeciesId]);

  const selectedSpecies = React.useMemo(
    () => processedSpecies.find((entry) => entry.id === selectedSpeciesId) ?? null,
    [processedSpecies, selectedSpeciesId]
  );

  React.useEffect(() => {
    latestProcessedSpeciesRef.current = processedSpecies;
  }, [processedSpecies]);

  const speciesSourceData = React.useMemo(
    () => buildSpeciesSourceData(processedSpecies, focusRegionId, selectedSpeciesId, currentYear),
    [currentYear, processedSpecies, focusRegionId, selectedSpeciesId]
  );

  const selectedDisplayPoints = React.useMemo(
    () => buildSelectedDisplayPoints(selectedSpecies, currentYear),
    [currentYear, selectedSpecies]
  );

  const primarySelectedPoint = React.useMemo(
    () =>
      resolvePrimarySelectedPoint(
        selectedDisplayPoints,
        selectedSpeciesClickLngLat,
        selectedPrimaryPointIdRef.current
      ),
    [selectedDisplayPoints, selectedSpeciesClickLngLat]
  );

  const colonySourceData = React.useMemo(
    () => buildColonySourceData(selectedSpecies, selectedDisplayPoints, primarySelectedPoint, colonyPulseScale),
    [selectedSpecies, selectedDisplayPoints, primarySelectedPoint, colonyPulseScale]
  );

  React.useEffect(() => {
    latestSpeciesSourceDataRef.current = speciesSourceData;
  }, [speciesSourceData]);

  const extSourceData = React.useMemo(
    () => buildExtSpeciesSourceData(extLoadedSpecies, focusRegionId, selectedSpeciesId),
    [extLoadedSpecies, focusRegionId, selectedSpeciesId]
  );

  const selectedExtSpecies = React.useMemo(() => {
    if (!selectedSpeciesId?.startsWith("ext_")) return null;
    return extLoadedSpecies.find((s) => s.id === selectedSpeciesId) ?? null;
  }, [selectedSpeciesId, extLoadedSpecies]);

  const selectedDistributionColor = React.useMemo(
    () =>
      selectedSpecies?.color ||
      EXT_TAXON_COLORS[selectedExtSpecies?.taxonomicClass || "mammal"] ||
      "#b8a88a",
    [selectedExtSpecies?.taxonomicClass, selectedSpecies?.color]
  );

  const cloudDistributionPoints = React.useMemo(() => {
    if (selectedSpecies) {
      if (!selectedSpecies.isVisibleOnMap) {
        return [];
      }

      const orderedDisplayPoints = selectedDisplayPoints.map((point) => ({
        id: point.id,
        lat: point.coordinates[1],
        lng: point.coordinates[0],
        weight: point.weight,
      }));

      if (orderedDisplayPoints.length > 0) {
        if (!primarySelectedPoint) {
          return orderedDisplayPoints.map(({ lat, lng, weight }) => ({ lat, lng, weight }));
        }

        const primaryPoint = orderedDisplayPoints.find((point) => point.id === primarySelectedPoint.id) ?? null;
        const secondaryPoints = orderedDisplayPoints.filter((point) => point.id !== primarySelectedPoint.id);

        return (primaryPoint ? [primaryPoint, ...secondaryPoints] : orderedDisplayPoints)
          .map(({ lat, lng, weight }) => ({ lat, lng, weight }));
      }

      if (primarySelectedPoint) {
        return [{
          lat: primarySelectedPoint.coordinates[1],
          lng: primarySelectedPoint.coordinates[0],
          weight: 1,
        }];
      }
      return [{ lat: selectedSpecies.geoPoint.lat, lng: selectedSpecies.geoPoint.lng, weight: 1 }];
    }
    if (selectedExtSpecies?.distributionPoints) {
      return orderCloudDistributionPoints(
        selectedExtSpecies.distributionPoints.map((point, index) => ({
          id: `ext-dist-${selectedExtSpecies.id}-${index}`,
          lat: point.lat,
          lng: point.lng,
          weight: point.weight,
        })),
        selectedSpeciesClickLngLat,
        selectedPrimaryPointIdRef.current
      );
    }
    return [];
  }, [primarySelectedPoint, selectedDisplayPoints, selectedSpecies, selectedExtSpecies, selectedSpeciesClickLngLat]);

  const syncRegionFeatureStates = React.useCallback(() => {
    const map = mapRef.current;
    if (!map || !isMapReadyRef.current || !map.getSource(MAP_SOURCE_REGIONS)) return;

    regionsData.forEach((region) => {
      map.setFeatureState(
        { source: MAP_SOURCE_REGIONS, id: region.id },
        {
          selected: focusRegionId === region.id,
          dimmed: Boolean(focusRegionId && focusRegionId !== region.id),
          hover: hoveredRegionId === region.id,
        }
      );
    });

    const selectedFilter = focusRegionId
      ? (["==", ["get", "regionId"], focusRegionId] as maplibregl.FilterSpecification)
      : (["==", ["get", "regionId"], "__none__"] as maplibregl.FilterSpecification);

    if (map.getLayer(MAP_LAYER_REGION_SELECTED_AURA)) {
      map.setFilter(MAP_LAYER_REGION_SELECTED_AURA, selectedFilter);
    }

    if (map.getLayer(MAP_LAYER_REGION_SELECTED_LINE)) {
      map.setFilter(MAP_LAYER_REGION_SELECTED_LINE, selectedFilter);
    }
  }, [focusRegionId, hoveredRegionId]);

  const syncSpeciesSource = React.useCallback(() => {
    const map = mapRef.current;
    if (!map || !isMapReadyRef.current) return;

    const source = map.getSource(MAP_SOURCE_SPECIES) as GeoJSONSource | undefined;
    if (source) {
      source.setData(speciesSourceData as GeoJSON.FeatureCollection);
    }
  }, [speciesSourceData]);

  const syncColonySource = React.useCallback(() => {
    const map = mapRef.current;
    if (!map || !isMapReadyRef.current) return;

    const source = map.getSource(MAP_SOURCE_COLONY) as GeoJSONSource | undefined;
    if (source) {
      source.setData(colonySourceData as GeoJSON.FeatureCollection);
    }
  }, [colonySourceData]);

  const syncCamera = React.useCallback(() => {
    const map = mapRef.current;
    const frame = frameRef.current;
    if (!map || !frame || !isMapReadyRef.current) return;
    if (speciesFitBoundsTimerRef.current !== null) {
      window.clearTimeout(speciesFitBoundsTimerRef.current);
      speciesFitBoundsTimerRef.current = null;
    }

    const currentSelectedSpeciesId = latestSelectedSpeciesIdRef.current;
    const currentSelectedSpecies =
      latestProcessedSpeciesRef.current.find((entry) => entry.id === currentSelectedSpeciesId) ?? null;
    const hasSpeciesFocus = currentSelectedSpecies?.isVisibleOnMap || selectedExtSpecies;
    const cameraMode: CameraMode = hasSpeciesFocus
      ? "species"
      : focusRegionId
      ? "region"
      : "overview";
    const padding = getCameraPadding(frame.clientWidth, cameraMode);
    const duration = shouldReduceMotion
      ? 0
      : hasSpeciesFocus
      ? 760
      : focusRegionId
      ? 620
      : 460;

    map.stop();

    if (currentSelectedSpecies?.isVisibleOnMap) {
      const clickOrigin = speciesClickOriginRef.current;

      if (
        cameraPositionedForSpeciesRef.current === currentSelectedSpecies.id &&
        !clickOrigin
      ) {
        return;
      }

      const distributionBounds = getSpeciesDistributionBounds(currentSelectedSpecies.states);

      if (distributionBounds) {
        const paddedBounds = extendBounds(distributionBounds, 1.2);

        if (clickOrigin) {
          speciesClickOriginRef.current = null;

          map.flyTo({
            center: clickOrigin,
            zoom: Math.min(map.getZoom() + 0.5, 5.5),
            duration: shouldReduceMotion ? 0 : 300,
            essential: true,
          });

          speciesFitBoundsTimerRef.current = window.setTimeout(() => {
            const currentMap = mapRef.current;
            const currentFrame = frameRef.current;
            if (!currentMap || !currentFrame || !isMapReadyRef.current) {
              speciesFitBoundsTimerRef.current = null;
              return;
            }

            currentMap.fitBounds(paddedBounds, {
              padding: getCameraPadding(currentFrame.clientWidth, "species"),
              duration: shouldReduceMotion ? 0 : 680,
              essential: true,
              maxZoom: 6.5,
            });
            speciesFitBoundsTimerRef.current = null;
          }, shouldReduceMotion ? 0 : 320);
        } else {
          map.fitBounds(paddedBounds, {
            padding,
            duration: shouldReduceMotion ? 0 : 780,
            essential: true,
            maxZoom: 6.5,
          });
        }

        cameraPositionedForSpeciesRef.current = currentSelectedSpecies.id;
        return;
      }

      speciesClickOriginRef.current = null;
      map.flyTo({
        center: [currentSelectedSpecies.geoPoint.lng, currentSelectedSpecies.geoPoint.lat],
        zoom: Math.max(map.getZoom(), getFocusZoom(focusRegionId)),
        padding,
        duration,
        essential: true,
      });
      cameraPositionedForSpeciesRef.current = currentSelectedSpecies.id;
      return;
    }

    if (selectedExtSpecies && selectedSpeciesClickLngLat) {
      speciesClickOriginRef.current = null;
      cameraPositionedForSpeciesRef.current = currentSelectedSpeciesId;
      map.flyTo({
        center: selectedSpeciesClickLngLat,
        zoom: Math.max(map.getZoom(), getFocusZoom(focusRegionId)),
        padding,
        duration,
        essential: true,
      });
      return;
    }

    cameraPositionedForSpeciesRef.current = null;

    if (focusRegionId) {
      const regionBounds = REGION_BOUNDS_LOOKUP.get(focusRegionId);
      if (regionBounds) {
        const paddedBounds = extendBounds(regionBounds, focusRegionId === "act" ? 0.45 : 0.72);
        const camera = map.cameraForBounds(paddedBounds, {
          padding,
          maxZoom: 8.8,
        });

        const minZoom = getFocusZoom(focusRegionId);
        const zoomBoost = getFocusZoomBoost(focusRegionId);
        const regionAnchor =
          regionFocusAnchorRef.current?.regionId === focusRegionId
            ? regionFocusAnchorRef.current.center
            : null;

        map.easeTo({
          center: regionAnchor ?? camera?.center ?? getBoundsCenter(regionBounds),
          zoom: Math.max((camera?.zoom ?? minZoom) + zoomBoost, minZoom),
          duration,
          essential: true,
        });
        return;
      }
    }

    map.fitBounds(extendBounds(AUSTRALIA_BOUNDS, 1.8), {
      padding,
      duration,
      essential: true,
      maxZoom: 4.15,
    });
  }, [focusRegionId, selectedExtSpecies, selectedSpeciesClickLngLat, shouldReduceMotion]);

  React.useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let isDisposed = false;
    let map: maplibregl.Map | null = null;
    let timeoutId: number | null = null;

    // WebGL support check (PRD §8.1)
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    if (!gl) {
      setWebGLUnsupported(true);
      return;
    }

    setMapBooted(false);
    setMapLoadTimeout(false);
    setMapErrorMessage(null);
    setMapReadyRef.current(false);

    const initializeMap = async () => {
      const resolvedStyle = await resolveMapStyle(mapConfig.style, mapConfig.provider);
      if (isDisposed || !containerRef.current || mapRef.current) {
        return;
      }

      map = new maplibregl.Map({
        container: containerRef.current,
        style: resolvedStyle,
        center: FALLBACK_CENTER,
        zoom: FALLBACK_ZOOM,
        fadeDuration: 0,
        minZoom: 2.6,
        maxZoom: 9.8,
        dragRotate: false,
        pitchWithRotate: false,
        touchZoomRotate: true,
        attributionControl: false,
        renderWorldCopies: false,
      });

      mapRef.current = map;

      window.requestAnimationFrame(() => {
        map?.resize();
      });

      map.addControl(
        new maplibregl.AttributionControl({
          compact: true,
        }),
        "bottom-right"
      );

      map.touchZoomRotate.disableRotation();
      map.setMaxBounds(extendBounds(AUSTRALIA_BOUNDS, MAP_MAX_BOUNDS_PADDING));

      map.on("error", (event) => {
        const message = event.error?.message || "地图资源暂时不可用";
        if (message.toLowerCase().includes("abort")) {
          return;
        }
        setMapErrorMessage(message);
      });

      resizeObserverRef.current = new ResizeObserver(() => {
        if (resizeRafRef.current !== null) {
          return;
        }

        resizeRafRef.current = window.requestAnimationFrame(() => {
          resizeRafRef.current = null;
          map?.resize();
        });
      });
      resizeObserverRef.current.observe(frameRef.current ?? containerRef.current);

      const handleLoad = async () => {
        if (!map) return;
        await addSpeciesImages(map);

        map.addSource(MAP_SOURCE_REGIONS, {
          type: "geojson",
          data: REGION_SOURCE_DATA as GeoJSON.FeatureCollection,
        });

      map.addLayer({
        id: MAP_LAYER_REGION_FILL,
        type: "fill",
        source: MAP_SOURCE_REGIONS,
        paint: {
          "fill-color": ["coalesce", ["get", "color"], "#ddc69e"],
          "fill-outline-color": "rgba(0,0,0,0)",
          "fill-opacity-transition": { duration: 420, delay: 0 },
          "fill-opacity": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            0.68,
            ["boolean", ["feature-state", "dimmed"], false],
            0.18,
            ["boolean", ["feature-state", "hover"], false],
            0.54,
            0.38,
          ],
        },
      });

      map.addLayer({
        id: MAP_LAYER_REGION_AURA,
        type: "line",
        source: MAP_SOURCE_REGIONS,
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
        paint: {
          "line-width-transition": { duration: 220, delay: 0 },
          "line-opacity-transition": { duration: 220, delay: 0 },
          "line-blur-transition": { duration: 220, delay: 0 },
          "line-color": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            "#7c6041",
            ["boolean", ["feature-state", "hover"], false],
            "#dfcaa2",
            "#8e7455",
          ],
          "line-width": getRegionAuraLineWidth(14),
          "line-opacity": getRegionAuraLineOpacity(0.12),
          "line-blur": getRegionAuraLineBlur(2.1),
        },
      });

      map.addLayer({
        id: MAP_LAYER_REGION_GLOW,
        type: "line",
        source: MAP_SOURCE_REGIONS,
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
        paint: {
          "line-width-transition": { duration: 200, delay: 0 },
          "line-opacity-transition": { duration: 200, delay: 0 },
          "line-blur-transition": { duration: 200, delay: 0 },
          "line-color": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            "#f7eee1",
            ["boolean", ["feature-state", "hover"], false],
            "#e2cda6",
            "#8e7455",
          ],
          "line-width": getRegionGlowLineWidth(7.8),
          "line-opacity": getRegionGlowLineOpacity(0.2),
          "line-blur": getRegionGlowLineBlur(0.9),
        },
      });

      map.addLayer({
        id: MAP_LAYER_REGION_LINE,
        type: "line",
        source: MAP_SOURCE_REGIONS,
        paint: {
          "line-color-transition": { duration: 180, delay: 0 },
          "line-width-transition": { duration: 180, delay: 0 },
          "line-opacity-transition": { duration: 180, delay: 0 },
          "line-color": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            "#231a12",
            "#8e7455",
          ],
          "line-width": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            4.8,
            ["boolean", ["feature-state", "hover"], false],
            2.4,
            1.5,
          ],
          "line-opacity": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            0.98,
            ["boolean", ["feature-state", "dimmed"], false],
            0.35,
            0.88,
          ],
          "line-blur": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            0,
            0.1,
          ],
        },
      });

      map.addLayer({
        id: MAP_LAYER_REGION_TRACE,
        type: "line",
        source: MAP_SOURCE_REGIONS,
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
        paint: {
          "line-color": "#6a5138",
          "line-width": getRegionTraceWidth(1.35),
          "line-opacity": getRegionTraceOpacity(0.26),
          "line-blur": 0,
        },
      });

      map.addLayer({
        id: MAP_LAYER_REGION_SELECTED_AURA,
        type: "line",
        source: MAP_SOURCE_REGIONS,
        filter: ["==", ["get", "regionId"], "__none__"],
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
        paint: {
          "line-width-transition": { duration: 160, delay: 0 },
          "line-opacity-transition": { duration: 160, delay: 0 },
          "line-color": "#fff4e4",
          "line-width": 8.4,
          "line-opacity": 0.72,
          "line-blur": 0.45,
        },
      });

      map.addLayer({
        id: MAP_LAYER_REGION_SELECTED_LINE,
        type: "line",
        source: MAP_SOURCE_REGIONS,
        filter: ["==", ["get", "regionId"], "__none__"],
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
        paint: {
          "line-width-transition": { duration: 160, delay: 0 },
          "line-opacity-transition": { duration: 160, delay: 0 },
          "line-color": "#1b140e",
          "line-width": 5.9,
          "line-opacity": 0.96,
          "line-blur": 0,
        },
      });

      map.addSource(MAP_SOURCE_SPECIES, {
        type: "geojson",
        data: latestSpeciesSourceDataRef.current as GeoJSON.FeatureCollection,
      });

      map.addLayer({
        id: MAP_LAYER_SPECIES_AURA,
        type: "circle",
        source: MAP_SOURCE_SPECIES,
        paint: {
          "circle-color": ["coalesce", ["get", "color"], "#7da56c"],
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 10, 6, 16, 8.5, 22],
          "circle-opacity": ["coalesce", ["get", "auraOpacity"], 0.18],
          "circle-blur": 0.82,
        },
      });

      map.addLayer({
        id: MAP_LAYER_SPECIES_HIT,
        type: "circle",
        source: MAP_SOURCE_SPECIES,
        paint: {
          "circle-radius": 20,
          "circle-opacity": 0.01,
        },
      });

      map.addLayer({
        id: MAP_LAYER_SPECIES_SYMBOL,
        type: "symbol",
        source: MAP_SOURCE_SPECIES,
        layout: {
          "icon-image": ["get", "iconId"],
          "icon-size": ["coalesce", ["get", "iconScale"], 0.9],
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
        },
        paint: {
          "icon-opacity": ["coalesce", ["get", "iconOpacity"], 0.42],
        },
      });

      map.addSource(MAP_SOURCE_COLONY, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      map.addLayer({
        id: MAP_LAYER_COLONY_AURA,
        type: "circle",
        source: MAP_SOURCE_COLONY,
        paint: {
          "circle-color": ["coalesce", ["get", "color"], "#7da56c"],
          "circle-radius": [
            "interpolate", ["linear"], ["zoom"],
            3, ["*", ["coalesce", ["get", "radius"], 12], 0.5],
            5, ["coalesce", ["get", "radius"], 12],
            7, ["*", ["coalesce", ["get", "radius"], 12], 1.8],
          ],
          "circle-opacity": ["coalesce", ["get", "auraOpacity"], 0.15],
          "circle-blur": 0.75,
          "circle-translate-transition": { duration: 400, delay: 0 },
          "circle-opacity-transition": { duration: 400, delay: 0 },
          "circle-radius-transition": { duration: 600, delay: 0 },
        },
      });

      map.addLayer({
        id: MAP_LAYER_COLONY_SYMBOL,
        type: "symbol",
        source: MAP_SOURCE_COLONY,
        layout: {
          "icon-image": ["get", "iconId"],
          "icon-size": ["coalesce", ["get", "scale"], 0.8],
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
        },
        paint: {
          "icon-opacity": ["coalesce", ["get", "opacity"], 0.7],
          "icon-opacity-transition": { duration: 600, delay: 0 },
        },
      });

      await addExtSpeciesImages(map);

      map.addSource(MAP_SOURCE_EXT, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      map.addLayer(
        {
          id: MAP_LAYER_EXT_AURA,
          type: "circle",
          source: MAP_SOURCE_EXT,
          paint: {
            "circle-color": "#b8a88a",
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 6, 6, 10, 8.5, 14],
            "circle-opacity": 0.1,
            "circle-blur": 0.9,
          },
        },
        MAP_LAYER_SPECIES_AURA
      );

      map.addLayer(
        {
          id: MAP_LAYER_EXT_HIT,
          type: "circle",
          source: MAP_SOURCE_EXT,
          paint: {
            "circle-radius": 16,
            "circle-opacity": 0.01,
          },
        },
        MAP_LAYER_SPECIES_AURA
      );

      map.addLayer(
        {
          id: MAP_LAYER_EXT_SYMBOL,
          type: "symbol",
          source: MAP_SOURCE_EXT,
          layout: {
            "icon-image": ["get", "iconId"],
            "icon-size": ["coalesce", ["get", "iconScale"], 0.28],
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
          },
          paint: {
            "icon-opacity": ["coalesce", ["get", "iconOpacity"], 0.55],
          },
        },
        MAP_LAYER_SPECIES_AURA
      );

      map.on("mousemove", (event) => {
        const activeMap = map;
        if (!activeMap) return;

        const hitLayers: string[] = [];
        if (!latestSelectedSpeciesIdRef.current) {
          hitLayers.push(MAP_LAYER_SPECIES_HIT);
          if (activeMap.getLayer(MAP_LAYER_EXT_HIT)) hitLayers.push(MAP_LAYER_EXT_HIT);
        }

        const hoveredSpecies = hitLayers.length
          ? (activeMap.queryRenderedFeatures(event.point, {
              layers: hitLayers,
            })[0] as MapGeoJSONFeature | undefined)
          : undefined;
        const hoveredRegionId = findRegionIdByLngLat(event.lngLat.lng, event.lngLat.lat);

        if (hoveredSpecies || hoveredRegionId) {
          activeMap.getCanvas().style.cursor = "pointer";
        } else {
          activeMap.getCanvas().style.cursor = "";
        }

        setHoveredRegionId(hoveredRegionId);
      });

      map.on("mouseleave", () => {
        const activeMap = map;
        if (!activeMap) return;
        activeMap.getCanvas().style.cursor = "";
        setHoveredRegionId(null);
      });

      map.on("click", (event) => {
        const activeMap = map;
        if (!activeMap) return;

        const colonyFeature = activeMap.queryRenderedFeatures(event.point, {
          layers: [MAP_LAYER_COLONY_SYMBOL],
        })[0] as MapGeoJSONFeature | undefined;
        if (colonyFeature) {
          const nextSpeciesId = colonyFeature.properties?.speciesId;
          if (typeof nextSpeciesId === "string") {
            const geom = colonyFeature.geometry as GeoJSON.Point;
            const featureLngLat: [number, number] = [geom.coordinates[0], geom.coordinates[1]];
            const pointId = colonyFeature.properties?.pointId;
            selectedPrimaryPointIdRef.current = typeof pointId === "string" ? pointId : null;
            speciesClickOriginRef.current = featureLngLat;
            cameraPositionedForSpeciesRef.current = null;
            actionRefs.current.openSpecies(nextSpeciesId, featureLngLat);
            return;
          }
        }

        if (!latestSelectedSpeciesIdRef.current) {
          const coreFeature = activeMap.queryRenderedFeatures(event.point, {
            layers: [MAP_LAYER_SPECIES_HIT],
          })[0] as MapGeoJSONFeature | undefined;
          if (coreFeature) {
            const nextSpeciesId = coreFeature.properties?.id;
            if (typeof nextSpeciesId === "string") {
              const geom = coreFeature.geometry as GeoJSON.Point;
              const featureLngLat: [number, number] = [geom.coordinates[0], geom.coordinates[1]];
              const pointId = coreFeature.properties?.pointId;
              selectedPrimaryPointIdRef.current = typeof pointId === "string" ? pointId : null;
              speciesClickOriginRef.current = featureLngLat;
              cameraPositionedForSpeciesRef.current = null;
              actionRefs.current.openSpecies(nextSpeciesId, featureLngLat);
              return;
            }
          }

          if (activeMap.getLayer(MAP_LAYER_EXT_HIT)) {
            const extFeature = activeMap.queryRenderedFeatures(event.point, {
              layers: [MAP_LAYER_EXT_HIT],
            })[0] as MapGeoJSONFeature | undefined;
            if (extFeature) {
              const nextSpeciesId = extFeature.properties?.id;
              if (typeof nextSpeciesId === "string") {
                const geom = extFeature.geometry as GeoJSON.Point;
                const featureLngLat: [number, number] = [geom.coordinates[0], geom.coordinates[1]];
                const pointId = extFeature.properties?.pointId;
                selectedPrimaryPointIdRef.current = typeof pointId === "string" ? pointId : null;
                speciesClickOriginRef.current = featureLngLat;
                cameraPositionedForSpeciesRef.current = null;
                actionRefs.current.openSpecies(nextSpeciesId, featureLngLat);
                return;
              }
            }
          }
        }

        const nextRegionId = findRegionIdByLngLat(event.lngLat.lng, event.lngLat.lat);

        actionRefs.current.triggerAmbient(
          event.lngLat.lat,
          event.lngLat.lng,
          nextRegionId
        );

        if (nextRegionId) {
          const isClosingRegion = latestFocusRegionIdRef.current === nextRegionId;
          regionFocusAnchorRef.current = isClosingRegion
            ? null
            : {
                regionId: nextRegionId,
                center: [event.lngLat.lng, event.lngLat.lat],
              };
          actionRefs.current.setSelectedSpecies(null);
          actionRefs.current.setFocusRegion(
            isClosingRegion ? null : nextRegionId
          );
          return;
        }

        if (latestSelectedSpeciesIdRef.current) {
          selectedPrimaryPointIdRef.current = null;
          actionRefs.current.setSelectedSpecies(null);
          return;
        }

        if (latestFocusRegionIdRef.current) {
          regionFocusAnchorRef.current = null;
          actionRefs.current.setFocusRegion(null);
        }
      });

        map.resize();
        window.requestAnimationFrame(() => {
          const currentMap = mapRef.current;
          if (!currentMap) return;
          currentMap.resize();
          isMapReadyRef.current = true;
          setMapErrorMessage(null);
          setMapBooted(true);
          setMapReadyRef.current(true);
        });
      };

      // Map load timeout (PRD §8.2) — 30s
      timeoutId = window.setTimeout(() => {
        if (!isMapReadyRef.current) {
          setMapLoadTimeout(true);
        }
      }, 30_000);

      map.on("load", () => {
        if (timeoutId !== null) {
          window.clearTimeout(timeoutId);
          timeoutId = null;
        }
        void handleLoad();
      });
    };

    void initializeMap();

    return () => {
      isDisposed = true;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (speciesFitBoundsTimerRef.current !== null) {
        window.clearTimeout(speciesFitBoundsTimerRef.current);
        speciesFitBoundsTimerRef.current = null;
      }
      selectedMarkerRef.current?.remove();
      selectedMarkerRef.current = null;
      if (colonyPulseRafRef.current !== null) {
        window.cancelAnimationFrame(colonyPulseRafRef.current);
        colonyPulseRafRef.current = null;
      }
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      if (resizeRafRef.current !== null) {
        window.cancelAnimationFrame(resizeRafRef.current);
        resizeRafRef.current = null;
      }
      isMapReadyRef.current = false;
      cameraPositionedForSpeciesRef.current = null;
      setMapBooted(false);
      setMapLoadTimeout(false);
      setMapErrorMessage(null);
      setMapReadyRef.current(false);
      map?.remove();
      if (mapRef.current === map) {
        mapRef.current = null;
      }
    };
  }, [mapConfig.provider, mapConfig.style]);

  React.useEffect(() => {
    if (!mapBooted) return;
    syncRegionFeatureStates();
  }, [mapBooted, syncRegionFeatureStates]);

  React.useEffect(() => {
    syncSpeciesSource();
  }, [syncSpeciesSource]);

  React.useEffect(() => {
    syncColonySource();
  }, [syncColonySource]);

  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapReadyRef.current) return;
    const src = map.getSource(MAP_SOURCE_EXT) as GeoJSONSource | undefined;
    if (src) {
      src.setData(extSourceData as GeoJSON.FeatureCollection);
    }
  }, [extSourceData]);

  React.useEffect(() => {
    if (!mapBooted) return;
    syncCamera();
  }, [mapBooted, focusRegionId, syncCamera]);

  React.useEffect(() => {
    if (speciesFitBoundsTimerRef.current !== null) {
      window.clearTimeout(speciesFitBoundsTimerRef.current);
      speciesFitBoundsTimerRef.current = null;
    }

    if (!selectedSpeciesId) {
      cameraPositionedForSpeciesRef.current = null;
      selectedPrimaryPointIdRef.current = null;
      speciesClickOriginRef.current = null;
    }

    if (!mapBooted) return;
    syncCamera();
  }, [mapBooted, selectedSpeciesId, syncCamera]);

  React.useEffect(() => {
    if (!mapBooted || !selectedSpeciesId || selectedSpeciesId.startsWith("ext_")) {
      return;
    }

    if (!speciesClickOriginRef.current) {
      return;
    }

    syncCamera();
  }, [mapBooted, selectedSpeciesClickLngLat, selectedSpeciesId, syncCamera]);

  React.useEffect(() => {
    if (colonyPulseRafRef.current !== null) {
      window.cancelAnimationFrame(colonyPulseRafRef.current);
      colonyPulseRafRef.current = null;
    }

    if (!selectedSpecies?.isVisibleOnMap || shouldReduceMotion) {
      setColonyPulseScale(1);
      return;
    }

    const tick = (timestamp: number) => {
      setColonyPulseScale(1 + Math.sin(timestamp / 420) * 0.06);
      colonyPulseRafRef.current = window.requestAnimationFrame(tick);
    };

    colonyPulseRafRef.current = window.requestAnimationFrame(tick);

    return () => {
      if (colonyPulseRafRef.current !== null) {
        window.cancelAnimationFrame(colonyPulseRafRef.current);
        colonyPulseRafRef.current = null;
      }
    };
  }, [selectedSpecies?.id, selectedSpecies?.isVisibleOnMap, shouldReduceMotion]);

  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapReadyRef.current) return;

    selectedMarkerRef.current?.remove();
    selectedMarkerRef.current = null;
    setSelectedMarkerHost(null);

    if (!selectedSpecies?.isVisibleOnMap) {
      return;
    }

    const lngLat: [number, number] = primarySelectedPoint?.coordinates
      ?? [selectedSpecies.geoPoint.lng, selectedSpecies.geoPoint.lat];

    const host = document.createElement("div");
    const marker = new maplibregl.Marker({
      element: host,
      anchor: "center",
      offset: [0, 0],
    })
      .setLngLat(lngLat)
      .addTo(map);

    selectedMarkerRef.current = marker;
    setSelectedMarkerHost(host);

    return () => {
      marker.remove();
      if (selectedMarkerRef.current === marker) {
        selectedMarkerRef.current = null;
      }
      setSelectedMarkerHost(null);
    };
  }, [
    primarySelectedPoint,
    selectedSpecies?.geoPoint.lat,
    selectedSpecies?.geoPoint.lng,
    selectedSpecies?.id,
    selectedSpecies?.isVisibleOnMap,
    selectedSpeciesClickLngLat,
  ]);

  return (
    <div ref={frameRef} className="relative h-full w-full overflow-hidden rounded-[2rem]">
      <div
        className="absolute inset-0 rounded-[2rem]"
        style={{
          background:
            "radial-gradient(circle at 18% 16%, rgba(236, 223, 196, 0.44), transparent 28%), radial-gradient(circle at 82% 18%, rgba(158, 195, 216, 0.18), transparent 22%), linear-gradient(180deg, rgba(253,248,239,0.7), rgba(242,230,206,0.24))",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.42), inset 0 0 0 1px rgba(156,128,92,0.16), 0 24px 48px rgba(94,74,47,0.1)",
        }}
      />

      <div
        ref={containerRef}
        className="absolute inset-0 rounded-[2rem]"
        aria-label="澳大利亚高精度地图"
      />
      <div
        id="atlas-cloud-layer"
        className="pointer-events-none absolute inset-0 z-20 overflow-hidden rounded-[2rem]"
        aria-hidden
      />

      <div className="pointer-events-none absolute inset-0 rounded-[2rem] border border-[rgba(145,117,84,0.18)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.2)]" />

      <div className="pointer-events-none absolute right-5 top-5 z-20 flex items-center gap-2">
        <div className="atlas-map-chip">
          {mapConfig.provider === "maptiler"
            ? mapConfig.isCustomStyle
              ? "MapTiler 绘本底图"
              : "MapTiler 底图已接入"
            : mapConfig.provider === "openfreemap"
            ? "OpenFreeMap 细节底图"
            : "本地州界高精度模式"}
        </div>
      </div>

      {webGLUnsupported && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center">
          <div className="atlas-map-loading">
            <p className="text-base font-display" style={{ color: "var(--earth-deep)" }}>
              浏览器不支持地图渲染
            </p>
            <p className="mt-2 text-sm" style={{ color: "var(--warm-gray)" }}>
              请使用 Chrome、Firefox 或 Safari 最新版本访问
            </p>
          </div>
        </div>
      )}

      {!mapBooted && !webGLUnsupported && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <div className="atlas-map-loading">
            <span className="atlas-kicker">Atlas Map</span>
            {mapLoadTimeout ? (
              <p style={{ color: "var(--coral)" }}>
                地图底图加载超时。请检查网络连接，或确认 MAPTILER_KEY 配置是否正确。
              </p>
            ) : (
              <p>{mapErrorMessage ? "地图底图暂时未响应，正在尝试恢复。" : "正在铺开澳大利亚的地理底图"}</p>
            )}
          </div>
        </div>
      )}

      {mapErrorMessage && (
        <div className="pointer-events-none absolute inset-x-4 top-20 z-20 flex justify-center">
          <div className="atlas-map-error">
            <span className="atlas-kicker">Map Notice</span>
            <p>{mapErrorMessage}</p>
          </div>
        </div>
      )}

      <AnimatePresence>
        {regionTransitionLabel && !shouldReduceMotion && (
          <motion.div
            key={regionTransitionLabel}
            initial={{ opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.99 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center"
          >
            <div className="atlas-region-transition-card">
              <span className="atlas-kicker">Map Focus</span>
              <p>{regionTransitionLabel}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="pointer-events-none absolute right-8 top-20 z-20 opacity-55">
        <div className="flex flex-col items-center text-[rgba(116,95,69,0.46)]">
          <span className="font-display text-[1.25rem] tracking-[0.12em]">N</span>
          <div className="mt-2 h-20 w-px bg-[rgba(129,106,78,0.3)]" />
          <div className="-mt-10 h-px w-20 bg-[rgba(129,106,78,0.3)]" />
        </div>
      </div>

      {mapBooted &&
        (selectedSpecies || selectedExtSpecies) &&
        cloudDistributionPoints.length > 1 && (
          <div className="pointer-events-none absolute bottom-5 left-5 z-20">
            <div
              className="atlas-distribution-guide"
              style={
                {
                  "--distribution-guide-color": selectedDistributionColor,
                } as React.CSSProperties
              }
            >
              <span className="atlas-kicker">Distribution Trace</span>
              <div className="atlas-distribution-guide__sample" aria-hidden>
                <span className="atlas-distribution-guide__dot atlas-distribution-guide__dot--active" />
                <span className="atlas-distribution-guide__line" />
                <span className="atlas-distribution-guide__dot" />
              </div>
              <p>虚线连接当前观察点与其他分布簇</p>
            </div>
          </div>
        )}

      {selectedMarkerHost &&
        selectedSpecies &&
        selectedSpecies.isVisibleOnMap &&
        createPortal(
          <SelectedSpeciesMarker
            species={selectedSpecies}
            onToggle={() =>
              setSelectedSpecies(selectedSpeciesId === selectedSpecies.id ? null : selectedSpecies.id)
            }
          />,
          selectedMarkerHost
        )}

      {mapBooted && (selectedSpecies || selectedExtSpecies) && cloudDistributionPoints.length > 0 && (
        <CloudEffectLayer
          speciesId={selectedSpeciesId}
          color={selectedDistributionColor}
          group={selectedSpecies?.group || selectedExtSpecies?.taxonomicClass || "native"}
          distributionPoints={cloudDistributionPoints}
          map={mapRef.current}
        />
      )}
    </div>
  );
}
