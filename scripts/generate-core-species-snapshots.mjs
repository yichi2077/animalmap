#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  AUSTRALIA_YEAR_RANGE,
  buildYearlyGridSnapshots,
  fetchAustralianOccurrencesByScientificName,
} from "../lib/server/ala-australia-data.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const speciesPath = join(repoRoot, "data", "species.json");
const metadataPath = join(repoRoot, "data", "core-species-ala-metadata.json");
const outPath = join(repoRoot, "data", "species-distribution-snapshots.json");

const SNAPSHOT_SPECIES_IDS = ["frilled_lizard", "southern_right_whale"];

async function main() {
  const speciesList = JSON.parse(await readFile(speciesPath, "utf8"));
  const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
  const output = {};

  for (const speciesId of SNAPSHOT_SPECIES_IDS) {
    const species = speciesList.find((entry) => entry.id === speciesId);
    const meta = metadata?.species?.[speciesId];

    if (!species) {
      throw new Error(`Species ${speciesId} not found in species.json`);
    }

    if (meta?.provenance !== "ala_yearly") {
      output[speciesId] = [];
      continue;
    }

    process.stdout.write(`Generating snapshots for ${speciesId}... `);

    const occurrences = await fetchAustralianOccurrencesByScientificName(species.scientificName, {
      yearFrom: meta.firstReliableAustralianYear ?? AUSTRALIA_YEAR_RANGE.from,
      yearTo: AUSTRALIA_YEAR_RANGE.to,
      pageSize: 500,
      maxPages: 24,
    });

    const filteredOccurrences = occurrences.filter(
      (entry) =>
        meta.firstReliableAustralianYear === null ||
        entry.year >= meta.firstReliableAustralianYear
    );

    output[speciesId] = buildYearlyGridSnapshots(speciesId, filteredOccurrences);
    process.stdout.write(`${output[speciesId].length} yearly snapshots\n`);
  }

  await writeFile(outPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`\nWrote yearly snapshots to ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
