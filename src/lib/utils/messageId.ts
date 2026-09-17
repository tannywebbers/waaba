const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/**
 * Generates a random 16-character alphanumeric message ID.
 * Used for the `message_id` template variable so every outgoing Meta template
 * carries a unique reference — this keeps identical template bodies unique and
 * avoids WhatsApp spam detection.
 */
export function generateMessageId(length = 16): string {
  let out = '';
  const bytes = new Uint8Array(length);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
    for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
    return out;
  }
  for (let i = 0; i < length; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}
