export interface KeyframeData {
  year: number;
  populationScore: number;
  distributionType: "stable" | "expansion" | "contraction" | "extinction" | "recovery";
  narrative: string;
}

/**
 * Find the two surrounding keyframes for a given year and interpolate between them.
 */
export function interpolateKeyframes(
  keyframes: KeyframeData[],
  year: number
): { populationScore: number; distributionType: string; narrative: string } {
  if (keyframes.length === 0) {
    return { populationScore: 0, distributionType: "stable", narrative: "" };
  }

  const sorted = [...keyframes].sort((a, b) => a.year - b.year);

  // Before first keyframe
  if (year <= sorted[0].year) {
    return sorted[0];
  }

  // After last keyframe
  if (year >= sorted[sorted.length - 1].year) {
    return sorted[sorted.length - 1];
  }

  // Find surrounding keyframes
  let before = sorted[0];
  let after = sorted[sorted.length - 1];

  for (let i = 0; i < sorted.length - 1; i++) {
    if (year >= sorted[i].year && year <= sorted[i + 1].year) {
      before = sorted[i];
      after = sorted[i + 1];
      break;
    }
  }

  const range = after.year - before.year;
  const progress = range === 0 ? 0 : (year - before.year) / range;

  // Smooth easing
  const eased = progress * progress * (3 - 2 * progress);

  const populationScore =
    before.populationScore + (after.populationScore - before.populationScore) * eased;

  // Use the closer keyframe's distribution type
  const distributionType = progress < 0.5 ? before.distributionType : after.distributionType;
  const narrative = progress < 0.5 ? before.narrative : after.narrative;

  return { populationScore, distributionType, narrative };
}

/**
 * Get opacity for a species based on population score and extinction status.
 */
export function getSpeciesOpacity(populationScore: number, isExtinct: boolean): number {
  if (isExtinct) return 0.25 + populationScore * 0.15;
  return 0.4 + populationScore * 0.6;
}

/**
 * Get CSS filter for species visual state.
 */
export function getSpeciesFilter(
  distributionType: string,
  populationScore: number
): string {
  switch (distributionType) {
    case "extinction":
      return `grayscale(${100 - populationScore * 30}%) opacity(${30 + populationScore * 20}%)`;
    case "contraction":
      return `saturate(${40 + populationScore * 60}%) opacity(${60 + populationScore * 30}%)`;
    case "expansion":
      return `saturate(${90 + populationScore * 10}%)`;
    default:
      return "none";
  }
}
