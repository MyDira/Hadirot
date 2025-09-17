export function normalizeUrlForHref(input?: string): string {
  if (!input) return "";
  const s = input.trim();
  if (/^(https?:\/\/|mailto:|tel:)/i.test(s)) return s;
  return `https://${s}`;
}

export function canonicalOrigin(): string {
  const env = (import.meta as any)?.env;
  return (env?.VITE_SITE_URL as string) || window.location.origin;
}

export function canonicalUrl(pathname: string): string {
  const base = canonicalOrigin().replace(/\/+$/, "");
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${base}${path}`;
}
