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
  title: string;
  currentStep: number;
  /** Furthest step index the user has reached by pressing Continue. */
  highWaterStep: number;
  onGoToStep: (step: number) => void;
  stepLabels?: string[];
}

export function WizardBreadcrumb({ title, currentStep, highWaterStep, onGoToStep, stepLabels }: WizardBreadcrumbProps) {
  const STEP_LABELS = stepLabels && stepLabels.length > 0 ? stepLabels : DEFAULT_STEP_LABELS;
  return (
    <div className="w-full bg-white border-b border-gray-200">
      <div className="max-w-5xl mx-auto px-4 py-3">
        {/* Page heading + step counter, together in one row on every breakpoint */}
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-lg font-bold text-gray-900 flex-shrink-0">{title}</h1>
          <span className="text-sm text-gray-500 text-right truncate">
            Step {currentStep + 1} of {STEP_LABELS.length} · {STEP_LABELS[currentStep]}
          </span>
        </div>
        <div className="mt-2 sm:hidden h-1 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-accent-500 rounded-full transition-all duration-300"
            style={{ width: `${((currentStep + 1) / STEP_LABELS.length) * 100}%` }}
          />
        </div>

        {/* Step trail — same click/visited/active rules on every breakpoint, scrolls horizontally when it doesn't fit */}
        <ol className="flex items-center gap-0.5 overflow-x-auto mt-2 sm:mt-0">
          {STEP_LABELS.map((label, idx) => {
            const active = idx === currentStep;
            const visited = idx <= highWaterStep;
            const showCheck = idx < highWaterStep;

            return (
              <li key={label} className="flex items-center gap-0.5 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => visited && !active && onGoToStep(idx)}
                  disabled={active || !visited}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors ${
                    active
                      ? 'bg-gray-100 font-bold text-gray-900 cursor-default'
                      : visited
                      ? 'font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 cursor-pointer'
                      : 'font-medium text-gray-300 cursor-not-allowed'
                  }`}
                >
                  <span
                    className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                      visited
                        ? 'bg-accent-500 text-white'
                        : 'bg-gray-200 text-gray-500'
                    }`}
                  >
                    {showCheck ? <Check className="w-3 h-3" strokeWidth={3} /> : idx + 1}
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
