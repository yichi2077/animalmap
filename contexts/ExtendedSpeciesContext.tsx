"use client";

import React, { createContext, useContext } from "react";
import { useALASpecies, ExtendedSpecies } from "@/hooks/useALASpecies";
import { useAtlas } from "@/contexts/AtlasContext";

interface ExtendedSpeciesState {
  loadedSpecies: ExtendedSpecies[];
  isLoading: boolean;
  loadedCount: number;
  totalExpected: number;
}

const ExtendedSpeciesContext = createContext<ExtendedSpeciesState>({
  loadedSpecies: [],
  isLoading: false,
  loadedCount: 0,
  totalExpected: 0,
});

export function ExtendedSpeciesProvider({ children }: { children: React.ReactNode }) {
  const { focusRegionId, isMapReady } = useAtlas();
  const data = useALASpecies(focusRegionId, isMapReady);

  return (
    <ExtendedSpeciesContext.Provider value={data}>
      {children}
    </ExtendedSpeciesContext.Provider>
  );
}

export function useExtendedSpecies() {
  return useContext(ExtendedSpeciesContext);
}
