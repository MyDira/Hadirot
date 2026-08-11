import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, Clock, CheckCircle } from 'lucide-react';
import { useWizardUI } from './WizardContext';

export interface StepTipsData {
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
      <p className="flex items-center gap-2 text-xs text-accent-600 font-medium">
        <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
        Review and Post
      </p>
    );
  }

  return (
    <p className="flex items-center gap-2 text-xs text-gray-400 font-medium">
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
      className={`flex items-center gap-2 text-xs text-accent-600 font-medium transition-opacity duration-500 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-accent-500 flex-shrink-0" />
      Draft saved
    </div>
  );
}

// Compact dropdown, styled and wired the same way as PostListingWizard's
// "Change listing type" button — button trigger + outside-click-to-close panel.
export function StepTips({ heading, bullets }: StepTipsData) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { currentStep, totalSteps, lastSavedAt } = useWizardUI();

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Step changed out from under an open panel — close it so stale tips aren't left showing.
  useEffect(() => {
    setOpen(false);
  }, [heading]);

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-800 border border-gray-200 hover:border-gray-300 bg-white hover:bg-gray-50 px-3 py-1.5 rounded-lg transition-colors"
      >
        <span className="text-[10px] font-bold tracking-widest text-accent-600 uppercase">Tip</span>
        <span className="max-w-[10rem] truncate">{heading}</span>
        <ChevronDown className={`w-3.5 h-3.5 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-72 max-w-[calc(100vw-2rem)] bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden p-4">
          <ul className="space-y-2">
            {bullets.map((b, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                <span className="mt-1.5 flex-shrink-0 w-1.5 h-1.5 rounded-full bg-accent-400" />
                {b}
              </li>
            ))}
          </ul>
          <div className="mt-3 pt-3 border-t border-gray-100 space-y-1.5">
            <CountdownOrReview currentStep={currentStep} totalSteps={totalSteps} />
            <DraftSavedFlash lastSavedAt={lastSavedAt} />
          </div>
        </div>
      )}
    </div>
  );
}
