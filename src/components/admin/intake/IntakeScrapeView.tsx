import React, { useEffect, useState } from 'react';
import { Globe, Loader2, RefreshCw } from 'lucide-react';
import type { ScrapeRun } from '@/config/supabase';
import { aiIntakeService, type ScrapeMode, type ScrapeResult } from '@/services/aiIntake';
import { Toast } from '@/components/shared/Toast';

interface IntakeScrapeViewProps {
  onScraped: (result: ScrapeResult) => void;
}

const MODES: Array<{ value: ScrapeMode; label: string; hint: string }> = [
  { value: 'since_last', label: 'Since last scrape', hint: 'Only listings posted since the last completed run.' },
  { value: 'range', label: 'Date range', hint: 'Only listings posted inside the dates you pick.' },
  { value: 'all', label: 'Everything', hint: 'No date filter — re-reads the whole index. Slower and costs more.' },
];

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

export function IntakeScrapeView({ onScraped }: IntakeScrapeViewProps) {
  const [mode, setMode] = useState<ScrapeMode>('since_last');
  const [since, setSince] = useState(daysAgo(7));
  const [until, setUntil] = useState(today());
  const [pages, setPages] = useState(3);
  const [limit, setLimit] = useState(60);
  const [includePromoted, setIncludePromoted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
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

  const rangeInvalid = mode === 'range' && !!since && !!until && since > until;

  const handleScrape = async () => {
    if (busy || rangeInvalid) return;
    setBusy(true);
    setResult(null);
    setProgress(null);
    try {
      const res = await aiIntakeService.scrapeLuachCom(
        {
          mode,
          since: mode === 'range' ? since : null,
          until: mode === 'range' ? until : null,
          pages,
          limit,
          includePromoted,
        },
        (done, total) => setProgress({ done, total }),
      );
      setResult(res);
      await loadLastRun();
      if (res.inserted > 0 || res.updated > 0) onScraped(res);
      else if (res.pages_fetched === 0)
        setToast(
          res.cutoff
            ? `Nothing posted on or after ${res.cutoff} — already up to date.`
            : 'Scrape finished — no listings matched.',
        );
      else setToast('Scrape finished — no new listings found.');
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Scrape failed');
    } finally {
      setBusy(false);
      setProgress(null);
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
              Pulls apartment listings from luach.com&apos;s real-estate section and adds new ones as
              leads. Listings are filtered by their posted date before anything is downloaded, so
              older ones cost nothing. Already-seen listings just update their history — they
              won&apos;t duplicate.
            </p>
          </div>
        </div>

        {/* Date window */}
        <div className="mt-5">
          <label className="block text-xs font-medium text-gray-600 mb-1.5">Posted date</label>
          <div className="flex flex-wrap gap-2">
            {MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setMode(m.value)}
                title={m.hint}
                className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                  mode === m.value
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-gray-400 mt-1.5">
            {MODES.find((m) => m.value === mode)?.hint}
          </p>
        </div>

        {mode === 'range' && (
          <div className="flex flex-wrap items-end gap-4 mt-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">From</label>
              <input
                type="date"
                value={since}
                max={until || undefined}
                onChange={(e) => setSince(e.target.value)}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">To</label>
              <input
                type="date"
                value={until}
                min={since || undefined}
                onChange={(e) => setUntil(e.target.value)}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {rangeInvalid && (
              <p className="text-xs text-red-600 pb-2">“From” must be on or before “To”.</p>
            )}
          </div>
        )}

        {/* Crawl limits */}
        <div className="flex flex-wrap items-end gap-4 mt-5 pt-5 border-t border-gray-100">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Max index pages</label>
            <input
              type="number"
              min={1}
              max={10}
              value={pages}
              onChange={(e) => setPages(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
              className="w-24 px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-[11px] text-gray-400 mt-1">Stops early once past the dates</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Max listings</label>
            <input
              type="number"
              min={1}
              max={120}
              value={limit}
              onChange={(e) => setLimit(Math.max(1, Math.min(120, Number(e.target.value) || 60)))}
              className="w-24 px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={handleScrape}
            disabled={busy || rangeInvalid}
            className="ml-auto flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {busy ? 'Scraping…' : 'Scrape luach.com'}
          </button>
        </div>

        <label className="flex items-start gap-2 mt-4 text-sm text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={includePromoted}
            onChange={(e) => setIncludePromoted(e.target.checked)}
            className="mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span>
            Include promoted listings
            <span className="block text-[11px] text-gray-400">
              luach.com pins a paid block to the top of page 1. Those aren&apos;t in date order and
              are usually older, so they&apos;re skipped by default.
            </span>
          </span>
        </label>

        {busy && (
          <div className="mt-4">
            <p className="text-sm text-gray-500 flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              {!progress
                ? 'Reading the luach.com index…'
                : progress.total === 0
                  ? 'Wrapping up…'
                  : `Fetching pages and reading listings with AI — batch ${Math.min(
                      progress.done + 1,
                      progress.total,
                    )} of ${progress.total}…`}
            </p>
            {progress && progress.total > 0 && (
              <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 transition-all duration-300"
                  style={{ width: `${(progress.done / progress.total) * 100}%` }}
                />
              </div>
            )}
          </div>
        )}

        {result && (
          <div className="mt-4 text-sm bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-green-800">
            <div>
              Read {result.cards_seen} listing{result.cards_seen === 1 ? '' : 's'} on the index ·
              fetched {result.pages_fetched} · <strong>{result.inserted}</strong> new ·{' '}
              {result.updated} updated · {result.geocoded} geocoded
              {result.errors.length > 0 && (
                <span className="text-amber-700"> · {result.errors.length} error(s)</span>
              )}
            </div>
            <div className="text-[11px] text-green-700/80 mt-1">
              Skipped {result.skipped_by_date} outside the date window
              {result.skipped_promoted > 0 && ` · ${result.skipped_promoted} promoted`}
              {result.cutoff && ` · cutoff ${result.cutoff}`} · {result.ai_calls} AI call
              {result.ai_calls === 1 ? '' : 's'}
            </div>
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
