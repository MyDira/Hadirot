import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=denonext";
import { corsHeaders } from "../_shared/cors.ts";
import { renderBrandEmail, sendViaZepto } from "../_shared/zepto.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_API_KEY") ?? "", {
  apiVersion: "2023-10-16",
});

// Statuses that represent an actually-billing (or about-to-bill) Stripe
// subscription. Cancelled/expired rows have nothing live to cancel.
const LIVE_SUBSCRIPTION_STATUSES = ["active", "past_due", "trial"];

interface StripeCleanupResult {
  subscriptionsCanceled: string[];
  subscriptionsFailed: { id: string; error: string }[];
  customerDeleted: boolean;
  customerDeleteError: string | null;
}

// Cancels any live Stripe subscriptions tied to this user (across
// listing_subscriptions and concierge_subscriptions) and deletes the Stripe
// customer object, so a deleted account stops being billed. Must run BEFORE
// auth.admin.deleteUser, since profiles (and these subscription tables) are
// ON DELETE CASCADE from auth.users and the rows disappear once the user is
// deleted. Failures here are logged and surfaced but never block account
// deletion itself.
async function cancelStripeBillingForUser(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
): Promise<StripeCleanupResult> {
  const result: StripeCleanupResult = {
    subscriptionsCanceled: [],
    subscriptionsFailed: [],
    customerDeleted: false,
    customerDeleteError: null,
  };

  if (!Deno.env.get("STRIPE_API_KEY")) {
    result.customerDeleteError = "STRIPE_API_KEY not configured; skipped Stripe cleanup";
    return result;
  }

  const subscriptionIds = new Set<string>();

  const [{ data: listingSubs }, { data: conciergeSubs }] = await Promise.all([
    supabaseAdmin
      .from("listing_subscriptions")
      .select("stripe_subscription_id, status")
      .eq("user_id", userId)
      .not("stripe_subscription_id", "is", null),
    supabaseAdmin
      .from("concierge_subscriptions")
      .select("stripe_subscription_id, status")
      .eq("user_id", userId)
      .not("stripe_subscription_id", "is", null),
  ]);

  for (const row of [...(listingSubs || []), ...(conciergeSubs || [])]) {
    const subId = (row as { stripe_subscription_id: string | null }).stripe_subscription_id;
    const status = (row as { status: string }).status;
    if (subId && LIVE_SUBSCRIPTION_STATUSES.includes(status)) {
      subscriptionIds.add(subId);
    }
  }

  for (const subId of subscriptionIds) {
    try {
      await stripe.subscriptions.cancel(subId);
      result.subscriptionsCanceled.push(subId);
    } catch (err) {
      console.error(`Failed to cancel Stripe subscription ${subId}:`, err);
      result.subscriptionsFailed.push({
        id: subId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Best-effort: delete the Stripe customer object too, so no stored payment
  // method or future invoice can be created against this identity.
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", userId)
    .maybeSingle();
  const stripeCustomerId = (profile as { stripe_customer_id?: string } | null)?.stripe_customer_id;

  if (stripeCustomerId) {
    try {
      await stripe.customers.del(stripeCustomerId);
      result.customerDeleted = true;
    } catch (err) {
      console.error(`Failed to delete Stripe customer ${stripeCustomerId}:`, err);
      result.customerDeleteError = err instanceof Error ? err.message : String(err);
    }
  }

  return result;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

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

    const isAdminViaJwt = user.app_metadata?.is_admin === true;

    if (!isAdminViaJwt) {
      console.error("Admin check failed (JWT app_metadata.is_admin not true):", user.id);
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

    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(userId)) {
      return new Response(
        JSON.stringify({ error: "Invalid userId format" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (reason !== undefined && (typeof reason !== "string" || reason.length > 500)) {
      return new Response(
        JSON.stringify({ error: "Field too long: reason" }),
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

    // Cancel any live Stripe subscriptions / delete the Stripe customer BEFORE
    // deleting the auth user, since the DB rows that hold the Stripe IDs
    // cascade-delete along with the user (see cancelStripeBillingForUser).
    // A Stripe failure here must never block the account deletion itself.
    let stripeCleanup: StripeCleanupResult;
    try {
      stripeCleanup = await cancelStripeBillingForUser(supabaseAdmin, userId);
    } catch (stripeError) {
      console.error("Unexpected error during Stripe cleanup for delete-user:", stripeError);
      stripeCleanup = {
        subscriptionsCanceled: [],
        subscriptionsFailed: [
          { id: "unknown", error: stripeError instanceof Error ? stripeError.message : String(stripeError) },
        ],
        customerDeleted: false,
        customerDeleteError: stripeError instanceof Error ? stripeError.message : String(stripeError),
      };
    }
    if (stripeCleanup.subscriptionsFailed.length > 0 || stripeCleanup.customerDeleteError) {
      console.error(
        `Stripe cleanup incomplete for user ${userId}:`,
        JSON.stringify(stripeCleanup),
      );
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

    const { error: auditError } = await supabaseAdmin.from("admin_audit_log").insert({
      action: "delete_user",
      actor_id: user.id,
      target_id: userId,
      details: {
        target_email: targetEmail || null,
        target_full_name: fullName || null,
        reason: reason || null,
        stripe_subscriptions_canceled: stripeCleanup.subscriptionsCanceled,
        stripe_subscriptions_failed: stripeCleanup.subscriptionsFailed,
        stripe_customer_deleted: stripeCleanup.customerDeleted,
        stripe_customer_delete_error: stripeCleanup.customerDeleteError,
      },
    });
    if (auditError) {
      console.error("Audit insert failed:", auditError.message);
    }

    // Send deletion notification email via ZeptoMail
    if (targetEmail) {
      try {
        const html = renderBrandEmail({
          title: "Account Deleted",
          intro: `Hi ${escapeHtml(String(fullName ?? ""))},`,
          bodyHtml: `<p>Your Hadirot account has been deleted.</p>${reason ? `<p>${escapeHtml(String(reason))}</p>` : ""}<p>If you have questions, contact support@hadirot.com.</p>`,
        });

        await sendViaZepto({
          to: targetEmail,
          subject: "Your Hadirot account has been deleted",
          html,
        });

        console.log("✅ Account deletion email sent via ZeptoMail");
      } catch (emailError) {
        console.error("Error sending account deletion email:", emailError);
      }
    }

    const stripeWarning =
      stripeCleanup.subscriptionsFailed.length > 0 || stripeCleanup.customerDeleteError
        ? "Stripe billing cleanup did not fully complete for this user — check admin_audit_log and cancel/refund manually in the Stripe dashboard."
        : undefined;

    return new Response(
      JSON.stringify({
        message: "User deleted successfully",
        userId,
        stripeSubscriptionsCanceled: stripeCleanup.subscriptionsCanceled,
        stripeCustomerDeleted: stripeCleanup.customerDeleted,
        ...(stripeWarning ? { warning: stripeWarning } : {}),
      }),
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