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
