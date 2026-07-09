import { corsHeaders } from "./cors.ts";

// Shared-secret gate for scheduled (pg_cron) functions.
//
// These functions perform destructive maintenance or fire paid SMS/email
// blasts and are only meant to be invoked by the scheduler. Their sole
// protection was the platform gateway accepting the public anon key, which is
// no protection. This helper requires a secret header that only the scheduler
// knows.
//
// DEPLOY DEPENDENCY: set the `CRON_SECRET` env var on the deployed functions
// and add the `X-Cron-Secret: <secret>` header to every pg_cron job that calls
// these functions. This helper FAILS CLOSED — if `CRON_SECRET` is unset, every
// request is rejected with 403.

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

/**
 * Returns a 403 Response if the request is missing/has a wrong cron secret,
 * or `null` if the caller is authorized and the handler should proceed.
 *
 * Usage at the top of a scheduled function's handler:
 *   const denied = requireCronSecret(req);
 *   if (denied) return denied;
 */
export function requireCronSecret(req: Request): Response | null {
  const expected = Deno.env.get("CRON_SECRET") ?? "";
  const provided = req.headers.get("x-cron-secret") ?? "";

  const encoder = new TextEncoder();
  const ok =
    expected.length > 0 &&
    timingSafeEqual(encoder.encode(expected), encoder.encode(provided));

  if (!ok) {
    console.error("Rejected scheduled-function call: missing/invalid X-Cron-Secret");
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return null;
}
