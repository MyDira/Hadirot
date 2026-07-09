// Twilio inbound request validation.
//
// Twilio signs every webhook it sends with the account's auth token. The
// signature is HMAC-SHA1 over the exact request URL Twilio hit, followed by
// every POST parameter concatenated as `name + value`, sorted alphabetically
// by name, with no delimiters. The result is base64-encoded and sent in the
// `X-Twilio-Signature` header.
//
// Reference: https://www.twilio.com/docs/usage/security#validating-requests
//
// Because Supabase edge functions sit behind a proxy, `req.url` seen inside the
// function is NOT the public URL Twilio signed. We reconstruct the URL from the
// forwarded proto/host headers so the signed string matches what Twilio built.

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

/**
 * Reconstruct the public URL Twilio saw, honoring proxy forwarding headers.
 */
export function getTwilioRequestUrl(req: Request): string {
  const url = new URL(req.url);

  const forwardedProto = req.headers.get("x-forwarded-proto");
  if (forwardedProto) {
    url.protocol = forwardedProto.split(",")[0].trim() + ":";
  }

  const forwardedHost =
    req.headers.get("x-forwarded-host") || req.headers.get("host");
  if (forwardedHost) {
    url.host = forwardedHost.split(",")[0].trim();
  }

  return url.toString();
}

/**
 * Compute the expected Twilio signature for a request URL + POST params.
 */
export async function computeTwilioSignature(
  authToken: string,
  url: string,
  params: Record<string, string>,
): Promise<string> {
  // URL first, then each param name+value in alphabetical order by name.
  let data = url;
  for (const key of Object.keys(params).sort()) {
    data += key + params[key];
  }

  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(authToken),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    encoder.encode(data),
  );

  return btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));
}

/**
 * Validate an inbound Twilio webhook request.
 *
 * @param req      the incoming Request (used to reconstruct the signed URL)
 * @param params   the POST parameters Twilio sent (from `await req.formData()`)
 * @param authToken the Twilio auth token; defaults to `TWILIO_AUTH_TOKEN` env
 * @returns true only if the `X-Twilio-Signature` header matches
 */
export async function verifyTwilioRequest(
  req: Request,
  params: Record<string, string>,
  authToken?: string,
): Promise<boolean> {
  const token = authToken ?? Deno.env.get("TWILIO_AUTH_TOKEN") ?? "";
  const signature = req.headers.get("x-twilio-signature");

  if (!token || !signature) {
    return false;
  }

  const url = getTwilioRequestUrl(req);
  const expected = await computeTwilioSignature(token, url, params);

  const encoder = new TextEncoder();
  return timingSafeEqual(
    encoder.encode(expected),
    encoder.encode(signature),
  );
}

/**
 * Convert a parsed FormData into a plain string map suitable for signature
 * verification (Twilio only signs string POST fields).
 */
export function formDataToParams(formData: FormData): Record<string, string> {
  const params: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") {
      params[key] = value;
    }
  }
  return params;
}
