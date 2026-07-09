import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { renderBrandEmail, sendViaZepto } from "../_shared/zepto.ts";

interface EmailRequest {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
  type?: "password_reset" | "general" | "admin_notification";
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Sliding-window rate limiting (mirrors send-contact-message). send-email can
// relay to admins (unauthenticated report-rented fallback) and to users, so it
// needs a throttle to prevent inbox flooding / Zepto quota burn.
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();

function checkRateLimit(
  key: string,
  windowMs: number,
  max: number,
): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || now - entry.windowStart >= windowMs) {
    rateLimitMap.set(key, { count: 1, windowStart: now });
    if (rateLimitMap.size > 10_000) {
      for (const [k, v] of rateLimitMap) {
        if (now - v.windowStart >= windowMs) rateLimitMap.delete(k);
      }
    }
    return { allowed: true };
  }
  if (entry.count + 1 > max) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((windowMs - (now - entry.windowStart)) / 1000),
    };
  }
  entry.count += 1;
  return { allowed: true };
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
const RATE_MAX = 30; // emails per IP per hour

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const clientIp = getClientIp(req);
    if (clientIp) {
      const ipHash = await sha256Hex(clientIp);
      const rate = checkRateLimit(`send-email:${ipHash}`, RATE_WINDOW_MS, RATE_MAX);
      if (!rate.allowed) {
        return new Response(
          JSON.stringify({ error: "Too many requests. Please try again later." }),
          {
            status: 429,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
              "Retry-After": String(rate.retryAfterSeconds),
            },
          },
        );
      }
    }

    const authHeader = req.headers.get("Authorization");

    const zeptoToken = Deno.env.get("ZEPTO_TOKEN");
    const zeptoFromAddress = Deno.env.get("ZEPTO_FROM_ADDRESS") || "noreply@hadirot.com";
    const zeptoFromName = Deno.env.get("ZEPTO_FROM_NAME") || "HaDirot";
    const zeptoReplyTo = Deno.env.get("ZEPTO_REPLY_TO");
    const emailProvider = Deno.env.get("EMAIL_PROVIDER");

    if (!zeptoToken) {
      console.error("ZEPTO_TOKEN not found in environment variables");
      return new Response(
        JSON.stringify({ error: "Email service not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    let emailData: EmailRequest;
    try {
      emailData = await req.json();
      console.log("📧 Email request received:", {
        to: emailData.to,
        subject: emailData.subject,
        type: emailData.type,
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
    const isAdminNotification = emailData.type === "admin_notification";

    if (!isPasswordReset && !isAdminNotification && !authHeader) {
      console.log("❌ Missing authorization for email");
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

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

    if (isPasswordReset) {
      console.log("🔐 Processing password reset for:", emailData.to);

      try {
        const resetEmail = Array.isArray(emailData.to)
          ? emailData.to[0]
          : emailData.to;
        const PUBLIC_SITE_URL =
          Deno.env.get('PUBLIC_SITE_URL') || 'http://localhost:5173';
        const redirectUrl = `${PUBLIC_SITE_URL.replace(new RegExp('/+$'), '')}/auth`;

        console.log("🔗 Generating reset link with params:", {
          email: resetEmail,
          redirectTo: redirectUrl,
        });

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
          from: `${zeptoFromName} <${zeptoFromAddress}>`,
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
    } else if (isAdminNotification) {
      console.log("📧 Processing admin notification email");

      try {
        const { data: adminProfiles, error: adminError } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .eq("is_admin", true);

        if (adminError) {
          console.error("❌ Error fetching admin profiles:", adminError);
          return new Response(
            JSON.stringify({ error: "Failed to fetch admin users" }),
            {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }

        if (!adminProfiles || adminProfiles.length === 0) {
          console.warn("⚠️ No admin users found in database");
          return new Response(
            JSON.stringify({ error: "No admin users found" }),
            {
              status: 404,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }

        console.log(`👥 Found ${adminProfiles.length} admin user(s)`);

        const adminEmails: string[] = [];

        for (const profile of adminProfiles) {
          try {
            const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(profile.id);

            if (userError) {
              console.warn(`⚠️ Error fetching user ${profile.id}:`, userError);
              continue;
            }

            if (userData?.user?.email) {
              adminEmails.push(userData.user.email);
              console.log(`✅ Found admin email: ${userData.user.email}`);
            } else {
              console.warn(`⚠️ No email found for admin user ${profile.id}`);
            }
          } catch (error) {
            console.warn(`⚠️ Exception fetching user ${profile.id}:`, error);
            continue;
          }
        }

        if (adminEmails.length === 0) {
          console.warn("⚠️ No admin email addresses found");
          return new Response(
            JSON.stringify({ error: "No admin email addresses found" }),
            {
              status: 404,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }

        console.log(`✅ Found ${adminEmails.length} admin email(s):`, adminEmails);

        // SECURITY: this path is reachable without a user JWT (the anonymous
        // report-rented email fallback uses it), so we must NOT trust the
        // caller-supplied `html` — otherwise anyone could deliver arbitrary
        // (DKIM-valid) phishing HTML into every admin inbox. Ignore client html
        // and build the body server-side from a fixed template; the only
        // caller-controlled value is the subject, which we escape.
        const safeSubject = escapeHtml(String(emailData.subject ?? "").slice(0, 200));
        const serverHtml = renderBrandEmail({
          title: "Hadirot Admin Notification",
          bodyHtml:
            `<p>An automated notification was triggered on Hadirot:</p>` +
            `<p style="font-weight:600;">${safeSubject}</p>` +
            `<p>Open the admin panel to review the related record and details.</p>`,
          ctaLabel: null,
          ctaHref: null,
        });

        emailData = {
          ...emailData,
          to: adminEmails,
          html: serverHtml,
        };
      } catch (error) {
        console.error("❌ Error in admin notification flow:", {
          error: error,
          message: error.message,
          stack: error.stack,
        });
        return new Response(
          JSON.stringify({ error: "Failed to process admin notification" }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
    } else if (authHeader) {
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

        // Restrict recipients on the `general` path so a throwaway account can't
        // use this as an open relay to arbitrary external addresses. Admins may
        // email anyone (they legitimately notify listing owners). Non-admins may
        // only email their own address or an internal allowlisted domain (the
        // "new listing pending approval" notice emails admin@hadirot.com).
        let isAdmin = user.app_metadata?.is_admin === true;
        if (!isAdmin) {
          const { data: profile } = await supabaseAdmin
            .from("profiles")
            .select("is_admin")
            .eq("id", user.id)
            .maybeSingle();
          isAdmin = profile?.is_admin === true;
        }

        if (!isAdmin) {
          const allowlistDomain =
            (Deno.env.get("EMAIL_ALLOWLIST_DOMAIN") || "hadirot.com").toLowerCase();
          const requestedRecipients = Array.isArray(emailData.to)
            ? emailData.to
            : [emailData.to];
          const callerEmail = (user.email ?? "").toLowerCase();
          const allAllowed = requestedRecipients.every((addr) => {
            if (typeof addr !== "string") return false;
            const lower = addr.toLowerCase();
            return (
              (!!callerEmail && lower === callerEmail) ||
              lower.endsWith(`@${allowlistDomain}`)
            );
          });
          if (!allAllowed) {
            console.error("❌ Non-admin attempted to email a disallowed recipient:", {
              caller: user.id,
              requested: requestedRecipients,
            });
            return new Response(
              JSON.stringify({
                error: "You may only send email to your own address",
              }),
              {
                status: 403,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              },
            );
          }
        }
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

    if (!isPasswordReset && !emailData.html) {
      console.error("❌ Missing HTML content for email");
      return new Response(
        JSON.stringify({
          error:
            "Missing required field: html content is required",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const toAddresses = Array.isArray(emailData.to) ? emailData.to : [emailData.to];

    console.log("📤 Sending email via ZeptoMail:", {
      to: toAddresses,
      subject: emailData.subject,
      from: `${zeptoFromName} <${zeptoFromAddress}>`,
      htmlLength: emailData.html.length,
    });

    try {
      const zeptoData = await sendViaZepto({
        to: toAddresses,
        subject: emailData.subject,
        html: emailData.html,
        from: zeptoFromAddress,
        fromName: zeptoFromName,
      });

      console.log("✅ Email sent successfully via ZeptoMail:", {
        messageId: zeptoData?.data?.message_id,
        to: toAddresses,
        subject: emailData.subject,
        type: emailData.type || "general",
      });

      return new Response(
        JSON.stringify({
          success: true,
          id: zeptoData?.data?.message_id,
          provider: "zeptomail",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    } catch (error) {
      console.error("❌ Error calling ZeptoMail API:", {
        error: error,
        message: error.message,
        stack: error.stack,
      });

      return new Response(
        JSON.stringify({ error: "Failed to send email via ZeptoMail" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
  } catch (error) {
    console.error("❌ Unexpected error in send-email function:", {
      error: error,
      message: error.message,
      stack: error.stack,
    });

    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});