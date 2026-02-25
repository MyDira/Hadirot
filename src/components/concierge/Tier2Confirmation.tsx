import React from 'react';
import { Mail, ArrowLeft } from 'lucide-react';

interface Tier2ConfirmationProps {
  emailHandle: string;
  onConfirm: () => void;
  onBack: () => void;
  loading: boolean;
}

export function Tier2Confirmation({ emailHandle, onConfirm, onBack, loading }: Tier2ConfirmationProps) {
  const fullEmail = `${emailHandle}@list.hadirot.com`;

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to plans
      </button>

      <div className="text-center space-y-4">
        <div className="mx-auto w-14 h-14 rounded-full bg-[#1E4A74]/10 flex items-center justify-center">
          <Mail className="w-7 h-7 text-[#1E4A74]" />
        </div>

        <div>
          <h3 className="text-xl font-bold text-gray-900 mb-1">Your Custom Email Address</h3>
          <p className="text-sm text-gray-600">
            Forward your listings to this address anytime and we'll post them for you.
          </p>
        </div>

        <div className="bg-[#F0F9FF] border-2 border-[#1E4A74] rounded-xl p-5">
          <span className="text-xl font-bold text-[#1E4A74] tracking-wide">{fullEmail}</span>
        </div>

        <div className="text-left bg-gray-50 rounded-lg p-4 text-sm text-gray-600 space-y-2">
          <p className="font-medium text-gray-700">After subscribing, just forward your listings to this address. Include:</p>
          <ul className="space-y-1 ml-4 list-disc">
            <li><strong>Rentals:</strong> bedrooms, bathrooms, price, contact number, cross streets</li>
            <li><strong>Sales:</strong> address, price, bedrooms, bathrooms, property type, building type, photo</li>
          </ul>
          <p className="text-gray-500 italic">The more details the better, but those are the essentials.</p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400">
          $125/month subscription via Stripe
        </p>
        <button
          onClick={onConfirm}
          disabled={loading}
          className="flex items-center gap-2 bg-[#1E4A74] text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-[#163a5e] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <Mail className="w-4 h-4" />
          )}
          Subscribe &mdash; $125/mo
        </button>
      </div>
    </div>
  );
}
