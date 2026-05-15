import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, AlertTriangle, X } from 'lucide-react';
import type { ListingFormData } from '../../../postListing/types';
import { StepTips } from '../../StepTips';

const TIPS = {
  heading: 'Price & Terms',
  bullets: [
    'A real price filters out unqualified leads.',
    'NYC law restricts advertising fees on rentals — fee listings are reviewed by our team.',
  ],
};

const LEASE_LENGTH_OPTIONS = [
  { value: 'short_term', label: 'Short Term' },
  { value: 'long_term_annual', label: 'Long Term / Annual' },
  { value: 'summer_rental', label: 'Summer Rental' },
  { value: 'winter_rental', label: 'Winter Rental' },
] as const;

interface Step2Props {
  formData: ListingFormData;
  updateFormData: (updates: Partial<ListingFormData>) => void;
  onNext: () => void;
  onBack: () => void;
}

export function Step2PriceAndTerms({ formData, updateFormData, onNext, onBack }: Step2Props) {
  const [showBrokerModal, setShowBrokerModal] = useState(false);

  const canContinue = formData.call_for_price || (!!formData.price && formData.price > 0);

  const handleBrokerFeeChange = (checked: boolean) => {
    if (checked) {
      setShowBrokerModal(true);
    } else {
      updateFormData({ broker_fee: false });
    }
  };

  const handleBrokerFeeConfirm = () => {
    updateFormData({ broker_fee: true });
    setShowBrokerModal(false);
  };

  const handleBrokerFeeCancel = () => {
    updateFormData({ broker_fee: false });
    setShowBrokerModal(false);
  };

  return (
    <div className="flex gap-8 items-start">
      <div className="flex-1 min-w-0 space-y-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-5">Price & Terms</h2>

          {/* Monthly Rent */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Monthly Rent <span className="text-red-500">*</span>
            </label>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input
                  type="number"
                  min={0}
                  step={50}
                  value={formData.price ?? ''}
                  onChange={e => updateFormData({ price: e.target.value ? Number(e.target.value) : null })}
                  disabled={formData.call_for_price}
                  placeholder="e.g. 2200"
                  className="pl-7 pr-3 py-2 border border-gray-300 rounded-md text-sm w-40 focus:ring-accent-500 focus:border-accent-500 disabled:bg-gray-50 disabled:text-gray-400"
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={formData.call_for_price}
                  onChange={e => {
                    updateFormData({
                      call_for_price: e.target.checked,
                      price: e.target.checked ? null : formData.price,
                    });
                  }}
                  className="h-4 w-4 text-accent-500 focus:ring-accent-500 border-gray-300 rounded"
                />
                <span className="text-sm text-gray-700">Call for Price</span>
              </label>
            </div>
          </div>

          {/* Lease Length */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">Lease Length</label>
            <div className="flex flex-wrap gap-2">
              {LEASE_LENGTH_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() =>
                    updateFormData({ lease_length: formData.lease_length === opt.value ? null : opt.value })
                  }
                  className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                    formData.lease_length === opt.value
                      ? 'bg-brand-700 border-brand-700 text-white'
                      : 'bg-white border-gray-300 text-gray-700 hover:border-brand-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Broker Fee */}
          <div className="pt-5 border-t border-gray-100">
            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={formData.broker_fee}
                onChange={e => handleBrokerFeeChange(e.target.checked)}
                className="mt-0.5 h-4 w-4 text-accent-500 focus:ring-accent-500 border-gray-300 rounded"
              />
              <div>
                <span className="text-sm font-medium text-gray-700">This listing has a broker / agent fee</span>
                {formData.broker_fee && (
                  <span className="ml-2 text-xs font-medium bg-amber-100 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded">
                    Fee disclosed
                  </span>
                )}
                <p className="text-xs text-gray-400 mt-0.5">
                  Fee listings are subject to review under NYC rental regulations.
                </p>
              </div>
            </label>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={!canContinue}
            className="flex items-center gap-2 bg-accent-500 text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-accent-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Continue
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <StepTips {...TIPS} />

      {/* Broker Fee Warning Modal */}
      {showBrokerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-auto overflow-hidden">
            <div className="flex items-start justify-between p-5 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
                <h3 className="text-base font-semibold text-gray-900">Broker Fee Notice</h3>
              </div>
              <button
                type="button"
                onClick={handleBrokerFeeCancel}
                className="text-gray-400 hover:text-gray-600 transition-colors ml-2"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5">
              <p className="text-sm text-gray-700 leading-relaxed mb-3">
                <strong>NYC law does not allow properties with a broker fee to be advertised</strong> on residential rental platforms in certain circumstances.
              </p>
              <p className="text-sm text-gray-700 leading-relaxed mb-5">
                HaDirot reserves the right to reject or delete any listing we determine is in violation of said law. By proceeding, you acknowledge this policy and confirm you are in compliance with applicable NYC rental regulations.
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={handleBrokerFeeCancel}
                  className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleBrokerFeeConfirm}
                  className="px-4 py-2 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 transition-colors"
                >
                  I understand, proceed
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
