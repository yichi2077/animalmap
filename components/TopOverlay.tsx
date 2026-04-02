"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useAtlas } from "@/contexts/AtlasContext";
import { useExtendedSpecies } from "@/contexts/ExtendedSpeciesContext";
import speciesData from "@/data/species.json";
import regionsData from "@/data/regions.json";
import { useMediaQuery } from "@/hooks/useMediaQuery";

const GROUP_ICON_PATHS: Record<string, string> = {
  extinct: "M12,2 C8,2 4,6 4,10 C4,14 8,18 12,22 C16,18 20,14 20,10 C20,6 16,2 12,2Z",
  endangered: "M12,3 L14,9 L20,9 L15,13 L17,19 L12,15 L7,19 L9,13 L4,9 L10,9Z",
  native: "M12,4 C8,4 5,7 5,11 C5,15 12,22 12,22 C12,22 19,15 19,11 C19,7 16,4 12,4Z",
  invasive: "M12,2 L15,8 L22,8 L16.5,12.5 L18.5,19 L12,15 L5.5,19 L7.5,12.5 L2,8 L9,8Z",
  marine: "M4,12 C4,12 8,6 12,6 C16,6 20,12 20,12 C20,12 16,18 12,18 C8,18 4,12 4,12Z",
  bird: "M12,4 C8,4 5,7 5,11 C5,15 12,22 12,22 C12,22 19,15 19,11 C19,7 16,4 12,4Z",
  mammal: "M12,4 C8,4 5,7 5,11 C5,15 12,22 12,22 C12,22 19,15 19,11 C19,7 16,4 12,4Z",
  reptile: "M4,12 C4,12 8,6 12,6 C16,6 20,12 20,12 C20,12 16,18 12,18 C8,18 4,12 4,12Z",
  amphibian: "M12,2 C8,2 4,6 4,10 C4,14 8,18 12,22 C16,18 20,14 20,10 C20,6 16,2 12,2Z",
};

const TAXON_COLORS: Record<string, string> = {
  bird: "#7da56c",
  mammal: "#b8a88a",
  reptile: "#e08a58",
  amphibian: "#64ba9c",
  marine: "#9ec3d8",
};

interface SearchResult {
  id: string;
  nameZh?: string;
  nameEn: string;
  color?: string;
  isCore: boolean;
  taxonomicClass?: string;
}

export default function TopOverlay() {
  const {
    currentYear,
    focusRegionId,
    selectedSpeciesId,
    setFocusRegion,
    setSelectedSpecies,
    searchKeyword,
    setSearchKeyword,
    openSpecies,
    ambientAudioEnabled,
    setAmbientAudioEnabled,
  } = useAtlas();

  const { loadedSpecies } = useExtendedSpecies();

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const isMobile = useMediaQuery("(max-width: 767px)");
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    if (isSearchOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isSearchOpen]);

  const suggestions = useMemo((): SearchResult[] => {
    if (!searchKeyword.trim()) return [];
    const kw = searchKeyword.toLowerCase();

    const coreResults: SearchResult[] = speciesData
      .filter(
        (sp) =>
          sp.nameZh.includes(searchKeyword) ||
          sp.nameEn.toLowerCase().includes(kw) ||
          sp.scientificName?.toLowerCase().includes(kw)
      )
      .map((sp) => ({
        id: sp.id,
        nameZh: sp.nameZh,
        nameEn: sp.nameEn,
        color: sp.color,
        isCore: true,
      }));

    const extResults: SearchResult[] = loadedSpecies
      .filter(
        (sp) =>
          sp.nameEn.toLowerCase().includes(kw) ||
          sp.scientificName.toLowerCase().includes(kw)
      )
      .map((sp) => ({
        id: sp.id,
        nameEn: sp.nameEn,
        isCore: false,
        taxonomicClass: sp.taxonomicClass,
      }));

    return [...coreResults, ...extResults].slice(0, 8);
  }, [searchKeyword, loadedSpecies]);

  const handleSelect = (speciesId: string) => {
    openSpecies(speciesId);
    setSearchKeyword("");
    setIsSearchOpen(false);
  };

  const yearDisplay = currentYear <= 1770 ? "1788前" : String(currentYear);
  const currentRegion = focusRegionId
    ? regionsData.find((region) => region.id === focusRegionId)
    : null;
  const showDropdown = isSearchOpen && searchKeyword.trim().length > 0;
  const panelOpen = Boolean(focusRegionId || selectedSpeciesId);
  const isFocusedStory = Boolean(currentRegion);

  useEffect(() => {
    if (!panelOpen) return;
    setIsSearchOpen(false);
  }, [panelOpen]);

  return (
    <div
      className="pointer-events-none fixed left-1/2 top-0 z-40 -translate-x-1/2 pt-4 lg:pt-5"
      style={{
        width: isMobile ? "calc(100vw - 1rem)" : "min(84rem, calc(100vw - 3rem))",
        maxWidth: !isMobile && panelOpen ? "calc(100vw - 29rem)" : "84rem",
      }}
    >
      <div
        className={`grid items-start gap-4 ${
          isMobile || panelOpen
            ? "grid-cols-1"
            : "grid-cols-[minmax(0,1fr)_minmax(16rem,18rem)]"
        }`}
      >
        <div className="pointer-events-auto flex items-start gap-2 px-1.5 sm:px-2 justify-self-start">
          <motion.div
            layout
            transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
            className="storybook-panel storybook-float overflow-hidden"
            style={
              isFocusedStory
                ? { width: isMobile ? "13.2rem" : "15.75rem" }
                : { width: isMobile ? "min(100%, 18rem)" : "min(100%, 21rem)" }
            }
          >
            <AnimatePresence mode="popLayout" initial={false}>
              {isFocusedStory ? (
                <motion.div
                  key="story-compact"
                  layout
                  initial={{ opacity: 0, y: -10, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.96 }}
                  transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                  className="flex items-center gap-3 px-4 py-3"
                >
                  <span className="atlas-kicker">Story Time</span>
                  <motion.span
                    layoutId="story-year"
                    className="inline-flex min-w-[5.5ch] justify-end font-display text-[1.5rem] font-bold leading-none tracking-[0.02em]"
                    style={{ color: "var(--earth-deep)", fontVariantNumeric: "tabular-nums" }}
                  >
                    {yearDisplay}
                  </motion.span>
                </motion.div>
              ) : (
                <motion.div
                  key="story-full"
                  layout
                  initial={{ opacity: 0, y: -10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.98 }}
                  transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                  className="px-5 py-3"
                >
                  <div className="min-w-0">
                    <div className="atlas-kicker">Story Time</div>
                    <div className="mt-1 flex items-end gap-3">
                      <motion.span
                        layoutId="story-year"
                        className="inline-flex min-w-[5.5ch] justify-start font-display font-bold leading-none tracking-[0.02em]"
                        style={{ color: "var(--earth-deep)", fontVariantNumeric: "tabular-nums", fontSize: isMobile ? "1.8rem" : "2.45rem" }}
                      >
                        {yearDisplay}
                      </motion.span>
                    </div>
                    <AnimatePresence>
                      {currentYear <= 1788 && (
                        <motion.p
                          key="inferred-disclaimer"
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                          className="mt-1 text-[0.63rem] leading-relaxed"
                          style={{ color: "var(--warm-gray)", opacity: 0.68 }}
                        >
                          ≈ 推断层：此时期基于生态推断，非确切历史记录
                        </motion.p>
                      )}
                    </AnimatePresence>
                    <p className="mt-1 text-[0.7rem] leading-relaxed" style={{ color: "var(--warm-gray)" }}>
                      {selectedSpeciesId
                        ? "点选动物头像后，右栏会切到它的现场笔记与档案。"
                        : "先点地图上的动物，再拖动时间尺看它一路如何变化。"}
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          <AnimatePresence>
            {isFocusedStory && (
              <motion.button
                initial={{ opacity: 0, x: -10, scale: 0.96 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: -10, scale: 0.96 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                onClick={() => {
                  if (selectedSpeciesId) {
                    setSelectedSpecies(null);
                  }
                  setFocusRegion(null);
                }}
                className="storybook-panel atlas-focus-ring flex h-12 items-center gap-2 rounded-full px-3 text-sm font-medium"
                style={{
                  color: "var(--bark)",
                  background: "linear-gradient(180deg, rgba(243, 238, 224, 0.94), rgba(228, 236, 218, 0.9))",
                  border: "1px solid rgba(120, 143, 104, 0.2)",
                }}
              >
                <span className="text-base leading-none">←</span>
                返回全局
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        <AnimatePresence>
          {!panelOpen && (
            <motion.div
              initial={{ opacity: 0, y: -16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              className={`pointer-events-auto relative flex items-start gap-2 ${isMobile ? "justify-self-start w-full max-w-[20rem]" : "justify-self-end"}`}
            >
              <div className="storybook-panel relative flex-1 overflow-visible px-4 py-3">
                <div className="atlas-kicker">Search Species</div>
                <p className="mt-1 text-[0.68rem] leading-5" style={{ color: "var(--warm-gray)" }}>
                  搜索核心物种与在线扩展物种
                </p>
                <AnimatePresence mode="wait">
                  {isSearchOpen ? (
                    <motion.div
                      key="search-input"
                      initial={{ width: 64, opacity: 0.6 }}
                      animate={{ width: isMobile ? 214 : 240, opacity: 1 }}
                      exit={{ width: 64, opacity: 0.6 }}
                      className="mt-2 flex items-center gap-2 overflow-hidden"
                    >
                      <div
                        className="flex h-10 w-10 items-center justify-center rounded-full"
                        style={{ background: "rgba(223, 234, 218, 0.82)" }}
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                          <circle cx="7" cy="7" r="5" stroke="var(--earth-light)" strokeWidth="1.5" />
                          <line x1="11" y1="11" x2="14" y2="14" stroke="var(--earth-light)" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                      </div>
                      <input
                        ref={inputRef}
                        type="text"
                        value={searchKeyword}
                        onChange={(e) => setSearchKeyword(e.target.value)}
                        placeholder="搜索物种名称"
                        className="atlas-focus-ring h-10 flex-1 rounded-full border-none bg-transparent px-1 text-sm outline-none"
                        style={{ color: "var(--text-primary)" }}
                        aria-label="搜索物种"
                        aria-controls="species-search-results"
                        onBlur={() => {
                          if (!searchKeyword) {
                            setTimeout(() => setIsSearchOpen(false), 180);
                          }
                        }}
                      />
                      <button
                        onClick={() => {
                          setSearchKeyword("");
                          setIsSearchOpen(false);
                        }}
                        className="atlas-focus-ring inline-flex h-9 w-9 items-center justify-center rounded-full text-sm"
                        style={{ color: "var(--warm-gray)", background: "rgba(242, 232, 214, 0.76)" }}
                        aria-label="关闭搜索"
                      >
                        ✕
                      </button>
                    </motion.div>
                  ) : (
                    <motion.button
                      key="search-btn"
                      onClick={() => setIsSearchOpen(true)}
                      className={`atlas-focus-ring mt-2 flex h-11 items-center gap-3 rounded-full px-3 text-sm ${
                        isMobile ? "w-full" : "w-[15rem]"
                      }`}
                      style={{
                        background: "rgba(249, 239, 220, 0.78)",
                        color: "var(--earth-deep)",
                        border: "1px solid rgba(126, 150, 109, 0.22)",
                      }}
                      aria-label="打开搜索"
                      aria-expanded={isSearchOpen}
                      aria-controls="species-search-results"
                    >
                      <span
                        className="flex h-8 w-8 items-center justify-center rounded-full"
                        style={{ background: "rgba(236, 224, 203, 0.82)" }}
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                          <circle cx="7" cy="7" r="5" stroke="var(--earth)" strokeWidth="1.5" />
                          <line x1="11" y1="11" x2="14" y2="14" stroke="var(--earth)" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                      </span>
                      搜索一只动物
                    </motion.button>
                  )}
                </AnimatePresence>

                <AnimatePresence>
                  {showDropdown && (
                    <motion.div
                      id="species-search-results"
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      className="storybook-panel absolute right-0 mt-3 w-[17rem] overflow-hidden p-2"
                    >
                      {suggestions.length > 0 ? (
                        suggestions.map((sp) => (
                          <button
                            key={sp.id}
                            onClick={() => handleSelect(sp.id)}
                            className="atlas-focus-ring flex w-full items-center gap-3 rounded-[1rem] px-3 py-2.5 text-left transition-colors hover:bg-[rgba(239,223,196,0.48)]"
                          >
                            {sp.isCore ? (
                              <span className="h-3.5 w-3.5 flex-shrink-0 rounded-full shadow-sm" style={{ background: sp.color }} />
                            ) : (
                              <span
                                className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full"
                                style={{ background: (TAXON_COLORS[sp.taxonomicClass || "mammal"] || "#b8a88a") + "22" }}
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24">
                                  <path
                                    d={GROUP_ICON_PATHS[sp.taxonomicClass || "native"]}
                                    fill={TAXON_COLORS[sp.taxonomicClass || "mammal"] || "#b8a88a"}
                                    opacity="0.8"
                                  />
                                </svg>
                              </span>
                            )}
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm" style={{ color: "var(--text-primary)" }}>
                                {sp.nameZh || sp.nameEn}
                              </span>
                              {sp.nameZh && (
                                <span className="block text-[0.72rem]" style={{ color: "var(--warm-gray)" }}>
                                  {sp.nameEn}
                                </span>
                              )}
                              {!sp.isCore && (
                                <span className="text-[0.62rem]" style={{ color: "var(--warm-gray)", opacity: 0.7 }}>
                                  ALA 在线物种
                                </span>
                              )}
                            </span>
                          </button>
                        ))
                      ) : (
                        <div className="rounded-[1rem] px-3 py-3 text-sm leading-relaxed" style={{ color: "var(--warm-gray)" }}>
                          没找到匹配的动物。试试中文名、英文名，或从地图上直接点选。
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <button
                onClick={() => setAmbientAudioEnabled(!ambientAudioEnabled)}
                className="atlas-focus-ring mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full transition-colors"
                style={{
                  background: ambientAudioEnabled
                    ? "rgba(125,165,108,0.18)"
                    : "rgba(239,223,196,0.6)",
                }}
                title={ambientAudioEnabled ? "关闭环境音" : "开启环境音（点击地图区域播放）"}
                aria-label={ambientAudioEnabled ? "关闭环境音" : "开启环境音"}
              >
                {ambientAudioEnabled ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M11 5L6 9H2v6h4l5 4V5z" fill="var(--leaf)" opacity="0.8" />
                    <path d="M15.54 8.46a5 5 0 010 7.07" stroke="var(--leaf)" strokeWidth="1.5" strokeLinecap="round" />
                    <path d="M19.07 4.93a10 10 0 010 14.14" stroke="var(--leaf)" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M11 5L6 9H2v6h4l5 4V5z" fill="var(--warm-gray)" opacity="0.5" />
                    <line x1="17" y1="9" x2="23" y2="15" stroke="var(--warm-gray)" strokeWidth="1.5" strokeLinecap="round" />
                    <line x1="23" y1="9" x2="17" y2="15" stroke="var(--warm-gray)" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                )}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
