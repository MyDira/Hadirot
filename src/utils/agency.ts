export function agencyNameToSlug(name: string): string {
  if (!name) {
    return '';
  }

  const normalized = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  return normalized
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function slugToAgencyLabel(slug: string): string {
  if (!slug) {
    return '';
  }

  const cleaned = slug
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) {
    return '';
  }

  return cleaned
    .split(' ')
    .map(part => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(' ');
}
