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

export function determineOptimalAnchor(
  available: SpaceAvailable,
  dimensions: PopupDimensions
): string {
  const requiredWidth = dimensions.width + 40;
  const requiredHeight = dimensions.height + 60;

  const spaceScores = {
    bottom: available.bottom >= requiredHeight ? available.bottom : 0,
    top: available.top >= requiredHeight ? available.top : 0,
    right: available.right >= requiredWidth ? available.right : 0,
    left: available.left >= requiredWidth ? available.left : 0,
  };

  if (spaceScores.bottom >= requiredHeight) return "top";
  if (spaceScores.top >= requiredHeight) return "bottom";
  if (spaceScores.right >= requiredWidth) return "left";
  if (spaceScores.left >= requiredWidth) return "right";

  const maxSpace = Math.max(...Object.values(spaceScores));
  if (maxSpace === spaceScores.bottom) return "top";
  if (maxSpace === spaceScores.top) return "bottom";
  if (maxSpace === spaceScores.right) return "left";
  return "bottom-left";
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
