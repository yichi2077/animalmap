#!/usr/bin/env node

/**
 * Fetches extended species list from ALA and outputs to data/extended-species.json.
 * Requires the dev server to be running at localhost:3000.
 * Usage: node scripts/fetch-extended-species.mjs
 */

import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const STATES = ["qld", "nsw", "vic", "wa", "sa", "tas", "nt", "act"];

async function main() {
  console.log("Fetching extended species from ALA via local API proxy...\n");
  
  const allSpecies = new Map();

  for (const stateId of STATES) {
    try {
      const url = `${BASE_URL}/api/ala/species?stateId=${stateId}&limit=30`;
      const res = await fetch(url);
      if (!res.ok) {
        console.warn(`  ⚠ ${stateId}: HTTP ${res.status}`);
        continue;
      }

      const data = await res.json();
      let added = 0;
      for (const sp of data) {
        if (!allSpecies.has(sp.lsid)) {
          allSpecies.set(sp.lsid, { ...sp, primaryState: stateId });
          added++;
        }
      }
      console.log(`  ✓ ${stateId}: ${data.length} results, ${added} new`);
    } catch (err) {
      console.warn(`  ✗ ${stateId}: ${err.message}`);
    }
  }

  const output = Array.from(allSpecies.values());
  const outPath = join(__dirname, "..", "data", "extended-species.json");
  writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`\n✓ Wrote ${output.length} species to data/extended-species.json`);
}

main().catch(console.error);
