"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const GROUPS = [
  { key: "extinct", label: "已灭绝", color: "#8a7e6d", icon: "◇" },
  { key: "endangered", label: "濒危", color: "#e08a58", icon: "★" },
  { key: "native", label: "本土物种", color: "#7da56c", icon: "♥" },
  { key: "invasive", label: "入侵物种", color: "#c97040", icon: "✦" },
  { key: "marine", label: "海洋物种", color: "#6cb3d9", icon: "◎" },
];

export default function Legend() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div
      className="fixed top-[11rem] z-30"
      style={{ left: "max(1.5rem, calc(50vw - 41rem))" }}
    >
      <motion.button
        onClick={() => setIsOpen(!isOpen)}
        className="storybook-panel atlas-focus-ring flex h-10 items-center gap-2 px-3 cursor-pointer"
        whileTap={{ scale: 0.95 }}
        aria-label={isOpen ? "收起图例" : "打开图例"}
      >
        <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
          <rect x="2" y="3" width="5" height="3" rx="1" fill="var(--leaf)" opacity="0.7" />
          <rect x="2" y="8" width="5" height="3" rx="1" fill="var(--coral)" opacity="0.7" />
          <rect x="2" y="13" width="5" height="3" rx="1" fill="var(--ocean)" opacity="0.7" />
          <line x1="9" y1="4.5" x2="16" y2="4.5" stroke="var(--earth-light)" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="9" y1="9.5" x2="16" y2="9.5" stroke="var(--earth-light)" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="9" y1="14.5" x2="14" y2="14.5" stroke="var(--earth-light)" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <span className="text-[0.75rem]" style={{ color: "var(--earth-deep)" }}>
          图例
        </span>
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="storybook-panel storybook-float absolute left-0 top-12 w-52 p-3.5"
          >
            <div className="atlas-kicker">Legend</div>
            <p className="mt-1.5 text-xs font-display" style={{ color: "var(--earth-deep)" }}>
              物种分类
            </p>
            <div className="mt-2 space-y-1.5">
              {GROUPS.map((g) => (
                <div key={g.key} className="flex items-center gap-2">
                  <span
                    className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full text-[0.6rem]"
                    style={{ background: `${g.color}26`, color: g.color }}
                  >
                    {g.icon}
                  </span>
                  <span className="text-[0.75rem]" style={{ color: "var(--text-primary)" }}>
                    {g.label}
                  </span>
                </div>
              ))}
            </div>

            <div
              className="mt-3 pt-2.5"
              style={{ borderTop: "1px solid rgba(170, 146, 112, 0.18)" }}
            >
              <p className="text-[0.65rem]" style={{ color: "var(--warm-gray)" }}>
                物种状态
              </p>
              <div className="mt-1.5 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--leaf)", opacity: 0.9 }} />
                  <span className="text-[0.7rem]" style={{ color: "var(--text-secondary)" }}>繁盛</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--warm-gray)", opacity: 0.4 }} />
                  <span className="text-[0.7rem]" style={{ color: "var(--text-secondary)" }}>衰退</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--warm-gray)", opacity: 0.2, border: "1px dashed var(--warm-gray)" }} />
                  <span className="text-[0.7rem]" style={{ color: "var(--text-secondary)" }}>灭绝</span>
                </div>
              </div>
            </div>

            <p className="mt-3 text-[0.68rem] leading-5" style={{ color: "var(--warm-gray)" }}>
              先点地图上的动物，再拖动时间尺观察它的命运。
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
