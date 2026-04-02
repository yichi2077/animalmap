"use client";

import React from "react";
import { motion } from "framer-motion";
import { useAtlas } from "@/contexts/AtlasContext";
import AustraliaMap from "./AustraliaMap";

export default function MapStage() {
  const { isNowMode } = useAtlas();

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden px-4 pb-20 pt-20 lg:px-8 lg:pb-24 lg:pt-24">
      <div className="paper-texture absolute inset-0 pointer-events-none" />

      <div
        aria-hidden
        className="absolute inset-x-6 top-24 bottom-20 rounded-[2rem] opacity-60 lg:bottom-24"
        style={{
          border: "1px solid rgba(150, 122, 88, 0.12)",
          background:
            "radial-gradient(circle at 18% 20%, rgba(140,182,154,0.1), transparent 24%), radial-gradient(circle at 78% 14%, rgba(166,198,212,0.08), transparent 22%), linear-gradient(180deg, rgba(255,251,244,0.16), rgba(255,251,244,0.02))",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.25)",
        }}
      />

      {isNowMode && (
        <motion.div
          className="absolute inset-0 pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.5 }}
          style={{
            background:
              "radial-gradient(ellipse at 50% 50%, rgba(119,156,102,0.08) 0%, transparent 52%), radial-gradient(ellipse at 62% 62%, rgba(126,173,204,0.04) 0%, transparent 72%)",
          }}
        />
      )}

      <div className="relative h-full w-full max-h-[780px] max-w-[1180px]">
        <AustraliaMap />
      </div>
    </div>
  );
}
