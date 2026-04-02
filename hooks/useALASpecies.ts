"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { kMeansCluster } from "@/lib/kmeans";

export interface ExtendedSpecies {
  id: string;
  lsid: string;
  nameEn: string;
  scientificName: string;
  taxonomicClass: string;
  occurrenceCount: number;
  primaryState: string;
  dangerStatus: string;
  isCore: false;
  distributionPoints?: Array<{ lat: number; lng: number; weight: number }>;
  populationScore?: number;
}

const MAX_CACHED = 80;
const BATCH_SIZE = 15;
const BATCH_INTERVAL = 1200;

function computePopulationScore(count: number): number {
  return Math.log(count + 1) / Math.log(5001);
}

export function useALASpecies(focusRegionId: string | null, isMapReady: boolean) {
  const [loadedSpecies, setLoadedSpecies] = useState<ExtendedSpecies[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [totalExpected, setTotalExpected] = useState(0);
  const cacheRef = useRef<Map<string, ExtendedSpecies>>(new Map());
  const fetchedLsids = useRef<Set<string>>(new Set());
  const abortRef = useRef<AbortController | null>(null);

  const fetchSpeciesList = useCallback(
    async (stateId?: string): Promise<ExtendedSpecies[]> => {
      const params = new URLSearchParams({ limit: "30" });
      if (stateId) params.set("stateId", stateId);

      try {
        const res = await fetch(`/api/ala/species?${params.toString()}`);
        if (!res.ok) return [];
        const data: Array<{
          lsid: string;
          nameEn: string;
          scientificName: string;
          taxonomicClass: string;
          occurrenceCount: number;
          dangerStatus: string;
        }> = await res.json();

        return data
          .filter((d) => !fetchedLsids.current.has(d.lsid))
          .map((d) => ({
            id: `ext_${d.lsid.slice(-20)}`,
            lsid: d.lsid,
            nameEn: d.nameEn,
            scientificName: d.scientificName,
            taxonomicClass: d.taxonomicClass,
            occurrenceCount: d.occurrenceCount,
            primaryState: stateId || "nsw",
            dangerStatus: d.dangerStatus,
            isCore: false as const,
            populationScore: computePopulationScore(d.occurrenceCount),
          }));
      } catch {
        return [];
      }
    },
    []
  );

  const fetchDistribution = useCallback(
    async (species: ExtendedSpecies): Promise<ExtendedSpecies | null> => {
      if (fetchedLsids.current.has(species.lsid)) {
        const cached = cacheRef.current.get(species.lsid);
        return cached ?? null;
      }

      try {
        const params = new URLSearchParams({
          lsid: species.lsid,
          yearFrom: "1970",
          yearTo: "2024",
          limit: "200",
        });
        const res = await fetch(`/api/ala/occurrences?${params.toString()}`);
        if (!res.ok) return null;

        const data: { occurrences: Array<{ lat: number; lng: number }> } =
          await res.json();
        if (!data.occurrences || data.occurrences.length === 0) return null;

        const clusters = kMeansCluster(data.occurrences);
        const enriched: ExtendedSpecies = {
          ...species,
          distributionPoints: clusters,
        };

        fetchedLsids.current.add(species.lsid);
        cacheRef.current.set(species.lsid, enriched);

        if (cacheRef.current.size > MAX_CACHED) {
          const firstKey = cacheRef.current.keys().next().value;
          if (firstKey) cacheRef.current.delete(firstKey);
        }

        return enriched;
      } catch {
        return null;
      }
    },
    []
  );

  useEffect(() => {
    if (!isMapReady) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    let cancelled = false;

    const loadAll = async () => {
      setIsLoading(true);

      const states = ["qld", "nsw", "vic", "wa", "sa", "tas", "nt", "act"];
      const priorityState = focusRegionId || undefined;
      const orderedStates = priorityState
        ? [priorityState, ...states.filter((s) => s !== priorityState)]
        : states;

      let allSpecies: ExtendedSpecies[] = [];
      for (const stateId of orderedStates) {
        if (cancelled) return;
        const batch = await fetchSpeciesList(stateId);
        allSpecies = [...allSpecies, ...batch];
      }

      const unique = new Map<string, ExtendedSpecies>();
      for (const sp of allSpecies) {
        if (!unique.has(sp.lsid)) unique.set(sp.lsid, sp);
      }
      const speciesList = Array.from(unique.values());
      setTotalExpected(speciesList.length);

      for (let i = 0; i < speciesList.length; i += BATCH_SIZE) {
        if (cancelled) return;

        const batch = speciesList.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(
          batch.map((sp) => fetchDistribution(sp))
        );

        const valid = results.filter(
          (r): r is ExtendedSpecies => r !== null && (r.distributionPoints?.length ?? 0) > 0
        );

        if (valid.length > 0) {
          setLoadedSpecies((prev) => {
            const existingIds = new Set(prev.map((s) => s.lsid));
            const newSpecies = valid.filter((s) => !existingIds.has(s.lsid));
            return [...prev, ...newSpecies].slice(0, MAX_CACHED);
          });
        }

        if (i + BATCH_SIZE < speciesList.length) {
          await new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, BATCH_INTERVAL);
            if (cancelled) {
              clearTimeout(timer);
              resolve();
            }
          });
        }
      }

      setIsLoading(false);
    };

    const timer = setTimeout(loadAll, 3000);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [isMapReady, focusRegionId, fetchSpeciesList, fetchDistribution]);

  return {
    loadedSpecies,
    isLoading,
    loadedCount: loadedSpecies.length,
    totalExpected,
  };
}
