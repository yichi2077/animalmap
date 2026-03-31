import type { StyleSpecification } from "maplibre-gl";

const DEFAULT_MAPTILER_STYLE_URL = "https://api.maptiler.com/maps/basic-v2/style.json";
const DEFAULT_OPENFREEMAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

function withKey(url: string, key: string) {
  try {
    const next = new URL(url);
    if (!next.searchParams.has("key")) {
      next.searchParams.set("key", key);
    }
    return next.toString();
  } catch {
    return `${url}${url.includes("?") ? "&" : "?"}key=${encodeURIComponent(key)}`;
  }
}

export function getAtlasMapConfig(): {
  style: StyleSpecification | string;
  mode: "remote" | "fallback";
  isCustomStyle: boolean;
  provider: "maptiler" | "openfreemap" | "fallback";
} {
  const key = process.env.NEXT_PUBLIC_MAPTILER_KEY?.trim();
  const customStyleUrl = process.env.NEXT_PUBLIC_MAPTILER_STYLE_URL?.trim();

  if (key && customStyleUrl) {
    return {
      style: withKey(customStyleUrl, key),
      mode: "remote",
      isCustomStyle: true,
      provider: "maptiler",
    };
  }

  if (key) {
    return {
      style: withKey(DEFAULT_MAPTILER_STYLE_URL, key),
      mode: "remote",
      isCustomStyle: false,
      provider: "maptiler",
    };
  }

  return {
    style: DEFAULT_OPENFREEMAP_STYLE_URL,
    mode: "remote",
    isCustomStyle: false,
    provider: "openfreemap",
  };
}
