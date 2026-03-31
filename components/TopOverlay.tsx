"use client";

import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAtlas } from "@/contexts/AtlasContext";
import speciesData from "@/data/species.json";
import regionsData from "@/data/regions.json";
export default function TopOverlay() {
  const {
    currentYear,
    focusRegionId,
    selectedSpeciesId,
    setFocusRegion,
    searchKeyword,
    setSearchKeyword,
    openSpecies,
  } = useAtlas();

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<typeof speciesData>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isSearchOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isSearchOpen]);

  useEffect(() => {
    if (!searchKeyword.trim()) {
      setSuggestions([]);
      return;
    }

    const kw = searchKeyword.toLowerCase();
    const matched = speciesData.filter(
      (sp) => sp.nameZh.includes(searchKeyword) || sp.nameEn.toLowerCase().includes(kw)
    );
    setSuggestions(matched.slice(0, 6));
  }, [searchKeyword]);

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
      style={{ width: "min(84rem, calc(100vw - 3rem))", maxWidth: panelOpen ? "calc(100vw - 29rem)" : "84rem" }}
    >
      <div
        className={`grid items-start gap-4 ${
          panelOpen
            ? "grid-cols-1"
            : "grid-cols-[minmax(0,1fr)_minmax(16rem,18rem)]"
        }`}
      >
        <div className="pointer-events-auto flex items-start gap-2 px-2 justify-self-start">
          <motion.div
            layout
            transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
            className="storybook-panel storybook-float overflow-hidden"
            style={isFocusedStory ? { width: "15.75rem" } : { width: "min(100%, 21rem)" }}
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
                        className="inline-flex min-w-[5.5ch] justify-start font-display text-[2.45rem] font-bold leading-none tracking-[0.02em]"
                        style={{ color: "var(--earth-deep)", fontVariantNumeric: "tabular-nums" }}
                      >
                        {yearDisplay}
                      </motion.span>
                    </div>
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
                onClick={() => setFocusRegion(null)}
                className="storybook-panel atlas-focus-ring flex h-12 items-center gap-2 rounded-full px-3 text-sm font-medium"
                style={{
                  color: "var(--earth-deep)",
                  background: "rgba(250, 240, 221, 0.9)",
                  border: "1px solid rgba(170, 146, 112, 0.28)",
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
              className="pointer-events-auto relative justify-self-end"
            >
              <div className="storybook-panel relative overflow-visible px-4 py-3">
                <div className="atlas-kicker">Search Species</div>
                <AnimatePresence mode="wait">
                  {isSearchOpen ? (
                    <motion.div
                      key="search-input"
                      initial={{ width: 64, opacity: 0.6 }}
                      animate={{ width: 240, opacity: 1 }}
                      exit={{ width: 64, opacity: 0.6 }}
                      className="mt-2 flex items-center gap-2 overflow-hidden"
                    >
                      <div
                        className="flex h-10 w-10 items-center justify-center rounded-full"
                        style={{ background: "rgba(236, 224, 203, 0.82)" }}
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                          <circle cx="7" cy="7" r="5" stroke="var(--earth-light)" strokeWidth="1.5" />
                          <line
                            x1="11"
                            y1="11"
                            x2="14"
                            y2="14"
                            stroke="var(--earth-light)"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                          />
                        </svg>
                      </div>
                      <input
                        ref={inputRef}
                        type="text"
                        value={searchKeyword}
                        onChange={(e) => setSearchKeyword(e.target.value)}
                        placeholder="搜索动物名称..."
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
                      className="atlas-focus-ring mt-2 flex h-11 w-[15rem] items-center gap-3 rounded-full px-3 text-sm"
                      style={{
                        background: "rgba(249, 239, 220, 0.78)",
                        color: "var(--earth-deep)",
                        border: "1px solid rgba(170, 146, 112, 0.2)",
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
                          <line
                            x1="11"
                            y1="11"
                            x2="14"
                            y2="14"
                            stroke="var(--earth)"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                          />
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
                            <span
                              className="h-3.5 w-3.5 rounded-full shadow-sm"
                              style={{ background: sp.color }}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm" style={{ color: "var(--text-primary)" }}>
                                {sp.nameZh}
                              </span>
                              <span className="block text-[0.72rem]" style={{ color: "var(--warm-gray)" }}>
                                {sp.nameEn}
                              </span>
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
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
