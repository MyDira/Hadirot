export interface ParsedSearchQuery {
  locationQuery: string;
  bedrooms?: number;
  bathrooms?: number;
  minPrice?: number;
  maxPrice?: number;
  propertyType?: string;
  remainingText: string;
}

const BEDROOM_PATTERNS = [
  /(\d+)\s*(?:bed(?:room)?s?|br|BR)\b/gi,
  /\b(studio)\b/gi,
];

const BATHROOM_PATTERNS = [
  /(\d+(?:\.\d+)?)\s*(?:bath(?:room)?s?|ba|BA)\b/gi,
];

const PRICE_PATTERNS = {
  under: /(?:under|below|max|up\s*to|less\s*than)\s*\$?(\d+(?:\.\d+)?)\s*(k|K|thousand)?\b/gi,
  over: /(?:over|above|min|more\s*than|at\s*least)\s*\$?(\d+(?:\.\d+)?)\s*(k|K|thousand)?\b/gi,
  range: /\$?(\d+(?:\.\d+)?)\s*(k|K)?\s*[-–]\s*\$?(\d+(?:\.\d+)?)\s*(k|K)?\b/gi,
  exact: /\$(\d+(?:,\d{3})*(?:\.\d+)?)(k|K)?\b/gi,
};

const PROPERTY_TYPE_KEYWORDS: Record<string, string> = {
  apartment: 'apartment_building',
  apt: 'apartment_building',
  house: 'full_house',
  condo: 'condo',
  duplex: 'duplex',
  basement: 'basement',
  townhouse: 'full_house',
  'single family': 'single_family',
  'single-family': 'single_family',
  'two family': 'two_family',
  'two-family': 'two_family',
  'multi family': 'four_family',
  'multi-family': 'four_family',
  'co-op': 'co_op',
  coop: 'co_op',
};

const ZIP_CODE_PATTERN = /\b(\d{5})\b/g;

function parsePrice(value: string, suffix?: string): number {
  let num = parseFloat(value.replace(/,/g, ''));
  if (suffix && (suffix.toLowerCase() === 'k' || suffix === 'thousand')) {
    num *= 1000;
  }
  return num;
}

export function parseSearchQuery(query: string): ParsedSearchQuery {
  let text = query.trim();
  let bedrooms: number | undefined;
  let bathrooms: number | undefined;
  let minPrice: number | undefined;
  let maxPrice: number | undefined;
  let propertyType: string | undefined;
  const extractedParts: string[] = [];

  for (const pattern of BEDROOM_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const value = match[1].toLowerCase();
      if (value === 'studio') {
        bedrooms = 0;
      } else {
        bedrooms = parseInt(value, 10);
      }
      extractedParts.push(match[0]);
    }
  }

  for (const pattern of BATHROOM_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      bathrooms = parseFloat(match[1]);
      extractedParts.push(match[0]);
    }
  }

  PRICE_PATTERNS.range.lastIndex = 0;
  let rangeMatch;
  while ((rangeMatch = PRICE_PATTERNS.range.exec(text)) !== null) {
    minPrice = parsePrice(rangeMatch[1], rangeMatch[2]);
    maxPrice = parsePrice(rangeMatch[3], rangeMatch[4]);
    extractedParts.push(rangeMatch[0]);
  }

  if (!minPrice && !maxPrice) {
    PRICE_PATTERNS.under.lastIndex = 0;
    let underMatch;
    while ((underMatch = PRICE_PATTERNS.under.exec(text)) !== null) {
      maxPrice = parsePrice(underMatch[1], underMatch[2]);
      extractedParts.push(underMatch[0]);
    }

    PRICE_PATTERNS.over.lastIndex = 0;
    let overMatch;
    while ((overMatch = PRICE_PATTERNS.over.exec(text)) !== null) {
      minPrice = parsePrice(overMatch[1], overMatch[2]);
      extractedParts.push(overMatch[0]);
    }
  }

  const lowerText = text.toLowerCase();
  for (const [keyword, type] of Object.entries(PROPERTY_TYPE_KEYWORDS)) {
    if (lowerText.includes(keyword)) {
      propertyType = type;
      const keywordPattern = new RegExp(`\\b${keyword}\\b`, 'gi');
      const keywordMatch = text.match(keywordPattern);
      if (keywordMatch) {
        extractedParts.push(keywordMatch[0]);
      }
      break;
    }
  }

  let remainingText = text;
  for (const part of extractedParts) {
    remainingText = remainingText.replace(part, ' ');
  }
  remainingText = remainingText.replace(/\s+/g, ' ').trim();

  const zipMatches = remainingText.match(ZIP_CODE_PATTERN);
  let locationQuery = remainingText;

  if (zipMatches && zipMatches.length > 0) {
    locationQuery = zipMatches[0];
  } else {
    const words = remainingText.split(' ').filter(w => w.length > 1);
    if (words.length > 0) {
      locationQuery = words.join(' ');
    }
  }

  return {
    locationQuery: locationQuery || '',
    bedrooms,
    bathrooms,
    minPrice,
    maxPrice,
    propertyType,
    remainingText,
  };
}

export function formatParsedFilters(parsed: ParsedSearchQuery): string[] {
  const tags: string[] = [];

  if (parsed.locationQuery) {
    tags.push(`Location: ${parsed.locationQuery}`);
  }

  if (parsed.bedrooms !== undefined) {
    tags.push(parsed.bedrooms === 0 ? 'Studio' : `${parsed.bedrooms} Bed`);
  }

  if (parsed.bathrooms !== undefined) {
    tags.push(`${parsed.bathrooms} Bath`);
  }

  if (parsed.minPrice && parsed.maxPrice) {
    tags.push(`$${(parsed.minPrice / 1000).toFixed(0)}K - $${(parsed.maxPrice / 1000).toFixed(0)}K`);
  } else if (parsed.maxPrice) {
    tags.push(`Under $${(parsed.maxPrice / 1000).toFixed(0)}K`);
  } else if (parsed.minPrice) {
    tags.push(`$${(parsed.minPrice / 1000).toFixed(0)}K+`);
  }

  if (parsed.propertyType) {
    const typeLabels: Record<string, string> = {
      apartment_building: 'Apartment',
      full_house: 'House',
      condo: 'Condo',
      duplex: 'Duplex',
      basement: 'Basement',
      single_family: 'Single-Family',
      two_family: 'Two-Family',
      four_family: 'Multi-Family',
      co_op: 'Co-op',
    };
    tags.push(typeLabels[parsed.propertyType] || parsed.propertyType);
  }

  return tags;
}
