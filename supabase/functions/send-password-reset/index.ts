import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const ZEPTO_API_URL = "https://api.zeptomail.com/v1.1/email";

function renderBrandEmail({
  title,
  intro,
  bodyHtml,
  ctaLabel,
  ctaHref,
}: {
  title: string;
  intro?: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaHref?: string;
}) {
  const introHtml = intro ? `<p style="margin-top:0;">${intro}</p>` : "";
  const button =
    ctaLabel && ctaHref
      ? `<div style="text-align:center;margin:32px 0;">
         <a href="${ctaHref}" style="background-color:#7CB342;color:#FFFFFF;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;font-weight:bold;">${ctaLabel}</a>
       </div>`
      : "";
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
    const { to, subject } = await req.json();

    if (!to) {
      return new Response(JSON.stringify({ error: "Missing to field" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const zeptoToken = Deno.env.get("ZEPTO_TOKEN");
    const zeptoFromAddress = Deno.env.get("ZEPTO_FROM_ADDRESS") || "noreply@hadirot.com";
    const zeptoFromName = Deno.env.get("ZEPTO_FROM_NAME") || "HaDirot";

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

    const redirectUrl = `${Deno.env.get("VITE_SITE_URL") || "http://localhost:5173"}/auth`;
    const email = Array.isArray(to) ? to[0] : to;

    const { data, error: linkError } =
      await supabaseAdmin.auth.admin.generateLink({
        type: "recovery",
        email,
        options: { redirectTo: redirectUrl },
      });

    const actionLink = data?.properties?.action_link || data?.action_link;

    if (linkError || !actionLink) {
      return new Response(
        JSON.stringify({
          error: linkError?.message || "Failed to generate reset link",
          details: linkError,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const html = renderBrandEmail({
      title: "Reset Your Password",
      bodyHtml: "<p>Click the button below to reset your password.</p>",
      ctaLabel: "Reset Password",
      ctaHref: actionLink,
    });

    const zeptoPayload = {
      from: {
        address: zeptoFromAddress,
        name: zeptoFromName,
      },
      to: [{
        email_address: {
          address: Array.isArray(to) ? to[0] : to,
        },
      }],
      subject: subject || "Reset your password",
      htmlbody: html,
      track_opens: false,
      track_clicks: false,
    };

    const zeptoResponse = await fetch(ZEPTO_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Zoho-enczapikey ${zeptoToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(zeptoPayload),
    });

    if (!zeptoResponse.ok) {
      const errorData = await zeptoResponse.text();
      console.error("❌ ZeptoMail API error:", {
        status: zeptoResponse.status,
        statusText: zeptoResponse.statusText,
        errorData: errorData,
      });

      return new Response(
        JSON.stringify({
          error: "Failed to send email",
          details: "Email service error",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const zeptoData = await zeptoResponse.json();
    console.log("✅ Password reset email sent via ZeptoMail:", {
      messageId: zeptoData?.data?.message_id,
      to: Array.isArray(to) ? to : [to],
    });

    return new Response(JSON.stringify({ 
      success: true, 
      id: zeptoData?.data?.message_id,
      provider: "zeptomail"
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return new Response(
      JSON.stringify({ error: "Internal server error", details: message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});