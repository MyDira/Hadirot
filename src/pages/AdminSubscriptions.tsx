// Admin Subscriptions panel — manage Agent/VIP listing subscriptions and
// individual paid listings.
//
// Route: /admin/subscriptions
//
// Two tabs:
//   - subscribers : listing_subscriptions sorted by upcoming renewal
//   - paid        : listings with payment_kind='individual_paid' sorted by days remaining
//
// Admin-only. Non-admins redirected to /.

import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Plus,
  Crown,
  ShieldCheck,
  Search,
  X,
  Calendar,
  AlertTriangle,
  Check,
  Trash2,
  Pencil,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { subscriptionsService } from '../services/subscriptions';
import { paymentsService } from '../services/payments';
import { monetizationStatusService, type MonetizationStatus } from '../services/monetizationStatus';
import { GrantDaysModal } from '../components/admin/GrantDaysModal';
import {
  formatCents,
  type ListingSubscription,
  type ListingSubscriptionPlan,
  type PaymentKind,
} from '../types/monetization';

type TabKey = 'subscribers' | 'paid';

interface SubscriberRow extends ListingSubscription {
  user?: { id: string; full_name: string; email: string; phone?: string };
}

interface PaidListingRow {
  id: string;
  user_id: string;
  paid_until: string | null;
  neighborhood: string | null;
  location: string | null;
  price: number | null;
  payment_kind: PaymentKind;
  user?: { full_name: string; email: string };
}

function daysFromNow(iso: string | null | undefined): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function StatusPill({ status }: { status: ListingSubscription['status'] }) {
  const map: Record<string, { label: string; cls: string }> = {
    active: { label: 'Active', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
    admin_active: { label: 'Admin active', cls: 'bg-indigo-50 text-indigo-800 border-indigo-200' },
    trial: { label: 'Trial', cls: 'bg-teal-50 text-teal-800 border-teal-200' },
    past_due: { label: 'Past due', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
    cancelled: { label: 'Cancelled', cls: 'bg-gray-100 text-gray-700 border-gray-200' },
    expired: { label: 'Expired', cls: 'bg-gray-100 text-gray-700 border-gray-200' },
    pending: { label: 'Pending', cls: 'bg-blue-50 text-blue-800 border-blue-200' },
  };
  const m = map[status] || { label: status, cls: 'bg-gray-100 text-gray-700 border-gray-200' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full border ${m.cls}`}>
      {m.label}
    </span>
  );
}

/** Trial countdown text — shown in the "Next renewal" column for trial rows.
 *  Prefers current_period_end (set by Stripe webhook to the trial-end /
 *  first-charge date); falls back to created_at + 14d if not present. */
function trialEndsIn(row: { created_at: string; current_period_end: string | null }): { date: Date; daysLeft: number } {
  const trialEnd = row.current_period_end
    ? new Date(row.current_period_end)
    : new Date(new Date(row.created_at).getTime() + 14 * 24 * 60 * 60 * 1000);
  const daysLeft = Math.ceil((trialEnd.getTime() - Date.now()) / 86400000);
  return { date: trialEnd, daysLeft };
}

function PlanBadge({ plan }: { plan: ListingSubscriptionPlan }) {
  return plan === 'vip' ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-purple-50 text-purple-800 border border-purple-200">
      <Crown className="w-3 h-3" /> VIP
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-blue-50 text-blue-800 border border-blue-200">
      <ShieldCheck className="w-3 h-3" /> Agent
    </span>
  );
}

// =====================================================================
// Add Subscriber Modal
// =====================================================================

interface AddSubscriberModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  adminId: string;
}

/** "manual" = mark subscribed in the DB with no Stripe charge (admin grant).
 *  "stripe" = open a real Stripe Checkout scoped to the target user (admin keys
 *  the caller's card over the phone); the webhook creates the subscription. */
type AddMode = 'manual' | 'stripe';

function AddSubscriberModal({ open, onClose, onCreated, adminId }: AddSubscriberModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Array<{ id: string; full_name: string; email: string }>>([]);
  const [searching, setSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState<{ id: string; full_name: string; email: string } | null>(null);
  const [mode, setMode] = useState<AddMode>('manual');
  const [plan, setPlan] = useState<ListingSubscriptionPlan>('agent');
  const [day, setDay] = useState<number>(new Date().getUTCDate() > 28 ? 1 : new Date().getUTCDate());
  const [startDate, setStartDate] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults([]);
      setSelectedUser(null);
      setMode('manual');
      setPlan('agent');
      setDay(new Date().getUTCDate() > 28 ? 1 : new Date().getUTCDate());
      setStartDate('');
      setNotes('');
      setErr(null);
      setBusy(false);
      setCheckoutUrl(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const found = await subscriptionsService.searchProfiles(query);
        if (!cancelled) setResults(found);
      } catch (e) {
        if (!cancelled) setErr((e as Error).message);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, open]);

  if (!open) return null;

  const handleSubmit = async () => {
    if (!selectedUser) {
      setErr('Pick an account first.');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      if (mode === 'stripe') {
        // Open the real Stripe Checkout scoped to the target user; admin keys the
        // caller's card. The webhook creates the listing_subscriptions row.
        const res = await subscriptionsService.adminCreateSubscriptionCheckout({
          targetUserId: selectedUser.id,
          plan,
        });
        setCheckoutUrl(res.url);
        window.open(res.url, '_blank', 'noopener');
        // Don't close — show the fallback link + Done button.
      } else {
        await subscriptionsService.adminCreate({
          userId: selectedUser.id,
          plan,
          billingDayOfMonth: day,
          adminId,
          notes: notes.trim() || undefined,
          startDate: startDate || undefined,
        });
        onCreated();
        onClose();
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/40 p-4 sm:p-6">
      <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-gray-200 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Add subscriber</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {mode === 'stripe'
                ? "Open a real Stripe Checkout scoped to this user — key the caller's card."
                : 'Mark an account as subscribed without going through Stripe.'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1 -m-1 text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 overflow-y-auto flex-1 space-y-5">
          {err && (
            <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              {err}
            </div>
          )}

          {checkoutUrl ? (
            <div className="space-y-3">
              <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg p-3">
                Stripe Checkout opened in a new tab for{' '}
                <span className="font-medium">{selectedUser?.email}</span>. Key the card the
                caller gave you. If a pop-up blocker stopped it, use the link below. The
                subscription appears here once payment completes.
              </div>
              <a
                href={checkoutUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm font-semibold text-accent-600 hover:text-accent-700"
              >
                <Search className="w-4 h-4" />
                Open Stripe Checkout
              </a>
            </div>
          ) : (
          <>
          {/* Mode toggle */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMode('manual')}
              className={`p-3 rounded-lg border-2 text-left transition-colors ${
                mode === 'manual' ? 'border-accent-500 bg-accent-50/40' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="text-sm font-semibold text-gray-900">Manual grant</div>
              <div className="text-xs text-gray-500 mt-0.5">No charge. Marks the account as subscribed.</div>
            </button>
            <button
              type="button"
              onClick={() => setMode('stripe')}
              className={`p-3 rounded-lg border-2 text-left transition-colors ${
                mode === 'stripe' ? 'border-accent-500 bg-accent-50/40' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="text-sm font-semibold text-gray-900">Stripe checkout</div>
              <div className="text-xs text-gray-500 mt-0.5">Charge the caller's card via real Stripe.</div>
            </button>
          </div>

          {/* Step 1 — search account */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              1. Pick an account
            </label>
            {selectedUser ? (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-gray-900">{selectedUser.full_name || '(no name)'}</div>
                  <div className="text-xs text-gray-600">{selectedUser.email}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedUser(null)}
                  className="text-xs text-blue-700 hover:text-blue-900 font-medium"
                >
                  Change
                </button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search by name or email…"
                    className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-accent-500 focus:border-accent-500"
                  />
                </div>
                {searching && (
                  <div className="mt-2 text-xs text-gray-500 flex items-center gap-2">
                    <div className="w-3 h-3 border-2 border-gray-300 border-t-accent-500 rounded-full animate-spin" />
                    Searching…
                  </div>
                )}
                {!searching && results.length > 0 && (
                  <div className="mt-2 border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-48 overflow-y-auto">
                    {results.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setSelectedUser(r)}
                        className="w-full text-left px-3 py-2 hover:bg-gray-50"
                      >
                        <div className="text-sm font-medium text-gray-900">{r.full_name || '(no name)'}</div>
                        <div className="text-xs text-gray-500">{r.email}</div>
                      </button>
                    ))}
                  </div>
                )}
                {!searching && query.trim().length >= 2 && results.length === 0 && (
                  <div className="mt-2 text-xs text-gray-500">No matches.</div>
                )}
              </>
            )}
          </div>

          {/* Step 2 — plan */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              2. Plan
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPlan('agent')}
                className={`p-3 rounded-lg border-2 text-left transition-colors ${
                  plan === 'agent' ? 'border-accent-500 bg-accent-50/40' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <ShieldCheck className="w-4 h-4 text-accent-700" />
                  <span className="text-sm font-semibold text-gray-900">Agent</span>
                </div>
                <div className="text-xs text-gray-500">$50/mo · up to 7 listings</div>
              </button>
              <button
                type="button"
                onClick={() => setPlan('vip')}
                className={`p-3 rounded-lg border-2 text-left transition-colors ${
                  plan === 'vip' ? 'border-accent-500 bg-accent-50/40' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Crown className="w-4 h-4 text-accent-700" />
                  <span className="text-sm font-semibold text-gray-900">VIP</span>
                </div>
                <div className="text-xs text-gray-500">$100/mo · unlimited listings</div>
              </button>
            </div>
          </div>

          {/* Manual-only: billing day, start date, notes. In Stripe mode the
              billing cycle and charges are managed by Stripe itself. */}
          {mode === 'manual' && (
            <>
              {/* Step 3 — day of month */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  3. Day of month for renewal
                </label>
                <div className="flex items-center gap-3">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  <input
                    type="number"
                    min={1}
                    max={28}
                    value={day}
                    onChange={(e) => setDay(Math.max(1, Math.min(28, parseInt(e.target.value || '1', 10))))}
                    className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-accent-500 focus:border-accent-500"
                  />
                  <span className="text-xs text-gray-500">1–28. Subscription rolls forward by one month each cycle.</span>
                </div>
              </div>

              {/* Step 4 — optional start date */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  4. Start date (optional)
                </label>
                <div className="flex items-center gap-3">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-accent-500 focus:border-accent-500"
                  />
                  <span className="text-xs text-gray-500">
                    Defaults to today. First renewal is the next billing day after this date.
                  </span>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Notes (optional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Why is this admin grant being made?"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-accent-500 focus:border-accent-500"
                />
              </div>
            </>
          )}
          </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-2">
          {checkoutUrl ? (
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-accent-500 hover:bg-accent-600 text-white rounded-lg text-sm font-semibold"
            >
              Done
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={busy || !selectedUser}
                className="px-4 py-2 bg-accent-500 hover:bg-accent-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
              >
                {busy ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    {mode === 'stripe' ? 'Open Stripe Checkout' : 'Create subscription'}
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// The GrantDaysModal previously inlined here moved to
// src/components/admin/GrantDaysModal.tsx so AdminPanel can reuse it.

// =====================================================================
// Main page
// =====================================================================

export function AdminSubscriptions() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<TabKey>(params.get('tab') === 'paid' ? 'paid' : 'subscribers');
  const [subscribers, setSubscribers] = useState<SubscriberRow[]>([]);
  const [paidListings, setPaidListings] = useState<PaidListingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [grantListingId, setGrantListingId] = useState<string | null>(null);
  const [editingDayId, setEditingDayId] = useState<string | null>(null);
  const [editingDayValue, setEditingDayValue] = useState<number>(1);
  // Phase J: master switch.
  const [monetization, setMonetization] = useState<MonetizationStatus>({ enabled: false, enabledAt: null });
  const [activating, setActivating] = useState(false);
  const [activationResult, setActivationResult] = useState<string | null>(null);

  // Admin guard
  useEffect(() => {
    if (profile === undefined) return;
    if (!profile?.is_admin) {
      navigate('/');
    }
  }, [profile, navigate]);

  // Sync tab param
  useEffect(() => {
    const t = params.get('tab') === 'paid' ? 'paid' : 'subscribers';
    if (t !== tab) setTab(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const loadData = async () => {
    if (!profile?.is_admin) return;
    setLoading(true);
    setErr(null);
    try {
      const [subs, paid, status] = await Promise.all([
        subscriptionsService.listAll(),
        paymentsService.adminListPaidListings(),
        monetizationStatusService.get(),
      ]);
      setSubscribers(subs);
      setPaidListings(paid as PaidListingRow[]);
      setMonetization(status);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleActivate = async () => {
    const confirmed = window.confirm(
      'Activate monetization now?\n\n' +
      'This flips the master switch ON and immediately:\n' +
      '  • Starts the 14-day free trial on every SINGULAR active rental (no other active listing shares its phone), staggered over 3 days.\n' +
      '  • Leaves high-volume listings (2+ active rentals sharing a phone — agents) exactly as today: freshness window only, no payment required.\n' +
      '  • Tags inactive rentals as legacy_free (no payment required).\n' +
      '  • Turns on the wizard payment cards, dashboard pills, and SMS reminders.\n\n' +
      'You can disable monetization again later, but the timestamps will stay.\n\n' +
      'Continue?',
    );
    if (!confirmed) return;
    setActivating(true);
    setErr(null);
    try {
      const res = await monetizationStatusService.activate();
      setActivationResult(
        `Monetization activated. ${res.trialedCount} singular rentals entered the 14-day trial (staggered over 3 days); ` +
        `${res.highVolumeCount} high-volume (shared-phone) rentals left as-is; ` +
        `${res.legacyCount} inactive rentals tagged legacy_free.`,
      );
      await loadData();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setActivating(false);
    }
  };

  const handleDeactivate = async () => {
    if (!window.confirm('Turn monetization OFF? Existing payment tags stay on listings, but the wizard, dashboard, and cron stop enforcing payment rules until reactivated.')) {
      return;
    }
    setActivating(true);
    setErr(null);
    try {
      await monetizationStatusService.deactivate();
      setActivationResult('Monetization deactivated. Existing payment tags preserved; re-enabling skips re-tagging.');
      await loadData();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setActivating(false);
    }
  };

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.is_admin]);

  const handleTabChange = (t: TabKey) => {
    setTab(t);
    setParams({ tab: t }, { replace: true });
  };

  const handleCancelSub = async (id: string) => {
    if (!window.confirm('Cancel this subscription? All subscription-covered listings will be deactivated unless they have an individual paid balance.')) return;
    try {
      await subscriptionsService.adminCancel(id);
      await loadData();
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const handleSaveDay = async (id: string) => {
    try {
      await subscriptionsService.adminUpdateBillingDay(id, editingDayValue);
      setEditingDayId(null);
      await loadData();
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  // ------ Sorted views ------

  const sortedSubscribers = useMemo(() => {
    return [...subscribers].sort((a, b) => {
      // Active first (including trial), then by next renewal / trial end.
      const aActive = ['active', 'admin_active', 'past_due', 'trial'].includes(a.status);
      const bActive = ['active', 'admin_active', 'past_due', 'trial'].includes(b.status);
      if (aActive !== bActive) return aActive ? -1 : 1;
      // For trial rows the effective renewal date is trial end (created_at + 14d).
      const aEnd = a.status === 'trial'
        ? trialEndsIn(a).date.getTime()
        : a.current_period_end ? new Date(a.current_period_end).getTime() : Infinity;
      const bEnd = b.status === 'trial'
        ? trialEndsIn(b).date.getTime()
        : b.current_period_end ? new Date(b.current_period_end).getTime() : Infinity;
      return aEnd - bEnd;
    });
  }, [subscribers]);

  if (profile === undefined) return null;
  if (!profile?.is_admin) return null;

  return (
    <div className="">
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link
            to="/admin"
            className="text-gray-400 hover:text-gray-600"
            aria-label="Back to admin"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-gray-900">Subscriptions & Paid Listings</h1>
            <p className="text-sm text-gray-500">
              Manage Agent / VIP subscriptions and individual paid residential rentals.
            </p>
          </div>
          {tab === 'subscribers' && (
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="inline-flex items-center gap-2 bg-accent-500 hover:bg-accent-600 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add subscriber
            </button>
          )}
        </div>

        {/* Phase J: master-switch banner */}
        <div
          className={`mb-4 rounded-xl border p-4 flex items-start gap-3 ${
            monetization.enabled
              ? 'bg-emerald-50 border-emerald-200'
              : 'bg-amber-50 border-amber-300'
          }`}
        >
          <div className={`w-10 h-10 rounded-lg border flex items-center justify-center flex-shrink-0 ${
            monetization.enabled
              ? 'bg-white border-emerald-200 text-emerald-700'
              : 'bg-white border-amber-300 text-amber-700'
          }`}>
            {monetization.enabled ? <Check className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className={`font-semibold ${monetization.enabled ? 'text-emerald-900' : 'text-amber-900'}`}>
              {monetization.enabled
                ? `Monetization is ACTIVE${monetization.enabledAt ? ` (since ${fmtDate(monetization.enabledAt)})` : ''}`
                : 'Monetization is OFF — the system is deployed but not yet collecting payments'}
            </div>
            <p className={`text-sm mt-0.5 leading-relaxed ${monetization.enabled ? 'text-emerald-800' : 'text-amber-800'}`}>
              {monetization.enabled
                ? 'Trial timers, payment gates, dashboard pills, and SMS reminders are live for residential rentals.'
                : 'Listings post the legacy way. The cron only enforces the existing freshness rule. Click "Activate" when you\'re ready to switch the whole system on — singular active rentals (unique contact phone) start a 14-day trial staggered over 3 days; high-volume listings (2+ active rentals sharing a phone) stay as they are today.'}
            </p>
            {activationResult && (
              <p className="mt-2 text-xs text-gray-700 bg-white border border-gray-200 rounded px-2 py-1">
                {activationResult}
              </p>
            )}
          </div>
          {monetization.enabled ? (
            <button
              type="button"
              onClick={handleDeactivate}
              disabled={activating}
              className="text-sm font-medium text-gray-600 hover:text-gray-900 disabled:opacity-50 flex-shrink-0"
            >
              Deactivate
            </button>
          ) : (
            <button
              type="button"
              onClick={handleActivate}
              disabled={activating}
              className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50 flex-shrink-0 inline-flex items-center gap-2"
            >
              {activating ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              Activate monetization
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-4">
          <button
            type="button"
            onClick={() => handleTabChange('subscribers')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              tab === 'subscribers'
                ? 'bg-accent-50 text-accent-700 border border-accent-200'
                : 'text-gray-600 hover:bg-gray-100 border border-transparent'
            }`}
          >
            Subscribers ({subscribers.length})
          </button>
          <button
            type="button"
            onClick={() => handleTabChange('paid')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              tab === 'paid'
                ? 'bg-accent-50 text-accent-700 border border-accent-200'
                : 'text-gray-600 hover:bg-gray-100 border border-transparent'
            }`}
          >
            Paid Listings ({paidListings.length})
          </button>
        </div>

        {err && (
          <div className="mb-4 flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            {err}
          </div>
        )}

        {/* Subscribers tab */}
        {tab === 'subscribers' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {loading ? (
              <div className="p-8 text-center text-sm text-gray-500">Loading…</div>
            ) : sortedSubscribers.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-500">
                No subscriptions yet. Click "Add subscriber" to grant one manually, or wait for Stripe checkouts.
              </div>
            ) : (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">User</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Plan</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Billing</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Next renewal</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Day</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {sortedSubscribers.map((s) => {
                    const isTrial = s.status === 'trial';
                    const trialInfo = isTrial ? trialEndsIn(s) : null;
                    const daysToRenewal = isTrial
                      ? trialInfo!.daysLeft
                      : daysFromNow(s.current_period_end);
                    const isUrgent =
                      daysToRenewal !== null &&
                      daysToRenewal <= 3 &&
                      ['active', 'admin_active', 'past_due', 'trial'].includes(s.status);
                    const isEditing = editingDayId === s.id;
                    // Phase K: trials go through Stripe with a card on file.
                    const billingSource = s.is_admin_granted
                      ? 'Admin'
                      : isTrial
                        ? 'Stripe trial'
                        : 'Stripe';
                    return (
                      <tr key={s.id} className={isUrgent ? 'bg-amber-50/30' : ''}>
                        <td className="px-4 py-3">
                          <div className="text-sm font-medium text-gray-900">{s.user?.full_name || '(unknown)'}</div>
                          <div className="text-xs text-gray-500">{s.user?.email || ''}</div>
                        </td>
                        <td className="px-4 py-3"><PlanBadge plan={s.plan} /></td>
                        <td className="px-4 py-3"><StatusPill status={s.status} /></td>
                        <td className="px-4 py-3 text-xs text-gray-600">{billingSource}</td>
                        <td className="px-4 py-3">
                          <div className="text-sm text-gray-900">
                            {isTrial ? fmtDate(trialInfo!.date.toISOString()) : fmtDate(s.current_period_end)}
                          </div>
                          {daysToRenewal !== null && ['active', 'admin_active', 'past_due', 'trial'].includes(s.status) && (
                            <div className={`text-xs ${isUrgent ? 'text-amber-700 font-medium' : 'text-gray-500'}`}>
                              {isTrial && 'Trial ends '}
                              {daysToRenewal <= 0 ? 'today or earlier' : `in ${daysToRenewal}d`}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {isEditing ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                min={1}
                                max={28}
                                value={editingDayValue}
                                onChange={(e) =>
                                  setEditingDayValue(Math.max(1, Math.min(28, parseInt(e.target.value || '1', 10))))
                                }
                                className="w-16 px-2 py-1 border border-gray-300 rounded text-xs"
                              />
                              <button
                                type="button"
                                onClick={() => handleSaveDay(s.id)}
                                className="text-emerald-700 hover:text-emerald-900"
                                aria-label="Save day"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingDayId(null)}
                                className="text-gray-400 hover:text-gray-600"
                                aria-label="Cancel edit"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            <span className="text-gray-700">{s.billing_day_of_month ?? '—'}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-2">
                            {!isEditing && (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingDayId(s.id);
                                  setEditingDayValue(s.billing_day_of_month ?? 1);
                                }}
                                className="text-gray-500 hover:text-gray-900"
                                title="Edit billing day"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                            )}
                            {['active', 'admin_active', 'past_due'].includes(s.status) && (
                              <button
                                type="button"
                                onClick={() => handleCancelSub(s.id)}
                                className="text-red-600 hover:text-red-800"
                                title="Cancel subscription"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Paid Listings tab */}
        {tab === 'paid' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {loading ? (
              <div className="p-8 text-center text-sm text-gray-500">Loading…</div>
            ) : paidListings.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-500">
                No individually-paid listings right now.
              </div>
            ) : (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Listing</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Owner</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Paid until</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Days left</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {paidListings.map((l) => {
                    const daysLeft = daysFromNow(l.paid_until);
                    const isUrgent = daysLeft !== null && daysLeft <= 3;
                    return (
                      <tr key={l.id} className={isUrgent ? 'bg-amber-50/30' : ''}>
                        <td className="px-4 py-3">
                          <Link
                            to={`/listing/${l.id}`}
                            className="text-sm font-medium text-gray-900 hover:text-accent-600"
                            target="_blank"
                            rel="noreferrer"
                          >
                            {l.neighborhood || l.location || 'Listing'}
                          </Link>
                          <div className="text-xs text-gray-500">
                            {l.price ? `$${l.price.toLocaleString()}/mo` : 'Call for price'}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm text-gray-900">{l.user?.full_name || '(unknown)'}</div>
                          <div className="text-xs text-gray-500">{l.user?.email || ''}</div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">{fmtDate(l.paid_until)}</td>
                        <td className="px-4 py-3">
                          <span className={`text-sm font-medium ${isUrgent ? 'text-amber-700' : 'text-gray-700'}`}>
                            {daysLeft !== null ? `${daysLeft}d` : '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => setGrantListingId(l.id)}
                            className="text-xs font-medium text-accent-600 hover:text-accent-800"
                          >
                            Grant days
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        <div className="text-xs text-gray-400 mt-6 text-center">
          Subscriptions billed via Stripe roll forward automatically on the day of month. Admin-granted
          subscriptions are visible to admins only and never charge the user.
        </div>
      </div>

      <AddSubscriberModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={loadData}
        adminId={profile.id}
      />
      <GrantDaysModal
        open={!!grantListingId}
        onClose={() => setGrantListingId(null)}
        onGranted={loadData}
        listingId={grantListingId}
        adminId={profile.id}
      />
    </div>
  );
}

export default AdminSubscriptions;

// Silence unused-import warning for formatCents (kept exported in case the page
// is extended later with a "revenue" widget).
void formatCents;
