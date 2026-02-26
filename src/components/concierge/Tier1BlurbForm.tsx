import React, { useState } from 'react';
import { Send, ArrowLeft } from 'lucide-react';

interface Tier1BlurbFormProps {
  onSubmit: (blurb: string) => void;
  onBack: () => void;
  loading: boolean;
}

export function Tier1BlurbForm({ onSubmit, onBack, loading }: Tier1BlurbFormProps) {
  const [blurb, setBlurb] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (blurb.trim()) onSubmit(blurb.trim());
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to plans
      </button>

      <div>
        <h3 className="text-xl font-bold text-gray-900 mb-2">Tell us about your listing</h3>
        <p className="text-gray-600 text-sm leading-relaxed">
          Describe your property in your own words and we'll create a polished listing for you.
          Make sure to include:
        </p>
        <ul className="mt-2 text-sm text-gray-600 space-y-1">
          <li className="flex items-start gap-2">
            <span className="text-[#1E4A74] font-medium">Rentals:</span>
            bedroom count, bathroom count, price (or "call for price"), contact number, cross streets
          </li>
          <li className="flex items-start gap-2">
            <span className="text-[#1E4A74] font-medium">Sales:</span>
            address, price, bedrooms, bathrooms, property type, building type, and at least one photo
          </li>
        </ul>
        <p className="mt-2 text-sm text-gray-500 italic">
          The more detail you give us, the better your listing will look!
        </p>
      </div>

      <textarea
        value={blurb}
        onChange={(e) => setBlurb(e.target.value)}
        placeholder="e.g., Beautiful 2BR/1BA apartment on the corner of Ocean Ave and Ave J. Freshly renovated kitchen, hardwood floors throughout. $2,200/month. Contact: 718-555-1234"
        rows={8}
        className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-[#1E4A74] focus:ring-1 focus:ring-[#1E4A74] outline-none resize-y"
        required
      />

      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400">
          You'll be redirected to Stripe to complete your $25 payment.
        </p>
        <button
          type="submit"
          disabled={!blurb.trim() || loading}
          className="flex items-center gap-2 bg-accent-500 text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-accent-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
          Submit & Pay $25
        </button>
      </div>
    </form>
  );
}
