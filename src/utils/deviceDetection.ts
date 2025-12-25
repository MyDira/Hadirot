export function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;

  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const isSmallScreen = window.innerWidth < 768;

  return isTouchDevice && isSmallScreen;
}

export function isTabletDevice(): boolean {
  if (typeof window === 'undefined') return false;

  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const isTabletScreen = window.innerWidth >= 768 && window.innerWidth < 1024;

  return isTouchDevice && isTabletScreen;
}

export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;

  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}
