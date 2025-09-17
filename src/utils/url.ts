export function normalizeUrlForHref(input?: string): string {
  if (!input) return "";
  const trimmed = input.trim();
  if (/^(https?:\/\/|mailto:|tel:)/i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}
