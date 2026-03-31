"use client";

import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useAtlas } from "@/contexts/AtlasContext";
import speciesData from "@/data/species.json";
import regionsData from "@/data/regions.json";
import timelineData from "@/data/timeline.json";
import audioData from "@/data/audio.json";
import { interpolateKeyframes, KeyframeData } from "@/lib/interpolate";
import { CONSERVATION_LEVELS } from "@/lib/constants";
import { getSpeciesTemporalState } from "@/lib/species-ui";

const timeline = timelineData as Record<string, KeyframeData[]>;
const audioMeta = audioData as Record<
  string,
  { src: string; type: string; label: string; description: string }
>;

function AudioPlayer({ speciesId }: { speciesId: string }) {
  const meta = audioMeta[speciesId];
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    setErrorMessage("");
    setProgress(0);
    setIsPlaying(false);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [speciesId]);

  const toggleAudio = () => {
    if (!meta) return;

    if (!audioRef.current) {
      audioRef.current = new Audio(meta.src);
      audioRef.current.addEventListener("ended", () => {
        setIsPlaying(false);
        setProgress(0);
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
      });
    }

    if (isPlaying) {
      audioRef.current.pause();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      setIsPlaying(false);
    } else {
      audioRef.current
        .play()
        .then(() => {
          setErrorMessage("");
          setIsPlaying(true);
          const tick = () => {
            if (audioRef.current && audioRef.current.duration) {
              setProgress(audioRef.current.currentTime / audioRef.current.duration);
            }
            rafRef.current = requestAnimationFrame(tick);
          };
          rafRef.current = requestAnimationFrame(tick);
        })
        .catch(() => {
          setErrorMessage("当前环境暂时无法播放这段声音。");
          setIsPlaying(false);
        });
    }
  };

  if (!meta) return null;

  const isAI = meta.type === "ai_simulated";

  return (
    <div
      className="rounded-[1.1rem] px-3.5 py-3"
      style={{ background: "rgba(239, 223, 196, 0.72)" }}
    >
      <div className="flex items-center gap-2.5">
        <button
          onClick={toggleAudio}
          className="atlas-focus-ring flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full transition-colors"
          style={{
            background: isPlaying ? "var(--coral)" : "var(--earth)",
            color: "rgba(255,249,241,0.96)",
          }}
          aria-label={isPlaying ? "暂停" : "播放声音"}
        >
          {isPlaying ? (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <rect x="2" y="1" width="3" height="10" rx="1" />
              <rect x="7" y="1" width="3" height="10" rx="1" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <path d="M2.5 1v10l8-5z" />
            </svg>
          )}
        </button>

        <div className="min-w-0 flex-1">
          <div className="h-2 overflow-hidden rounded-full" style={{ background: "var(--sand)" }}>
            <motion.div
              className="h-full rounded-full"
              style={{ background: "var(--coral)" }}
              animate={{ width: `${progress * 100}%` }}
              transition={{ duration: 0.1 }}
            />
          </div>
          <div className="mt-1 flex items-center gap-1.5">
            {isAI && (
              <span
                className="rounded-full px-1.5 py-0.5 text-[0.64rem]"
                style={{
                  background: "var(--coral-light)",
                  color: "var(--coral)",
                }}
              >
                AI
              </span>
            )}
            <span className="truncate text-[0.72rem]" style={{ color: "var(--warm-gray)" }}>
              {meta.description}
            </span>
          </div>
          {errorMessage && (
            <p className="mt-1 text-[0.72rem]" style={{ color: "var(--coral)" }}>
              {errorMessage}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function RegionInfo({ regionId }: { regionId: string }) {
  const { currentYear } = useAtlas();
  const [searchDraft, setSearchDraft] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const region = regionsData.find((r) => r.id === regionId);
  if (!region) return null;

  const regionSpecies = speciesData.filter((sp) => sp.states.includes(regionId));
  const speciesWithStatus = regionSpecies.map((sp) => {
    const keyframes = timeline[sp.id] || [];
    const interpolated = interpolateKeyframes(keyframes, currentYear);
    const temporal = getSpeciesTemporalState(sp.id, currentYear);
    return { ...sp, interpolated, temporal };
  });

  const alive = speciesWithStatus.filter(
    (s) =>
      !s.temporal?.isPreArrival &&
      s.interpolated.distributionType !== "extinction" &&
      s.interpolated.populationScore > 0
  );
  const extinct = speciesWithStatus.filter(
    (s) => s.interpolated.distributionType === "extinction"
  );
  const sortedSpecies = [...speciesWithStatus].sort((a, b) => {
    const aRank = a.temporal?.isPreArrival ? 2 : a.interpolated.distributionType === "extinction" ? 1 : 0;
    const bRank = b.temporal?.isPreArrival ? 2 : b.interpolated.distributionType === "extinction" ? 1 : 0;
    if (aRank !== bRank) return aRank - bRank;
    return b.interpolated.populationScore - a.interpolated.populationScore;
  });
  const normalizedQuery = activeQuery.trim().toLowerCase();
  const filteredSpecies = sortedSpecies.filter((sp) => {
    if (!normalizedQuery) return true;
    const scientific = sp.scientificName?.toLowerCase() || "";
    return (
      sp.nameZh.includes(activeQuery.trim()) ||
      sp.nameEn.toLowerCase().includes(normalizedQuery) ||
      scientific.includes(normalizedQuery)
    );
  });
  const hasFilter = normalizedQuery.length > 0;

  const handleSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setActiveQuery(searchDraft.trim());
  };

  return (
    <div className="space-y-4">
      <div>
        <h3
          className="text-base font-display font-bold"
          style={{ color: "var(--text-primary)" }}
        >
          {region.nameZh}
        </h3>
        <p className="text-xs mt-0.5" style={{ color: "var(--warm-gray)" }}>
          {region.nameEn}
        </p>
      </div>

      <div className="flex gap-3">
        <div
          className="flex-1 rounded-xl px-3 py-2 text-center"
          style={{ background: "var(--parchment-dark)" }}
        >
          <div className="text-lg font-display font-bold" style={{ color: "var(--leaf)" }}>
            {alive.length}
          </div>
          <div className="text-[0.72rem]" style={{ color: "var(--warm-gray)" }}>
            现存物种
          </div>
        </div>
        <div
          className="flex-1 rounded-xl px-3 py-2 text-center"
          style={{ background: "var(--parchment-dark)" }}
        >
          <div className="text-lg font-display font-bold" style={{ color: "var(--warm-gray)" }}>
            {extinct.length}
          </div>
          <div className="text-[0.72rem]" style={{ color: "var(--warm-gray)" }}>
            已灭绝
          </div>
        </div>
      </div>

      <div
        className="rounded-[1.1rem] p-2.5"
        style={{ background: "rgba(245, 234, 213, 0.72)" }}
      >
        <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
          <div
            className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full px-3"
            style={{
              background: "rgba(251, 244, 231, 0.9)",
              border: "1px solid rgba(170, 146, 112, 0.2)",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
              <circle cx="7" cy="7" r="5" stroke="var(--earth-light)" strokeWidth="1.4" />
              <line
                x1="11"
                y1="11"
                x2="14"
                y2="14"
                stroke="var(--earth-light)"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
            <input
              type="text"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder={`在${region.nameZh}里搜动物`}
              className="atlas-focus-ring h-full min-w-0 flex-1 border-none bg-transparent text-[0.82rem] outline-none"
              style={{ color: "var(--text-primary)" }}
              aria-label={`${region.nameZh}区域物种搜索`}
            />
          </div>
          <button
            type="submit"
            className="atlas-focus-ring h-10 rounded-full px-3 text-[0.78rem] font-medium"
            style={{
              background: "rgba(233, 218, 191, 0.9)",
              color: "var(--earth-deep)",
              border: "1px solid rgba(170, 146, 112, 0.22)",
            }}
          >
            搜索
          </button>
        </form>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <p className="text-[0.72rem] font-display tracking-[0.12em]" style={{ color: "var(--warm-gray)" }}>
            区域物种
          </p>
          {hasFilter && (
            <button
              type="button"
              onClick={() => {
                setSearchDraft("");
                setActiveQuery("");
              }}
              className="atlas-focus-ring rounded-full px-2 py-0.5 text-[0.68rem]"
              style={{ background: "rgba(236, 222, 198, 0.8)", color: "var(--earth)" }}
            >
              清除筛选
            </button>
          )}
        </div>
        {filteredSpecies.length > 0 ? (
          filteredSpecies.map((sp) => {
            const isExtinct = sp.interpolated.distributionType === "extinction";
            const isPreArrival = Boolean(sp.temporal?.isPreArrival);

            return <SpeciesRow key={sp.id} species={sp} isExtinct={isExtinct} isPreArrival={isPreArrival} />;
          })
        ) : (
          <div
            className="rounded-[0.95rem] px-3 py-3 text-[0.78rem] leading-6"
            style={{ background: "rgba(246, 236, 217, 0.74)", color: "var(--warm-gray)" }}
          >
            在 {region.nameZh} 没找到匹配物种，试试中文名、英文名或学名关键词。
          </div>
        )}
      </div>
    </div>
  );
}

function SpeciesRow({
  species,
  isExtinct,
  isPreArrival,
}: {
  species: typeof speciesData[0] & {
    interpolated: { populationScore: number; distributionType: string; narrative: string };
    temporal?: ReturnType<typeof getSpeciesTemporalState>;
  };
  isExtinct: boolean;
  isPreArrival: boolean;
}) {
  const { openSpecies } = useAtlas();
  const level = CONSERVATION_LEVELS.find((l) => l.key === species.dangerStatus);

  return (
    <button
      onClick={() => openSpecies(species.id)}
      className="atlas-focus-ring w-full flex items-center gap-2.5 rounded-[0.95rem] px-2.5 py-2.5 text-left transition-colors hover:bg-[rgba(239,223,196,0.46)]"
    >
      <span
        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
        style={{
          background: species.color,
          opacity: isExtinct ? 0.3 : 1,
        }}
      />
      <span
        className="text-xs flex-1 text-left"
        style={{
          color: isExtinct ? "var(--warm-gray)" : "var(--text-primary)",
          textDecoration: isExtinct ? "line-through" : "none",
        }}
      >
        {species.nameZh}
      </span>
      {level && (
        <span
          className="rounded-full px-1.5 py-0.5 text-[0.64rem]"
          style={{ background: level.color + "20", color: "var(--earth-deep)" }}
        >
          {isPreArrival ? "未到来" : level.label}
        </span>
      )}
    </button>
  );
}

function SpeciesInfo({ speciesId }: { speciesId: string }) {
  const { currentYear, focusRegionId, setFocusRegion } = useAtlas();
  const species = speciesData.find((sp) => sp.id === speciesId);
  if (!species) return null;

  const keyframes = timeline[species.id] || [];
  const interpolated = interpolateKeyframes(keyframes, currentYear);
  const level = CONSERVATION_LEVELS.find((l) => l.key === species.dangerStatus);
  const isExtinct = interpolated.distributionType === "extinction";

  const populationPercent = Math.round(interpolated.populationScore * 100);

  return (
    <div className="space-y-4">
      <div
        className="rounded-[1.5rem] px-4 py-4"
        style={{ background: "rgba(246, 236, 217, 0.54)" }}
      >
        <div className="atlas-kicker">Field Note</div>
        <div className="mt-3 flex items-start gap-4">
          <div
            className="relative flex h-20 w-20 flex-shrink-0 items-center justify-center overflow-hidden rounded-[1.35rem]"
            style={{
              background: `linear-gradient(180deg, ${species.color}12, ${species.color}26)`,
              border: `1.5px solid ${species.color}36`,
            }}
          >
            <div
              className="absolute h-12 w-12 rounded-full blur-xl"
              style={{ background: `${species.color}44` }}
            />
            <div
              className="relative h-9 w-9 rounded-full"
              style={{
                background: `radial-gradient(circle at 35% 35%, ${species.color}, ${species.color}aa)`,
                opacity: isExtinct ? 0.38 : 0.75,
              }}
            />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-2">
              <h3
                className="font-display text-[1.4rem] font-bold leading-tight"
                style={{ color: "var(--earth-deep)" }}
              >
                {species.nameZh}
              </h3>
              {level && (
                <span
                  className="mt-1 rounded-full px-2 py-0.5 text-[0.68rem] flex-shrink-0"
                  style={{ background: level.color + "18", color: "var(--earth-deep)" }}
                >
                  {level.label}
                </span>
              )}
            </div>
            <p className="mt-1 text-[0.82rem]" style={{ color: "var(--warm-gray)" }}>
              {species.nameEn}
            </p>
            <p className="mt-1 text-[0.72rem] italic" style={{ color: "var(--earth-light)" }}>
              {species.scientificName}
            </p>

            <div className="mt-3 flex flex-wrap gap-1.5">
              <span
                className="rounded-full px-2 py-1 text-[0.68rem]"
                style={{ background: "rgba(244, 232, 210, 0.86)", color: "var(--earth)" }}
              >
                {species.groupLabel}
              </span>
              <span
                className="rounded-full px-2 py-1 text-[0.68rem]"
                style={{
                  background:
                    species.soundType === "ai_simulated" ? "var(--coral-light)" : "var(--leaf-light)",
                  color: species.soundType === "ai_simulated" ? "var(--coral)" : "var(--leaf)",
                }}
              >
                {species.soundType === "ai_simulated" ? "AI 模拟声音" : "真实录音"}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-4">
          <AudioPlayer speciesId={species.id} />
        </div>
      </div>

      <div
        className="space-y-4 rounded-[1.35rem] px-4 py-4"
        style={{ background: "rgba(245, 236, 219, 0.66)" }}
      >
        <div className="atlas-kicker">Current Snapshot</div>

        {level && (
          <div
            className="flex items-center gap-2 rounded-xl px-3 py-2"
            style={{ background: level.color + "12" }}
          >
            <span
              className="w-2 h-2 rounded-full"
              style={{ background: level.color }}
            />
            <span className="text-[0.8rem]" style={{ color: "var(--earth-deep)" }}>
              IUCN: {level.label} ({species.dangerStatus})
            </span>
          </div>
        )}

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[0.72rem]" style={{ color: "var(--warm-gray)" }}>
              种群状态
            </span>
            <span className="text-xs font-display font-bold" style={{ color: "var(--text-primary)" }}>
              {populationPercent}%
            </span>
          </div>
          <div
            className="h-2 overflow-hidden rounded-full"
            style={{ background: "var(--parchment-dark)" }}
          >
            <motion.div
              className="h-full rounded-full"
              style={{
                background: isExtinct
                  ? "var(--warm-gray)"
                  : `linear-gradient(90deg, ${species.color}, ${species.color}cc)`,
              }}
              initial={{ width: 0 }}
              animate={{ width: `${populationPercent}%` }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            />
          </div>
        </div>

        <div
          className="rounded-xl px-3 py-3 text-[0.84rem] leading-7"
          style={{
            background: "var(--parchment-dark)",
            color: "var(--text-secondary)",
          }}
        >
          {interpolated.narrative}
        </div>
      </div>

      <div
        className="space-y-4 rounded-[1.35rem] px-4 py-4"
        style={{ background: "rgba(250, 245, 237, 0.54)" }}
      >
        <div className="atlas-kicker">Species Archive</div>

        <div>
          <p className="mb-1.5 text-[0.72rem] font-display tracking-[0.12em]" style={{ color: "var(--warm-gray)" }}>
            物种故事
          </p>
          <p
            className="text-[0.84rem] leading-7"
            style={{ color: "var(--text-secondary)" }}
          >
            {species.story}
          </p>
        </div>

        <div>
          <p className="mb-1.5 text-[0.72rem] font-display tracking-[0.12em]" style={{ color: "var(--warm-gray)" }}>
            分布区域
          </p>
          <div className="flex flex-wrap gap-1.5">
            {species.states.map((stateId) => {
              const region = regionsData.find((r) => r.id === stateId);
              return (
                <button
                  key={stateId}
                  type="button"
                  onClick={() => setFocusRegion(stateId)}
                  className="atlas-focus-ring rounded-full px-2 py-1 text-[0.68rem]"
                  aria-label={`聚焦到${region?.nameZh || stateId.toUpperCase()}`}
                  style={{
                    background: focusRegionId === stateId ? "rgba(236, 222, 198, 0.96)" : "var(--parchment-dark)",
                    color: "var(--earth)",
                    border: focusRegionId === stateId ? "1px solid rgba(170, 146, 112, 0.36)" : "1px solid transparent",
                  }}
                >
                  {region?.abbr || stateId.toUpperCase()}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function InfoPanel() {
  const { selectedSpeciesId, focusRegionId, setSelectedSpecies, setFocusRegion } = useAtlas();
  const shouldReduceMotion = useReducedMotion();

  const isOpen = !!(selectedSpeciesId || focusRegionId);
  const selectedSpecies = selectedSpeciesId
    ? speciesData.find((species) => species.id === selectedSpeciesId)
    : null;
  const selectedRegion = focusRegionId
    ? regionsData.find((region) => region.id === focusRegionId)
    : null;

  const scrollRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo(0, 0);
    }
  }, [selectedSpeciesId, focusRegionId]);

  const panelKicker = selectedSpecies ? "Species Profile" : "Regional Notes";
  const panelTitle = selectedSpecies
    ? selectedSpecies?.nameZh
    : selectedRegion?.nameZh || "区域档案";
  const panelSubtitle = selectedSpecies
    ? selectedSpecies?.nameEn
    : selectedRegion?.nameEn || "Region Overview";

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ x: 340, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 340, opacity: 0 }}
          transition={
            shouldReduceMotion
              ? { duration: 0 }
              : { type: "spring", stiffness: 200, damping: 25, mass: 0.8 }
          }
          className="pointer-events-auto fixed inset-y-5 right-5 z-30 w-[24rem] xl:w-[25rem]"
        >
          <div
            className="storybook-panel storybook-panel-strong h-full overflow-hidden"
            style={{ borderRadius: "2rem" }}
          >
            <div
              className="sticky top-0 z-10 flex flex-col justify-between px-5 pb-4 pt-5"
              style={{
                background:
                  "linear-gradient(180deg, rgba(251,246,236,1) 0%, rgba(248,240,228,0.98) 72%, rgba(248,240,228,0) 100%)",
              }}
            >
              <div className="flex items-start justify-between gap-4">
                {selectedSpeciesId ? (
                  <button
                    onClick={() => setSelectedSpecies(null)}
                    className="atlas-focus-ring flex shrink-0 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
                    style={{ background: "rgba(239, 223, 196, 0.75)", color: "var(--earth-deep)" }}
                    aria-label="返回区域列表"
                  >
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                      <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    返回区域
                  </button>
                ) : (
                  <div className="atlas-kicker">{panelKicker}</div>
                )}

                <button
                  onClick={() => {
                    setSelectedSpecies(null);
                    setFocusRegion(null);
                  }}
                  className="atlas-focus-ring flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-black/5"
                  style={{ color: "var(--warm-gray)" }}
                  aria-label="关闭面板"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path
                      d="M2 2L10 10M10 2L2 10"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </div>

              <div className="mt-3">
                {selectedSpeciesId && <div className="atlas-kicker mb-1">{panelKicker}</div>}
                <div className="flex flex-wrap items-center gap-2">
                  <h2
                    className="font-display text-[1.45rem] font-bold leading-tight"
                    style={{ color: "var(--earth-deep)" }}
                  >
                    {panelTitle}
                  </h2>
                  {selectedSpeciesId && focusRegionId && (
                    <span className="atlas-chip">
                      {regionsData.find((region) => region.id === focusRegionId)?.abbr}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[0.8rem]" style={{ color: "var(--warm-gray)" }}>
                  {panelSubtitle}
                </p>
              </div>

              <div
                className="mt-4 h-px"
                style={{
                  background:
                    "linear-gradient(90deg, rgba(170,146,112,0), rgba(170,146,112,0.46), rgba(170,146,112,0))",
                }}
              />
            </div>

            <div className="flex h-[calc(100%-8.5rem)] flex-col relative">
              <div ref={scrollRef} className="scrollbar-hide flex-1 overflow-y-auto px-5 pb-6">
                <AnimatePresence mode="wait" initial={false}>
                  {selectedSpeciesId ? (
                    <motion.div
                      key={`species-${selectedSpeciesId}`}
                      initial={shouldReduceMotion ? false : { opacity: 0, y: 16, scale: 0.985 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -10, scale: 0.992 }}
                      transition={
                        shouldReduceMotion
                          ? { duration: 0 }
                          : { duration: 0.28, ease: [0.22, 1, 0.36, 1] }
                      }
                    >
                      <SpeciesInfo speciesId={selectedSpeciesId} />
                    </motion.div>
                  ) : focusRegionId ? (
                    <motion.div
                      key={`region-${focusRegionId}`}
                      initial={shouldReduceMotion ? false : { opacity: 0, y: 18, scale: 0.985 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -12, scale: 0.992 }}
                      transition={
                        shouldReduceMotion
                          ? { duration: 0 }
                          : { duration: 0.32, ease: [0.22, 1, 0.36, 1] }
                      }
                    >
                      <RegionInfo regionId={focusRegionId} />
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
