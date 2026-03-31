"use client";

import React from "react";
import { AtlasProvider } from "@/contexts/AtlasContext";
import MapStage from "@/components/MapStage";
import TopOverlay from "@/components/TopOverlay";
import TimelineBar from "@/components/TimelineBar";
import InfoPanel from "@/components/InfoPanel";
import Legend from "@/components/Legend";
import IntroSequence from "@/components/IntroSequence";

export default function Home() {
  return (
    <AtlasProvider>
      <main className="atlas-shell relative isolate w-screen h-screen overflow-hidden">
        <div aria-hidden className="atlas-glow atlas-glow-left" />
        <div aria-hidden className="atlas-glow atlas-glow-right" />
        <div aria-hidden className="atlas-glow atlas-glow-bottom" />
        <MapStage />
        <TopOverlay />
        <InfoPanel />
        <Legend />
        <TimelineBar />
        <IntroSequence />
      </main>
    </AtlasProvider>
  );
}
