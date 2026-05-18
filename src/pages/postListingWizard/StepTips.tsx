import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, ChevronUp, Clock, CheckCircle } from 'lucide-react';
import { useWizardUI } from './WizardContext';

interface StepTipsProps {
  heading: string;
  bullets: string[];
}

function CountdownOrReview({ currentStep, totalSteps }: { currentStep: number; totalSteps: number }) {
  const finalIdx = totalSteps - 1;
  const isFinal = currentStep >= finalIdx;
  // Distribute time across non-final steps. Total budget ~90s for 6-step wizards, ~120s for 7-step.
  const totalBudget = totalSteps >= 7 ? 120 : 90;
  const perStep = Math.round(totalBudget / Math.max(1, finalIdx) / 5) * 5; // round to nearest 5s
  const remaining = Math.max(0, totalBudget - currentStep * perStep);

  if (isFinal) {
    return (
      <p className="flex items-center gap-2 text-xs text-accent-600 font-medium px-1">
        <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
        Review and Post
      </p>
    );
  }

  return (
    <p className="flex items-center gap-2 text-xs text-gray-400 font-medium px-1">
      <Clock className="w-3 h-3 flex-shrink-0" />
      ~{remaining}s remaining
    </p>
  );
}

function DraftSavedFlash({ lastSavedAt }: { lastSavedAt: Date | null }) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevTs = useRef<number | null>(null);

  useEffect(() => {
    if (!lastSavedAt) return;
    const ts = lastSavedAt.getTime();
    if (prevTs.current === ts) return;
    prevTs.current = ts;

    setVisible(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setVisible(false), 2500);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [lastSavedAt]);

  return (
    <div
      className={`flex items-center gap-2 text-xs text-accent-600 font-medium px-1 transition-opacity duration-500 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-accent-500 flex-shrink-0" />
      Draft saved
    </div>
  );
}

export function StepTips({ heading, bullets }: StepTipsProps) {
  const [open, setOpen] = useState(false);
  const { currentStep, totalSteps, lastSavedAt } = useWizardUI();

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:block w-60 flex-shrink-0">
        <div className="sticky top-6 space-y-3">
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs font-bold tracking-widest text-accent-600 uppercase">TIP</span>
              <span className="text-sm font-semibold text-gray-800">{heading}</span>
            </div>
            <ul className="space-y-2">
              {bullets.map((b, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                  <span className="mt-1.5 flex-shrink-0 w-1.5 h-1.5 rounded-full bg-accent-400" />
                  {b}
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-1.5">
            <CountdownOrReview currentStep={currentStep} totalSteps={totalSteps} />
            <DraftSavedFlash lastSavedAt={lastSavedAt} />
          </div>
        </div>
      </aside>

      {/* Mobile accordion */}
      <div className="lg:hidden border border-gray-200 rounded-xl overflow-hidden mb-4">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="w-full flex items-center justify-between px-4 py-3 bg-white"
        >
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold tracking-widest text-accent-600 uppercase">TIP</span>
            <span className="text-sm font-semibold text-gray-800">{heading}</span>
          </div>
          {open ? (
            <ChevronUp className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          )}
        </button>
        {open && (
          <ul className="px-4 pb-4 space-y-2 bg-white">
            {bullets.map((b, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                <span className="mt-1.5 flex-shrink-0 w-1.5 h-1.5 rounded-full bg-accent-400" />
                {b}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
