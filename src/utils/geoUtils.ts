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

export function isPointInBounds(
  lat: number,
  lng: number,
  bounds: { north: number; south: number; east: number; west: number }
): boolean {
  return (
    lat >= bounds.south &&
    lat <= bounds.north &&
    lng >= bounds.west &&
    lng <= bounds.east
  );
}

export interface GeographicCenter {
  center: { lat: number; lng: number };
  zoom: number;
}

export function calculateGeographicCenter(
  listings: Array<{ latitude: number | null; longitude: number | null }>
): GeographicCenter | null {
  const listingsWithCoords = listings.filter(
    (l) => l.latitude != null && l.longitude != null
  ) as Array<{ latitude: number; longitude: number }>;

  if (listingsWithCoords.length === 0) {
    return null;
  }

  if (listingsWithCoords.length === 1) {
    const lat = listingsWithCoords[0].latitude;
    const lng = listingsWithCoords[0].longitude;

    // Validate single listing coordinates
    if (!isFinite(lat) || !isFinite(lng)) {
      console.error('Invalid single listing coordinates:', { lat, lng });
      return null;
    }

    return {
      center: { lat, lng },
      zoom: 15,
    };
  }

  const lats = listingsWithCoords.map((l) => l.latitude);
  const lngs = listingsWithCoords.map((l) => l.longitude);

  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  const centerLat = (minLat + maxLat) / 2;
  const centerLng = (minLng + maxLng) / 2;

  // Validate that coordinates are finite numbers
  if (!isFinite(centerLat) || !isFinite(centerLng) ||
      !isFinite(minLat) || !isFinite(maxLat) ||
      !isFinite(minLng) || !isFinite(maxLng)) {
    console.error('Invalid coordinates detected in calculateGeographicCenter', {
      centerLat, centerLng, minLat, maxLat, minLng, maxLng
    });
    return null;
  }

  const latSpread = maxLat - minLat;
  const lngSpread = maxLng - minLng;
  const maxSpread = Math.max(latSpread, lngSpread);

  let zoom = 12;
  if (maxSpread < 0.01) {
    zoom = 15;
  } else if (maxSpread < 0.02) {
    zoom = 14;
  } else if (maxSpread < 0.05) {
    zoom = 13;
  } else if (maxSpread < 0.1) {
    zoom = 12;
  } else if (maxSpread < 0.2) {
    zoom = 11;
  } else {
    zoom = 10;
  }

  return {
    center: { lat: centerLat, lng: centerLng },
    zoom,
  };
}
