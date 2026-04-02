"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useAtlas } from "@/contexts/AtlasContext";
import { useExtendedSpecies } from "@/contexts/ExtendedSpeciesContext";
import speciesData from "@/data/species.json";
import regionsData from "@/data/regions.json";
import timelineData from "@/data/timeline.json";
import audioData from "@/data/audio.json";
import { interpolateKeyframes, KeyframeData } from "@/lib/interpolate";
import { CONSERVATION_LEVELS } from "@/lib/constants";
import {
  getCoreSpeciesDataProvenance,
  getEvidenceMeta,
  getExtendedSpeciesDataProvenance,
  getSpeciesTemporalState,
} from "@/lib/species-ui";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import EvidenceBadge from "@/components/ui/EvidenceBadge";
import SpeciesAvatar from "@/components/ui/SpeciesAvatar";
import type { ExtendedSpecies } from "@/hooks/useALASpecies";

const timeline = timelineData as Record<string, KeyframeData[]>;
const audioMeta = audioData as Record<string, AudioMeta>;

type AudioAvailability = "available" | "missing" | "ai_simulated" | "planned";
type SpeciesAssetStatus = "placeholder" | "partial" | "complete";
type SpeciesReviewStatus = "draft" | "reviewed" | "approved";

interface AudioMeta {
  src: string;
  type: "real" | "ai_simulated";
  label: string;
  description: string;
  availability: AudioAvailability;
  attribution: string;
  license: string;
  sourceUrl: string;
}



interface SpeciesSource {
  label: string;
  note: string;
  url: string;
}

const ASSET_STATUS_META: Record<
  SpeciesAssetStatus,
  { label: string; description: string; background: string; color: string }
> = {
  placeholder: {
    label: "占位素材",
    description: "当前以品牌化占位视觉与说明文本维持主流程完整。",
    background: "rgba(244, 232, 210, 0.88)",
    color: "var(--earth)",
  },
  partial: {
    label: "部分到位",
    description: "部分插图、照片或音频已到位，其余仍在整理。",
    background: "rgba(241, 233, 217, 0.88)",
    color: "var(--earth-deep)",
  },
  complete: {
    label: "媒体完整",
    description: "插图、照片与声音资料均已核对并可公开展示。",
    background: "rgba(232, 242, 230, 0.9)",
    color: "var(--leaf)",
  },
};

const REVIEW_STATUS_META: Record<
  SpeciesReviewStatus,
  { label: string; description: string; background: string; color: string }
> = {
  draft: {
    label: "草稿内容",
    description: "叙事仍待进一步校对，不应被视为最终展示版本。",
    background: "rgba(244, 232, 210, 0.88)",
    color: "var(--earth)",
  },
  reviewed: {
    label: "已审校",
    description: "当前文案已按主轨要求补齐来源与证据层说明。",
    background: "rgba(232, 242, 230, 0.9)",
    color: "var(--leaf)",
  },
  approved: {
    label: "已批准",
    description: "内容与媒体均已通过正式发布前审核。",
    background: "rgba(232, 242, 230, 0.9)",
    color: "var(--leaf)",
  },
};

function SectionCard({
  kicker,
  title,
  tone = "soft",
  children,
}: {
  kicker?: string;
  title?: string;
  tone?: "soft" | "strong";
  children: React.ReactNode;
}) {
  return (
    <section className={`atlas-section-card ${tone === "strong" ? "atlas-section-card-strong" : ""} px-4 py-4`}>
      {(kicker || title) && (
        <div className="mb-3">
          {kicker && <div className="atlas-kicker">{kicker}</div>}
          {title && (
            <p className="mt-1 font-display text-[0.92rem] tracking-[0.08em]" style={{ color: "var(--earth-deep)" }}>
              {title}
            </p>
          )}
        </div>
      )}
      {children}
    </section>
  );
}

function FoldSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <section className="atlas-section-card px-4 py-3.5">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="atlas-focus-ring flex w-full items-center justify-between gap-3 rounded-[1rem] text-left"
        style={{ color: "var(--earth-deep)" }}
      >
        <span className="font-display text-[0.94rem] tracking-[0.06em]">{title}</span>
        <span
          className="inline-flex h-8 w-8 items-center justify-center rounded-full"
          style={{ background: "rgba(241, 231, 212, 0.88)", color: "var(--earth)" }}
          aria-hidden
        >
          {isOpen ? "−" : "+"}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0, y: -6 }}
            animate={{ opacity: 1, height: "auto", y: 0 }}
            exit={{ opacity: 0, height: 0, y: -6 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="atlas-divider my-3" />
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}


function AudioPlayer({ speciesId }: { speciesId: string }) {
  const meta = audioMeta[speciesId];
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    setErrorMsg("");
    setProgress(0);
    setIsPlaying(false);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    };
  }, [speciesId]);

  // ── 状态 1：无元数据 ──
  if (!meta) return null;

  // ── 状态 2：文件缺失 ──
  if (meta.availability === "missing") {
    return (
      <div
        className="rounded-[1.1rem] px-3.5 py-3"
        style={{ background: "rgba(239, 223, 196, 0.72)" }}
      >
        <p className="text-[0.72rem]" style={{ color: "var(--warm-gray)" }}>
          暂无音频，资料收集中
        </p>
      </div>
    );
  }

  // ── 状态 3：AI 模拟 或 可用音频 ──
  const isAI = meta.availability === "ai_simulated";

  const toggleAudio = () => {
    if (!meta.src) return;
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
      audioRef.current.play()
        .then(() => {
          setErrorMsg("");
          setIsPlaying(true);
          const tick = () => {
            if (audioRef.current?.duration) {
              setProgress(audioRef.current.currentTime / audioRef.current.duration);
            }
            rafRef.current = requestAnimationFrame(tick);
          };
          rafRef.current = requestAnimationFrame(tick);
        })
        .catch(() => {
          setErrorMsg("当前环境无法播放此音频");
          setIsPlaying(false);
        });
    }
  };

  return (
    <div
      className="rounded-[1.1rem] px-3.5 py-3"
      style={{ background: "rgba(239, 223, 196, 0.72)" }}
    >
      {/* ── 播放行 ── */}
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
            <div
              className="h-full rounded-full transition-all duration-100"
              style={{ width: `${progress * 100}%`, background: "var(--coral)" }}
            />
          </div>

          {/* AI 警示标签 */}
          {isAI && (
            <span
              className="mt-1 inline-block rounded-full px-2 py-0.5 text-[0.62rem]"
              style={{ background: "var(--coral-light)", color: "var(--coral)" }}
            >
              AI 模拟 · 非真实历史录音
            </span>
          )}

          {errorMsg && (
            <p className="mt-1 text-[0.68rem]" style={{ color: "var(--coral)" }}>
              {errorMsg}
            </p>
          )}
        </div>
      </div>

      {/* ── 归因行 ── */}
      {meta.attribution && (
        <div className="mt-2 flex items-start gap-1">
          <span className="shrink-0 text-[0.58rem] leading-[1.6]" style={{ color: "var(--warm-gray)", opacity: 0.5 }}>
            ©
          </span>
          <p className="text-[0.62rem] leading-relaxed" style={{ color: "var(--warm-gray)", opacity: 0.65 }}>
            {meta.attribution}
            {meta.sourceUrl && (
              <>
                {" · "}
                <a
                  href={meta.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 transition-opacity hover:opacity-80"
                  style={{ color: "var(--earth-light)" }}
                >
                  来源
                </a>
              </>
            )}
          </p>
        </div>
      )}
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
    <div className="space-y-3.5">
      <SectionCard kicker="Regional Chapter" title="区域导读" tone="strong">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-[1.35rem] font-bold leading-tight" style={{ color: "var(--earth-deep)" }}>
              {region.nameZh}
            </h3>
            <p className="mt-1 text-[0.8rem]" style={{ color: "var(--warm-gray)" }}>
              {region.nameEn}
            </p>
          </div>
          <span className="atlas-chip atlas-chip-strong">{currentYear <= 1770 ? "1788 前" : `${currentYear} 年`}</span>
        </div>

        <p className="mt-3 text-[0.82rem] leading-7" style={{ color: "var(--text-secondary)" }}>
          先阅读这片区域当前仍活跃的动物，再挑一只进入它的章节页。灭绝和未到来的物种依然保留在目录里，帮助你看清时间留下的断层。
        </p>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-[1rem] px-3 py-3" style={{ background: "rgba(233, 243, 230, 0.88)" }}>
            <p className="text-[0.68rem]" style={{ color: "var(--warm-gray)" }}>
              现存物种
            </p>
            <p className="mt-1 font-display text-[1.35rem] font-bold" style={{ color: "var(--leaf)" }}>
              {alive.length}
            </p>
          </div>
          <div className="rounded-[1rem] px-3 py-3" style={{ background: "rgba(241, 233, 217, 0.86)" }}>
            <p className="text-[0.68rem]" style={{ color: "var(--warm-gray)" }}>
              已灭绝
            </p>
            <p className="mt-1 font-display text-[1.35rem] font-bold" style={{ color: "var(--earth)" }}>
              {extinct.length}
            </p>
          </div>
        </div>
      </SectionCard>

      <SectionCard kicker="Directory" title="区域物种检索">
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
              <line x1="11" y1="11" x2="14" y2="14" stroke="var(--earth-light)" strokeWidth="1.4" strokeLinecap="round" />
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

        <div className="mt-3 flex items-center justify-between">
          <p className="text-[0.72rem] font-display tracking-[0.12em]" style={{ color: "var(--warm-gray)" }}>
            共 {filteredSpecies.length} 条结果
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
      </SectionCard>

      <FoldSection title="区域物种目录" defaultOpen>
        <div className="space-y-1.5">
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
      </FoldSection>
    </div>
  );
}

function SpeciesRow({
  species,
  isExtinct,
  isPreArrival,
}: {
  species: typeof speciesData[0] & {
    interpolated: ReturnType<typeof interpolateKeyframes>;
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
  const evidence = getEvidenceMeta(interpolated.evidenceType, currentYear);
  const temporal = getSpeciesTemporalState(species.id, currentYear);
  const provenance = getCoreSpeciesDataProvenance(species.id, currentYear);
  const assetStatusMeta =
    ASSET_STATUS_META[species.assetStatus as SpeciesAssetStatus] ?? ASSET_STATUS_META.placeholder;
  const reviewStatusMeta =
    REVIEW_STATUS_META[species.reviewStatus as SpeciesReviewStatus] ?? REVIEW_STATUS_META.reviewed;
  const sourceList = (species.sources ?? []) as SpeciesSource[];

  const populationPercent = Math.round(interpolated.populationScore * 100);

  return (
    <div className="space-y-3.5">
      <SectionCard kicker="Field Note" title="章节首页" tone="strong">
        <div className="flex items-start gap-4">
          <SpeciesAvatar
            illustration={species.media?.illustration ?? ""}
            photo={species.media?.photo ?? ""}
            nameZh={species.nameZh}
            color={species.color}
            group={species.group}
            assetStatus={species.assetStatus ?? "placeholder"}
          />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start gap-2">
              <h3 className="font-display text-[1.45rem] font-bold leading-tight" style={{ color: "var(--earth-deep)" }}>
                {species.nameZh}
              </h3>
              {level && (
                <span
                  className="mt-1 rounded-full px-2 py-0.5 text-[0.68rem]"
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
              <span className="atlas-chip">{species.groupLabel}</span>
              <span
                className="atlas-chip"
                style={{
                  background: species.soundType === "ai_simulated" ? "var(--coral-light)" : "var(--leaf-light)",
                  color: species.soundType === "ai_simulated" ? "var(--coral)" : "var(--leaf)",
                }}
              >
                {species.soundType === "ai_simulated" ? "AI 模拟声音" : "真实录音"}
              </span>
              <span className="atlas-chip" style={{ background: reviewStatusMeta.background, color: reviewStatusMeta.color }}>
                {reviewStatusMeta.label}
              </span>
              {interpolated.evidenceType && <EvidenceBadge evidenceType={interpolated.evidenceType} />}
            </div>
          </div>
        </div>

        <div
          className="mt-4 rounded-[1rem] px-3 py-3 text-[0.84rem] leading-7"
          style={{ background: "rgba(250, 244, 233, 0.82)", color: "var(--text-secondary)" }}
        >
          {interpolated.narrative}
        </div>

        <div className="mt-4">
          <AudioPlayer speciesId={species.id} />
        </div>
      </SectionCard>

      <SectionCard kicker="Current Snapshot" title="时间切片">
        <div className="space-y-3.5">
          {temporal && (
            <div
              className="rounded-xl px-3 py-2.5"
              style={{
                background:
                  temporal.tone === "arrival"
                    ? "rgba(244, 232, 210, 0.9)"
                    : temporal.tone === "extinct"
                    ? "rgba(238, 233, 226, 0.88)"
                    : temporal.tone === "now"
                    ? "rgba(232, 242, 230, 0.86)"
                    : "rgba(241, 233, 217, 0.82)",
              }}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="atlas-chip atlas-chip-strong">{temporal.badge}</span>
                <span className="text-[0.72rem]" style={{ color: "var(--warm-gray)" }}>
                  {currentYear <= 1770 ? "1788 前" : `${currentYear} 年`}
                </span>
              </div>
              <p className="mt-2 text-[0.76rem] leading-6" style={{ color: "var(--text-secondary)" }}>
                {temporal.description}
              </p>
            </div>
          )}

          {level && (
            <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: level.color + "12" }}>
              <span className="h-2 w-2 rounded-full" style={{ background: level.color }} />
              <span className="text-[0.8rem]" style={{ color: "var(--earth-deep)" }}>
                IUCN: {level.label} ({species.dangerStatus})
              </span>
            </div>
          )}

          <div
            className="rounded-xl px-3 py-2.5"
            style={{
              background:
                evidence.tone === "inference"
                  ? "rgba(244, 232, 210, 0.88)"
                  : evidence.tone === "historical"
                  ? "rgba(241, 233, 217, 0.82)"
                  : "rgba(232, 242, 230, 0.86)",
            }}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="atlas-chip atlas-chip-strong">{evidence.label}</span>
              <span className="text-[0.72rem]" style={{ color: "var(--warm-gray)" }}>
                {currentYear <= 1770 ? "1788 前" : `${currentYear} 年`}
              </span>
            </div>
            <p className="mt-2 text-[0.76rem] leading-6" style={{ color: "var(--text-secondary)" }}>
              {evidence.description}
            </p>
          </div>

          <div className="rounded-xl px-3 py-2.5" style={{ background: "rgba(248, 240, 227, 0.82)" }}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="atlas-chip">{provenance.label}</span>
            </div>
            <p className="mt-2 text-[0.76rem] leading-6" style={{ color: "var(--text-secondary)" }}>
              {provenance.description}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="rounded-xl px-3 py-2.5" style={{ background: reviewStatusMeta.background }}>
              <p className="text-[0.7rem]" style={{ color: "var(--warm-gray)" }}>
                内容审校
              </p>
              <p className="mt-1 text-[0.82rem] font-medium" style={{ color: reviewStatusMeta.color }}>
                {reviewStatusMeta.label}
              </p>
              <p className="mt-1 text-[0.72rem] leading-5" style={{ color: "var(--text-secondary)" }}>
                {reviewStatusMeta.description}
              </p>
            </div>
            <div className="rounded-xl px-3 py-2.5" style={{ background: assetStatusMeta.background }}>
              <p className="text-[0.7rem]" style={{ color: "var(--warm-gray)" }}>
                媒体状态
              </p>
              <p className="mt-1 text-[0.82rem] font-medium" style={{ color: assetStatusMeta.color }}>
                {assetStatusMeta.label}
              </p>
              <p className="mt-1 text-[0.72rem] leading-5" style={{ color: "var(--text-secondary)" }}>
                {assetStatusMeta.description}
              </p>
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[0.72rem]" style={{ color: "var(--warm-gray)" }}>
                种群状态
              </span>
              <span className="text-xs font-display font-bold" style={{ color: "var(--text-primary)" }}>
                {populationPercent}%
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full" style={{ background: "var(--parchment-dark)" }}>
              <motion.div
                className="h-full rounded-full"
                style={{
                  background: isExtinct ? "var(--warm-gray)" : `linear-gradient(90deg, ${species.color}, ${species.color}cc)`,
                }}
                initial={{ width: 0 }}
                animate={{ width: `${populationPercent}%` }}
                transition={{ duration: 0.6, ease: "easeOut" }}
              />
            </div>
          </div>
        </div>
      </SectionCard>

      <FoldSection title="物种故事与分布" defaultOpen>
        <div className="space-y-4">
          <div>
            <p className="mb-1.5 text-[0.72rem] font-display tracking-[0.12em]" style={{ color: "var(--warm-gray)" }}>
              物种故事
            </p>
            <p className="text-[0.84rem] leading-7" style={{ color: "var(--text-secondary)" }}>
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
      </FoldSection>

      <FoldSection title="资料来源" defaultOpen={!sourceList.length}>
        <div className="space-y-2">
          {sourceList.length > 0 ? (
            sourceList.map((source) => (
              <a
                key={`${species.id}-${source.label}`}
                href={source.url}
                target="_blank"
                rel="noreferrer"
                className="atlas-focus-ring block rounded-[1rem] px-3 py-2.5 transition-colors hover:bg-[rgba(239,223,196,0.36)]"
                style={{ background: "rgba(248, 240, 227, 0.72)" }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[0.8rem] font-medium" style={{ color: "var(--earth-deep)" }}>
                      {source.label}
                    </p>
                    <p className="mt-1 text-[0.72rem] leading-5" style={{ color: "var(--text-secondary)" }}>
                      {source.note}
                    </p>
                  </div>
                  <span className="text-[0.78rem]" style={{ color: "var(--earth-light)" }}>
                    ↗
                  </span>
                </div>
              </a>
            ))
          ) : (
            <div className="rounded-[1rem] px-3 py-3 text-[0.78rem] leading-6" style={{ background: "rgba(248, 240, 227, 0.72)", color: "var(--warm-gray)" }}>
              当前章节的来源卡仍在整理，先保留时间切片与叙事摘要。
            </div>
          )}
        </div>
      </FoldSection>
    </div>
  );
}

const GROUP_ICON_PATHS: Record<string, string> = {
  bird: "M12,4 C8,4 5,7 5,11 C5,15 12,22 12,22 C12,22 19,15 19,11 C19,7 16,4 12,4Z",
  mammal: "M12,4 C8,4 5,7 5,11 C5,15 12,22 12,22 C12,22 19,15 19,11 C19,7 16,4 12,4Z",
  reptile: "M4,12 C4,12 8,6 12,6 C16,6 20,12 20,12 C20,12 16,18 12,18 C8,18 4,12 4,12Z",
  amphibian: "M12,2 C8,2 4,6 4,10 C4,14 8,18 12,22 C16,18 20,14 20,10 C20,6 16,2 12,2Z",
  marine: "M4,12 C4,12 8,6 12,6 C16,6 20,12 20,12 C20,12 16,18 12,18 C8,18 4,12 4,12Z",
};

const TAXON_COLORS: Record<string, string> = {
  bird: "#7da56c",
  mammal: "#b8a88a",
  reptile: "#e08a58",
  amphibian: "#64ba9c",
  marine: "#9ec3d8",
};

const STATE_NAMES_ZH: Record<string, string> = {
  nsw: "新南威尔士", vic: "维多利亚", qld: "昆士兰",
  sa: "南澳大利亚", wa: "西澳大利亚", tas: "塔斯马尼亚",
  nt: "北领地", act: "首都领地",
};

function useLLMStory(species: ExtendedSpecies | null) {
  const [story, setStory] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const cacheRef = useRef<Map<string, string>>(new Map());

  const fetchStory = useCallback(async (sp: ExtendedSpecies) => {
    const cached = cacheRef.current.get(sp.scientificName);
    if (cached) {
      setStory(cached);
      setIsDone(true);
      setIsStreaming(false);
      return;
    }

    setStory("");
    setError(false);
    setIsDone(false);
    setIsStreaming(true);

    try {
      const res = await fetch("/api/llm/story", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nameEn: sp.nameEn,
          scientificName: sp.scientificName,
          dangerStatus: sp.dangerStatus,
          taxonomicClass: sp.taxonomicClass,
          primaryState: sp.primaryState,
        }),
      });

      if (!res.ok || !res.body) {
        setError(true);
        setIsStreaming(false);
        return;
      }

      const contentType = res.headers.get("Content-Type") || "";
      if (!contentType.includes("text/event-stream")) {
        const json = await res.json();
        if (json.error) {
          setError(true);
          setIsStreaming(false);
          return;
        }
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") break;
          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content ?? "";
            accumulated += delta;
            setStory(accumulated);
          } catch {
            // skip malformed JSON chunks
          }
        }
      }

      setIsStreaming(false);
      setIsDone(true);
      if (accumulated) {
        cacheRef.current.set(sp.scientificName, accumulated);
      }
    } catch {
      setError(true);
      setIsStreaming(false);
    }
  }, []);

  useEffect(() => {
    if (species) {
      fetchStory(species);
    } else {
      setStory("");
      setIsStreaming(false);
      setError(false);
      setIsDone(false);
    }
  }, [species, fetchStory]);

  return { story, isStreaming, error, isDone };
}

function ExtendedSpeciesInfo({ species }: { species: ExtendedSpecies }) {
  const { story, isStreaming, error } = useLLMStory(species);
  const color = TAXON_COLORS[species.taxonomicClass] || "#b8a88a";
  const iconPath = GROUP_ICON_PATHS[species.taxonomicClass] ?? GROUP_ICON_PATHS.mammal;
  const level = CONSERVATION_LEVELS.find((l) => l.key === species.dangerStatus);
  const stateNameZh = STATE_NAMES_ZH[species.primaryState] || species.primaryState.toUpperCase();
  const occDisplay = species.occurrenceCount.toLocaleString();
  const provenance = getExtendedSpeciesDataProvenance();

  return (
    <div className="space-y-3.5">
      <SectionCard kicker="ALA Species" title="在线物种章节" tone="strong">
        <div className="flex items-start gap-4">
          <div
            className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-[1rem]"
            style={{
              background: `${color}18`,
              border: `1.5px solid ${color}36`,
            }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden>
              <path d={iconPath} fill={color} opacity="0.9" />
            </svg>
          </div>

          <div className="min-w-0 flex-1">
            <h3 className="font-display text-[1.25rem] font-bold leading-tight" style={{ color: "var(--earth-deep)" }}>
              {species.nameEn}
            </h3>
            <p className="mt-1 text-[0.74rem] italic" style={{ color: "var(--warm-gray)" }}>
              {species.scientificName}
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {level && (
                <span className="atlas-chip" style={{ background: level.color + "18", color: "var(--earth-deep)" }}>
                  {level.label}
                </span>
              )}
              <span className="atlas-chip">{stateNameZh}</span>
              <span className="atlas-chip">{occDisplay} 条记录</span>
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard kicker="Data Provenance" title="资料来源">
        <div className="space-y-3">
          <div className="rounded-xl px-3 py-2.5" style={{ background: "rgba(246, 236, 217, 0.54)" }}>
            <div className="flex items-center gap-2 text-[0.82rem]" style={{ color: "var(--text-secondary)" }}>
              <span style={{ color: "var(--earth)" }}>ALA 记录</span>
              <span className="font-medium" style={{ color: "var(--earth-deep)" }}>
                {occDisplay} 条
              </span>
            </div>
            <div className="mt-2 flex items-center gap-2 text-[0.82rem]" style={{ color: "var(--text-secondary)" }}>
              <span style={{ color: "var(--earth)" }}>主要分布</span>
              <span className="font-medium" style={{ color: "var(--earth-deep)" }}>
                {stateNameZh}
              </span>
            </div>
          </div>

          <div className="rounded-xl px-3 py-2.5" style={{ background: "rgba(248, 240, 227, 0.82)" }}>
            <div className="flex items-center gap-2">
              <span className="atlas-chip">{provenance.label}</span>
            </div>
            <p className="mt-2 text-[0.78rem] leading-6" style={{ color: "var(--text-secondary)" }}>
              {provenance.description}
            </p>
          </div>
        </div>
      </SectionCard>

      <SectionCard kicker="Generated Note" title="AI 生成故事">
        {isStreaming && !story && (
          <div className="space-y-2">
            <div className="h-3 w-4/5 animate-pulse rounded-full" style={{ background: "var(--parchment-dark)" }} />
            <div className="h-3 w-3/5 animate-pulse rounded-full" style={{ background: "var(--parchment-dark)" }} />
            <div className="h-3 w-2/3 animate-pulse rounded-full" style={{ background: "var(--parchment-dark)" }} />
            <p className="mt-2 text-[0.72rem]" style={{ color: "var(--warm-gray)", opacity: 0.6 }}>
              正在查阅这种动物的故事…
            </p>
          </div>
        )}

        {story && (
          <p className="text-[0.84rem] leading-7" style={{ color: "var(--text-secondary)" }}>
            {story}
            {isStreaming && (
              <span className="ml-0.5 inline-block animate-pulse" style={{ color: "var(--earth-light)" }}>
                ▍
              </span>
            )}
          </p>
        )}

        {error && !story && (
          <p className="text-[0.82rem]" style={{ color: "var(--coral)" }}>
            故事加载失败，稍后重试
          </p>
        )}

        {(story || isStreaming) && (
          <p className="mt-3 text-[0.62rem]" style={{ color: "var(--warm-gray)", opacity: 0.6 }}>
            以上内容由 AI 生成，仅供科普参考。基础数据来源为 ALA。
          </p>
        )}
      </SectionCard>

      <a
        href={`https://bie.ala.org.au/species/${encodeURIComponent(species.lsid)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="atlas-focus-ring block rounded-[1rem] px-4 py-3 text-center text-[0.72rem] transition-opacity hover:opacity-70"
        style={{ color: "var(--earth-light)", background: "rgba(246, 236, 217, 0.36)" }}
      >
        在 ALA 查看完整资料 ↗
      </a>
    </div>
  );
}

type PanelState = "closed" | "region" | "core-species" | "extended-species";

function getPanelState(
  selectedSpeciesId: string | null,
  focusRegionId: string | null
): PanelState {
  if (!selectedSpeciesId && !focusRegionId) return "closed";
  if (selectedSpeciesId?.startsWith("ext_")) return "extended-species";
  if (selectedSpeciesId) return "core-species";
  return "region";
}

export default function InfoPanel() {
  const { selectedSpeciesId, focusRegionId, setSelectedSpecies, setFocusRegion } = useAtlas();
  const { loadedSpecies: extLoadedSpecies } = useExtendedSpecies();
  const shouldReduceMotion = useReducedMotion();
  const isMobile = useMediaQuery("(max-width: 767px)");

  const panelState = getPanelState(selectedSpeciesId, focusRegionId);
  const isOpen = panelState !== "closed";

  const selectedSpecies = selectedSpeciesId && !selectedSpeciesId.startsWith("ext_")
    ? speciesData.find((species) => species.id === selectedSpeciesId)
    : null;
  const selectedExtSpecies = selectedSpeciesId?.startsWith("ext_")
    ? extLoadedSpecies.find((sp) => sp.id === selectedSpeciesId) ?? null
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

  const panelKicker = panelState === "core-species"
    ? "Species Profile"
    : panelState === "extended-species"
    ? "ALA Species"
    : "Regional Notes";
  const panelTitle = selectedSpecies
    ? selectedSpecies.nameZh
    : selectedExtSpecies
    ? selectedExtSpecies.nameEn
    : selectedRegion?.nameZh || "区域档案";
  const panelSubtitle = selectedSpecies
    ? selectedSpecies.nameEn
    : selectedExtSpecies
    ? selectedExtSpecies.scientificName
    : selectedRegion?.nameEn || "Region Overview";
  const panelMotion = isMobile
    ? {
        initial: { y: "105%", opacity: 0 },
        animate: { y: 0, opacity: 1 },
        exit: { y: "105%", opacity: 0 },
      }
    : {
        initial: { x: 340, opacity: 0 },
        animate: { x: 0, opacity: 1 },
        exit: { x: 340, opacity: 0 },
      };

  const closePanel = () => {
    setSelectedSpecies(null);
    setFocusRegion(null);
  };

  const goBackToRegion = () => {
    setSelectedSpecies(null);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={panelMotion.initial}
          animate={panelMotion.animate}
          exit={panelMotion.exit}
          transition={
            shouldReduceMotion
              ? { duration: 0 }
              : { type: "spring", stiffness: 200, damping: 25, mass: 0.8 }
          }
          className={`pointer-events-auto fixed z-30 ${
            isMobile
              ? "inset-x-2 bottom-[5.15rem] top-auto"
              : "inset-y-5 right-5 w-[24rem] xl:w-[25rem]"
          }`}
        >
          <div
            className={`atlas-panel-shell relative overflow-hidden ${
              isMobile ? "h-[min(60vh,36rem)] rounded-[1.6rem]" : "h-full"
            }`}
            style={{ borderRadius: isMobile ? "1.6rem" : "2rem" }}
          >
            {isMobile && (
              <div className="pointer-events-none flex justify-center pt-3">
                <span
                  className="h-1.5 w-14 rounded-full"
                  style={{ background: "rgba(126, 99, 66, 0.18)" }}
                />
              </div>
            )}
            <div
              className="sticky top-0 z-10 flex flex-col justify-between px-5 pb-4 pt-5"
              style={{
                background:
                  "linear-gradient(180deg, rgba(252,248,240,0.98) 0%, rgba(246,237,221,0.96) 74%, rgba(246,237,221,0) 100%)",
              }}
            >
              <div className="flex items-start justify-between gap-4">
                {selectedSpeciesId ? (
                  <button
                    onClick={goBackToRegion}
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
                  onClick={closePanel}
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
                <div className="atlas-kicker mb-1">{panelKicker}</div>
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

              <div className="atlas-divider mt-4" />
            </div>

            <div className="relative flex h-[calc(100%-11rem)] flex-col">
              <div ref={scrollRef} className="atlas-panel-scroll flex-1 overflow-y-auto px-5 pb-6">
                <AnimatePresence mode="wait" initial={false}>
                  {panelState === "core-species" && selectedSpeciesId ? (
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
                  ) : panelState === "extended-species" && selectedExtSpecies ? (
                    <motion.div
                      key={`ext-${selectedSpeciesId}`}
                      initial={shouldReduceMotion ? false : { opacity: 0, y: 16, scale: 0.985 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -10, scale: 0.992 }}
                      transition={
                        shouldReduceMotion
                          ? { duration: 0 }
                          : { duration: 0.28, ease: [0.22, 1, 0.36, 1] }
                      }
                    >
                      <ExtendedSpeciesInfo species={selectedExtSpecies} />
                    </motion.div>
                  ) : panelState === "region" && focusRegionId ? (
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
