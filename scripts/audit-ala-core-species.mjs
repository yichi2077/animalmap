#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  AUSTRALIA_YEAR_RANGE,
  buildStateOverlap,
  buildYearlyCounts,
  buildYearlyStateCoverage,
  fetchAustralianOccurrencesByScientificName,
  getFirstReliableAustralianYear,
} from "../lib/server/ala-australia-data.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const speciesPath = join(repoRoot, "data", "species.json");
const reportPath = join(__dirname, "ala-core-audit-report.json");
const metadataPath = join(repoRoot, "data", "core-species-ala-metadata.json");

const YEARLY_TRIAL_SPECIES = new Set(["frilled_lizard", "southern_right_whale"]);

function assessRisk(species, yearlyCounts, stateOverlap) {
  const notes = [];
  const totalRecords = yearlyCounts.reduce((sum, entry) => sum + entry.count, 0);
  const firstAustralianObservedYear = yearlyCounts[0]?.year ?? null;
  const lastAustralianObservedYear = yearlyCounts.at(-1)?.year ?? null;
  const firstReliableAustralianYear = getFirstReliableAustralianYear(yearlyCounts);
  const introYear = typeof species.introYear === "number" ? species.introYear : null;

  let risk = "usable";

  if (totalRecords === 0) {
    return {
      risk: "missing",
      notes: ["ALA 未返回任何澳洲范围观测记录。"],
      firstAustralianObservedYear,
      firstReliableAustralianYear,
      lastAustralianObservedYear,
      totalRecords,
      recommendedIntroYear: null,
    };
  }

  if (firstReliableAustralianYear === null) {
    return {
      risk: "sparse",
      notes: ["ALA 澳洲范围记录过于稀疏，尚不足以形成稳定的年度可视化起点。"],
      firstAustralianObservedYear,
      firstReliableAustralianYear,
      lastAustralianObservedYear,
      totalRecords,
      recommendedIntroYear: null,
    };
  }

  let recommendedIntroYear = firstReliableAustralianYear;

  if (introYear !== null && firstReliableAustralianYear < introYear) {
    risk = "contradictory";
    notes.push(
      `ALA 可靠澳洲记录年 ${firstReliableAustralianYear} 早于策展 introYear ${introYear}。`
    );
  }

  if (stateOverlap.overlapRatio < 0.5) {
    risk = "contradictory";
    notes.push("ALA 澳洲州覆盖与当前策展 states 重合度偏低。");
  }

  if (risk !== "contradictory" && (totalRecords < 25 || yearlyCounts.length < 5)) {
    risk = "sparse";
    notes.push("ALA 年度记录偏少，暂不适合作为稳定逐年驱动源。");
  }

  if (notes.length === 0) {
    notes.push("ALA 澳洲范围年度记录与当前策展分布未见明显冲突。");
  }

  return {
    risk,
    notes,
    firstAustralianObservedYear,
    firstReliableAustralianYear,
    lastAustralianObservedYear,
    totalRecords,
    recommendedIntroYear,
  };
}

function toMetadataEntry(species, assessment) {
  const provenance =
    YEARLY_TRIAL_SPECIES.has(species.id) && assessment.risk === "usable"
      ? "ala_yearly"
      : "curated_historical";

  return {
    firstAustralianObservedYear: assessment.firstAustralianObservedYear,
    firstReliableAustralianYear: assessment.firstReliableAustralianYear,
    recommendedIntroYear: assessment.recommendedIntroYear,
    effectiveIntroYear:
      provenance === "ala_yearly"
        ? assessment.firstReliableAustralianYear
        : typeof species.introYear === "number"
        ? species.introYear
        : null,
    provenance,
    auditRisk: assessment.risk,
  };
}

async function auditSpecies(species) {
  const occurrences = await fetchAustralianOccurrencesByScientificName(species.scientificName, {
    yearFrom: AUSTRALIA_YEAR_RANGE.from,
    yearTo: AUSTRALIA_YEAR_RANGE.to,
    pageSize: 500,
    maxPages: 24,
  });

  const yearlyCounts = buildYearlyCounts(occurrences);
  const observedStates = Array.from(
    new Set(occurrences.map((entry) => entry.stateId).filter(Boolean))
  ).sort();
  const yearlyStateCoverage = buildYearlyStateCoverage(occurrences);
  const stateOverlap = buildStateOverlap(species.states ?? [], observedStates);
  const assessment = assessRisk(species, yearlyCounts, stateOverlap);

  return {
    id: species.id,
    nameZh: species.nameZh,
    nameEn: species.nameEn,
    scientificName: species.scientificName,
    introYear: typeof species.introYear === "number" ? species.introYear : null,
    curatedStates: species.states ?? [],
    firstAustralianObservedYear: assessment.firstAustralianObservedYear,
    firstReliableAustralianYear: assessment.firstReliableAustralianYear,
    recommendedIntroYear: assessment.recommendedIntroYear,
    lastAustralianObservedYear: assessment.lastAustralianObservedYear,
    totalRecords: assessment.totalRecords,
    yearlyCounts,
    yearlyStateCoverage,
    stateOverlap,
    samplePointCount: occurrences.length,
    risk: assessment.risk,
    notes: assessment.notes,
  };
}

async function main() {
  const rawSpecies = JSON.parse(await readFile(speciesPath, "utf8"));
  const coreSpecies = rawSpecies.filter((species) => !String(species.id).startsWith("ext_"));

  const report = {
    generatedAt: new Date().toISOString(),
    source: "ALA australia-only audit",
    yearRange: AUSTRALIA_YEAR_RANGE,
    species: [],
  };

  const metadata = {
    generatedAt: report.generatedAt,
    source: report.source,
    yearRange: AUSTRALIA_YEAR_RANGE,
    species: {},
  };

  for (const species of coreSpecies) {
    process.stdout.write(`Auditing ${species.id}... `);
    try {
      const audited = await auditSpecies(species);
      report.species.push(audited);
      metadata.species[species.id] = toMetadataEntry(species, audited);
      process.stdout.write(`${audited.risk}\n`);
    } catch (error) {
      const missingEntry = {
        id: species.id,
        nameZh: species.nameZh,
        nameEn: species.nameEn,
        scientificName: species.scientificName,
        introYear: typeof species.introYear === "number" ? species.introYear : null,
        curatedStates: species.states ?? [],
        firstAustralianObservedYear: null,
        firstReliableAustralianYear: null,
        recommendedIntroYear: null,
        lastAustralianObservedYear: null,
        totalRecords: 0,
        yearlyCounts: [],
        yearlyStateCoverage: [],
        stateOverlap: {
          curatedStates: species.states ?? [],
          observedStates: [],
          sharedStates: [],
          overlapRatio: 0,
        },
        samplePointCount: 0,
        risk: "missing",
        notes: [error instanceof Error ? error.message : "ALA audit failed"],
      };
      report.species.push(missingEntry);
      metadata.species[species.id] = {
        firstAustralianObservedYear: null,
        firstReliableAustralianYear: null,
        recommendedIntroYear: null,
        effectiveIntroYear: typeof species.introYear === "number" ? species.introYear : null,
        provenance: "curated_historical",
        auditRisk: "missing",
      };
      process.stdout.write("missing\n");
    }
  }

  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
  console.log(`\nWrote audit report to ${reportPath}`);
  console.log(`Wrote metadata to ${metadataPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
