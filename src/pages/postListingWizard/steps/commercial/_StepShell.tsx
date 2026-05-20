import React from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { CommercialListingFormData } from '../../../postCommercial/commercialTypes';

export interface CommercialStepProps {
  formData: CommercialListingFormData;
  updateFormData: (updates: Partial<CommercialListingFormData>) => void;
  isSale: boolean;
  onNext: () => void;
  onBack: () => void;
}

interface StepShellProps {
  title: string;
  children: React.ReactNode;
  onBack: () => void;
  onNext?: () => void;
  canContinue?: boolean;
  isSubmit?: boolean;
  submitLabel?: string;
  submitting?: boolean;
}

/**
 * Shared layout for commercial wizard steps — title card + Back/Continue footer.
 * Steps render their own field UI inside `children`.
 */
export function StepShell({
  title,
  children,
  onBack,
  onNext,
  canContinue = true,
  isSubmit = false,
  submitLabel = 'Submit Listing',
  submitting = false,
}: StepShellProps) {
  return (
    <div className="flex-1 min-w-0 space-y-5">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-5">{title}</h2>
        {children}
      </div>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        {onNext && (
          <button
            type="button"
            onClick={onNext}
            disabled={!canContinue || submitting}
            className="flex items-center gap-2 bg-accent-500 text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-accent-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmit ? (submitting ? 'Submitting…' : submitLabel) : 'Continue'}
            {!isSubmit && <ArrowRight className="w-4 h-4" />}
          </button>
        )}
      </div>
    </div>
  );
}
