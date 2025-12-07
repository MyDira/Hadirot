import { corsHeaders } from "./_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { renderBrandEmail, sendViaZepto } from "./_shared/zepto.ts";

interface EmailRequest {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
  type?: "password_reset" | "general" | "admin_notification";
}

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

        const { data: { users }, error: usersError } = await supabaseAdmin.auth.admin.listUsers();

        if (usersError) {
          console.error("❌ Error fetching user emails:", usersError);
          return new Response(
            JSON.stringify({ error: "Failed to fetch admin email addresses" }),
            {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }

        const adminIds = new Set(adminProfiles.map(p => p.id));
        const adminEmails = users
          ?.filter(u => adminIds.has(u.id))
          .map(u => u.email)
          .filter((email): email is string => !!email) || [];

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

        console.log(`✅ Found ${adminEmails.length} admin email(s)`);

        emailData = {
          ...emailData,
          to: adminEmails,
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