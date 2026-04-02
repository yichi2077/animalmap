interface Point {
  lat: number;
  lng: number;
}

interface ClusterResult {
  lat: number;
  lng: number;
  weight: number;
}

function distance(a: Point, b: Point): number {
  const dlat = a.lat - b.lat;
  const dlng = a.lng - b.lng;
  return dlat * dlat + dlng * dlng;
}

function kMeansPlusPlusInit(points: Point[], k: number): Point[] {
  const centers: Point[] = [];
  const idx = Math.floor(Math.random() * points.length);
  centers.push({ ...points[idx] });

  for (let c = 1; c < k; c++) {
    const dists = points.map((p) => {
      let minD = Infinity;
      for (const center of centers) {
        const d = distance(p, center);
        if (d < minD) minD = d;
      }
      return minD;
    });

    const totalDist = dists.reduce((s, d) => s + d, 0);
    let r = Math.random() * totalDist;
    let chosen = 0;
    for (let i = 0; i < dists.length; i++) {
      r -= dists[i];
      if (r <= 0) {
        chosen = i;
        break;
      }
    }
    centers.push({ ...points[chosen] });
  }

  return centers;
}

export function kMeansCluster(
  points: Point[],
  k?: number,
  maxIterations = 15
): ClusterResult[] {
  if (points.length === 0) return [];
  if (points.length <= 2) {
    return points.map((p) => ({
      lat: Math.round(p.lat * 100) / 100,
      lng: Math.round(p.lng * 100) / 100,
      weight: 1 / points.length,
    }));
  }

  const effectiveK = k ?? Math.min(6, Math.max(3, Math.ceil(points.length / 40)));
  const actualK = Math.min(effectiveK, points.length);
  const centers = kMeansPlusPlusInit(points, actualK);

  for (let iter = 0; iter < maxIterations; iter++) {
    const assignments = new Array<number>(points.length);
    for (let i = 0; i < points.length; i++) {
      let minD = Infinity;
      let bestC = 0;
      for (let c = 0; c < centers.length; c++) {
        const d = distance(points[i], centers[c]);
        if (d < minD) {
          minD = d;
          bestC = c;
        }
      }
      assignments[i] = bestC;
    }

    const newCenters: Array<{ sumLat: number; sumLng: number; count: number }> =
      centers.map(() => ({ sumLat: 0, sumLng: 0, count: 0 }));

    for (let i = 0; i < points.length; i++) {
      const c = assignments[i];
      newCenters[c].sumLat += points[i].lat;
      newCenters[c].sumLng += points[i].lng;
      newCenters[c].count++;
    }

    let converged = true;
    for (let c = 0; c < centers.length; c++) {
      if (newCenters[c].count === 0) continue;
      const newLat = newCenters[c].sumLat / newCenters[c].count;
      const newLng = newCenters[c].sumLng / newCenters[c].count;
      if (
        Math.abs(newLat - centers[c].lat) > 0.001 ||
        Math.abs(newLng - centers[c].lng) > 0.001
      ) {
        converged = false;
      }
      centers[c] = { lat: newLat, lng: newLng };
    }

    if (converged) break;
  }

  const counts = new Array<number>(centers.length).fill(0);
  for (let i = 0; i < points.length; i++) {
    let minD = Infinity;
    let bestC = 0;
    for (let c = 0; c < centers.length; c++) {
      const d = distance(points[i], centers[c]);
      if (d < minD) {
        minD = d;
        bestC = c;
      }
    }
    counts[bestC]++;
  }

  return centers
    .map((center, i) => ({
      lat: Math.round(center.lat * 100) / 100,
      lng: Math.round(center.lng * 100) / 100,
      weight: counts[i] / points.length,
    }))
    .filter((c) => c.weight > 0);
}
