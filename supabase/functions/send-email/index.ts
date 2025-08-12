import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const listEnvKeys = () => {
  try {
    const keys = Object.keys(Deno.env.toObject() || {}).sort();
    console.log("🧪 [send-email] ENV_KEYS", keys);
  } catch (e) {
    console.log("🧪 [send-email] ENV_KEYS error", String(e));
  }
};

// Email provider (Zepto default, Resend fallback)
const ZEPTO_API_URL = "https://api.zeptomail.com/v1.1/email";
const RESEND_API_URL = "https://api.resend.com/emails";

const dbg = (...args: any[]) => console.log("🧪 [send-email]", ...args);
const mask = (s?: string | null, keep = 8) =>
  s ? `${s.slice(0, keep)}…(${s.length})` : "undefined";

const env = {
  PROVIDER: (Deno.env.get("EMAIL_PROVIDER") || "zepto").toLowerCase(),
  ZEPTO_TOKEN_RAW: Deno.env.get("ZEPTO_TOKEN") || "",
  ZEPTO_FROM_ADDRESS:
    Deno.env.get("ZEPTO_FROM_ADDRESS") || "noreply@hadirot.com",
  ZEPTO_FROM_NAME: Deno.env.get("ZEPTO_FROM_NAME") || "HaDirot",
  ZEPTO_REPLY_TO: Deno.env.get("ZEPTO_REPLY_TO") || "",
  SITE_URL: Deno.env.get("VITE_SITE_URL") || "http://localhost:5173",
  SUPABASE_URL: Deno.env.get("SUPABASE_URL") || "",
  HAS_SERVICE_ROLE: !!Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
  HAS_ANON_KEY: !!Deno.env.get("SUPABASE_ANON_KEY"),
};

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

interface Attachment {
  name: string;
  mimeType: string;
  base64: string;
}

interface EmailRequest {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  cc?: string[];
  bcc?: string[];
  replyTo?: string;
  attachments?: Attachment[];
  from?: string;
  type?: "password_reset" | "general";
}

Deno.serve(async (req) => {
  listEnvKeys();
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Only allow POST requests
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get the authorization header at the start
    const authHeader = req.headers.get("Authorization");

    // Determine which provider to use and validate required env vars
    const provider = env.PROVIDER;

    let resendApiKey: string | undefined;
    const zeptoFrom = env.ZEPTO_FROM_ADDRESS;
    const zeptoFromName = env.ZEPTO_FROM_NAME;
    const zeptoReplyTo = env.ZEPTO_REPLY_TO || undefined;

    if (provider === "resend") {
      resendApiKey = Deno.env.get("RESEND_API_KEY");
      if (!resendApiKey) {
        console.error("RESEND_API_KEY not found in environment variables");
        return new Response(
          JSON.stringify({ error: "Email service not configured" }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
    }

    // Parse the request body
    let emailData: EmailRequest;
    try {
      emailData = await req.json();
      dbg("env", {
        PROVIDER: env.PROVIDER,
        ZEPTO_TOKEN: mask(env.ZEPTO_TOKEN_RAW),
        ZEPTO_FROM_ADDRESS: env.ZEPTO_FROM_ADDRESS,
        ZEPTO_FROM_NAME: env.ZEPTO_FROM_NAME,
        ZEPTO_REPLY_TO: env.ZEPTO_REPLY_TO ? "set" : "unset",
        SITE_URL: env.SITE_URL,
        SUPABASE_URL: env.SUPABASE_URL ? "set" : "unset",
        HAS_SERVICE_ROLE: env.HAS_SERVICE_ROLE,
        HAS_ANON_KEY: env.HAS_ANON_KEY,
      });
      dbg("request meta", {
        to: emailData?.to,
        subject: emailData?.subject,
        type: emailData?.type,
      });
      console.log("📧 Email request received:", {
        to: emailData.to,
        subject: emailData.subject,
        type: emailData.type,
        provider,
        hasAuth: !!authHeader,
      });
    } catch (error) {
      console.error("❌ Invalid JSON in request body:", error);
      return new Response(
        JSON.stringify({ error: "Invalid JSON in request body" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const isPasswordReset = emailData.type === "password_reset";

    // For non-password-reset emails, require authentication
    if (!isPasswordReset && !authHeader) {
      console.log("❌ Missing authorization for non-password-reset email");
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Create Supabase admin client for password resets
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );

    // Handle password reset emails specially
    if (isPasswordReset) {
      console.log("🔐 Processing password reset for:", emailData.to);

      try {
        const resetEmail = Array.isArray(emailData.to)
          ? emailData.to[0]
          : emailData.to;
        const redirectUrl = `${Deno.env.get("VITE_SITE_URL") || "http://localhost:5173"}/auth`;

        console.log("🔗 Generating reset link with params:", {
          email: resetEmail,
          redirectTo: redirectUrl,
        });

        // Generate password reset link using admin client (without sending Supabase's default email)
        const { data, error: resetError } =
          await supabaseAdmin.auth.admin.generateLink({
            type: "recovery",
            email: resetEmail,
            options: {
              redirectTo: redirectUrl,
            },
          });

        if (resetError) {
          console.error("❌ Error generating password reset link:", {
            error: resetError,
            message: resetError.message,
            status: resetError.status,
            email: resetEmail,
            redirectTo: redirectUrl,
          });

          // Handle rate limit errors specifically
          if (
            resetError.status === 429 ||
            resetError.message?.includes(
              "For security purposes, you can only request this after",
            )
          ) {
            return new Response(
              JSON.stringify({
                error:
                  resetError.message ||
                  "Rate limit exceeded. Please wait before requesting another password reset.",
                code: "rate_limit_exceeded",
              }),
              {
                status: 429,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              },
            );
          }

          return new Response(
            JSON.stringify({
              error:
                resetError.message || "Failed to generate password reset link",
            }),
            {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }

        if (!data?.properties?.action_link) {
          console.error("❌ No action link in reset response:", data);
          return new Response(
            JSON.stringify({ error: "Failed to generate reset link" }),
            {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }

        const resetLink = data.properties.action_link;
        console.log("✅ Password reset link generated successfully:", {
          email: resetEmail,
          hasActionLink: !!resetLink,
          linkLength: resetLink.length,
        });

        // Create branded password reset email HTML
        const resetHtml = renderBrandEmail({
          title: "Reset Your Password",
          bodyHtml:
            "<p>We received a request to reset your password for your Hadirot account.</p><p>If you didn't request this, you can ignore this email.</p>",
          ctaLabel: "Reset My Password",
          ctaHref: resetLink,
        });

        emailData = {
          ...emailData,
          html: resetHtml,
          from: "HaDirot <noreply@hadirot.com>",
        };

        console.log(
          "🎨 Generated branded password reset email for:",
          emailData.to,
        );
      } catch (error) {
        console.error("❌ Error in password reset flow:", {
          error: error,
          message: error.message,
          stack: error.stack,
          email: emailData.to,
        });
        return new Response(
          JSON.stringify({ error: "Failed to process password reset" }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
    } else if (authHeader) {
      // For non-password-reset emails, verify the session
      try {
        const supabaseClient = createClient(
          Deno.env.get("SUPABASE_URL") ?? "",
          Deno.env.get("SUPABASE_ANON_KEY") ?? "",
        );

        const token = authHeader.replace("Bearer ", "");
        const {
          data: { user },
          error: authError,
        } = await supabaseClient.auth.getUser(token);

        if (authError || !user) {
          console.error("❌ Auth verification failed:", authError);
          return new Response(
            JSON.stringify({ error: "Invalid authorization" }),
            {
              status: 401,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }

        console.log("✅ Auth verified for user:", user.id);
      } catch (error) {
        console.error("❌ Error verifying auth:", error);
        return new Response(
          JSON.stringify({ error: "Authentication verification failed" }),
          {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
    }

    // Validate required fields
    if (!emailData.to || !emailData.subject) {
      console.error("❌ Missing required fields:", {
        to: !!emailData.to,
        subject: !!emailData.subject,
      });
      return new Response(
        JSON.stringify({
          error: "Missing required fields: to and subject are required",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // For non-password-reset emails, require HTML content
    if (!isPasswordReset && !emailData.html) {
      console.error("❌ Missing HTML content for non-password-reset email");
      return new Response(
        JSON.stringify({
          error:
            "Missing required field: html content is required for non-password-reset emails",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const toAddresses = Array.isArray(emailData.to)
      ? emailData.to
      : [emailData.to];
    console.log("📤 Sending email via", provider, {
      to: toAddresses,
      subject: emailData.subject,
    });
    const zeptoToken = env.ZEPTO_TOKEN_RAW.trim();
    if (provider === "zepto" && !zeptoToken) {
      dbg("ZEPTO_TOKEN missing or empty after trim");
      return new Response(JSON.stringify({ error: "ZEPTO_TOKEN missing" }), {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "X-Debug-Provider": "zepto",
        },
      });
    }

    try {
      if (provider === "resend") {
        const resendPayload = {
          from: emailData.from || "HaDirot <noreply@hadirot.com>",
          to: toAddresses,
          subject: emailData.subject,
          html: emailData.html,
          text: emailData.text,
          cc: emailData.cc,
          bcc: emailData.bcc,
          reply_to: emailData.replyTo,
          attachments: emailData.attachments?.map((a) => ({
            filename: a.name,
            content: a.base64,
            type: a.mimeType,
          })),
        };

        const resendResponse = await fetch(RESEND_API_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(resendPayload),
        });

        if (!resendResponse.ok) {
          const errorData = await resendResponse.text();
          console.error("❌ Resend API error:", {
            status: resendResponse.status,
            statusText: resendResponse.statusText,
            errorData: errorData,
          });

          return new Response(
            JSON.stringify({
              error: "Failed to send email",
              details:
                resendResponse.status === 422
                  ? "Invalid email data"
                  : "Email service error",
              resendStatus: resendResponse.status,
            }),
            {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }

        const resendData = await resendResponse.json();
        console.log("✅ Email sent successfully via Resend:", {
          id: resendData.id,
          to: toAddresses,
          subject: emailData.subject,
          type: isPasswordReset ? "password_reset" : "general",
        });

        return new Response(
          JSON.stringify({
            ok: true,
            provider: "resend",
            request_id: resendData.id,
            raw: resendData,
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      } else {
        const zeptoPayload = {
          from: { address: zeptoFrom!, name: zeptoFromName! },
          to: toAddresses.map((a) => ({ email_address: { address: a } })),
          subject: emailData.subject,
          htmlbody: emailData.html,
          textbody: emailData.text ?? undefined,
          cc: emailData.cc?.map((a) => ({ email_address: { address: a } })),
          bcc: emailData.bcc?.map((a) => ({ email_address: { address: a } })),
          reply_to: zeptoReplyTo
            ? [{ address: zeptoReplyTo }]
            : emailData.replyTo
            ? [{ address: emailData.replyTo }]
            : undefined,
          track_opens: false,
          track_clicks: false,
          attachments: emailData.attachments?.map((a) => ({
            name: a.name,
            mime_type: a.mimeType,
            content: a.base64,
          })),
        };

        const reqId = crypto.randomUUID();
        dbg("sending to Zepto", { reqId, endpoint: ZEPTO_API_URL });

        const zeptoRes = await fetch(ZEPTO_API_URL, {
          method: "POST",
          headers: {
            Authorization: `Zoho-enczapikey ${zeptoToken}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(zeptoPayload),
        });

        const status = zeptoRes.status;
        const text = await zeptoRes.text();
        dbg("Zepto response", { reqId, status, bodyPreview: text.slice(0, 400) });

        if (!zeptoRes.ok) {
          return new Response(
            JSON.stringify({
              error: "Zepto send failed",
              status,
              details: text,
            }),
            {
              status: 502,
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json",
                "X-Debug-Provider": "zepto",
              },
            },
          );
        }

        const zeptoData = JSON.parse(text || "{}");
        return new Response(
          JSON.stringify({
            ok: true,
            provider: "zepto",
            request_id: zeptoData?.data?.message_id,
            debug: { reqId },
          }),
          {
            status: 200,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
              "X-Debug-Provider": "zepto",
            },
          },
        );
      }
    } catch (error) {
      console.error("❌ Error calling email provider:", {
        provider: provider,
        error: error,
        message: error.message,
        stack: error.stack,
      });

      return new Response(
        JSON.stringify({ error: `Failed to send email via ${provider}` }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
  } catch (error) {
    console.error("❌ [send-email] unexpected error:", error);

    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
