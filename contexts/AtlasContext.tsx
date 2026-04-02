"use client";

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import { YEAR_MIN, YEAR_MAX, YEAR_NOW } from "@/lib/constants";
import { getPreferredRegionId } from "@/lib/species-ui";

interface AtlasState {
  currentYear: number;
  isPlaying: boolean;
  focusRegionId: string | null;
  selectedSpeciesId: string | null;
  selectedSpeciesClickLngLat: [number, number] | null;
  searchKeyword: string;
  hasSeenIntro: boolean;
  isNowMode: boolean;
  isMapReady: boolean;
  ambientAudioEnabled: boolean;
  currentAmbientZoneId: string | null;
}

interface AtlasActions {
  setCurrentYear: (year: number) => void;
  togglePlay: () => void;
  stopPlay: () => void;
  jumpToStart: () => void;
  jumpToNow: () => void;
  setFocusRegion: (regionId: string | null) => void;
  setSelectedSpecies: (speciesId: string | null) => void;
  openSpecies: (speciesId: string, clickLngLat?: [number, number]) => void;
  setSearchKeyword: (keyword: string) => void;
  markIntroSeen: () => void;
  setMapReady: (ready: boolean) => void;
  setAmbientAudioEnabled: (enabled: boolean) => void;
  setCurrentAmbientZoneId: (zoneId: string | null) => void;
}

const AtlasContext = createContext<(AtlasState & AtlasActions) | null>(null);

export function AtlasProvider({ children }: { children: React.ReactNode }) {
  const [currentYear, setCurrentYearRaw] = useState(YEAR_MIN);
  const [isPlaying, setIsPlaying] = useState(false);
  const [focusRegionId, setFocusRegionId] = useState<string | null>(null);
  const [selectedSpeciesId, setSelectedSpeciesId] = useState<string | null>(null);
  const [selectedSpeciesClickLngLat, setSelectedSpeciesClickLngLat] = useState<[number, number] | null>(null);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [hasSeenIntro, setHasSeenIntro] = useState(false);
  const [isMapReady, setMapReady] = useState(false);
  const [ambientAudioEnabled, setAmbientAudioEnabledRaw] = useState(true);
  const [currentAmbientZoneId, setCurrentAmbientZoneId] = useState<string | null>(null);
  const playRef = useRef<number | null>(null);

  const isNowMode = currentYear >= YEAR_NOW;

  const setCurrentYear = useCallback((year: number) => {
    setCurrentYearRaw(Math.max(YEAR_MIN, Math.min(YEAR_MAX, Math.round(year))));
  }, []);

  const stopPlay = useCallback(() => {
    setIsPlaying(false);
    if (playRef.current) {
      cancelAnimationFrame(playRef.current);
      playRef.current = null;
    }
  }, []);

  const togglePlay = useCallback(() => {
    setIsPlaying((prev) => !prev);
  }, []);

  const jumpToStart = useCallback(() => {
    stopPlay();
    setCurrentYearRaw(YEAR_MIN);
  }, [stopPlay]);

  const jumpToNow = useCallback(() => {
    stopPlay();
    setCurrentYearRaw(YEAR_NOW);
  }, [stopPlay]);

  const setFocusRegion = useCallback((regionId: string | null) => {
    setFocusRegionId(regionId);
  }, []);

  const setSelectedSpecies = useCallback((speciesId: string | null) => {
    setSelectedSpeciesId(speciesId);
    if (!speciesId) setSelectedSpeciesClickLngLat(null);
  }, []);

  const openSpecies = useCallback((speciesId: string, clickLngLat?: [number, number]) => {
    setSelectedSpeciesId(speciesId);
    setSelectedSpeciesClickLngLat(clickLngLat ?? null);
    if (!speciesId.startsWith("ext_")) {
      setFocusRegionId((prev) => getPreferredRegionId(speciesId, prev));
    }
  }, []);

  const markIntroSeen = useCallback(() => {
    setHasSeenIntro(true);
    if (typeof window !== "undefined") {
      localStorage.setItem("atlas-intro-seen", "true");
    }
  }, []);

  const setAmbientAudioEnabled = useCallback((enabled: boolean) => {
    setAmbientAudioEnabledRaw(enabled);
    if (typeof window !== "undefined") {
      localStorage.setItem("atlas-ambient-enabled", String(enabled));
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const seen = localStorage.getItem("atlas-intro-seen");
      if (seen === "true") setHasSeenIntro(true);

      const ambientPref = localStorage.getItem("atlas-ambient-enabled");
      if (ambientPref === "false") setAmbientAudioEnabledRaw(false);
    }
  }, []);

  useEffect(() => {
    if (!isPlaying) return;

    let lastTime = performance.now();
    const YEARS_PER_SECOND = 30;

    const tick = (now: number) => {
      const delta = (now - lastTime) / 1000;
      lastTime = now;

      setCurrentYearRaw((prev) => {
        const next = prev + delta * YEARS_PER_SECOND;
        if (next >= YEAR_MAX) {
          setIsPlaying(false);
          return YEAR_MAX;
        }
        return Math.round(next);
      });

      playRef.current = requestAnimationFrame(tick);
    };

    playRef.current = requestAnimationFrame(tick);

    return () => {
      if (playRef.current) cancelAnimationFrame(playRef.current);
    };
  }, [isPlaying]);

  return (
    <AtlasContext.Provider
      value={{
        currentYear,
        isPlaying,
        focusRegionId,
        selectedSpeciesId,
        selectedSpeciesClickLngLat,
        searchKeyword,
        hasSeenIntro,
        isNowMode,
        isMapReady,
        ambientAudioEnabled,
        currentAmbientZoneId,
        setCurrentYear,
        togglePlay,
        stopPlay,
        jumpToStart,
        jumpToNow,
        setFocusRegion,
        setSelectedSpecies,
        openSpecies,
        setSearchKeyword,
        markIntroSeen,
        setMapReady,
        setAmbientAudioEnabled,
        setCurrentAmbientZoneId,
      }}
    >
      {children}
    </AtlasContext.Provider>
  );
}

export function useAtlas() {
  const ctx = useContext(AtlasContext);
  if (!ctx) throw new Error("useAtlas must be used within AtlasProvider");
  return ctx;
}
