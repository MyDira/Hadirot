import React, { useEffect, useState } from 'react';
import { Globe, Loader2, RefreshCw } from 'lucide-react';
import type { ScrapeRun } from '@/config/supabase';
import { aiIntakeService, type ScrapeResult } from '@/services/aiIntake';
import { Toast } from '@/components/shared/Toast';

interface IntakeScrapeViewProps {
  onScraped: (result: ScrapeResult) => void;
}

export function IntakeScrapeView({ onScraped }: IntakeScrapeViewProps) {
  const [pages, setPages] = useState(1);
  const [limit, setLimit] = useState(40);
  const [busy, setBusy] = useState(false);
  const [lastRun, setLastRun] = useState<ScrapeRun | null>(null);
  const [result, setResult] = useState<ScrapeResult | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const loadLastRun = async () => {
    try {
      const runs = await aiIntakeService.getRuns(20);
      setLastRun(runs.find((r) => r.source === 'luach_com') ?? null);
    } catch {
      /* non-critical */
    }
  };

  useEffect(() => {
    loadLastRun();
  }, []);

  const handleScrape = async () => {
    if (busy) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await aiIntakeService.scrapeLuachCom({ pages, limit });
      setResult(res);
      await loadLastRun();
      if (res.inserted > 0 || res.updated > 0) onScraped(res);
      else setToast('Scrape finished — no new listings found.');
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Scrape failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
            <Globe className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Scrape luach.com</h3>
            <p className="text-sm text-gray-500 mt-0.5">
              Pulls the newest apartment listings from luach.com&apos;s real-estate section and adds
              new ones as leads. Already-seen listings just update their history — they won&apos;t
              duplicate.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-4 mt-5">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Index pages</label>
            <input
              type="number"
              min={1}
              max={10}
              value={pages}
              onChange={(e) => setPages(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
              className="w-24 px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-[11px] text-gray-400 mt-1">1 = newest only</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Max listings</label>
            <input
              type="number"
              min={1}
              max={120}
              value={limit}
              onChange={(e) => setLimit(Math.max(1, Math.min(120, Number(e.target.value) || 40)))}
              className="w-24 px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={handleScrape}
            disabled={busy}
            className="ml-auto flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {busy ? 'Scraping…' : 'Scrape luach.com'}
          </button>
        </div>

        {busy && (
          <p className="text-sm text-gray-500 mt-4 flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Fetching pages and reading listings with
            AI — this can take a minute…
          </p>
        )}

        {result && (
          <div className="mt-4 text-sm bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-green-800">
            Fetched {result.pages_fetched} page{result.pages_fetched === 1 ? '' : 's'} ·{' '}
            <strong>{result.inserted}</strong> new · {result.updated} updated · {result.geocoded}{' '}
            geocoded
            {result.errors.length > 0 && (
              <span className="text-amber-700"> · {result.errors.length} error(s)</span>
            )}
          </div>
        )}
      </div>

      {lastRun && (
        <p className="text-xs text-gray-400">
          Last luach.com scrape: {new Date(lastRun.started_at).toLocaleString()} —{' '}
          {lastRun.listings_inserted} new, {lastRun.listings_updated} updated
        </p>
      )}

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
