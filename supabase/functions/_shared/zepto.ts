// supabase/functions/_shared/zepto.ts
type To = string | string[];

export interface SendEmailParams {
  to: To;
  subject: string;
  html: string;
  from?: string;
  fromName?: string;
}

function normalizeTo(to: To): string[] {
  return Array.isArray(to) ? to : [to];
}

/**
 * Sends an HTML email via ZeptoMail "Email API" v1.1
 * Requires environment vars:
 *  - ZEPTO_TOKEN (Zepto "Send Mail Token")
 *  - ZEPTO_FROM (default from address if not provided per-call)
 */
export async function sendViaZepto(params: SendEmailParams) {
  const token =
    Deno.env.get("ZEPTO_TOKEN") ||
    Deno.env.get("ZEPTO_API_TOKEN") || // tolerate alt name
    "";
  const defaultFrom = Deno.env.get("ZEPTO_FROM") || Deno.env.get("EMAIL_FROM") || "";
  if (!token) {
    throw new Error("Missing ZEPTO_TOKEN env var");
  }

  const fromAddress = params.from || defaultFrom;
  if (!fromAddress) {
    throw new Error("Missing from address (set ZEPTO_FROM or pass params.from)");
  }

  const toList = normalizeTo(params.to);
  if (!toList.length) throw new Error("No recipients");

  const payload = {
    from: { address: fromAddress, name: params.fromName || undefined },
    to: toList.map((addr) => ({ email_address: { address: addr } })),
    subject: params.subject,
    htmlbody: params.html,
  };

  const resp = await fetch("https://api.zeptomail.com/v1.1/email", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      // IMPORTANT: Zepto uses Zoho-enczapikey + Send Mail Token
      Authorization: `Zoho-enczapikey ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const msg = typeof data === "object" ? JSON.stringify(data) : String(data);
    throw new Error(`ZeptoMail error: ${resp.status} ${msg}`);
  }
  return data;
}

/**
 * Brand template utility (keep consistent across functions).
 * Minimal wrapper: produces a simple branded HTML shell.
 * If your project already has a richer template, copy it here and use this one everywhere.
 */
export function renderBrandEmail(opts: {
  title: string;
  intro?: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaHref?: string;
  footerNote?: string;
}) {
  const {
    title,
    intro,
    bodyHtml,
    ctaLabel,
    ctaHref,
    footerNote = "© " + new Date().getFullYear() + " HaDirot",
  } = opts;

  const cta = ctaLabel && ctaHref
    ? `<p style="margin:24px 0;"><a href="${ctaHref}" style="display:inline-block;padding:12px 18px;text-decoration:none;border-radius:8px;border:1px solid #ccc;">${ctaLabel}</a></p>`
    : "";

  return `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:640px;margin:0 auto;padding:24px;">
    <h1 style="margin:0 0 12px 0;font-size:20px;">${title}</h1>
    ${intro ? `<p style="opacity:.85;margin:0 0 16px;">${intro}</p>` : ""}
    <div>${bodyHtml}</div>
    ${cta}
    <hr style="margin:24px 0;border:none;border-top:1px solid #eee;" />
    <p style="font-size:12px;color:#777;margin:0;">${footerNote}</p>
  </div>`;
}
