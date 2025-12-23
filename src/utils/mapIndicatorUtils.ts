/**
 * Utility functions for calculating off-screen map indicator positions and directions
 */

export type Direction = 'north' | 'south' | 'east' | 'west' | 'northeast' | 'northwest' | 'southeast' | 'southwest';

export interface EdgePosition {
  x: number;
  y: number;
  edge: 'top' | 'bottom' | 'left' | 'right';
}

export interface IndicatorData {
  position: EdgePosition;
  direction: Direction;
  rotation: number;
}

/**
 * Determines which direction an off-screen pin is relative to the current map view
 */
export function calculateOffScreenDirection(
  pinLng: number,
  pinLat: number,
  bounds: { north: number; south: number; east: number; west: number }
): Direction {
  const isNorth = pinLat > bounds.north;
  const isSouth = pinLat < bounds.south;
  const isEast = pinLng > bounds.east;
  const isWest = pinLng < bounds.west;

  if (isNorth && isEast) return 'northeast';
  if (isNorth && isWest) return 'northwest';
  if (isSouth && isEast) return 'southeast';
  if (isSouth && isWest) return 'southwest';
  if (isNorth) return 'north';
  if (isSouth) return 'south';
  if (isEast) return 'east';
  if (isWest) return 'west';

  return 'north';
}

/**
 * Calculates the pixel position on the map edge where the indicator should appear
 */
export function calculateEdgeIndicatorPosition(
  pinLng: number,
  pinLat: number,
  mapBounds: { north: number; south: number; east: number; west: number },
  containerWidth: number,
  containerHeight: number,
  direction: Direction
): EdgePosition {
  const edgeMargin = 50;
  const minEdgeDistance = 60;

  const lngRange = mapBounds.east - mapBounds.west;
  const latRange = mapBounds.north - mapBounds.south;

  const normalizedLng = (pinLng - mapBounds.west) / lngRange;
  const normalizedLat = (mapBounds.north - pinLat) / latRange;

  let x = 0;
  let y = 0;
  let edge: 'top' | 'bottom' | 'left' | 'right' = 'top';

  if (direction.includes('north')) {
    y = edgeMargin;
    edge = 'top';

    if (direction === 'northeast' || direction === 'northwest') {
      x = Math.max(minEdgeDistance, Math.min(containerWidth - minEdgeDistance, normalizedLng * containerWidth));
    } else {
      x = Math.max(minEdgeDistance, Math.min(containerWidth - minEdgeDistance, normalizedLng * containerWidth));
    }
  } else if (direction.includes('south')) {
    y = containerHeight - edgeMargin;
    edge = 'bottom';

    if (direction === 'southeast' || direction === 'southwest') {
      x = Math.max(minEdgeDistance, Math.min(containerWidth - minEdgeDistance, normalizedLng * containerWidth));
    } else {
      x = Math.max(minEdgeDistance, Math.min(containerWidth - minEdgeDistance, normalizedLng * containerWidth));
    }
  } else if (direction === 'east') {
    x = containerWidth - edgeMargin;
    y = Math.max(minEdgeDistance, Math.min(containerHeight - minEdgeDistance, normalizedLat * containerHeight));
    edge = 'right';
  } else if (direction === 'west') {
    x = edgeMargin;
    y = Math.max(minEdgeDistance, Math.min(containerHeight - minEdgeDistance, normalizedLat * containerHeight));
    edge = 'left';
  }

  return { x, y, edge };
}

/**
 * Calculates the rotation angle for the arrow indicator based on direction
 */
export function calculateIndicatorRotation(direction: Direction): number {
  const rotations: Record<Direction, number> = {
    north: 0,
    northeast: 45,
    east: 90,
    southeast: 135,
    south: 180,
    southwest: 225,
    west: 270,
    northwest: 315,
  };

  return rotations[direction];
}

/**
 * Main function to calculate all indicator data for an off-screen pin
 */
export function calculateIndicatorData(
  pinLng: number,
  pinLat: number,
  mapBounds: { north: number; south: number; east: number; west: number },
  containerWidth: number,
  containerHeight: number
): IndicatorData {
  const direction = calculateOffScreenDirection(pinLng, pinLat, mapBounds);
  const position = calculateEdgeIndicatorPosition(
    pinLng,
    pinLat,
    mapBounds,
    containerWidth,
    containerHeight,
    direction
  );
  const rotation = calculateIndicatorRotation(direction);

  return { position, direction, rotation };
}
