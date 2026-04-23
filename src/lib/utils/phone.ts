export function normalizePhoneNumber(input: string): string {
  const digits = (input || '').replace(/[^\d+]/g, '').replace(/^\+/, '').replace(/^00/, '');
  if (!digits) return '';
  if (digits.startsWith('234')) return digits;
  if (digits.startsWith('0')) return `234${digits.slice(1)}`;
  return `234${digits}`;
}

export function parsePhoneNumbers(input: string): string[] {
  return Array.from(new Set(
    (input || '')
      .split(/[\n,]+/)
      .map((value) => normalizePhoneNumber(value.trim()))
      .filter(Boolean)
  ));
}