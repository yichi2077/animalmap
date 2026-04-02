import speciesData from "@/data/species.json";
import coreSpeciesAlaMetadata from "@/data/core-species-ala-metadata.json";
import speciesDistributionSnapshots from "@/data/species-distribution-snapshots.json";
import timelineData from "@/data/timeline.json";
import { YEAR_NOW } from "@/lib/constants";
import { EvidenceType, interpolateKeyframes, KeyframeData } from "@/lib/interpolate";

export type SpeciesRecord = (typeof speciesData)[number] & {
  introYear?: number;
  extinctYear?: number;
};

export type DistributionPoint = {
  pointId?: string;
  lat: number;
  lng: number;
  weight: number;
  count?: number;
};

export type DistributionSnapshot = {
  year: number;
  provenance: "curated_historical" | "ala_yearly";
  states?: string[];
  points: DistributionPoint[];
};

const timeline = timelineData as Record<string, KeyframeData[]>;
const snapshotsBySpecies = speciesDistributionSnapshots as Record<string, DistributionSnapshot[]>;
const coreSpeciesMeta = (coreSpeciesAlaMetadata as {
  species?: Record<
    string,
    {
      firstAustralianObservedYear: number | null;
      firstReliableAustralianYear: number | null;
      recommendedIntroYear: number | null;
      effectiveIntroYear: number | null;
      provenance: SpeciesDataProvenance;
      auditRisk: "usable" | "sparse" | "contradictory" | "missing";
    }
  >;
}).species ?? {};

export type EvidenceTone = "inference" | "historical" | "contemporary";
export type SpeciesDataProvenance = "curated_historical" | "ala_yearly" | "ala_aggregated";

export function getCoreSpeciesAlaMeta(speciesId: string) {
  return coreSpeciesMeta[speciesId] ?? null;
}

export function getSpeciesEffectiveIntroYear(speciesId: string): number | null {
  const species = getSpeciesById(speciesId);
  if (!species) return null;

  const alaMeta = getCoreSpeciesAlaMeta(speciesId);
  if (typeof alaMeta?.effectiveIntroYear === "number") {
    return alaMeta.effectiveIntroYear;
  }

  return typeof species.introYear === "number" ? species.introYear : null;
}

export function getCoreSpeciesDataProvenance(
  speciesId: string,
  currentYear: number
): {
  provenance: SpeciesDataProvenance;
  label: string;
  description: string;
} {
  const alaMeta = getCoreSpeciesAlaMeta(speciesId);
  const timeLabel = currentYear <= 1770 ? "1788 前" : `${currentYear} 年`;

  if (alaMeta?.provenance === "ala_yearly") {
    return {
      provenance: "ala_yearly",
      label: "ALA 年度记录",
      description: `${timeLabel} 的地图点位优先来自 ALA 澳洲范围年度观测快照；若当前年份没有精确记录，则回退到最近一个不晚于当前年份的年度切片。`,
    };
  }

  return {
    provenance: "curated_historical",
    label: "策展时间轴",
    description: `${timeLabel} 的核心物种轨迹当前主要来自策展时间轴、历史资料与整理后的阶段性叙事，不代表已完成 ALA 逐年定位复原。`,
  };
}

export function getExtendedSpeciesDataProvenance(): {
  provenance: SpeciesDataProvenance;
  label: string;
  description: string;
} {
  return {
    provenance: "ala_aggregated",
    label: "ALA 聚合记录",
    description: "当前扩展物种地图点位来自 ALA 1970–2024 的聚合观测记录聚类，不代表逐年历史轨迹。",
  };
}

export function getSpeciesDistributionPointsForYear(
  species: SpeciesRecord | null,
  currentYear: number
): DistributionPoint[] {
  if (!species) return [];

  const introYear = getSpeciesEffectiveIntroYear(species.id);
  if (introYear !== null && currentYear < introYear) {
    return [];
  }

  const snapshots = [...(snapshotsBySpecies[species.id] ?? [])].sort((a, b) => a.year - b.year);
  const matchedSnapshot =
    snapshots.filter((snapshot) => snapshot.year <= currentYear).at(-1) ??
    snapshots[0] ??
    null;

  if (matchedSnapshot?.points?.length) {
    return matchedSnapshot.points;
  }

  return (species.distributionPoints as DistributionPoint[] | undefined) ?? [];
}

export function getEvidenceMeta(
  evidenceType: EvidenceType | null | undefined,
  year: number
): {
  tone: EvidenceTone;
  label: string;
  description: string;
} {
  const fallbackEvidenceType =
    year < 1788 ? "inferred" : year >= YEAR_NOW ? "contemporary" : "historical";
  const resolvedEvidenceType = evidenceType ?? fallbackEvidenceType;

  if (resolvedEvidenceType === "inferred") {
    return {
      tone: "inference",
      label: "推断层",
      description: "此时间段以整理后的历史推断与物种叙事为主，不代表精确逐年观测数据。",
    };
  }

  if (resolvedEvidenceType === "contemporary") {
    return {
      tone: "contemporary",
      label: "当代观察",
      description: "此内容优先表达当前整理后的保护状态与近代记录。",
    };
  }

  return {
    tone: "historical",
    label: "历史记录",
    description: "此时间段以历史事件、保护背景与整理后的阶段性描述为主。",
  };
}

export function getSpeciesById(speciesId: string | null) {
  if (!speciesId) return null;
  return (speciesData as SpeciesRecord[]).find((species) => species.id === speciesId) || null;
}

export function getPreferredRegionId(
  speciesId: string,
  currentRegionId?: string | null
) {
  const species = getSpeciesById(speciesId);
  if (!species) return null;

  if (currentRegionId && species.states.includes(currentRegionId)) {
    return currentRegionId;
  }

  return species.states[0] ?? null;
}

export function getSpeciesTemporalState(speciesId: string, currentYear: number) {
  const species = getSpeciesById(speciesId);
  if (!species) return null;

  const interpolated = interpolateKeyframes(timeline[species.id] || [], currentYear);
  const introYear = getSpeciesEffectiveIntroYear(species.id);
  const extinctYear = typeof species.extinctYear === "number" ? species.extinctYear : null;
  const isPreArrival = introYear !== null && currentYear < introYear;
  const isExtinct =
    interpolated.distributionType === "extinction" ||
    (extinctYear !== null && currentYear >= extinctYear);
  const isVisibleOnMap = !isPreArrival;

  if (isPreArrival) {
    return {
      species,
      interpolated,
      introYear,
      extinctYear,
      isPreArrival,
      isExtinct,
      isVisibleOnMap,
      tone: "arrival" as const,
      badge: "尚未抵达",
      title: `${introYear} 年前尚未进入这片大陆`,
      description: `当前时间停留在 ${currentYear} 年。这一物种要到 ${introYear} 年后才会在澳大利亚生态中留下痕迹，因此地图上不会出现它的现场标记。`,
    };
  }

  if (isExtinct && extinctYear !== null && currentYear >= extinctYear) {
    return {
      species,
      interpolated,
      introYear,
      extinctYear,
      isPreArrival,
      isExtinct,
      isVisibleOnMap,
      tone: "extinct" as const,
      badge: "仅存档案",
      title: `这条生命线已在 ${extinctYear} 年前后消失`,
      description: `你现在看到的是历史档案与推断叙述。地图上的物种信号会退去，但右栏仍保留它的名字、录音资料与故事。`,
    };
  }

  if (currentYear >= YEAR_NOW) {
    return {
      species,
      interpolated,
      introYear,
      extinctYear,
      isPreArrival,
      isExtinct,
      isVisibleOnMap,
      tone: "now" as const,
      badge: "当下记录",
      title: "现在听见的是当下现场",
      description: "右栏这组内容已经切换到 Now 时间层，适合直接聆听录音、阅读近况，再回看它一路走来的轨迹。",
    };
  }

  return {
    species,
    interpolated,
    introYear,
    extinctYear,
    isPreArrival,
    isExtinct,
    isVisibleOnMap,
    tone: "history" as const,
    badge: "时间切片",
    title: `正在阅读 ${currentYear} 年的时间切片`,
    description: "地图、时间尺和右栏内容现在共享同一个历史年份，适合观察种群变化、迁移与收缩。",
  };
}
