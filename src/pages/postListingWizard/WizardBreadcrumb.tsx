import React from 'react';

const STEP_LABELS = [
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
}

export function WizardBreadcrumb({ currentStep, onGoToStep }: WizardBreadcrumbProps) {
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

            return (
              <li key={label} className="flex items-center gap-0.5 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => onGoToStep(idx)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors ${
                    active
                      ? 'bg-gray-100 font-bold text-gray-900'
                      : 'font-medium text-gray-400 hover:text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <span
                    className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                      active
                        ? 'bg-accent-500 text-white'
                        : 'bg-gray-200 text-gray-500'
                    }`}
                  >
                    {idx + 1}
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
