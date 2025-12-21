export interface ViewportBounds {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
}

export interface SpaceAvailable {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface PopupDimensions {
  width: number;
  height: number;
  offset: number;
}

export interface EdgeProximity {
  isNearTop: boolean;
  isNearBottom: boolean;
  isNearLeft: boolean;
  isNearRight: boolean;
  nearestEdge: 'top' | 'bottom' | 'left' | 'right' | null;
  distanceToNearestEdge: number;
}

export function getViewportBounds(): ViewportBounds {
  return {
    top: 0,
    left: 0,
    right: window.innerWidth,
    bottom: window.innerHeight,
    width: window.innerWidth,
    height: window.innerHeight,
  };
}

export function getContainerBounds(container: HTMLElement): ViewportBounds {
  const rect = container.getBoundingClientRect();
  return {
    top: 0,
    left: 0,
    right: rect.width,
    bottom: rect.height,
    width: rect.width,
    height: rect.height,
  };
}

export function calculateAvailableSpace(
  elementX: number,
  elementY: number,
  viewport: ViewportBounds
): SpaceAvailable {
  return {
    top: elementY - viewport.top,
    right: viewport.right - elementX,
    bottom: viewport.bottom - elementY,
    left: elementX - viewport.left,
  };
}

export function getPopupDimensions(isMobile: boolean): PopupDimensions {
  if (isMobile) {
    return {
      width: Math.min(window.innerWidth * 0.85, 300),
      height: 200,
      offset: 20,
    };
  }
  return {
    width: 280,
    height: 280,
    offset: 20,
  };
}

export function checkEdgeProximity(
  elementX: number,
  elementY: number,
  viewport: ViewportBounds,
  threshold: number = 100
): EdgeProximity {
  const distanceToTop = elementY - viewport.top;
  const distanceToBottom = viewport.bottom - elementY;
  const distanceToLeft = elementX - viewport.left;
  const distanceToRight = viewport.right - elementX;

  const distances = [
    { edge: 'top' as const, distance: distanceToTop },
    { edge: 'bottom' as const, distance: distanceToBottom },
    { edge: 'left' as const, distance: distanceToLeft },
    { edge: 'right' as const, distance: distanceToRight },
  ];

  const nearest = distances.reduce((min, curr) =>
    curr.distance < min.distance ? curr : min
  );

  return {
    isNearTop: distanceToTop < threshold,
    isNearBottom: distanceToBottom < threshold,
    isNearLeft: distanceToLeft < threshold,
    isNearRight: distanceToRight < threshold,
    nearestEdge: nearest.distance < threshold ? nearest.edge : null,
    distanceToNearestEdge: nearest.distance,
  };
}

export function determineOptimalAnchor(
  available: SpaceAvailable,
  dimensions: PopupDimensions,
  isMobile: boolean = false
): string {
  const markerHeight = 35;
  const popupTipHeight = 15;
  const safeMargin = 15;

  const requiredWidth = dimensions.width + dimensions.offset + safeMargin;
  const requiredHeight = dimensions.height + dimensions.offset + markerHeight + popupTipHeight + safeMargin;
  const cornerRequiredWidth = (dimensions.width * 0.7) + dimensions.offset + safeMargin;
  const cornerRequiredHeight = (dimensions.height * 0.7) + dimensions.offset + markerHeight + safeMargin;

  type AnchorPosition = 'top' | 'bottom' | 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

  const anchorScores: Record<AnchorPosition, number> = {
    'top': 0,
    'bottom': 0,
    'left': 0,
    'right': 0,
    'top-left': 0,
    'top-right': 0,
    'bottom-left': 0,
    'bottom-right': 0,
  };

  if (available.bottom >= requiredHeight) {
    anchorScores['top'] = available.bottom + (isMobile ? 0 : 50);
  }
  if (available.top >= requiredHeight) {
    anchorScores['bottom'] = available.top + (isMobile ? 0 : 40);
  }
  if (available.right >= requiredWidth) {
    anchorScores['left'] = available.right + (isMobile ? -20 : 30);
  }
  if (available.left >= requiredWidth) {
    anchorScores['right'] = available.left + (isMobile ? -20 : 20);
  }

  if (available.bottom >= cornerRequiredHeight && available.right >= cornerRequiredWidth) {
    anchorScores['top-left'] = Math.min(available.bottom, available.right) + 10;
  }
  if (available.bottom >= cornerRequiredHeight && available.left >= cornerRequiredWidth) {
    anchorScores['top-right'] = Math.min(available.bottom, available.left) + 10;
  }
  if (available.top >= cornerRequiredHeight && available.right >= cornerRequiredWidth) {
    anchorScores['bottom-left'] = Math.min(available.top, available.right) + 10;
  }
  if (available.top >= cornerRequiredHeight && available.left >= cornerRequiredWidth) {
    anchorScores['bottom-right'] = Math.min(available.top, available.left) + 10;
  }

  const sortedAnchors = (Object.entries(anchorScores) as [AnchorPosition, number][])
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1]);

  if (sortedAnchors.length > 0) {
    return sortedAnchors[0][0];
  }

  const maxVertical = Math.max(available.top, available.bottom);
  const maxHorizontal = Math.max(available.left, available.right);

  if (maxVertical >= maxHorizontal) {
    if (available.bottom >= available.top) {
      return available.right >= available.left ? 'top-left' : 'top-right';
    } else {
      return available.right >= available.left ? 'bottom-left' : 'bottom-right';
    }
  } else {
    if (available.right >= available.left) {
      return available.bottom >= available.top ? 'top-left' : 'bottom-left';
    } else {
      return available.bottom >= available.top ? 'top-right' : 'bottom-right';
    }
  }
}

export function calculatePanOffset(
  elementX: number,
  elementY: number,
  viewport: ViewportBounds,
  dimensions: PopupDimensions,
  edgeThreshold: number = 120
): { x: number; y: number } | null {
  const proximity = checkEdgeProximity(elementX, elementY, viewport, edgeThreshold);

  if (!proximity.nearestEdge) {
    return null;
  }

  const panAmount = dimensions.width * 0.6;
  let panX = 0;
  let panY = 0;

  if (proximity.isNearLeft) {
    panX = Math.min(panAmount, edgeThreshold - (elementX - viewport.left));
  } else if (proximity.isNearRight) {
    panX = -Math.min(panAmount, edgeThreshold - (viewport.right - elementX));
  }

  if (proximity.isNearTop) {
    panY = Math.min(panAmount, edgeThreshold - (elementY - viewport.top));
  } else if (proximity.isNearBottom) {
    panY = -Math.min(panAmount, edgeThreshold - (viewport.bottom - elementY));
  }

  if (panX === 0 && panY === 0) {
    return null;
  }

  return { x: panX, y: panY };
}

export function isElementFullyVisible(
  element: HTMLElement,
  container: HTMLElement
): boolean {
  const elementRect = element.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();

  return (
    elementRect.top >= containerRect.top &&
    elementRect.bottom <= containerRect.bottom &&
    elementRect.left >= containerRect.left &&
    elementRect.right <= containerRect.right
  );
}

export function scrollElementIntoView(
  element: HTMLElement,
  container: HTMLElement,
  behavior: ScrollBehavior = "smooth"
): void {
  const elementRect = element.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();

  const isPartiallyAbove = elementRect.top < containerRect.top;
  const isPartiallyBelow = elementRect.bottom > containerRect.bottom;

  if (isPartiallyAbove || isPartiallyBelow) {
    element.scrollIntoView({
      behavior,
      block: "center",
      inline: "nearest",
    });
  }
}
