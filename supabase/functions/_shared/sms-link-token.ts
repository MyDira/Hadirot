// Signed, self-contained tokens for one-tap "pay from your phone" SMS links.
//
// An SMS reminder embeds a token that encodes which listing to pay for, how many
// days, and an expiry. The public `pay-listing-link` edge function verifies the
// token (HMAC-SHA256) and — with no login required — creates a Stripe Checkout
// session and redirects the phone straight to Stripe.
//
// The HMAC key is derived from SUPABASE_SERVICE_ROLE_KEY, a strong secret that is
// available to every edge function and never shipped to the client. Both the
// signer (send-paid-listing-reminders) and verifier (pay-listing-link) use it, so
// no extra secret needs to be configured.

export interface ListingPayTokenPayload {
  l: string; // listing_id
  d: number; // days package
  a: 'pay' | 'reactivate'; // intent (affects copy only; both create a checkout)
  e: number; // expiry — unix epoch seconds
}

function base64urlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(str: string): Uint8Array {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function importKey(secret: string): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function signListingPayToken(
  payload: ListingPayTokenPayload,
  secret: string,
): Promise<string> {
  const body = base64urlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await importKey(secret);
  const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  const sig = base64urlEncode(new Uint8Array(sigBuf));
  return `${body}.${sig}`;
}

export async function verifyListingPayToken(
  token: string,
  secret: string,
): Promise<ListingPayTokenPayload | null> {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;

  try {
    const key = await importKey(secret);
    const expectedBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
    const expected = new Uint8Array(expectedBuf);
    const provided = base64urlDecode(sig);
    if (!timingSafeEqual(expected, provided)) return null;

    const payload = JSON.parse(new TextDecoder().decode(base64urlDecode(body))) as ListingPayTokenPayload;
    if (!payload.l || !payload.d || !payload.e) return null;
    if (Math.floor(Date.now() / 1000) > payload.e) return null; // expired
    return payload;
  } catch {
    return null;
  }
}
