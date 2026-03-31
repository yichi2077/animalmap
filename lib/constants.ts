export const YEAR_MIN = 1770;
export const YEAR_MAX = 2024;
export const YEAR_NOW = 2024;

export const KEYFRAME_YEARS = [1770, 1788, 1900, 1935, 1950, 2024] as const;

export const TIME_LABELS: Record<string, string> = {
  inference: "推断层",
  fact: "事实层",
  now: "探索层",
};

export function getTimeLabel(year: number): string {
  if (year < 1788) return TIME_LABELS.inference;
  if (year < 2024) return TIME_LABELS.fact;
  return TIME_LABELS.now;
}

export const CONSERVATION_LEVELS = [
  { key: "LC", label: "无危", color: "#7da56c" },
  { key: "NT", label: "近危", color: "#a3bf96" },
  { key: "VU", label: "易危", color: "#e0c99a" },
  { key: "EN", label: "濒危", color: "#e08a58" },
  { key: "CR", label: "极危", color: "#c97040" },
  { key: "EX", label: "灭绝", color: "#8a7e6d" },
] as const;

export type ConservationKey = (typeof CONSERVATION_LEVELS)[number]["key"];
