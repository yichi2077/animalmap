import { NextRequest, NextResponse } from "next/server";

const ALA_SPECIES_URL =
  process.env.ALA_SPECIES_URL || "https://api.ala.org.au/species";

// Normalized scientific names (lowercase, spaces → underscores) of all core species.
// These are excluded from ALA-fetched extended results to avoid duplicates.
const CORE_SPECIES_SCIENTIFIC = new Set([
  // original 18
  "thylacinus_cynocephalus",
  "chaeropus_ecaudatus",
  "phascolarctos_cinereus",
  "ornithorhynchus_anatinus",
  "sarcophilus_harrisii",
  "macrotis_lagotis",
  "osphranter_rufus",
  "dromaius_novaehollandiae",
  "tachyglossus_aculeatus",
  "dacelo_novaeguineae",
  "chlamydosaurus_kingii",
  "rhinella_marina",
  "oryctolagus_cuniculus",
  "canis_lupus_dingo",
  "vulpes_vulpes",
  "eubalaena_australis",
  "carcharodon_carcharias",
  "chelonia_mydas",
  // new 10
  "rheobatrachus_silus",
  "dasyurus_hallucatus",
  "neophema_chrysogaster",
  "crocodylus_porosus",
  "moloch_horridus",
  "aquila_audax",
  "macropus_giganteus",
  "felis_catus",
  "dugong_dugon",
  "megaptera_novaeangliae",
]);

const STATE_ID_MAP: Record<string, string> = {
  nsw: "New South Wales",
  vic: "Victoria",
  qld: "Queensland",
  sa: "South Australia",
  wa: "Western Australia",
  tas: "Tasmania",
  nt: "Northern Territory",
  act: "Australian Capital Territory",
};

const ALLOWED_CLASSES = ["Aves", "Mammalia", "Reptilia", "Amphibia", "Chondrichthyes"];

const CLASS_MAP: Record<string, string> = {
  Aves: "bird",
  Mammalia: "mammal",
  Reptilia: "reptile",
  Amphibia: "amphibian",
  Chondrichthyes: "marine",
  Actinopterygii: "marine",
};

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const stateId = searchParams.get("stateId");
  const q = searchParams.get("q") || "*";
  const limitParam = Math.min(Number(searchParams.get("limit") || "30"), 50);

  try {
    const fqParts: string[] = [
      "idxtype:TAXON",
      `class:(${ALLOWED_CLASSES.join(" OR ")})`,
    ];

    if (stateId && STATE_ID_MAP[stateId]) {
      fqParts.push(`state:\"${STATE_ID_MAP[stateId]}\"`);
    }

    const params = new URLSearchParams({
      q,
      sort: "occCount",
      dir: "desc",
      pageSize: String(limitParam + 20),
    });
    fqParts.forEach((fq) => params.append("fq", fq));

    const res = await fetch(
      `${ALA_SPECIES_URL}/search?${params.toString()}`,
      { next: { revalidate: 3600 } }
    );

    if (!res.ok) {
      return NextResponse.json([]);
    }

    const data = await res.json();
    const results: Array<{
      lsid: string;
      nameEn: string;
      scientificName: string;
      taxonomicClass: string;
      occurrenceCount: number;
      dangerStatus: string;
    }> = [];

    const rawResults = data?.searchResults?.results ?? data?.results ?? [];
    for (const item of rawResults) {
      if (results.length >= limitParam) break;

      const guid: string = item.guid ?? item.lsid ?? "";
      const commonName: string = item.commonName ?? item.commonNameSingle ?? item.name ?? "";
      const scientificName: string = item.scientificName ?? item.name ?? "";
      const className: string = item.class ?? item.classs ?? "";
      const occCount: number = item.occurrenceCount ?? item.occCount ?? 0;

      if (!guid || occCount < 100) continue;

      const normId = scientificName.toLowerCase().replace(/\s+/g, "_");
      if (CORE_SPECIES_SCIENTIFIC.has(normId)) continue;

      results.push({
        lsid: guid,
        nameEn: commonName || scientificName,
        scientificName,
        taxonomicClass: CLASS_MAP[className] || "mammal",
        occurrenceCount: occCount,
        dangerStatus: item.conservationStatus ?? item.conservation ?? "LC",
      });
    }

    return NextResponse.json(results);
  } catch {
    return NextResponse.json([]);
  }
}
