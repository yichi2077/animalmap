"use client";

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import { YEAR_MIN, YEAR_MAX, YEAR_NOW } from "@/lib/constants";
import { getPreferredRegionId } from "@/lib/species-ui";

interface AtlasState {
  currentYear: number;
  isPlaying: boolean;
  focusRegionId: string | null;
  selectedSpeciesId: string | null;
  searchKeyword: string;
  hasSeenIntro: boolean;
  isNowMode: boolean;
}

interface AtlasActions {
  setCurrentYear: (year: number) => void;
  togglePlay: () => void;
  stopPlay: () => void;
  jumpToStart: () => void;
  jumpToNow: () => void;
  setFocusRegion: (regionId: string | null) => void;
  setSelectedSpecies: (speciesId: string | null) => void;
  openSpecies: (speciesId: string) => void;
  setSearchKeyword: (keyword: string) => void;
  markIntroSeen: () => void;
}

const AtlasContext = createContext<(AtlasState & AtlasActions) | null>(null);

export function AtlasProvider({ children }: { children: React.ReactNode }) {
  const [currentYear, setCurrentYearRaw] = useState(YEAR_MIN);
  const [isPlaying, setIsPlaying] = useState(false);
  const [focusRegionId, setFocusRegionId] = useState<string | null>(null);
  const [selectedSpeciesId, setSelectedSpeciesId] = useState<string | null>(null);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [hasSeenIntro, setHasSeenIntro] = useState(false);
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
  }, []);

  const openSpecies = useCallback((speciesId: string) => {
    setSelectedSpeciesId(speciesId);
    setFocusRegionId((prev) => getPreferredRegionId(speciesId, prev));
  }, []);

  const markIntroSeen = useCallback(() => {
    setHasSeenIntro(true);
    if (typeof window !== "undefined") {
      localStorage.setItem("atlas-intro-seen", "true");
    }
  }, []);

  // Check localStorage for intro seen
  useEffect(() => {
    if (typeof window !== "undefined") {
      const seen = localStorage.getItem("atlas-intro-seen");
      if (seen === "true") setHasSeenIntro(true);
    }
  }, []);

  // Playback loop
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
        searchKeyword,
        hasSeenIntro,
        isNowMode,
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
