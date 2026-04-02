import { NextRequest, NextResponse } from "next/server";

const ALA_BIOCACHE_URL =
  process.env.ALA_BIOCACHE_URL || "https://biocache.ala.org.au/ws";

const AU_BOUNDS = { west: 112, east: 154, south: -44, north: -10 };

function isValidLsid(lsid: string): boolean {
  return lsid.startsWith("urn:lsid:");
}

function isInAustralia(lat: number, lng: number): boolean {
  return (
    lat >= AU_BOUNDS.south &&
    lat <= AU_BOUNDS.north &&
    lng >= AU_BOUNDS.west &&
    lng <= AU_BOUNDS.east
  );
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const lsid = searchParams.get("lsid");
  const yearFrom = searchParams.get("yearFrom") || "1970";
  const yearTo = searchParams.get("yearTo") || "2024";
  const limitParam = Math.min(
    Number(searchParams.get("limit") || "300"),
    500
  );

  if (!lsid || !isValidLsid(lsid)) {
    return NextResponse.json(
      { error: "Invalid or missing lsid parameter. Must start with 'urn:lsid:'" },
      { status: 400 }
    );
  }

  try {
    const params = new URLSearchParams({
      q: `lsid:${lsid}`,
      fq: `year:[${yearFrom} TO ${yearTo}]`,
      fields: "decimalLatitude,decimalLongitude,year",
      pageSize: String(limitParam),
      sort: "year",
      dir: "desc",
    });

    const res = await fetch(
      `${ALA_BIOCACHE_URL}/occurrences/search?${params.toString()}`,
      { next: { revalidate: 3600 } }
    );

    if (!res.ok) {
      return NextResponse.json({ occurrences: [], count: 0, error: "ALA request failed" });
    }

    const data = await res.json();
    const raw: Array<{ decimalLatitude?: number; decimalLongitude?: number; year?: number }> =
      data?.occurrences ?? [];

    const occurrences = raw
      .filter(
        (o) =>
          typeof o.decimalLatitude === "number" &&
          typeof o.decimalLongitude === "number" &&
          isInAustralia(o.decimalLatitude, o.decimalLongitude)
      )
      .map((o) => ({
        lat: Math.round(o.decimalLatitude! * 100) / 100,
        lng: Math.round(o.decimalLongitude! * 100) / 100,
        year: o.year ?? null,
      }));

    return NextResponse.json({ occurrences, count: occurrences.length });
  } catch {
    return NextResponse.json({ occurrences: [], count: 0, error: "ALA request failed" });
  }
}
