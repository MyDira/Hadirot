import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { renderBrandEmail, sendViaZepto } from "../_shared/zepto.ts";

Deno.serve(async (req) => {
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

    // Get the authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Create Supabase client with service role key for admin operations
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

    // Verify the user making the request
    // Create a regular Supabase client to verify the session
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    );

    // Set the session using the provided token
    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser(token);

    if (authError || !user) {
      console.error("Auth verification failed:", authError);
      return new Response(JSON.stringify({ error: "Invalid authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if the requesting user is an admin
    const { data: profile, error: profileError } = await supabaseClient
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .single();

    if (profileError || !profile?.is_admin) {
      console.error("Admin check failed:", profileError, profile);
      return new Response(
        JSON.stringify({ error: "Insufficient permissions" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Parse the request body to get userId
    const { userId, reason } = await req.json();

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Missing userId parameter" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Prevent admin from deleting themselves
    if (userId === user.id) {
      return new Response(
        JSON.stringify({ error: "Cannot delete your own account" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Fetch user info before deletion for email
    const { data: userInfo } =
      await supabaseAdmin.auth.admin.getUserById(userId);
    let targetEmail = userInfo?.user?.email || "";
    let fullName = (userInfo?.user?.user_metadata?.full_name as string) || "";

    if (!targetEmail) {
      const { data: profileData } = await supabaseAdmin
        .from("profiles")
        .select("email, full_name")
        .eq("id", userId)
        .single();
      targetEmail = profileData?.email || "";
      fullName = profileData?.full_name || "";
    }

    // Delete the user from Supabase Auth (this will cascade to profiles table)
    const { error: deleteError } =
      await supabaseAdmin.auth.admin.deleteUser(userId);

    if (deleteError) {
      console.error("Error deleting user from auth:", deleteError);
      return new Response(
        JSON.stringify({
          error: "Failed to delete user from authentication system",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    console.log(`Successfully deleted user: ${userId}`);

    // Send deletion notification email via ZeptoMail
    if (targetEmail) {
      try {
        const zeptoToken = Deno.env.get("ZEPTO_TOKEN");
        const zeptoFromAddress = Deno.env.get("ZEPTO_FROM_ADDRESS") || "noreply@hadirot.com";
        const zeptoFromName = Deno.env.get("ZEPTO_FROM_NAME") || "HaDirot";
        const zeptoReplyTo = Deno.env.get("ZEPTO_REPLY_TO");
        const emailProvider = Deno.env.get("EMAIL_PROVIDER");

        if (zeptoToken) {
          const html = renderBrandEmail({
            title: "Account Deleted",
            intro: `Hi ${fullName},`,
            bodyHtml: `<p>Your Hadirot account has been deleted.</p>${reason ? `<p>${reason}</p>` : ""}<p>If you have questions, contact support@hadirot.com.</p>`,
          });

          await sendViaZepto({
            to: targetEmail,
            subject: "Your Hadirot account has been deleted",
            html,
            from: zeptoFromAddress,
            fromName: zeptoFromName,
          });

          console.log("✅ Account deletion email sent via ZeptoMail");
        } else {
          console.warn("ZEPTO_TOKEN not set; skipping deletion email");
        }
      } catch (emailError) {
        console.error("Error sending account deletion email:", emailError);
      }
    }

    return new Response(
      JSON.stringify({ message: "User deleted successfully", userId }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Unexpected error in delete-user function:", error);

    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});