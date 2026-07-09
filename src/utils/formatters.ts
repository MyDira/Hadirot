/**
 * Capitalizes the first letter of each word in a name
 * @param name - The name string to capitalize
 * @returns The name with proper capitalization
 */
export function capitalizeName(name: string): string {
  if (!name || typeof name !== 'string') {
    return '';
  }
  
  return name
    .trim()
    .toLowerCase()
    .split(' ')
    .map(word => {
      if (word.length === 0) return word;
      // Handle hyphenated names like "mary-jane"
      return word
        .split('-')
        .map(part => (part.length > 0 ? part.charAt(0).toUpperCase() + part.slice(1) : part))
        .join('-');
    })
    .join(' ')
    .replace(/\s+/g, ' '); // Replace multiple spaces with single space
}

/**
 * Formats a price to currency format
 * @param price - The price number to format
 * @returns Formatted price string
 */
export function formatPrice(price: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price);
}

/**
 * Formats lease length enum value to display-friendly text
 * @param leaseLength - The lease length enum value
 * @returns Formatted lease length string
 */
export function formatLeaseLength(leaseLength: string | null | undefined): string {
  if (!leaseLength) return '';

  switch (leaseLength) {
    case 'short_term':
      return 'Short Term';
    case 'long_term_annual':
      return 'Long Term/Annual';
    case 'summer_rental':
      return 'Summer Rental';
    case 'winter_rental':
      return 'Winter Rental';
    default:
      return leaseLength
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
  }
}
