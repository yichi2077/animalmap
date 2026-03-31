"use client";

import React from "react";
import { createPortal } from "react-dom";
import maplibregl, { GeoJSONSource, MapGeoJSONFeature } from "maplibre-gl";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { useAtlas } from "@/contexts/AtlasContext";
import { getAtlasMapConfig } from "@/lib/map-style";
import { interpolateKeyframes, KeyframeData } from "@/lib/interpolate";
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

const MAP_SOURCE_REGIONS = "atlas-regions";
const MAP_SOURCE_SPECIES = "atlas-species";
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

const TIMELINE = timelineData as Record<string, KeyframeData[]>;

const GROUP_ICON_PATHS: Record<string, string> = {
  extinct: "M12,2 C8,2 4,6 4,10 C4,14 8,18 12,22 C16,18 20,14 20,10 C20,6 16,2 12,2Z",
  endangered: "M12,3 L14,9 L20,9 L15,13 L17,19 L12,15 L7,19 L9,13 L4,9 L10,9Z",
  native: "M12,4 C8,4 5,7 5,11 C5,15 12,22 12,22 C12,22 19,15 19,11 C19,7 16,4 12,4Z",
  invasive: "M12,2 L15,8 L22,8 L16.5,12.5 L18.5,19 L12,15 L5.5,19 L7.5,12.5 L2,8 L9,8Z",
  marine: "M4,12 C4,12 8,6 12,6 C16,6 20,12 20,12 C20,12 16,18 12,18 C8,18 4,12 4,12Z",
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

function buildSpeciesSourceData(species: ProcessedSpecies[]) {
  return {
    type: "FeatureCollection",
    features: species
      .filter((entry) => entry.isVisibleOnMap && !entry.isSelected)
      .map((entry) => ({
        type: "Feature" as const,
        id: entry.id,
        geometry: {
          type: "Point" as const,
          coordinates: [entry.geoPoint.lng, entry.geoPoint.lat],
        },
        properties: {
          id: entry.id,
          nameZh: entry.nameZh,
          color: entry.color,
          iconId: entry.id,
          iconOpacity: entry.iconOpacity,
          iconScale: entry.iconScale,
          auraOpacity: entry.auraOpacity,
        },
      })),
  };
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
    searchKeyword,
    setFocusRegion,
    setSelectedSpecies,
    openSpecies,
  } = useAtlas();
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
  const latestSpeciesSourceDataRef = React.useRef<ReturnType<typeof buildSpeciesSourceData>>(
    buildSpeciesSourceData([])
  );
  const actionRefs = React.useRef({
    openSpecies,
    setFocusRegion,
    setSelectedSpecies,
  });
  const previousFocusRegionIdRef = React.useRef<string | null>(focusRegionId);
  const [hoveredRegionId, setHoveredRegionId] = React.useState<string | null>(null);
  const [selectedMarkerHost, setSelectedMarkerHost] = React.useState<HTMLDivElement | null>(null);
  const [mapBooted, setMapBooted] = React.useState(false);
  const [regionTransitionLabel, setRegionTransitionLabel] = React.useState<string | null>(null);

  const mapConfig = React.useMemo(() => getAtlasMapConfig(), []);

  React.useEffect(() => {
    latestFocusRegionIdRef.current = focusRegionId;
  }, [focusRegionId]);

  React.useEffect(() => {
    latestSelectedSpeciesIdRef.current = selectedSpeciesId;
  }, [selectedSpeciesId]);

  React.useEffect(() => {
    actionRefs.current = {
      openSpecies,
      setFocusRegion,
      setSelectedSpecies,
    };
  }, [openSpecies, setFocusRegion, setSelectedSpecies]);

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
      const introYear = typeof species.introYear === "number" ? species.introYear : null;
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

      const iconOpacity = isSelected ? 0 : selectedSpeciesId ? baseOpacity * 0.42 : baseOpacity;
      const auraOpacity = Math.min(iconOpacity * 0.48, 0.28);
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

  const speciesSourceData = React.useMemo(
    () => buildSpeciesSourceData(processedSpecies),
    [processedSpecies]
  );

  React.useEffect(() => {
    latestSpeciesSourceDataRef.current = speciesSourceData;
  }, [speciesSourceData]);

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

  const syncCamera = React.useCallback(() => {
    const map = mapRef.current;
    const frame = frameRef.current;
    if (!map || !frame || !isMapReadyRef.current) return;

    const cameraMode: CameraMode = selectedSpecies?.isVisibleOnMap
      ? "species"
      : focusRegionId
      ? "region"
      : "overview";
    const padding = getCameraPadding(frame.clientWidth, cameraMode);
    const duration = shouldReduceMotion
      ? 0
      : selectedSpecies?.isVisibleOnMap
      ? 760
      : focusRegionId
      ? 620
      : 460;

    map.stop();

    if (selectedSpecies?.isVisibleOnMap) {
      map.flyTo({
        center: [selectedSpecies.geoPoint.lng, selectedSpecies.geoPoint.lat],
        zoom: Math.max(map.getZoom(), getFocusZoom(focusRegionId)),
        padding,
        duration,
        essential: true,
      });
      return;
    }

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
  }, [focusRegionId, selectedSpecies, shouldReduceMotion]);

  React.useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: mapConfig.style,
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

    map.addControl(
      new maplibregl.AttributionControl({
        compact: true,
      }),
      "bottom-right"
    );

    map.touchZoomRotate.disableRotation();
    map.setMaxBounds(extendBounds(AUSTRALIA_BOUNDS, MAP_MAX_BOUNDS_PADDING));

    resizeObserverRef.current = new ResizeObserver(() => {
      if (resizeRafRef.current !== null) {
        return;
      }

      resizeRafRef.current = window.requestAnimationFrame(() => {
        resizeRafRef.current = null;
        map.resize();
      });
    });
    resizeObserverRef.current.observe(frameRef.current ?? containerRef.current);

    const handleLoad = async () => {
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

      map.on("mousemove", (event) => {
        const hoveredSpecies = map.queryRenderedFeatures(event.point, {
          layers: [MAP_LAYER_SPECIES_HIT],
        })[0] as MapGeoJSONFeature | undefined;
        const hoveredRegionId = findRegionIdByLngLat(event.lngLat.lng, event.lngLat.lat);

        if (hoveredSpecies || hoveredRegionId) {
          map.getCanvas().style.cursor = "pointer";
        } else {
          map.getCanvas().style.cursor = "";
        }

        setHoveredRegionId(hoveredRegionId);
      });

      map.on("mouseleave", () => {
        map.getCanvas().style.cursor = "";
        setHoveredRegionId(null);
      });

      map.on("click", (event) => {
        const speciesFeature = map.queryRenderedFeatures(event.point, {
          layers: [MAP_LAYER_SPECIES_HIT],
        })[0] as MapGeoJSONFeature | undefined;
        if (speciesFeature) {
          const nextSpeciesId = speciesFeature.properties?.id;
          if (typeof nextSpeciesId === "string") {
            actionRefs.current.openSpecies(nextSpeciesId);
            return;
          }
        }

        const nextRegionId = findRegionIdByLngLat(event.lngLat.lng, event.lngLat.lat);
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
          actionRefs.current.setSelectedSpecies(null);
          return;
        }

        if (latestFocusRegionIdRef.current) {
          regionFocusAnchorRef.current = null;
          actionRefs.current.setFocusRegion(null);
        }
      });

      isMapReadyRef.current = true;
      setMapBooted(true);
    };

    map.on("load", () => {
      void handleLoad();
    });

    return () => {
      selectedMarkerRef.current?.remove();
      selectedMarkerRef.current = null;
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      if (resizeRafRef.current !== null) {
        window.cancelAnimationFrame(resizeRafRef.current);
        resizeRafRef.current = null;
      }
      isMapReadyRef.current = false;
      map.remove();
      mapRef.current = null;
    };
  }, [mapConfig.style]);

  React.useEffect(() => {
    if (!mapBooted) return;
    syncRegionFeatureStates();
  }, [mapBooted, syncRegionFeatureStates]);

  React.useEffect(() => {
    syncSpeciesSource();
  }, [syncSpeciesSource]);

  React.useEffect(() => {
    if (!mapBooted) return;
    const map = mapRef.current;
    if (!map || !isMapReadyRef.current) return;
    syncCamera();
  }, [mapBooted, syncCamera]);

  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapReadyRef.current) return;

    selectedMarkerRef.current?.remove();
    selectedMarkerRef.current = null;
    setSelectedMarkerHost(null);

    if (!selectedSpecies?.isVisibleOnMap) {
      return;
    }

    const host = document.createElement("div");
    const marker = new maplibregl.Marker({
      element: host,
      anchor: "center",
      offset: [0, -6],
    })
      .setLngLat([selectedSpecies.geoPoint.lng, selectedSpecies.geoPoint.lat])
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
  }, [selectedSpecies?.geoPoint.lat, selectedSpecies?.geoPoint.lng, selectedSpecies?.id, selectedSpecies?.isVisibleOnMap]);

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

      {!mapBooted && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <div className="atlas-map-loading">
            <span className="atlas-kicker">Atlas Map</span>
            <p>正在铺开澳大利亚的地理底图</p>
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
    </div>
  );
}
