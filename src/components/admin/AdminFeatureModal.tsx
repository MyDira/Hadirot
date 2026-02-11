import React, { useState } from 'react';
import { X, Star, Clock, Loader2, DollarSign } from 'lucide-react';
import { stripeService, FEATURED_PLANS } from '../../services/stripe';
import type { Listing } from '../../config/supabase';

interface AdminFeatureModalProps {
  isOpen: boolean;
  onClose: () => void;
  listing: Listing;
  adminId: string;
  onSuccess: () => void;
}

type Mode = 'select' | 'free' | 'manual';

const DURATION_OPTIONS = [
  { id: '7day', label: '1 Week', days: 7 },
  { id: '14day', label: '2 Weeks', days: 14 },
  { id: '30day', label: '1 Month', days: 30 },
];

export function AdminFeatureModal({ isOpen, onClose, listing, adminId, onSuccess }: AdminFeatureModalProps) {
  const [mode, setMode] = useState<Mode>('select');
  const [selectedDuration, setSelectedDuration] = useState('14day');
  const [manualAmount, setManualAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const isCurrentlyFeatured = listing.is_featured &&
    listing.featured_expires_at &&
    new Date(listing.featured_expires_at) > new Date();

  const daysLeft = isCurrentlyFeatured && listing.featured_expires_at
    ? Math.max(0, Math.ceil((new Date(listing.featured_expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  const handleGrantFree = async () => {
    setLoading(true);
    setError(null);
    try {
      const opt = DURATION_OPTIONS.find(d => d.id === selectedDuration)!;
      await stripeService.adminGrantFeature(listing.id, opt.id, opt.days, adminId, 'free');
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to grant feature');
    } finally {
      setLoading(false);
    }
  };

  const handleRecordManual = async () => {
    setLoading(true);
    setError(null);
    try {
      const opt = DURATION_OPTIONS.find(d => d.id === selectedDuration)!;
      const cents = Math.round(parseFloat(manualAmount || '0') * 100);
      await stripeService.adminGrantFeature(listing.id, opt.id, opt.days, adminId, 'manual_payment', cents);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to record payment');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveFeature = async () => {
    setLoading(true);
    setError(null);
    try {
      await stripeService.adminRemoveFeature(listing.id);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to remove feature');
    } finally {
      setLoading(false);
    }
  };

  const resetMode = () => {
    setMode('select');
    setError(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="relative bg-white rounded-xl shadow-2xl max-w-md w-full mx-auto overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Star className="w-5 h-5 text-amber-500" />
            <h3 className="text-lg font-semibold text-[#273140]">Admin Feature Controls</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-lg hover:bg-gray-50">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4">
          <div className="bg-gray-50 rounded-lg px-4 py-3 mb-4">
            <p className="text-xs text-gray-500">Listing</p>
            <p className="text-sm font-medium text-[#273140] truncate">{listing.title || listing.location}</p>
            {isCurrentlyFeatured && (
              <p className="text-xs text-amber-600 mt-1">Currently featured - {daysLeft}d remaining</p>
            )}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {mode === 'select' && (
            <div className="space-y-2.5">
              <button
                onClick={() => setMode('free')}
                className="w-full flex items-center gap-3 px-4 py-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-left"
              >
                <Star className="w-5 h-5 text-amber-500 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-[#273140]">Free Feature</p>
                  <p className="text-xs text-gray-500">Grant featured status at no charge</p>
                </div>
              </button>
              <button
                onClick={() => setMode('manual')}
                className="w-full flex items-center gap-3 px-4 py-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-left"
              >
                <DollarSign className="w-5 h-5 text-green-600 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-[#273140]">Record Manual Payment</p>
                  <p className="text-xs text-gray-500">For offline payments (cash, Zelle, etc.)</p>
                </div>
              </button>
              {isCurrentlyFeatured && (
                <button
                  onClick={handleRemoveFeature}
                  disabled={loading}
                  className="w-full flex items-center gap-3 px-4 py-3 border border-red-200 rounded-lg hover:bg-red-50 transition-colors text-left"
                >
                  <X className="w-5 h-5 text-red-500 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-red-700">Remove Featured</p>
                    <p className="text-xs text-red-500">Immediately remove featured status</p>
                  </div>
                </button>
              )}
            </div>
          )}

          {(mode === 'free' || mode === 'manual') && (
            <div className="space-y-4">
              <button onClick={resetMode} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
                ← Back
              </button>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Duration</label>
                <div className="grid grid-cols-3 gap-2">
                  {DURATION_OPTIONS.map(opt => (
                    <button
                      key={opt.id}
                      onClick={() => setSelectedDuration(opt.id)}
                      className={`px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                        selectedDuration === opt.id
                          ? 'border-brand-600 bg-brand-50 text-brand-700'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {mode === 'manual' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Amount Received ($)</label>
                  <input
                    type="number"
                    value={manualAmount}
                    onChange={e => setManualAmount(e.target.value)}
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-brand-500 focus:border-brand-500"
                  />
                </div>
              )}

              <button
                onClick={mode === 'free' ? handleGrantFree : handleRecordManual}
                disabled={loading || (mode === 'manual' && !manualAmount)}
                className="w-full py-2.5 px-4 bg-brand-600 hover:bg-brand-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : mode === 'free' ? (
                  'Grant Free Feature'
                ) : (
                  'Record Payment & Activate'
                )}
              </button>
            </div>
          )}

          <p className="text-xs text-gray-400 mt-4">
            Promotion codes are managed in the Stripe Dashboard under Products → Coupons.
          </p>
        </div>
      </div>
    </div>
  );
}
