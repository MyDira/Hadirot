import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { sendViaZepto, renderBrandEmail } from '../_shared/zepto.ts';

// Escape user-controlled strings (e.g. listing title) before interpolating into
// email HTML. Prevents broken markup / link injection in notification emails.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        {
          status: 405,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const supabaseAuthClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: authError,
    } = await supabaseAuthClient.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authorization' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const isAdminViaJwt = user.app_metadata?.is_admin === true;

    if (!isAdminViaJwt) {
      console.error('[EDGE] approve-listing rejected — not admin (JWT):', user.id);
      return new Response(
        JSON.stringify({ error: 'Insufficient permissions' }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { listingId, isCommercial } = await req.json();
    console.log('[EDGE] approve-listing called', { listingId, isCommercial, at: new Date().toISOString() });

    if (!listingId) {
      return new Response(
        JSON.stringify({ error: 'Missing listingId parameter' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(listingId)) {
      return new Response(
        JSON.stringify({ error: 'Invalid listingId format' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    let listingData: { id: string; title: string | null; user_id: string } | null = null;

    if (isCommercial) {
      // Anchor the lifecycle clock at APPROVAL time (parity with residential).
      // Commercial is free — no trial/paid logic — so this is a straight freshness
      // window from admin_settings. Without this, expires_at stays at the
      // posting-time value and the queue wait is silently eaten from the live window.
      const now = new Date();

      const { data: current } = await supabaseClient
        .from('commercial_listings')
        .select('listing_type')
        .eq('id', listingId)
        .maybeSingle();

      const { data: settings } = await supabaseClient
        .from('admin_settings')
        .select('rental_active_days, sale_active_days')
        .maybeSingle();

      const activeDays =
        current?.listing_type === 'sale'
          ? (settings?.sale_active_days ?? 30)
          : (settings?.rental_active_days ?? 30);

      const expiresAt = new Date(now);
      expiresAt.setUTCDate(expiresAt.getUTCDate() + activeDays);

      const { data, error } = await supabaseClient
        .from('commercial_listings')
        .update({
          approved: true,
          is_active: true,
          last_published_at: now.toISOString(),
          expires_at: expiresAt.toISOString(),
          updated_at: now.toISOString(),
        })
        .eq('id', listingId)
        .select('id, title, user_id')
        .single();

      console.log('[EDGE] approve-listing updated commercial listing to approved/active', { listingId });

      if (error) {
        console.error('Error approving commercial listing:', error);
        return new Response(
          JSON.stringify({ error: 'Failed to approve listing' }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      listingData = data;
    } else {
      // ----------------------------------------------------------------
      // Re-anchor the monetization clock at APPROVAL time.
      //
      // The free-trial and paid clocks must begin when an admin approves the
      // listing — NOT when it was posted. (The wizard intentionally no longer
      // stamps trial_started_at at posting.) We read the current payment state
      // and the payment ledger (paid_listing_payments) and compute the right
      // trial_started_at / paid_until / expires_at here.
      //
      // Spec (individual residential rental):
      //   • 14-day free trial, starting at approval.
      //   • If paid at posting: 14 trial + 30 paid + 30 early-payment bonus
      //     = 74 days total, all measured from approval.
      //   • must_pay (no trial): paid days only, from approval.
      //
      // Non-monetized / sale / subscription / legacy listings keep the simple
      // { approved, is_active } behavior.
      // ----------------------------------------------------------------
      const now = new Date();

      const { data: settings } = await supabaseClient
        .from('admin_settings')
        .select('monetization_enabled')
        .maybeSingle();
      const monetizationEnabled = settings?.monetization_enabled === true;

      const { data: current } = await supabaseClient
        .from('listings')
        .select('payment_kind, trial_started_at, paid_until, listing_type')
        .eq('id', listingId)
        .maybeSingle();

      const update: Record<string, unknown> = { approved: true, is_active: true };

      if (
        monetizationEnabled &&
        current &&
        current.listing_type === 'rental' &&
        (current.payment_kind === 'individual_trial' ||
          current.payment_kind === 'pending_payment')
      ) {
        // Sum any payments already recorded against this listing (pay-at-posting).
        const { data: payments } = await supabaseClient
          .from('paid_listing_payments')
          .select('days_granted, bonus_days')
          .eq('listing_id', listingId);
        const ledger = payments || [];
        const hasPayment = ledger.length > 0;
        const totalPaidDays = ledger.reduce(
          (sum: number, p: { days_granted: number | null; bonus_days: number | null }) =>
            sum + (p.days_granted || 0) + (p.bonus_days || 0),
          0,
        );

        const thirtyAhead = new Date(now);
        thirtyAhead.setUTCDate(thirtyAhead.getUTCDate() + 30);

        // Freshness window resets at approval for every monetized rental.
        update.last_published_at = now.toISOString();

        if (current.payment_kind === 'individual_trial') {
          // 14-day free trial begins now.
          update.trial_started_at = now.toISOString();

          if (hasPayment) {
            // Paid at posting: 14 trial days + paid days (bonus already in total).
            update.payment_kind = 'individual_paid';
            const paidUntil = new Date(now);
            paidUntil.setUTCDate(paidUntil.getUTCDate() + 14 + totalPaidDays);
            update.paid_until = paidUntil.toISOString();
            update.expires_at = (paidUntil < thirtyAhead ? paidUntil : thirtyAhead).toISOString();
            update.paused_paid_days = 0;
          } else {
            // Pure free trial — no payment yet.
            update.expires_at = thirtyAhead.toISOString();
          }
        } else {
          // pending_payment (must-pay, no free trial). Should always have a
          // payment by approval time, but guard anyway.
          if (hasPayment) {
            update.payment_kind = 'individual_paid';
            const paidUntil = new Date(now);
            paidUntil.setUTCDate(paidUntil.getUTCDate() + totalPaidDays);
            update.paid_until = paidUntil.toISOString();
            update.expires_at = (paidUntil < thirtyAhead ? paidUntil : thirtyAhead).toISOString();
            update.paused_paid_days = 0;
          } else {
            // Audit M2: a must-pay listing with NO payment must NOT go live for
            // free. Keep it approved (so it's out of the moderation queue) but
            // inactive until payment lands. derivePaymentState renders this as
            // "payment_required"; the webhook flips it active when payment
            // applies. Without this guard, approving an unpaid must-pay listing
            // would grant ~30 free freshness days.
            update.is_active = false;
          }
        }
      }

      const { data, error } = await supabaseClient
        .from('listings')
        .update(update)
        .eq('id', listingId)
        .select('id, title, user_id')
        .single();

      console.log('[EDGE] approve-listing updated listing to approved/active', {
        listingId,
        reAnchored: update.payment_kind ?? current?.payment_kind ?? null,
      });

      if (error) {
        console.error('Error approving listing:', error);
        return new Response(
          JSON.stringify({ error: 'Failed to approve listing' }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      listingData = data;
    }

    // Fetch owner email from auth.users via service role — profiles does not store email
    const { data: userData, error: userError } = await supabaseClient.auth.admin.getUserById(listingData.user_id);
    const ownerEmail = userData?.user?.email ?? null;

    if (userError || !ownerEmail) {
      console.warn('[EDGE] approve-listing: could not fetch owner email, skipping notification', {
        listingId,
        userId: listingData.user_id,
        userError,
      });
    } else {
      try {
        const listingTitle = listingData.title ?? 'Your listing';
        const siteUrl = Deno.env.get('SITE_URL') ?? Deno.env.get('PUBLIC_SITE_URL') ?? 'https://hadirot.com';
        const listingUrl = isCommercial
          ? `${siteUrl}/commercial-listing/${listingData.id}`
          : `${siteUrl}/listing/${listingData.id}`;

        const html = renderBrandEmail({
          title: 'Your Listing Has Been Approved',
          intro: 'Great news!',
          bodyHtml: `<p>Your listing <strong>${escapeHtml(listingTitle)}</strong> has been approved and is now live on Hadirot.</p>`,
          ctaLabel: 'View Live Listing',
          ctaHref: listingUrl,
        });

        await sendViaZepto({
          to: ownerEmail,
          subject: `Listing Approved: ${listingTitle} is now live! - Hadirot`,
          html,
        });

        console.log('[EDGE] approve-listing: approval email sent', { listingId, to: ownerEmail });
      } catch (emailErr) {
        console.error('[EDGE] approve-listing: failed to send approval email (approval still succeeded)', emailErr);
      }
    }

    return new Response(
      JSON.stringify({ message: 'Listing approved', listing: listingData }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Unexpected error in approve-listing function:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
