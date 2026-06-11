import React, { useState } from 'react';
import { ClipboardPaste, ListChecks } from 'lucide-react';
import { IntakeInputView } from '@/components/admin/intake/IntakeInputView';
import { IntakeReviewView } from '@/components/admin/intake/IntakeReviewView';
import type { ParseBlocksResult } from '@/services/aiIntake';

type IntakeTab = 'input' | 'review';

/**
 * AI Intake — bulk listing creation from raw text.
 * Input tab: paste text blocks (1..N listings each) with photos + account
 * assignment, parsed by Claude via the parse-bulk-listings edge function.
 * Review tab: confirm/edit the parsed listings and publish them live.
 */
export function AiIntakeSection() {
  const [tab, setTab] = useState<IntakeTab>('input');
  const [focusBatchId, setFocusBatchId] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<ParseBlocksResult | null>(null);

  const handleParsed = (result: ParseBlocksResult) => {
    setLastResult(result);
    setFocusBatchId(result.run_id);
    setTab('review');
  };

  const tabClass = (active: boolean) =>
    `flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
      active ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'
    }`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="inline-flex p-1 bg-gray-100 rounded-lg">
          <button onClick={() => setTab('input')} className={tabClass(tab === 'input')}>
            <ClipboardPaste className="w-4 h-4" /> Input
          </button>
          <button onClick={() => setTab('review')} className={tabClass(tab === 'review')}>
            <ListChecks className="w-4 h-4" /> Review &amp; Publish
          </button>
        </div>

        {lastResult && tab === 'review' && (
          <p className="text-sm text-gray-500">
            Last run: {lastResult.parsed} parsed, {lastResult.inserted} ready for review
            {lastResult.errors.length > 0 && (
              <span className="text-red-600"> · {lastResult.errors.length} block error(s)</span>
            )}
          </p>
        )}
      </div>

      {tab === 'input' ? (
        <IntakeInputView onParsed={handleParsed} />
      ) : (
        <IntakeReviewView focusBatchId={focusBatchId} />
      )}
    </div>
  );
}
