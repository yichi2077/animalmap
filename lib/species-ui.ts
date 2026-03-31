import speciesData from "@/data/species.json";
import timelineData from "@/data/timeline.json";
import { YEAR_NOW } from "@/lib/constants";
import { interpolateKeyframes, KeyframeData } from "@/lib/interpolate";

export type SpeciesRecord = (typeof speciesData)[number] & {
  introYear?: number;
  extinctYear?: number;
};

const timeline = timelineData as Record<string, KeyframeData[]>;

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
  const introYear = typeof species.introYear === "number" ? species.introYear : null;
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
