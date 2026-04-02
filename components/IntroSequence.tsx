"use client";

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useAtlas } from "@/contexts/AtlasContext";
import { useMediaQuery } from "@/hooks/useMediaQuery";

export default function IntroSequence() {
  const { hasSeenIntro, isMapReady, markIntroSeen } = useAtlas();
  const [phase, setPhase] = useState(0);
  const shouldReduceMotion = useReducedMotion();
  const isMobile = useMediaQuery("(max-width: 767px)");

  useEffect(() => {
    if (hasSeenIntro) return;

    const timers = shouldReduceMotion
      ? [
          setTimeout(() => setPhase(1), 120),
          setTimeout(() => setPhase(3), 900),
          setTimeout(() => {
            setPhase(5);
            markIntroSeen();
          }, 2200),
        ]
      : [
          setTimeout(() => setPhase(1), 600),
          setTimeout(() => setPhase(2), 2200),
          setTimeout(() => setPhase(3), 4500),
          setTimeout(() => setPhase(4), 7000),
          setTimeout(() => {
            setPhase(5);
            markIntroSeen();
          }, 9000),
        ];

    return () => timers.forEach(clearTimeout);
  }, [hasSeenIntro, markIntroSeen, shouldReduceMotion]);

  if (hasSeenIntro) return null;

  const closingHint = isMapReady ? "即将开始..." : "底图加载中...";
  const subtitleLines = isMapReady
    ? ["翻开这本绘本", "拖动时间，看见动物的故事"]
    : ["翻开这本绘本", "地图正在铺开，请稍候"];

  return (
    <AnimatePresence>
      {phase < 5 && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden"
          style={{ background: "var(--parchment)" }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8 }}
        >
          <div className="paper-texture absolute inset-0 pointer-events-none" />

          <motion.div
            className="absolute left-1/2 top-0 bottom-0 w-px"
            style={{ background: "var(--earth-light)", opacity: 0.3 }}
            initial={{ scaleY: 0 }}
            animate={phase >= 1 ? { scaleY: 1 } : {}}
            transition={{ duration: 1.2, ease: "easeInOut" }}
          />

          <motion.div
            className="absolute left-0 top-0 bottom-0 w-1/2 origin-right"
            style={{ background: "var(--parchment)" }}
            initial={{ rotateY: 0 }}
            animate={phase >= 3 ? { rotateY: -60 } : {}}
            transition={{ duration: 1.5, ease: [0.25, 0.1, 0.25, 1] }}
          >
            <div
              className="absolute inset-0"
              style={{
                boxShadow: "inset -20px 0 40px rgba(139,119,90,0.08)",
              }}
            />
          </motion.div>

          <motion.div
            className="absolute right-0 top-0 bottom-0 w-1/2 origin-left"
            style={{ background: "var(--parchment)" }}
            initial={{ rotateY: 0 }}
            animate={phase >= 3 ? { rotateY: 60 } : {}}
            transition={{ duration: 1.5, ease: [0.25, 0.1, 0.25, 1] }}
          >
            <div
              className="absolute inset-0"
              style={{
                boxShadow: "inset 20px 0 40px rgba(139,119,90,0.08)",
              }}
            />
          </motion.div>

          <div className="relative z-10 text-center px-8">
            <AnimatePresence mode="wait">
              {phase >= 1 && phase < 3 && (
                <motion.div
                  key="title"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.8 }}
                >
                  <motion.div
                    className="w-12 h-12 mx-auto mb-6 rounded-2xl flex items-center justify-center"
                    style={{ background: "var(--earth-light)", opacity: 0.6 }}
                    animate={{ scale: [1, 1.05, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M4 19.5A2.5 2.5 0 016.5 17H20"
                        stroke="var(--earth)"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                      <path
                        d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"
                        stroke="var(--earth)"
                        strokeWidth="1.5"
                      />
                    </svg>
                  </motion.div>
                  <h1
                    className="text-2xl font-display font-bold mb-2"
                    style={{ color: "var(--text-primary)" }}
                  >
                    澳洲野生动物时空图谱
                  </h1>
                  <p
                    className="text-sm"
                    style={{ color: "var(--warm-gray)" }}
                  >
                    Australia Wild Time Atlas
                  </p>
                </motion.div>
              )}

              {phase >= 3 && phase < 5 && (
                <motion.div
                  key="subtitle"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.6 }}
                >
                  <p
                    className="text-base font-display leading-relaxed"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {subtitleLines[0]}
                  </p>
                  <p
                    className="text-base font-display leading-relaxed mt-1"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {subtitleLines[1]}
                  </p>
                  <motion.p
                    className="text-xs mt-4"
                    style={{ color: "var(--warm-gray)" }}
                    animate={{ opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    {closingHint}
                  </motion.p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <motion.button
            className={`absolute ${isMobile ? "bottom-8 left-1/2 -translate-x-1/2" : "bottom-8 right-8"} text-xs px-4 py-2 rounded-full z-20`}
            style={{
              background: "var(--parchment-dark)",
              color: "var(--warm-gray)",
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.5 }}
            onClick={() => {
              setPhase(5);
              markIntroSeen();
            }}
            aria-label="跳过片头序章"
          >
            跳过
          </motion.button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
