import React, { useState } from 'react';
import { UploadCloud, Globe, ClipboardPaste, ListChecks } from 'lucide-react';
import { IntakeUploadView } from '@/components/admin/intake/IntakeUploadView';
import { IntakeScrapeView } from '@/components/admin/intake/IntakeScrapeView';
import { IntakeInputView } from '@/components/admin/intake/IntakeInputView';
import { IntakeReviewView } from '@/components/admin/intake/IntakeReviewView';

type IntakeTab = 'upload' | 'scrape' | 'paste' | 'review';

/**
 * Listing Intake hub — one place to bring in leads from every source and work
 * them to publish:
 *   Upload  — pamphlet PDFs/photos (Luach HaTsibbur / Kol Berama / Heimish)
 *   Scrape  — luach.com website (button-triggered)
 *   Paste   — raw text blocks
 *   Review  — filterable table across all sources with new-vs-old + history,
 *             the call workflow, and one-click publish.
 */
export function IntakeSection() {
  const [tab, setTab] = useState<IntakeTab>('review');
  const [reviewSource, setReviewSource] = useState<string | undefined>(undefined);
  const [refreshKey, setRefreshKey] = useState(0);

  const goToReview = (source?: string) => {
    setReviewSource(source);
    setRefreshKey((k) => k + 1);
    setTab('review');
  };

  const tabClass = (active: boolean) =>
    `flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
      active ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'
    }`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Listing Intake</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Bring in leads from pamphlets and websites, then call, approve, and publish — no manual
          re-typing.
        </p>
      </div>

      <div className="inline-flex p-1 bg-gray-100 rounded-lg flex-wrap gap-1">
        <button onClick={() => setTab('upload')} className={tabClass(tab === 'upload')}>
          <UploadCloud className="w-4 h-4" /> Upload Pamphlet
        </button>
        <button onClick={() => setTab('scrape')} className={tabClass(tab === 'scrape')}>
          <Globe className="w-4 h-4" /> Scrape Website
        </button>
        <button onClick={() => setTab('paste')} className={tabClass(tab === 'paste')}>
          <ClipboardPaste className="w-4 h-4" /> Paste Text
        </button>
        <button onClick={() => setTab('review')} className={tabClass(tab === 'review')}>
          <ListChecks className="w-4 h-4" /> Review &amp; Publish
        </button>
      </div>

      {tab === 'upload' && <IntakeUploadView onParsed={(r) => goToReview(r.source)} />}
      {tab === 'scrape' && <IntakeScrapeView onScraped={() => goToReview('luach_com')} />}
      {tab === 'paste' && <IntakeInputView onParsed={() => goToReview('admin_intake')} />}
      {tab === 'review' && <IntakeReviewView initialSource={reviewSource} refreshKey={refreshKey} />}
    </div>
  );
}
