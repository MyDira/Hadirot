import React, { useState } from 'react';
import { Plus, Trash2, ArrowLeft, Crown } from 'lucide-react';

export interface SourceEntry {
  name: string;
  link: string;
}

interface Tier3SourcesFormProps {
  onSubmit: (sources: SourceEntry[]) => void;
  onBack: () => void;
  loading: boolean;
}

export function Tier3SourcesForm({ onSubmit, onBack, loading }: Tier3SourcesFormProps) {
  const [sources, setSources] = useState<SourceEntry[]>([{ name: '', link: '' }]);

  const addSource = () => {
    if (sources.length < 10) setSources([...sources, { name: '', link: '' }]);
  };

  const removeSource = (idx: number) => {
    if (sources.length > 1) {
      setSources(sources.filter((_, i) => i !== idx));
    }
  };

  const updateSource = (idx: number, field: keyof SourceEntry, value: string) => {
    setSources(sources.map((s, i) => (i === idx ? { ...s, [field]: value } : s)));
  };

  const validSources = sources.filter((s) => s.name.trim());

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validSources.length > 0) onSubmit(validSources);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to plans
      </button>

      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-full bg-[#1E4A74]/10 flex items-center justify-center">
            <Crown className="w-5 h-5 text-[#1E4A74]" />
          </div>
          <h3 className="text-xl font-bold text-gray-900">VIP / Full Service Setup</h3>
        </div>
        <p className="text-sm text-gray-600">
          Tell us where you regularly post your listings. We'll check these sources twice a week
          and post any new listings we find on Hadirot for you.
        </p>
      </div>

      <div className="space-y-4">
        <label className="block text-sm font-medium text-gray-700">
          Where do you usually post your listings?
        </label>
        {sources.map((source, idx) => (
          <div key={idx} className="flex items-start gap-2">
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="text"
                value={source.name}
                onChange={(e) => updateSource(idx, 'name', e.target.value)}
                placeholder="Source name (e.g., BP Apartments WhatsApp)"
                className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#1E4A74] focus:ring-1 focus:ring-[#1E4A74] outline-none"
              />
              <input
                type="text"
                value={source.link}
                onChange={(e) => updateSource(idx, 'link', e.target.value)}
                placeholder="Link / URL (optional)"
                className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#1E4A74] focus:ring-1 focus:ring-[#1E4A74] outline-none"
              />
            </div>
            {sources.length > 1 && (
              <button
                type="button"
                onClick={() => removeSource(idx)}
                className="p-2 mt-0.5 text-gray-400 hover:text-red-500 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}

        {sources.length < 10 && (
          <button
            type="button"
            onClick={addSource}
            className="flex items-center gap-1.5 text-sm text-[#1E4A74] hover:text-[#163a5e] font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add another source
          </button>
        )}
      </div>

      <div className="flex items-center justify-between pt-2">
        <p className="text-xs text-gray-400">
          $200/month subscription via Stripe
        </p>
        <button
          type="submit"
          disabled={validSources.length === 0 || loading}
          className="flex items-center gap-2 bg-accent-500 text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-accent-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <Crown className="w-4 h-4" />
          )}
          Subscribe &mdash; $200/mo
        </button>
      </div>
    </form>
  );
}
