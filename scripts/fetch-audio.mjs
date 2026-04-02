#!/usr/bin/env node

/**
 * Downloads ambient audio files from Freesound.org (requires FREESOUND_API_KEY).
 * If the API key is not set, prints manual download instructions instead.
 * Usage: FREESOUND_API_KEY=xxx node scripts/fetch-audio.mjs
 */

import { existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const API_KEY = process.env.FREESOUND_API_KEY;
const OUTPUT_DIR = join(__dirname, "..", "public", "assets", "audio", "ambient");

const ZONES = [
  { file: "tropical-rainforest.mp3", search: "tropical rainforest australia birds" },
  { file: "coastal-waves.mp3", search: "ocean waves australia beach" },
  { file: "outback-desert.mp3", search: "outback australia desert wind" },
  { file: "temperate-forest.mp3", search: "temperate forest birds creek stream australia" },
  { file: "savanna.mp3", search: "savanna grassland wind birds australia" },
  { file: "ocean-deep.mp3", search: "underwater ocean ambient deep" },
];

if (!existsSync(OUTPUT_DIR)) {
  mkdirSync(OUTPUT_DIR, { recursive: true });
}

if (!API_KEY) {
  console.log("FREESOUND_API_KEY is not configured.\n");
  console.log("To download ambient audio automatically, set the environment variable:\n");
  console.log("  FREESOUND_API_KEY=your_key node scripts/fetch-audio.mjs\n");
  console.log("Or download manually from freesound.org with these search terms:\n");
  for (const zone of ZONES) {
    const exists = existsSync(join(OUTPUT_DIR, zone.file));
    console.log(`  ${exists ? "✓" : "○"} ${zone.file} → search: "${zone.search}"`);
  }
  console.log(`\nPlace downloaded files in: ${OUTPUT_DIR}`);
  process.exit(0);
}

console.log("Fetching ambient audio from Freesound...\n");

async function downloadZone(zone) {
  const outPath = join(OUTPUT_DIR, zone.file);
  if (existsSync(outPath)) {
    console.log(`  ✓ ${zone.file} already exists, skipping`);
    return;
  }

  try {
    const searchUrl = `https://freesound.org/apiv2/search/text/?query=${encodeURIComponent(zone.search)}&filter=duration:[5 TO 60]&sort=rating_desc&fields=id,name,previews&page_size=1&token=${API_KEY}`;
    const res = await fetch(searchUrl);
    if (!res.ok) throw new Error(`Search failed: ${res.status}`);

    const data = await res.json();
    if (!data.results || data.results.length === 0) {
      console.warn(`  ⚠ ${zone.file}: no results found`);
      return;
    }

    const previewUrl = data.results[0].previews?.["preview-hq-mp3"];
    if (!previewUrl) {
      console.warn(`  ⚠ ${zone.file}: no preview URL`);
      return;
    }

    const audioRes = await fetch(previewUrl);
    if (!audioRes.ok) throw new Error(`Download failed: ${audioRes.status}`);

    const { writeFileSync } = await import("fs");
    const buffer = Buffer.from(await audioRes.arrayBuffer());
    writeFileSync(outPath, buffer);
    console.log(`  ✓ ${zone.file} downloaded (${data.results[0].name})`);
  } catch (err) {
    console.warn(`  ✗ ${zone.file}: ${err.message}`);
  }
}

async function main() {
  for (const zone of ZONES) {
    await downloadZone(zone);
  }
  console.log("\nDone.");
}

main().catch(console.error);
