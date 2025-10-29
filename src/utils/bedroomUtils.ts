export function formatBedroomCount(
  bedrooms: number,
  additionalRooms?: number | null
): string {
  if (bedrooms === 0) {
    return "Studio";
  }

  const baseText = bedrooms >= 8 ? "8+" : bedrooms.toString();

  if (additionalRooms && additionalRooms > 0) {
    return `${baseText}+${additionalRooms}`;
  }

  return baseText;
}

export function formatBedroomLabel(
  bedrooms: number,
  additionalRooms?: number | null
): string {
  if (bedrooms === 0) {
    return "Studio";
  }

  const formatted = formatBedroomCount(bedrooms, additionalRooms);
  return formatted === "1" ? "1 Bedroom" : `${formatted} Bedrooms`;
}
