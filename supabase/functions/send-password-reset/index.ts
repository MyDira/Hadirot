import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { sendViaZepto, renderBrandEmail } from "../_shared/zepto.ts";

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

    if (!supabaseUrl || !serviceRoleKey) {
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
      intro: "Use the button below to reset your password.",
      bodyHtml:
        `<p>This link will expire shortly. If you didn't request a reset, you can ignore this message.</p>`,
      ctaLabel: "Reset Password",
      ctaHref: actionLink,
    });

    await sendViaZepto({
      to,
      subject: subject || "Password reset",
      html,
    });

    return new Response(JSON.stringify({ success: true }), {
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
