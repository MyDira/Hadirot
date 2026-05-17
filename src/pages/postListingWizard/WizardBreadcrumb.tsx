import React from 'react';
import { Check } from 'lucide-react';

const DEFAULT_STEP_LABELS = [
  'Property & Layout',
  'Price & Terms',
  'Photos & Description',
  'Location',
  'Features & Condition',
  'Contact & Review',
];

interface WizardBreadcrumbProps {
  currentStep: number;
  onGoToStep: (step: number) => void;
  stepLabels?: string[];
  allowFreeNavigation?: boolean;
}

export function WizardBreadcrumb({ currentStep, onGoToStep, stepLabels, allowFreeNavigation }: WizardBreadcrumbProps) {
  const STEP_LABELS = stepLabels && stepLabels.length > 0 ? stepLabels : DEFAULT_STEP_LABELS;
  return (
    <div className="w-full bg-white border-b border-gray-200">
      <div className="max-w-5xl mx-auto px-4 py-3">
        {/* Mobile: compact step counter */}
        <div className="flex sm:hidden items-center justify-between">
          <span className="text-sm font-medium text-gray-900">
            Step {currentStep + 1} of {STEP_LABELS.length}
          </span>
          <span className="text-sm text-gray-500">{STEP_LABELS[currentStep]}</span>
        </div>
        <div className="mt-2 sm:hidden h-1 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-accent-500 rounded-full transition-all duration-300"
            style={{ width: `${((currentStep + 1) / STEP_LABELS.length) * 100}%` }}
          />
        </div>

        {/* Desktop: step trail */}
        <ol className="hidden sm:flex items-center gap-0.5 overflow-x-auto">
          {STEP_LABELS.map((label, idx) => {
            const active = idx === currentStep;
            const completed = idx < currentStep;
            const future = idx > currentStep;
            const clickable = allowFreeNavigation ? true : (completed || active);

            return (
              <li key={label} className="flex items-center gap-0.5 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => clickable && onGoToStep(idx)}
                  disabled={!clickable}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors ${
                    active
                      ? 'bg-gray-100 font-bold text-gray-900'
                      : completed
                      ? 'font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 cursor-pointer'
                      : allowFreeNavigation
                      ? 'font-medium text-gray-400 hover:text-gray-700 hover:bg-gray-50 cursor-pointer'
                      : 'font-medium text-gray-300 cursor-not-allowed'
                  }`}
                >
                  <span
                    className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                      active
                        ? 'bg-accent-500 text-white'
                        : completed
                        ? 'bg-brand-700 text-white'
                        : 'bg-gray-200 text-gray-400'
                    }`}
                  >
                    {completed ? <Check className="w-3 h-3" strokeWidth={3} /> : idx + 1}
                  </span>
                  {label}
                </button>
                {idx < STEP_LABELS.length - 1 && (
                  <span className="text-gray-300 text-sm select-none">›</span>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
