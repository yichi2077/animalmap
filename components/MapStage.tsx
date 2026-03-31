"use client";

import React from "react";
import { motion } from "framer-motion";
import { useAtlas } from "@/contexts/AtlasContext";
import AustraliaMap from "./AustraliaMap";

export default function MapStage() {
  const { isNowMode } = useAtlas();

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden px-4 pb-20 pt-20 lg:px-8 lg:pb-24 lg:pt-24">
      {/* Parchment background */}
      <div className="paper-texture absolute inset-0 pointer-events-none" />

      <div
        aria-hidden
        className="absolute inset-x-6 top-24 bottom-20 rounded-[2rem] opacity-60 lg:bottom-24"
        style={{
          border: "1px solid rgba(150, 122, 88, 0.12)",
          background:
            "linear-gradient(180deg, rgba(255,251,244,0.14), rgba(255,251,244,0.02))",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.25)",
        }}
      />

      {/* Now-mode ambient glow */}
      {isNowMode && (
        <motion.div
          className="absolute inset-0 pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.5 }}
          style={{
            background:
              "radial-gradient(ellipse at 50% 50%, rgba(125,165,108,0.06) 0%, transparent 70%)",
          }}
        />
      )}

      {/* Map container */}
      <div className="relative h-full w-full max-h-[780px] max-w-[1180px]">
        <AustraliaMap />
      </div>
    </div>
  );
}
