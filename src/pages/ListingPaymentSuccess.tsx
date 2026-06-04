import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle, XCircle, ArrowRight, Home } from 'lucide-react';

// Branded thank-you / cancelled landing pages for the one-tap "pay from your
// phone" SMS flow (pay-listing-link → Stripe → here). The listing itself is
// updated by the Stripe webhook; this page just confirms to the visitor.
//
// `cancelled` toggles the cancel variant (Stripe cancel_url points here).

export function ListingPaymentSuccess({ cancelled = false }: { cancelled?: boolean }) {
  const [searchParams] = useSearchParams();
  const listingId = searchParams.get('listing');

  if (cancelled) {
    return (
      <div className="max-w-xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
        <div className="mx-auto w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mb-6">
          <XCircle className="w-8 h-8 text-amber-600" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-3">Payment Cancelled</h1>
        <p className="text-gray-600 mb-8">
          No charge was made. Your listing was not updated. You can try again anytime
          from the link in your text message, or from your account.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          {listingId && (
            <Link
              to={`/listing/${listingId}`}
              className="flex items-center gap-2 bg-white border border-gray-300 text-gray-700 px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-gray-50 transition-colors"
            >
              View Listing
            </Link>
          )}
          <Link
            to="/account?tab=listings"
            className="flex items-center gap-2 bg-[#1E4A74] text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-[#163a5e] transition-colors"
          >
            Go to My Listings
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
      <div className="mx-auto w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mb-6">
        <CheckCircle className="w-8 h-8 text-emerald-600" />
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-3">Thank You!</h1>
      <p className="text-gray-600 mb-2">
        Your payment was received and your listing has been renewed.
      </p>
      <p className="text-gray-500 text-sm mb-8">
        A confirmation email is on its way. It can take a moment for your listing
        status to refresh.
      </p>
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
        {listingId && (
          <Link
            to={`/listing/${listingId}`}
            className="flex items-center gap-2 bg-white border border-gray-300 text-gray-700 px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-gray-50 transition-colors"
          >
            View My Listing
          </Link>
        )}
        <Link
          to="/account?tab=listings"
          className="flex items-center gap-2 bg-[#1E4A74] text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-[#163a5e] transition-colors"
        >
          Go to My Listings
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
      <div className="mt-8">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#1E4A74] transition-colors"
        >
          <Home className="w-4 h-4" />
          Back to Hadirot
        </Link>
      </div>
    </div>
  );
}
