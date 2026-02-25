import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle, Mail, ArrowRight } from 'lucide-react';

export function ConciergeSuccess() {
  const [searchParams] = useSearchParams();
  const tier = searchParams.get('tier') || '';
  const handle = searchParams.get('handle') || '';

  const isTier1 = tier === 'tier1_quick';
  const isTier2 = tier === 'tier2_forward';
  const isTier3 = tier === 'tier3_vip';

  return (
    <div className="max-w-xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
      <div className="mx-auto w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mb-6">
        <CheckCircle className="w-8 h-8 text-emerald-600" />
      </div>

      {isTier1 && (
        <>
          <h1 className="text-2xl font-bold text-gray-900 mb-3">Thank You!</h1>
          <p className="text-gray-600 mb-8">
            We've received your listing details and payment. We'll have your listing posted within 24 hours.
          </p>
        </>
      )}

      {isTier2 && (
        <>
          <h1 className="text-2xl font-bold text-gray-900 mb-3">Welcome to Forward & Post!</h1>
          <p className="text-gray-600 mb-4">Your custom email address is ready:</p>
          <div className="bg-[#F0F9FF] border-2 border-[#1E4A74] rounded-xl p-5 mb-4 inline-block">
            <div className="flex items-center gap-2 justify-center">
              <Mail className="w-5 h-5 text-[#1E4A74]" />
              <span className="text-xl font-bold text-[#1E4A74]">{handle}@list.hadirot.com</span>
            </div>
          </div>
          <p className="text-gray-600 mb-8">
            Start forwarding your listings to this address anytime. We'll take care of the rest.
          </p>
        </>
      )}

      {isTier3 && (
        <>
          <h1 className="text-2xl font-bold text-gray-900 mb-3">Welcome to VIP!</h1>
          <p className="text-gray-600 mb-8">
            We'll start checking your listing sources twice a week. Sit back and relax -- your listings will appear on Hadirot automatically.
          </p>
        </>
      )}

      {!isTier1 && !isTier2 && !isTier3 && (
        <>
          <h1 className="text-2xl font-bold text-gray-900 mb-3">Payment Successful!</h1>
          <p className="text-gray-600 mb-8">
            Your concierge service has been activated. Thank you!
          </p>
        </>
      )}

      <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
        <Link
          to="/account"
          className="flex items-center gap-2 bg-[#1E4A74] text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-[#163a5e] transition-colors"
        >
          Go to My Account
          <ArrowRight className="w-4 h-4" />
        </Link>
        <Link
          to="/concierge"
          className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          Back to Concierge
        </Link>
      </div>
    </div>
  );
}
