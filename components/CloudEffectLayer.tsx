"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import maplibregl from "maplibre-gl";
import speciesData from "@/data/species.json";

interface DistributionPoint {
  lat: number;
  lng: number;
  weight: number;
}

interface CloudProps {
  speciesId: string | null;
  color: string;
  group: string;
  distributionPoints: DistributionPoint[];
  map: maplibregl.Map | null;
}

const GROUP_ICON_PATHS: Record<string, string> = {
  extinct: "M12,2 C8,2 4,6 4,10 C4,14 8,18 12,22 C16,18 20,14 20,10 C20,6 16,2 12,2Z",
  endangered: "M12,3 L14,9 L20,9 L15,13 L17,19 L12,15 L7,19 L9,13 L4,9 L10,9Z",
  native: "M12,4 C8,4 5,7 5,11 C5,15 12,22 12,22 C12,22 19,15 19,11 C19,7 16,4 12,4Z",
  invasive: "M12,2 L15,8 L22,8 L16.5,12.5 L18.5,19 L12,15 L5.5,19 L7.5,12.5 L2,8 L9,8Z",
  marine: "M4,12 C4,12 8,6 12,6 C16,6 20,12 20,12 C20,12 16,18 12,18 C8,18 4,12 4,12Z",
};

function hexToRgba(hex: string, alpha: number) {
  const normalized = hex.replace("#", "").trim();
  const expanded =
    normalized.length === 3
      ? normalized
          .split("")
          .map((char) => `${char}${char}`)
          .join("")
      : normalized;

  if (expanded.length !== 6) {
    return `rgba(125, 165, 108, ${alpha})`;
  }

  const value = Number.parseInt(expanded, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function mixHexColors(hexA: string, hexB: string, amount: number) {
  const normalize = (hex: string) => {
    const value = hex.replace("#", "").trim();
    if (value.length === 3) {
      return value
        .split("")
        .map((char) => `${char}${char}`)
        .join("");
    }
    return value;
  };

  const a = normalize(hexA);
  const b = normalize(hexB);
  if (a.length !== 6 || b.length !== 6) {
    return hexA;
  }

  const mixChannel = (start: string, end: string) => {
    const startValue = Number.parseInt(start, 16);
    const endValue = Number.parseInt(end, 16);
    return Math.round(startValue + (endValue - startValue) * amount)
      .toString(16)
      .padStart(2, "0");
  };

  return `#${mixChannel(a.slice(0, 2), b.slice(0, 2))}${mixChannel(
    a.slice(2, 4),
    b.slice(2, 4)
  )}${mixChannel(a.slice(4, 6), b.slice(4, 6))}`;
}

function getCloudPalette(color: string) {
  const parchment = "#fff6ea";
  const parchmentDeep = "#f0dfc0";
  const earthShadow = "#8b7558";
  const connectorCore = mixHexColors(color, earthShadow, 0.16);
  const connectorHalo = mixHexColors(color, parchment, 0.56);
  const bubbleTint = mixHexColors(color, parchment, 0.62);
  const bubbleEdge = mixHexColors(color, earthShadow, 0.18);
  const bubbleShadow = mixHexColors(color, earthShadow, 0.3);
  const iconColor = mixHexColors(color, earthShadow, 0.1);

  return {
    connectorCore,
    connectorHalo,
    bubbleTint,
    bubbleEdge,
    bubbleShadow,
    iconColor,
    parchment,
    parchmentDeep,
  };
}

function useMapPosition(map: maplibregl.Map, lat: number, lng: number) {
  const [screenPos, setScreenPos] = useState<{ x: number; y: number } | null>(null);
  const rafRef = useRef<number | null>(null);

  const updatePosition = useCallback(() => {
    const pos = map.project([lng, lat]);
    setScreenPos({ x: pos.x, y: pos.y });
  }, [map, lat, lng]);

  useEffect(() => {
    updatePosition();

    const onMove = () => {
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        updatePosition();
      });
    };

    map.on("move", onMove);
    map.on("zoom", onMove);

    return () => {
      map.off("move", onMove);
      map.off("zoom", onMove);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [map, updatePosition]);

  return screenPos;
}

function ConnectorLines({
  mainPoint,
  secondaryPoints,
  color,
  map,
}: {
  mainPoint: DistributionPoint;
  secondaryPoints: DistributionPoint[];
  color: string;
  map: maplibregl.Map;
}) {
  const [positions, setPositions] = useState<{
    main: { x: number; y: number };
    secondary: Array<{ x: number; y: number }>;
  } | null>(null);
  const rafRef = useRef<number | null>(null);
  const palette = getCloudPalette(color);

  const updatePositions = useCallback(() => {
    const mainPos = map.project([mainPoint.lng, mainPoint.lat]);
    const secPos = secondaryPoints.map((pt) => {
      const p = map.project([pt.lng, pt.lat]);
      return { x: p.x, y: p.y };
    });
    setPositions({ main: { x: mainPos.x, y: mainPos.y }, secondary: secPos });
  }, [map, mainPoint, secondaryPoints]);

  useEffect(() => {
    updatePositions();

    const onMove = () => {
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        updatePositions();
      });
    };

    map.on("move", onMove);
    map.on("zoom", onMove);

    return () => {
      map.off("move", onMove);
      map.off("zoom", onMove);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [map, updatePositions]);

  if (!positions) return null;

  return (
    <svg
      className="absolute inset-0 h-full w-full"
      style={{ overflow: "visible", pointerEvents: "none" }}
    >
      {positions.secondary.map((secPos, i) => (
        (() => {
          const dx = secPos.x - positions.main.x;
          const dy = secPos.y - positions.main.y;
          const distance = Math.hypot(dx, dy) || 1;
          const ux = dx / distance;
          const uy = dy / distance;
          const mainInset = 34;
          const secondaryInset = 18 + secondaryPoints[i].weight * 7;
          const x1 = positions.main.x + ux * mainInset;
          const y1 = positions.main.y + uy * mainInset;
          const x2 = secPos.x - ux * secondaryInset;
          const y2 = secPos.y - uy * secondaryInset;

          return (
        <g key={i}>
          <line
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={hexToRgba(palette.connectorHalo, 0.8)}
            strokeWidth="3.8"
            strokeLinecap="round"
            strokeDasharray="6 7"
          />
          <line
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={hexToRgba(palette.connectorCore, 0.78)}
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray="6 7"
          />
        </g>
          );
        })()
      ))}
    </svg>
  );
}

function CloudBubble({
  point,
  index,
  isMain,
  color,
  group,
  map,
  reducedMotion,
}: {
  point: DistributionPoint;
  index: number;
  isMain: boolean;
  color: string;
  group: string;
  map: maplibregl.Map;
  reducedMotion: boolean;
}) {
  const screenPos = useMapPosition(map, point.lat, point.lng);
  const iconPath = GROUP_ICON_PATHS[group] ?? GROUP_ICON_PATHS.native;

  if (!screenPos) return null;

  const baseSize = isMain ? 48 : 28 + point.weight * 10;
  const amplitude = 2 + (index % 5) * 1.0;
  const period = 8 + (index * 1.7) % 6;
  const phase = (index * 1.37) % (2 * Math.PI);
  const palette = getCloudPalette(color);
  const secondaryGlow = hexToRgba(palette.bubbleTint, 0.36 + point.weight * 0.12);
  const secondaryBorder = hexToRgba(palette.bubbleEdge, 0.9);
  const secondaryCore = hexToRgba(color, 0.28 + point.weight * 0.12);
  const secondaryWash = hexToRgba(palette.bubbleTint, 0.94);
  const secondaryIcon = hexToRgba(palette.iconColor, 0.96);
  const secondaryShadow = hexToRgba(palette.bubbleShadow, 0.24);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{
        opacity: 1,
        scale: reducedMotion
          ? 1
          : isMain
            ? [1, 1.03, 1]
            : 1,
        x: reducedMotion || isMain ? 0 : [
          Math.cos(phase) * amplitude,
          Math.cos(phase + Math.PI) * amplitude,
          Math.cos(phase) * amplitude,
        ],
        y: reducedMotion || isMain ? 0 : [
          Math.sin(phase) * amplitude * 0.7,
          Math.sin(phase + Math.PI) * amplitude * 0.7,
          Math.sin(phase) * amplitude * 0.7,
        ],
      }}
      exit={{ opacity: 0, scale: 0.6 }}
      transition={
        reducedMotion
          ? { duration: 0.3 }
          : isMain
            ? {
                opacity: { duration: 0.3 },
                scale: { duration: 4, repeat: Infinity, ease: "easeInOut" },
              }
            : {
                opacity: { duration: 0.3 },
                scale: { duration: 0.3 },
                x: { duration: period, repeat: Infinity, ease: "easeInOut" },
                y: { duration: period * 1.1, repeat: Infinity, ease: "easeInOut" },
              }
      }
      className="absolute"
      style={{
        left: screenPos.x - baseSize / 2,
        top: screenPos.y - baseSize / 2,
        width: baseSize,
        height: baseSize,
        pointerEvents: "none",
      }}
    >
      <div
        className="flex h-full w-full items-center justify-center rounded-full"
        style={{
          background: isMain
            ? `rgba(255,250,243,0.96)`
            : `radial-gradient(circle at 32% 28%, rgba(255,251,245,0.99) 0%, ${secondaryWash} 46%, ${secondaryCore} 100%)`,
          border: isMain
            ? `3px solid ${color}`
            : `2.5px solid ${secondaryBorder}`,
          boxShadow: isMain
            ? `0 0 0 8px ${color}22, 0 8px 24px ${color}44`
            : `0 0 0 3px rgba(255,247,236,0.9), 0 0 0 7px ${secondaryGlow}, 0 10px 24px ${secondaryShadow}`,
          opacity: isMain ? 1 : 0.9 + point.weight * 0.06,
        }}
      >
        <svg
          width={isMain ? 24 : 16}
          height={isMain ? 24 : 16}
          viewBox="0 0 24 24"
        >
          <path d={iconPath} fill={isMain ? color : secondaryIcon} opacity="0.94" />
        </svg>
      </div>
    </motion.div>
  );
}

export default function CloudEffectLayer({ speciesId, color, group, distributionPoints, map }: CloudProps) {
  const shouldReduceMotion = useReducedMotion() ?? false;
  const [mountTarget, setMountTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const el = document.getElementById("atlas-cloud-layer");
    setMountTarget(el);
  }, []);

  if (!mountTarget || !map || !speciesId) return null;

  const species = speciesData.find((s) => s.id === speciesId);
  const effectColor = species?.color || color;
  const effectGroup = species?.group || group;

  const mainPoint = distributionPoints[0];
  const secondaryPoints = distributionPoints.slice(1, 13);

  return createPortal(
    <AnimatePresence>
      {speciesId && mainPoint && secondaryPoints.length > 0 && (
        <motion.div
          key={speciesId}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="absolute inset-0"
        >
          <ConnectorLines
            mainPoint={mainPoint}
            secondaryPoints={secondaryPoints}
            color={effectColor}
            map={map}
          />
          {secondaryPoints.map((pt, i) => (
            <CloudBubble
              key={i}
              point={pt}
              index={i + 1}
              isMain={false}
              color={effectColor}
              group={effectGroup}
              map={map}
              reducedMotion={shouldReduceMotion}
            />
          ))}
        </motion.div>
      )}
    </AnimatePresence>,
    mountTarget
  );
}
