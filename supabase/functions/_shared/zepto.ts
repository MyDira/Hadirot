const ZEPTO_API_URL = "https://api.zeptomail.com/v1.1/email";

interface ZeptoParams {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
  fromName?: string;
}

export async function sendViaZepto({ to, subject, html, from, fromName }: ZeptoParams) {
  const token = Deno.env.get("ZEPTO_TOKEN");
  const address = from || Deno.env.get("ZEPTO_FROM_ADDRESS") || "";
  const name = fromName || Deno.env.get("ZEPTO_FROM_NAME") || "";
  const replyTo = Deno.env.get("ZEPTO_REPLY_TO") || undefined;

  if (!token || !address || !name) {
    throw new Error("ZeptoMail is not configured" );
  }

  const toList = Array.isArray(to) ? to : [to];
  const payload = {
    from: { address, name },
    to: toList.map((addr) => ({ email_address: { address: addr } })),
    subject,
    htmlbody: html,
    reply_to: replyTo ? [{ address: replyTo }] : undefined,
    track_opens: false,
    track_clicks: false,
  };

  const res = await fetch(ZEPTO_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Zoho-enczapikey ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ZeptoMail error: ${res.status} ${text}`);
  }
  return await res.json();
}

interface BrandEmailParams {
  title: string;
  intro?: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaHref?: string;
}

export function renderBrandEmail({ title, intro, bodyHtml, ctaLabel, ctaHref }: BrandEmailParams) {
  const introHtml = intro ? `<p style="margin-top:0;">${intro}</p>` : "";
  const button = ctaLabel && ctaHref ? `<div style="text-align:center;margin:32px 0;">
         <a href="${ctaHref}" style="background-color:#7CB342;color:#FFFFFF;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;font-weight:bold;">${ctaLabel}</a>
       </div>` : "";
  return `
    <div style="font-family:Arial,sans-serif;background-color:#F7F9FC;padding:24px;">
      <div style="max-width:600px;margin:0 auto;background-color:#FFFFFF;border:1px solid #E5E7EB;border-radius:8px;overflow:hidden;">
        <div style="background-color:#1E4A74;color:#FFFFFF;padding:24px;text-align:center;">
          <h1 style="margin:0;font-size:24px;">Hadirot</h1>
        </div>
        <div style="padding:24px;color:#374151;font-size:16px;line-height:1.5;">
          <h2 style="margin:0 0 16px 0;font-size:20px;color:#1E4A74;">${title}</h2>
          ${introHtml}
          ${bodyHtml}
          ${button}
        </div>
        <div style="background-color:#F7F9FC;color:#6B7280;text-align:center;font-size:12px;padding:16px;">
          © ${new Date().getFullYear()} Hadirot. All rights reserved.
        </div>
      </div>
    </div>
  `;
}
