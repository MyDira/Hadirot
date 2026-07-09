import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { renderBrandEmail, sendViaZepto } from "../_shared/zepto.ts";

// Sliding-window rate limiting (mirrors send-contact-message). Unthrottled,
// this endpoint is an email-bomb + account-enumeration vector.
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();

function checkRateLimit(
  key: string,
  windowMs: number,
  max: number,
): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || now - entry.windowStart >= windowMs) {
    rateLimitMap.set(key, { count: 1, windowStart: now });
    if (rateLimitMap.size > 10_000) {
      for (const [k, v] of rateLimitMap) {
        if (now - v.windowStart >= windowMs) rateLimitMap.delete(k);
      }
    }
    return true;
  }
  if (entry.count + 1 > max) return false;
  entry.count += 1;
  return true;
}

function getClientIp(req: Request): string | null {
  const headers = ["x-forwarded-for", "x-real-ip", "cf-connecting-ip"];
  for (const header of headers) {
    const value = req.headers.get(header);
    if (value) {
      const ip = value.split(",")[0]?.trim();
      if (ip) return ip;
    }
  }
  return null;
}

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

// Identical generic response, whether or not the account exists — prevents
// account enumeration.
function genericSuccess(): Response {
  return new Response(
    JSON.stringify({
      success: true,
      message: "If an account exists for that email, a reset link has been sent.",
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const toRaw = (body as { to?: unknown })?.to;
    const candidate = Array.isArray(toRaw) ? toRaw[0] : toRaw;

    if (typeof candidate !== "string" || candidate.length > 254) {
      return new Response(JSON.stringify({ error: "Invalid to field" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!emailRegex.test(candidate)) {
      return new Response(JSON.stringify({ error: "Invalid email address" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const to = candidate;

    // Rate limit by IP and by target email (both fail into a generic success
    // so an attacker can't distinguish throttling from a non-existent account).
    const clientIp = getClientIp(req);
    if (clientIp) {
      const ipHash = await sha256Hex(clientIp);
      if (!checkRateLimit(`pwreset-ip:${ipHash}`, RATE_WINDOW_MS, 5)) {
        return genericSuccess();
      }
    }
    const emailHash = await sha256Hex(to.toLowerCase());
    if (!checkRateLimit(`pwreset-email:${emailHash}`, RATE_WINDOW_MS, 3)) {
      return genericSuccess();
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const zeptoToken = Deno.env.get("ZEPTO_TOKEN");
    const zeptoFromAddress = Deno.env.get("ZEPTO_FROM_ADDRESS") || "noreply@hadirot.com";
    const zeptoFromName = Deno.env.get("ZEPTO_FROM_NAME") || "HaDirot";
    const zeptoReplyTo = Deno.env.get("ZEPTO_REPLY_TO");
    const emailProvider = Deno.env.get("EMAIL_PROVIDER");

    if (!supabaseUrl || !serviceRoleKey || !zeptoToken) {
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const PUBLIC_SITE_URL =
      Deno.env.get('PUBLIC_SITE_URL') || 'http://localhost:5173';
    const redirectUrl = `${PUBLIC_SITE_URL.replace(new RegExp('/+$'), '')}/auth`;

    const { data, error: linkError } =
      await supabaseAdmin.auth.admin.generateLink({
        type: "recovery",
        email: to,
        options: { redirectTo: redirectUrl },
      });

    const actionLink = data?.properties?.action_link || data?.action_link;

    if (linkError || !actionLink) {
      // Do NOT echo the error: a non-existent account and a real failure must
      // look identical to the caller. Log server-side only.
      console.error("generateLink failed for password reset:", linkError?.message);
      return genericSuccess();
    }

    const html = renderBrandEmail({
      title: "Reset Your Password",
      bodyHtml: "<p>Click the button below to reset your password.</p>",
      ctaLabel: "Reset Password",
      ctaHref: actionLink,
    });

    const zeptoData = await sendViaZepto({
      to,
      subject: "Reset your password",
      html,
      from: zeptoFromAddress,
      fromName: zeptoFromName,
    });

    console.log("✅ Password reset email sent via ZeptoMail:", {
      messageId: zeptoData?.data?.message_id,
      to,
    });

    return genericSuccess();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Password reset internal error:", message);

    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});