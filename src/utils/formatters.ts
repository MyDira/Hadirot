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
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ')
    .replace(/\s+/g, ' '); // Replace multiple spaces with single space
}

/**
 * Formats a phone number to a consistent format
 * @param phone - The phone number string to format
 * @returns Formatted phone number
 */
export function formatPhoneNumber(phone: string): string {
  if (!phone) return '';
  
  // Remove all non-digit characters
  const cleaned = phone.replace(/\D/g, '');
  
  // Format as (XXX) XXX-XXXX if it's a 10-digit number
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  
  // Return original if not 10 digits
  return phone;
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