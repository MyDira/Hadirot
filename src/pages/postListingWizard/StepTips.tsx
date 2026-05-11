import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface StepTipsProps {
  heading: string;
  bullets: string[];
}

export function StepTips({ heading, bullets }: StepTipsProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:block w-60 flex-shrink-0">
        <div className="sticky top-6 bg-white border border-gray-200 rounded-xl p-5">
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
