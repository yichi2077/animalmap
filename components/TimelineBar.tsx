"use client";

import React, { useRef, useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useAtlas } from "@/contexts/AtlasContext";
import { YEAR_MIN, YEAR_MAX, KEYFRAME_YEARS, getTimeLabel } from "@/lib/constants";
import { useMediaQuery } from "@/hooks/useMediaQuery";

const MILESTONE_LABELS: Record<number, string> = {
  1770: "自然状态",
  1788: "殖民开始",
  1900: "世纪之交",
  1935: "蟾蜍引入",
  1950: "战后时代",
  2024: "Now",
};

export default function TimelineBar() {
  const {
    currentYear,
    setCurrentYear,
    isPlaying,
    togglePlay,
    focusRegionId,
    selectedSpeciesId,
    isMapReady,
  } = useAtlas();

  const [displayYear, setDisplayYear] = React.useState(currentYear);
  const [showAmbientHint, setShowAmbientHint] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const detailMode = Boolean(focusRegionId || selectedSpeciesId);
  const timelinePanelId = "atlas-time-console";
  const isMobile = useMediaQuery("(max-width: 767px)");
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    if (!isMapReady) return;
    const seen = localStorage.getItem("atlas-ambient-hint-seen");
    if (seen === "true") return;

    const showTimer = setTimeout(() => setShowAmbientHint(true), 1200);
    const hideTimer = setTimeout(() => {
      setShowAmbientHint(false);
      localStorage.setItem("atlas-ambient-hint-seen", "true");
    }, 4200);

    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
    };
  }, [isMapReady]);

  useEffect(() => {
    if (!isDragging.current) {
      setDisplayYear(currentYear);
    }
  }, [currentYear]);

  const yearToPercent = (year: number) => ((year - YEAR_MIN) / (YEAR_MAX - YEAR_MIN)) * 100;

  const percentToYear = (percent: number) =>
    Math.round(YEAR_MIN + (percent / 100) * (YEAR_MAX - YEAR_MIN));

  const handlePointerEvent = useCallback(
    (e: React.PointerEvent | PointerEvent) => {
      if (!trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      const padding = 24;
      const trackWidth = rect.width - padding * 2;
      const x = Math.max(0, Math.min(e.clientX - rect.left - padding, trackWidth));
      const percent = trackWidth <= 0 ? 0 : (x / trackWidth) * 100;
      const newYear = percentToYear(percent);

      setDisplayYear(newYear);

      React.startTransition(() => {
        setCurrentYear(newYear);
      });
    },
    [setCurrentYear]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      isDragging.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      handlePointerEvent(e);
    },
    [handlePointerEvent]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDragging.current) return;
      handlePointerEvent(e);
    },
    [handlePointerEvent]
  );

  const handlePointerUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
        e.preventDefault();
        setCurrentYear(displayYear - 1);
      }
      if (e.key === "ArrowRight" || e.key === "ArrowUp") {
        e.preventDefault();
        setCurrentYear(displayYear + 1);
      }
      if (e.key === "Escape") {
        e.preventDefault();
        (e.currentTarget as HTMLDivElement).blur();
      }
    },
    [displayYear, setCurrentYear]
  );

  const timeLabel = getTimeLabel(displayYear);
  const progress = yearToPercent(displayYear);
  const shellPositionClass = isMobile
    ? "left-1/2 -translate-x-1/2"
    : detailMode
    ? "right-[25.25rem] xl:right-[26.25rem]"
    : "left-1/2 -translate-x-1/2";
  const shellWidth = isMobile
    ? "calc(100vw - 1rem)"
    : detailMode
    ? "min(56rem, calc(100vw - 30rem))"
    : "min(72rem, calc(100vw - 3rem))";

  return (
    <motion.div
      initial={false}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
      className={`fixed bottom-0 z-40 ${shellPositionClass}`}
      style={{
        width: shellWidth,
        maxWidth: isMobile
          ? "calc(100vw - 0.75rem)"
          : detailMode
          ? "calc(100vw - 27rem)"
          : "calc(100vw - 2rem)",
      }}
    >
      <div className="pointer-events-none relative mx-auto pb-4" style={{ width: "100%" }}>
        <AnimatePresence>
          {showAmbientHint && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={
                shouldReduceMotion
                  ? { duration: 0 }
                  : { duration: 0.4, ease: [0.22, 1, 0.36, 1] }
              }
              className="pointer-events-none absolute inset-x-0 bottom-[4.8rem] z-30 flex justify-center"
            >
              <span
                className="rounded-full px-4 py-2 text-[0.72rem]"
                style={{
                  background: "rgba(251,246,236,0.92)",
                  color: "var(--earth)",
                  boxShadow: "0 4px 16px rgba(90,71,45,0.1)",
                  border: "1px solid rgba(170,146,112,0.15)",
                }}
              >
                点击地图任意区域，聆听那里的声音
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div
          id={timelinePanelId}
          initial={false}
          animate={{
            opacity: 1,
            y: 0,
            scale: 1,
          }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="storybook-panel storybook-panel-strong absolute inset-x-0 bottom-0 z-20 px-4 py-3 pointer-events-auto"
        >
          <div className={`flex items-center ${isMobile ? "gap-2" : "gap-3"}`}>
            <div className="flex items-center gap-2">
              <button
                onClick={togglePlay}
                className="atlas-focus-ring flex h-9 w-9 items-center justify-center rounded-full transition-transform hover:scale-[1.03]"
                style={{
                  background:
                    "linear-gradient(180deg, rgba(152, 118, 72, 0.95), rgba(117, 150, 92, 0.94))",
                  color: "rgba(255,249,241,0.96)",
                  boxShadow: "0 10px 18px rgba(93, 102, 50, 0.22)",
                }}
                aria-label={isPlaying ? "暂停" : "播放"}
              >
                {isPlaying ? (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                    <rect x="2" y="1" width="3.5" height="12" rx="1" />
                    <rect x="8.5" y="1" width="3.5" height="12" rx="1" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                    <path d="M3 1.5v11l9-5.5z" />
                  </svg>
                )}
              </button>
            </div>

            <div
              ref={trackRef}
              className="atlas-focus-ring relative h-[3.55rem] min-w-0 flex-1 cursor-pointer select-none rounded-[1.1rem] px-4"
              style={{
                background:
                  "linear-gradient(180deg, rgba(250,247,240,0.9), rgba(235,229,212,0.78))",
                boxShadow: "inset 0 1px 4px rgba(170,146,112,0.15)",
                border: "1px solid rgba(220,205,178,0.4)",
              }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onKeyDown={handleKeyDown}
              role="slider"
              tabIndex={0}
              aria-label="时间轴"
              aria-valuemin={YEAR_MIN}
              aria-valuemax={YEAR_MAX}
              aria-valuenow={displayYear}
              aria-valuetext={`${displayYear}年，${timeLabel}`}
            >
              <div className="pointer-events-none relative h-full w-full">
                <div
                  className="absolute left-0 right-0 top-[0.95rem] h-[8px] -translate-y-1/2 rounded-full"
                  style={{
                    background: "rgba(220, 205, 178, 0.6)",
                    boxShadow: "inset 0 1px 3px rgba(122,107,82,0.15)",
                  }}
                >
                  <div
                    className="absolute bottom-0 left-0 top-0 rounded-full transition-all duration-75"
                    style={{
                      width: `${progress}%`,
                      background: "linear-gradient(90deg, rgba(119,156,102,0.94) 0%, rgba(139,182,172,0.92) 48%, rgba(184,124,74,0.95) 100%)",
                    }}
                  />

                  {KEYFRAME_YEARS.map((year, index) => {
                    const left = yearToPercent(year);
                    const label = MILESTONE_LABELS[year];
                    const shouldShowLabel = !isMobile || year === 1788 || year === 1935 || year === 2024;
                    const reached = displayYear >= year;
                    const isLast = index === KEYFRAME_YEARS.length - 1;
                    const labelTop = isMobile ? 14 : 16;
                    const labelShift = year === 1935 ? -18 : year === 1950 ? 18 : 0;

                    return (
                      <div
                        key={year}
                        className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
                        style={{ left: `${left}%` }}
                      >
                        <div
                          className="absolute left-1/2 top-1/2 h-[12px] w-[12px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[2px] transition-colors"
                          style={{
                            borderColor: reached ? "var(--coral)" : "rgba(170,146,112,0.5)",
                            background: reached ? "var(--coral)" : "rgba(252,247,239,1)",
                          }}
                        />
                        {label && shouldShowLabel && (
                          <span
                            className="absolute whitespace-nowrap text-[0.66rem] leading-none tracking-[0.04em] transition-colors"
                            style={{
                              top: `${labelTop}px`,
                              ...(isLast
                                ? { right: 0, transform: "translateX(0)" }
                                : {
                                    left: "50%",
                                    transform: `translateX(calc(-50% + ${labelShift}px))`,
                                  }),
                              color: reached ? "var(--earth)" : "var(--warm-gray)",
                              opacity: reached ? 1 : 0.75,
                            }}
                          >
                            {label}
                          </span>
                        )}
                      </div>
                    );
                  })}

                  <motion.div
                    className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
                    style={{
                      left: `${progress}%`,
                      width: isMobile ? 30 : 26,
                      height: isMobile ? 30 : 26,
                      background: "linear-gradient(180deg, rgba(255,253,250,1), rgba(246,238,223,1))",
                      border: "3px solid var(--coral)",
                      boxShadow: "0 4px 12px rgba(224,138,88,0.3), inset 0 -2px 4px rgba(122,107,82,0.1)",
                    }}
                    whileTap={{ scale: 1.12 }}
                  />
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
