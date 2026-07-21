// Thin client for the Supabase Edge Function that sends a callback-request
// SMS to a listing's owner. Used by ListingContactForm and by the parent
// listing-detail page when restoring a pending callback after login.

import { getAnalyticsSessionId, trackContactSubmitted } from "../lib/analytics";

interface BaseArgs {
  userName: string;
  userPhone: string;
  consentToFollowup: boolean;
}

interface RentalArgs extends BaseArgs {
  listingId: string;
}

interface CommercialArgs extends BaseArgs {
  commercialListingId: string;
}

async function post(body: Record<string, unknown>): Promise<void> {
  const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-listing-contact-sms`;
  const response = await fetch(functionUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      ...body,
      // Real analytics session id so submissions join to analytics_events /
      // analytics_sessions (historic rows used a homemade id and can't).
      sessionId: getAnalyticsSessionId(),
      userAgent: navigator.userAgent,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || "Failed to send contact request");
  }
}

export async function sendListingContactSms(args: RentalArgs): Promise<void> {
  await post({
    listingId: args.listingId,
    userName: args.userName.trim(),
    userPhone: args.userPhone,
    consentToFollowup: args.consentToFollowup,
  });
  trackContactSubmitted(args.listingId, "rental");
}

export async function sendCommercialContactSms(
  args: CommercialArgs,
): Promise<void> {
  await post({
    isCommercial: true,
    commercialListingId: args.commercialListingId,
    userName: args.userName.trim(),
    userPhone: args.userPhone,
    consentToFollowup: args.consentToFollowup,
  });
  trackContactSubmitted(args.commercialListingId, "commercial");
}
