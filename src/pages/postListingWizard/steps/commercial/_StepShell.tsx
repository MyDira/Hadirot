import React from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { CommercialListingFormData } from '../../../postCommercial/commercialTypes';
import { StepTips } from '../../StepTips';

export interface CommercialStepProps {
  formData: CommercialListingFormData;
  updateFormData: (updates: Partial<CommercialListingFormData>) => void;
  isSale: boolean;
  onNext: () => void;
  onBack: () => void;
}

export interface StepTipsData {
  heading: string;
  bullets: string[];
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
  tips?: StepTipsData;
}

export function StepShell({
  title,
  children,
  onBack,
  onNext,
  canContinue = true,
  isSubmit = false,
  submitLabel = 'Submit Listing',
  submitting = false,
  tips,
}: StepShellProps) {
  const inner = (
    <div className="flex-1 min-w-0 space-y-5">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-5">{title}</h2>
        {children}
      </div>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 py-2.5 transition-colors"
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

  if (tips) {
    return (
      <div className="flex gap-8 items-start">
        {inner}
        <StepTips {...tips} />
      </div>
    );
  }

  return inner;
}
