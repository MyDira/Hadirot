import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle, Mail, ArrowRight, Plus, Trash2, Crown } from 'lucide-react';
import { conciergeService } from '../services/concierge';

interface SourceEntry {
  name: string;
  link: string;
}

function VIPSourcesForm() {
  const [sources, setSources] = useState<SourceEntry[]>([{ name: '', link: '' }]);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addSource = () => {
    if (sources.length < 10) setSources([...sources, { name: '', link: '' }]);
  };

  const removeSource = (idx: number) => {
    if (sources.length > 1) setSources(sources.filter((_, i) => i !== idx));
  };

  const updateSource = (idx: number, field: keyof SourceEntry, value: string) => {
    setSources(sources.map((s, i) => (i === idx ? { ...s, [field]: value } : s)));
  };

  const validSources = sources.filter((s) => s.name.trim());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (validSources.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      await conciergeService.updateSubscriptionSources(validSources);
      setSubmitted(true);
    } catch (err: any) {
      setError(err.message || 'Failed to save sources');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 text-center">
        <CheckCircle className="w-8 h-8 text-emerald-600 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-gray-900 mb-1">Sources Saved</h3>
        <p className="text-sm text-gray-600">
          We'll start monitoring your listing sources this week. You can update them anytime from your account settings.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="text-left bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-full bg-[#1E4A74]/10 flex items-center justify-center">
          <Crown className="w-5 h-5 text-[#1E4A74]" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-gray-900">One more step</h3>
          <p className="text-sm text-gray-500">Tell us where you post your listings so we can start monitoring them.</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="space-y-3 mb-4">
        <label className="block text-sm font-medium text-gray-700">
          Your listing sources
        </label>
        {sources.map((source, idx) => (
          <div key={idx} className="flex items-start gap-2">
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="text"
                value={source.name}
                onChange={(e) => updateSource(idx, 'name', e.target.value)}
                placeholder="Source name (e.g., BP Apartments WhatsApp)"
                className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#1E4A74] focus:ring-1 focus:ring-[#1E4A74] outline-none"
              />
              <input
                type="text"
                value={source.link}
                onChange={(e) => updateSource(idx, 'link', e.target.value)}
                placeholder="Link / URL (optional)"
                className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#1E4A74] focus:ring-1 focus:ring-[#1E4A74] outline-none"
              />
            </div>
            {sources.length > 1 && (
              <button
                type="button"
                onClick={() => removeSource(idx)}
                className="p-2 mt-0.5 text-gray-400 hover:text-red-500 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}

        {sources.length < 10 && (
          <button
            type="button"
            onClick={addSource}
            className="flex items-center gap-1.5 text-sm text-[#1E4A74] hover:text-[#163a5e] font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add another source
          </button>
        )}
      </div>

      <button
        type="submit"
        disabled={validSources.length === 0 || loading}
        className="w-full flex items-center justify-center gap-2 bg-[#1E4A74] text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-[#163a5e] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? (
          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
        ) : (
          <Crown className="w-4 h-4" />
        )}
        Save Sources
      </button>
    </form>
  );
}

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
          <p className="text-gray-600 mb-6">
            Your subscription is active. Complete the setup below to get started.
          </p>
          <VIPSourcesForm />
          <div className="mt-6" />
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
