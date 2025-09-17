export function formatPhoneForDisplay(input?: string): string {
  if (!input) return "";
  const digits = input.replace(/\D+/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    const area = digits.slice(1, 4);
    const pre = digits.slice(4, 7);
    const line = digits.slice(7, 11);
    return `+1 (${area}) ${pre}-${line}`;
  }
  if (digits.length === 10) {
    const area = digits.slice(0, 3);
    const pre = digits.slice(3, 6);
    const line = digits.slice(6, 10);
    return `(${area}) ${pre}-${line}`;
  }
  return input.trim();
}
