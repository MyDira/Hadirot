import {
  BROOKLYN_NAMED_STREETS,
  BROOKLYN_LETTERED_AVENUES,
  COMMON_MISSPELLINGS,
  getOrdinalSuffix,
} from './brooklyn-streets.ts';

const DIRECTION_ABBREVIATIONS: Record<string, string> = {
  'e': 'East',
  'e.': 'East',
  'east': 'East',
  'w': 'West',
  'w.': 'West',
  'west': 'West',
  'n': 'North',
  'n.': 'North',
  'north': 'North',
  's': 'South',
  's.': 'South',
  'south': 'South',
};

const STREET_TYPE_ABBREVIATIONS: Record<string, string> = {
  'st': 'Street',
  'st.': 'Street',
  'str': 'Street',
  'street': 'Street',
  'ave': 'Avenue',
  'ave.': 'Avenue',
  'av': 'Avenue',
  'av.': 'Avenue',
  'avenue': 'Avenue',
  'blvd': 'Boulevard',
  'blvd.': 'Boulevard',
  'bvd': 'Boulevard',
  'boulevard': 'Boulevard',
  'pkwy': 'Parkway',
  'pkwy.': 'Parkway',
  'pky': 'Parkway',
  'parkway': 'Parkway',
  'hwy': 'Highway',
  'hwy.': 'Highway',
  'highway': 'Highway',
  'rd': 'Road',
  'rd.': 'Road',
  'road': 'Road',
  'dr': 'Drive',
  'dr.': 'Drive',
  'drive': 'Drive',
  'ct': 'Court',
  'ct.': 'Court',
  'court': 'Court',
  'pl': 'Place',
  'pl.': 'Place',
  'place': 'Place',
  'ln': 'Lane',
  'ln.': 'Lane',
  'lane': 'Lane',
  'ter': 'Terrace',
  'ter.': 'Terrace',
  'terrace': 'Terrace',
  'cir': 'Circle',
  'cir.': 'Circle',
  'circle': 'Circle',
};

const SEPARATOR_PATTERNS = [
  /\s+and\s+/i,
  /\s*&\s*/,
  /\s*\/\s*/,
  /\s*@\s*/,
  /\s+at\s+/i,
  /\s*\+\s*/,
  /\s*,\s*/,
];

export interface NormalizedStreet {
  original: string;
  normalized: string;
  type: 'numbered' | 'lettered_avenue' | 'named' | 'unknown';
  direction?: string;
  number?: number;
  letter?: string;
  streetType?: string;
}

export interface ParsedCrossStreets {
  street1: NormalizedStreet;
  street2: NormalizedStreet | null;
  separator: string;
  formattedQuery: string;
}

function fixCommonMisspellings(input: string): string {
  let result = input.toLowerCase();
  for (const [misspelled, correct] of Object.entries(COMMON_MISSPELLINGS)) {
    const regex = new RegExp(`\\b${misspelled}\\b`, 'gi');
    result = result.replace(regex, correct);
  }
  return result;
}

function expandDirections(input: string): string {
  let result = input;

  for (const [abbrev, full] of Object.entries(DIRECTION_ABBREVIATIONS)) {
    const regex = new RegExp(`^${abbrev}\\s*(?=\\d)`, 'i');
    result = result.replace(regex, `${full} `);

    const regexWithSpace = new RegExp(`^${abbrev}\\s+`, 'i');
    result = result.replace(regexWithSpace, `${full} `);
  }

  return result;
}

function expandStreetTypes(input: string): string {
  let result = input;

  for (const [abbrev, full] of Object.entries(STREET_TYPE_ABBREVIATIONS)) {
    const regex = new RegExp(`\\b${abbrev.replace('.', '\\.')}$`, 'i');
    result = result.replace(regex, full);
  }

  return result;
}

function addOrdinalSuffix(num: number): string {
  return `${num}${getOrdinalSuffix(num)}`;
}

function normalizeNumberedStreet(input: string): string {
  const numberMatch = input.match(/(\d+)/);
  if (!numberMatch) return input;

  const num = parseInt(numberMatch[1], 10);
  const hasOrdinal = /\d+(st|nd|rd|th)/i.test(input);

  if (!hasOrdinal) {
    return input.replace(/(\d+)/, addOrdinalSuffix(num));
  }

  return input;
}

function detectAndNormalizeLetterAvenue(input: string): string | null {
  const letterAvenuePatterns = [
    /^ave(?:nue)?\s*([a-z])$/i,
    /^av\.?\s*([a-z])$/i,
    /^([a-z])\s*ave(?:nue)?$/i,
    /^avenue\s+([a-z])$/i,
  ];

  for (const pattern of letterAvenuePatterns) {
    const match = input.match(pattern);
    if (match) {
      const letter = match[1].toUpperCase();
      if (BROOKLYN_LETTERED_AVENUES.includes(letter)) {
        return `Avenue ${letter}`;
      }
    }
  }

  return null;
}

function matchNamedStreet(input: string): string | null {
  const inputLower = input.toLowerCase().trim();

  for (const [canonical, aliases] of Object.entries(BROOKLYN_NAMED_STREETS)) {
    if (canonical.toLowerCase() === inputLower) {
      return canonical;
    }
    for (const alias of aliases) {
      if (alias.toLowerCase() === inputLower) {
        return canonical;
      }
    }
  }

  for (const [canonical, aliases] of Object.entries(BROOKLYN_NAMED_STREETS)) {
    const canonicalWords = canonical.toLowerCase().split(/\s+/);
    const inputWords = inputLower.split(/\s+/);

    if (inputWords.length >= 1 && canonicalWords.includes(inputWords[0])) {
      const similarity = calculateSimilarity(inputLower, canonical.toLowerCase());
      if (similarity > 0.7) {
        return canonical;
      }
    }
  }

  return null;
}

function calculateSimilarity(s1: string, s2: string): number {
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;

  if (longer.length === 0) return 1.0;

  const distance = levenshteinDistance(longer, shorter);
  return (longer.length - distance) / longer.length;
}

function levenshteinDistance(s1: string, s2: string): number {
  const m = s1.length;
  const n = s2.length;

  if (m === 0) return n;
  if (n === 0) return m;

  const d: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + cost
      );
    }
  }

  return d[m][n];
}

function addMissingStreetType(input: string): string {
  const hasStreetType = Object.values(STREET_TYPE_ABBREVIATIONS).some(
    type => input.toLowerCase().endsWith(type.toLowerCase())
  );

  if (hasStreetType) return input;

  const hasDirection = /^(East|West|North|South)\s+/i.test(input);
  const hasNumber = /\d+(st|nd|rd|th)?/i.test(input);

  if (hasDirection && hasNumber) {
    return `${input} Street`;
  }

  return input;
}

export function normalizeStreet(input: string): NormalizedStreet {
  let working = input.trim();

  working = fixCommonMisspellings(working);

  working = working.replace(/\s+/g, ' ');

  const letterAvenue = detectAndNormalizeLetterAvenue(working);
  if (letterAvenue) {
    return {
      original: input,
      normalized: letterAvenue,
      type: 'lettered_avenue',
      letter: letterAvenue.split(' ')[1],
    };
  }

  const namedStreet = matchNamedStreet(working);
  if (namedStreet) {
    return {
      original: input,
      normalized: namedStreet,
      type: 'named',
    };
  }

  working = expandDirections(working);

  working = normalizeNumberedStreet(working);

  working = expandStreetTypes(working);

  working = addMissingStreetType(working);

  working = working.split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');

  working = working.replace(/(\d+)(st|nd|rd|th)/gi, (_, num, suffix) =>
    `${num}${suffix.toLowerCase()}`
  );

  const directionMatch = working.match(/^(East|West|North|South)/i);
  const numberMatch = working.match(/(\d+)/);

  if (directionMatch && numberMatch) {
    return {
      original: input,
      normalized: working,
      type: 'numbered',
      direction: directionMatch[1],
      number: parseInt(numberMatch[1], 10),
      streetType: 'Street',
    };
  }

  return {
    original: input,
    normalized: working,
    type: 'unknown',
  };
}

export function parseCrossStreets(input: string): ParsedCrossStreets {
  let cleanInput = input.trim();

  let separator = '&';
  let parts: string[] = [cleanInput];

  for (const pattern of SEPARATOR_PATTERNS) {
    if (pattern.test(cleanInput)) {
      parts = cleanInput.split(pattern).map(p => p.trim()).filter(p => p.length > 0);
      if (parts.length >= 2) {
        const match = cleanInput.match(pattern);
        separator = match ? match[0].trim() || '&' : '&';
        break;
      }
    }
  }

  const street1 = normalizeStreet(parts[0]);
  const street2 = parts.length > 1 ? normalizeStreet(parts[1]) : null;

  let formattedQuery: string;
  if (street2) {
    formattedQuery = `${street1.normalized} & ${street2.normalized}`;
  } else {
    formattedQuery = street1.normalized;
  }

  return {
    street1,
    street2,
    separator,
    formattedQuery,
  };
}

export function generateQueryVariations(parsed: ParsedCrossStreets): string[] {
  const variations: string[] = [];

  variations.push(parsed.formattedQuery);

  if (parsed.street2) {
    variations.push(`${parsed.street2.normalized} & ${parsed.street1.normalized}`);
  }

  if (parsed.street2) {
    variations.push(`${parsed.street1.normalized} and ${parsed.street2.normalized}`);
    variations.push(`${parsed.street2.normalized} and ${parsed.street1.normalized}`);
  }

  variations.push(parsed.street1.normalized);
  if (parsed.street2) {
    variations.push(parsed.street2.normalized);
  }

  return [...new Set(variations)];
}

export function fuzzyMatchStreet(input: string, threshold: number = 0.75): string | null {
  const inputLower = input.toLowerCase().trim();

  let bestMatch: string | null = null;
  let bestScore = 0;

  for (const [canonical, aliases] of Object.entries(BROOKLYN_NAMED_STREETS)) {
    const score = calculateSimilarity(inputLower, canonical.toLowerCase());
    if (score > threshold && score > bestScore) {
      bestMatch = canonical;
      bestScore = score;
    }

    for (const alias of aliases) {
      const aliasScore = calculateSimilarity(inputLower, alias.toLowerCase());
      if (aliasScore > threshold && aliasScore > bestScore) {
        bestMatch = canonical;
        bestScore = aliasScore;
      }
    }
  }

  for (let i = 1; i <= 108; i++) {
    const eastStreet = `east ${i}${getOrdinalSuffix(i)} street`;
    const score = calculateSimilarity(inputLower, eastStreet);
    if (score > threshold && score > bestScore) {
      bestMatch = `East ${i}${getOrdinalSuffix(i)} Street`;
      bestScore = score;
    }
  }

  for (let i = 1; i <= 37; i++) {
    const westStreet = `west ${i}${getOrdinalSuffix(i)} street`;
    const score = calculateSimilarity(inputLower, westStreet);
    if (score > threshold && score > bestScore) {
      bestMatch = `West ${i}${getOrdinalSuffix(i)} Street`;
      bestScore = score;
    }
  }

  for (const letter of BROOKLYN_LETTERED_AVENUES) {
    const avenueName = `avenue ${letter.toLowerCase()}`;
    const score = calculateSimilarity(inputLower, avenueName);
    if (score > threshold && score > bestScore) {
      bestMatch = `Avenue ${letter}`;
      bestScore = score;
    }
  }

  return bestMatch;
}
