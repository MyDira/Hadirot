import { PolygonGeometry } from "../services/locationSearch";

export function isPointInPolygon(
  lat: number,
  lng: number,
  polygon: PolygonGeometry
): boolean {
  if (polygon.type === "Polygon") {
    return isPointInRing(lat, lng, polygon.coordinates[0] as number[][]);
  } else if (polygon.type === "MultiPolygon") {
    for (const poly of polygon.coordinates as number[][][][]) {
      if (isPointInRing(lat, lng, poly[0])) {
        return true;
      }
    }
    return false;
  }
  return false;
}

function isPointInRing(lat: number, lng: number, ring: number[][]): boolean {
  let inside = false;
  const n = ring.length;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];

    const intersect =
      yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;

    if (intersect) {
      inside = !inside;
    }
  }

  return inside;
}

export function filterListingsByPolygon<
  T extends { latitude?: number | null; longitude?: number | null }
>(listings: T[], polygon: PolygonGeometry | null | undefined): T[] {
  if (!polygon) return listings;

  return listings.filter((listing) => {
    if (listing.latitude == null || listing.longitude == null) return false;
    return isPointInPolygon(listing.latitude, listing.longitude, polygon);
  });
}

export function getAdjacentZipCodes(zipCode: string): string[] {
  const zip = parseInt(zipCode, 10);
  if (isNaN(zip)) return [];

  const adjacentZips: string[] = [];
  for (let offset = -5; offset <= 5; offset++) {
    if (offset !== 0) {
      const adjacent = zip + offset;
      if (adjacent >= 10000 && adjacent <= 99999) {
        adjacentZips.push(adjacent.toString().padStart(5, "0"));
      }
    }
  }
  return adjacentZips;
}

export function calculatePolygonBounds(
  polygon: PolygonGeometry
): { north: number; south: number; east: number; west: number } | null {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;

  const processRing = (ring: number[][]) => {
    for (const coord of ring) {
      const lng = coord[0];
      const lat = coord[1];
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
      minLng = Math.min(minLng, lng);
      maxLng = Math.max(maxLng, lng);
    }
  };

  if (polygon.type === "Polygon") {
    processRing(polygon.coordinates[0] as number[][]);
  } else if (polygon.type === "MultiPolygon") {
    for (const poly of polygon.coordinates as number[][][][]) {
      processRing(poly[0]);
    }
  }

  if (!isFinite(minLat) || !isFinite(maxLat)) return null;

  return {
    north: maxLat,
    south: minLat,
    east: maxLng,
    west: minLng,
  };
}
