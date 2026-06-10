// MonetizationModal — three-option upsell shown from the dashboard.
//
// Triggered when (any of):
//   - URL has ?subscribe=open (e.g., wizard "see subscription options")
//   - User has a listing requiring payment action (parent decides)
//   - User opens via "Pay or subscribe" button
//
// Options:
//   1. Pay for a specific listing (day-count picker)
//   2. Subscribe to Agent or VIP (optionally + concierge add-on)
//   3. (Day-count picker is the same UI as #1; the third "option" is just
//      surfacing the multi-month packages, which are inside option #1.)
//
// Each path opens the corresponding Stripe Checkout via the services.

import { useEffect, useState } from 'react';
import {
  X,
  CreditCard,
  Crown,
  ShieldCheck,
  Check,
  Sparkles,
  ArrowRight,
  AlertTriangle,
  Gift,
} from 'lucide-react';
import { paymentsService } from '../../services/payments';
import { subscriptionsService } from '../../services/subscriptions';
import {
  INDIVIDUAL_LISTING_PACKAGES,
  LISTING_SUBSCRIPTION_PLANS,
  CONCIERGE_ADDON_PRICE_CENTS,
  TRIAL_SUBSCRIPTION_LENGTH_DAYS,
  formatCents,
} from '../../types/monetization';
import type { ListingSubscription } from '../../types/monetization';

export type MonetizationModalListingOption = {
  id: string;
  label: string; // human-readable summary, e.g. "Studio at Crown Heights for $1,800"
};

export interface MonetizationModalProps {
  open: boolean;
  onClose: () => void;
  /** Listings the user could pay for individually. If empty, only subscribe shown. */
  listings: MonetizationModalListingOption[];
  /** Pre-selected listing id (e.g. from a per-card "Pay" click). */
  preselectedListingId?: string | null;
  /** Initial tab — typically 'subscribe' for the wizard-handoff, 'pay' otherwise. */
  initialTab?: 'pay' | 'subscribe';
  /** The caller's active listing subscription, if any. Drives the Agent→VIP upgrade UI. */
  activeSubscription?: ListingSubscription | null;
  /** Called after a successful in-place upgrade so the parent can refresh. */
  onUpgraded?: () => void;
}

const UPGRADE_ACTIVE_STATUSES = ['active', 'admin_active', 'past_due', 'trial'];

export function MonetizationModal({
  open,
  onClose,
  listings,
  preselectedListingId,
  initialTab,
  activeSubscription,
  onUpgraded,
}: MonetizationModalProps) {
  const [tab, setTab] = useState<'pay' | 'subscribe'>(initialTab ?? 'pay');
  const [selectedListingId, setSelectedListingId] = useState<string | null>(
    preselectedListingId ?? listings[0]?.id ?? null,
  );
  const [selectedDays, setSelectedDays] = useState<number>(30);
  const [selectedPlan, setSelectedPlan] = useState<'agent' | 'vip'>('agent');
  const [includeAddon, setIncludeAddon] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [priorPaymentCount, setPriorPaymentCount] = useState<number | null>(null);
  const [upgradeDone, setUpgradeDone] = useState(false);
  // null = still loading; true/false once resolved. The 14-day trial entry
  // points only render when this is true (genuinely new listers). Returning
  // listers see paid checkout only. The edge function re-checks server-side.
  const [trialEligible, setTrialEligible] = useState<boolean | null>(null);

  useEffect(() => {
    if (!open) return;
    setTab(initialTab ?? 'pay');
    setSelectedListingId(preselectedListingId ?? listings[0]?.id ?? null);
    setSelectedDays(30);
    setErr(null);
    setBusy(false);
    setUpgradeDone(false);
  }, [open, initialTab, preselectedListingId, listings]);

  // Resolve subscription-trial eligibility once the modal opens. Only new
  // listers (no active/recent listing of their own, no contact phone shared
  // with another active account) may take the 14-day trial.
  useEffect(() => {
    if (!open) {
      setTrialEligible(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const eligible = await subscriptionsService.isSubscriptionTrialEligible();
        if (!cancelled) setTrialEligible(eligible);
      } catch {
        // On error, fail closed: hide the trial (server still enforces).
        if (!cancelled) setTrialEligible(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Look up prior payment count for the selected listing — drives first-time vs renewal pricing.
  useEffect(() => {
    if (!open || !selectedListingId) {
      setPriorPaymentCount(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const count = await paymentsService.getPriorPaymentCount(selectedListingId);
        if (!cancelled) setPriorPaymentCount(count);
      } catch {
        if (!cancelled) setPriorPaymentCount(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, selectedListingId]);

  if (!open) return null;

  const isFirstPayment = priorPaymentCount === 0;
  const selectedPkg = INDIVIDUAL_LISTING_PACKAGES.find((p) => p.days === selectedDays);
  const priceCents = selectedPkg
    ? isFirstPayment
      ? selectedPkg.firstTimeCents
      : selectedPkg.renewalCents
    : 0;

  const handlePay = async () => {
    if (!selectedListingId) {
      setErr('Pick a listing first.');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const checkout = await paymentsService.createCheckoutSession({
        listingId: selectedListingId,
        days: selectedDays,
        isInitialPurchase: false, // dashboard payments never qualify for the at-posting bonus
      });
      window.location.href = checkout.url;
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };

  const handleSubscribe = async () => {
    setBusy(true);
    setErr(null);
    try {
      const checkout = await subscriptionsService.createCheckoutSession({
        plan: selectedPlan,
        includeConciergeAddon: includeAddon,
      });
      window.location.href = checkout.url;
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };

  const handleUpgradeToVip = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await subscriptionsService.upgradeToVip();
      setUpgradeDone(true);
      onUpgraded?.();
      // Stripe-backed subs charged the prorated delta in place; we stay in the
      // modal and show confirmation.
      void res;
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Comped (admin_active) Agent user upgrading to VIP: there is no card on file
  // and no Stripe subscription to prorate, so we convert them into a real
  // paying VIP subscriber via Stripe Checkout (full $100/mo, no trial). The
  // webhook supersedes their admin-granted row when the checkout completes.
  const handleConvertCompedToVip = async () => {
    setBusy(true);
    setErr(null);
    try {
      const checkout = await subscriptionsService.createCheckoutSession({
        plan: 'vip',
        withTrial: false,
      });
      window.location.href = checkout.url;
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };

  const handleStartTrial = async () => {
    setBusy(true);
    setErr(null);
    try {
      // Phase K: trial runs through Stripe — user enters card, no charge for
      // 14 days, then Stripe auto-charges. Redirect to Stripe Checkout.
      const checkout = await subscriptionsService.startFreeTrial({ plan: selectedPlan });
      window.location.href = checkout.url;
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };

  const subscribeMonthlyCents =
    (LISTING_SUBSCRIPTION_PLANS.find((p) => p.plan === selectedPlan)?.priceCents ?? 0) +
    (includeAddon ? CONCIERGE_ADDON_PRICE_CENTS : 0);

  // Agent→VIP in-place upgrade (pay only the prorated difference, no new checkout).
  const canUpgradeToVip =
    !!activeSubscription &&
    activeSubscription.plan === 'agent' &&
    UPGRADE_ACTIVE_STATUSES.includes(activeSubscription.status);
  const agentCents = LISTING_SUBSCRIPTION_PLANS.find((p) => p.plan === 'agent')?.priceCents ?? 5000;
  const vipCents = LISTING_SUBSCRIPTION_PLANS.find((p) => p.plan === 'vip')?.priceCents ?? 10000;
  const upgradeDeltaCents = vipCents - agentCents;

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/40 p-4 sm:p-6">
      <div className="bg-white w-full sm:max-w-2xl rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-start justify-between flex-shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Keep your listings live</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Pick a single-listing payment, or subscribe to cover multiple.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 -m-1 text-gray-400 hover:text-gray-600"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="px-6 pt-4 flex gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={() => setTab('pay')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              tab === 'pay'
                ? 'bg-accent-50 text-accent-700 border border-accent-200'
                : 'text-gray-600 hover:bg-gray-50 border border-transparent'
            }`}
          >
            <CreditCard className="inline w-4 h-4 mr-1.5 -mt-0.5" /> Pay per listing
          </button>
          <button
            type="button"
            onClick={() => setTab('subscribe')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              tab === 'subscribe'
                ? 'bg-accent-50 text-accent-700 border border-accent-200'
                : 'text-gray-600 hover:bg-gray-50 border border-transparent'
            }`}
          >
            <Crown className="inline w-4 h-4 mr-1.5 -mt-0.5" /> Subscribe
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 overflow-y-auto flex-1">
          {err && (
            <div className="mb-4 flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              {err}
            </div>
          )}

          {tab === 'pay' && (
            <div className="space-y-5">
              {listings.length === 0 ? (
                <div className="text-sm text-gray-500 text-center py-6">
                  No listings to pay for right now.
                </div>
              ) : (
                <>
                  {/* Listing picker */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                      Listing
                    </label>
                    <div className="space-y-1.5">
                      {listings.map((l) => (
                        <label
                          key={l.id}
                          className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                            selectedListingId === l.id
                              ? 'border-accent-500 bg-accent-50/40'
                              : 'border-gray-200 hover:bg-gray-50'
                          }`}
                        >
                          <input
                            type="radio"
                            name="listing"
                            checked={selectedListingId === l.id}
                            onChange={() => setSelectedListingId(l.id)}
                            className="text-accent-500 focus:ring-accent-500"
                          />
                          <span className="text-sm text-gray-900 truncate">{l.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Day-count picker */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                      Days
                      {priorPaymentCount !== null && (
                        <span className="ml-2 normal-case text-gray-400 font-normal">
                          {isFirstPayment
                            ? '(first payment — $25 for 30 days)'
                            : '(renewal pricing — $15/30 days)'}
                        </span>
                      )}
                    </label>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                      {INDIVIDUAL_LISTING_PACKAGES.map((pkg) => {
                        const cents = isFirstPayment ? pkg.firstTimeCents : pkg.renewalCents;
                        const selected = pkg.days === selectedDays;
                        return (
                          <button
                            key={pkg.days}
                            type="button"
                            onClick={() => setSelectedDays(pkg.days)}
                            className={`p-3 rounded-lg border text-left transition-colors ${
                              selected
                                ? 'border-accent-500 bg-accent-50/40 ring-1 ring-accent-200'
                                : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                            }`}
                          >
                            <div className="text-sm font-medium text-gray-900">{pkg.label}</div>
                            <div className="text-xs text-gray-500 mt-0.5">{pkg.days} days · {formatCents(cents)}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Total */}
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 flex items-center justify-between">
                    <div className="text-sm text-gray-600">Total today</div>
                    <div className="text-xl font-bold text-gray-900">{formatCents(priceCents)}</div>
                  </div>

                  <button
                    type="button"
                    onClick={handlePay}
                    disabled={busy || !selectedListingId}
                    className="w-full bg-accent-500 hover:bg-accent-600 text-white py-3 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {busy ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <CreditCard className="w-4 h-4" />
                        Continue to checkout
                      </>
                    )}
                  </button>
                </>
              )}
            </div>
          )}

          {tab === 'subscribe' && (canUpgradeToVip || upgradeDone) && (
            <div className="space-y-5">
              {upgradeDone ? (
                <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/40 border-2 border-emerald-200 rounded-xl p-5 text-center">
                  <div className="w-12 h-12 rounded-full bg-white border border-emerald-200 flex items-center justify-center text-emerald-600 mx-auto mb-3">
                    <Crown className="w-6 h-6" />
                  </div>
                  <div className="text-lg font-semibold text-emerald-900">You're on VIP now</div>
                  <p className="text-sm text-emerald-800 mt-1 leading-relaxed">
                    Your plan was upgraded and your listing cap is now unlimited.
                    We charged only the prorated difference for the rest of this billing cycle.
                  </p>
                  <button
                    type="button"
                    onClick={onClose}
                    className="mt-4 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/40 border-2 border-emerald-200 rounded-xl p-5">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-white border border-emerald-200 flex items-center justify-center text-emerald-600 flex-shrink-0">
                      <Crown className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-emerald-900">Upgrade to VIP</div>
                      <p className="text-sm text-emerald-800 mt-0.5 leading-relaxed">
                        You're on the Agent plan ({formatCents(agentCents)}/mo, 7-listing cap).
                        Upgrade to VIP for unlimited active listings — no cap.
                      </p>
                      <ul className="mt-3 space-y-1.5 text-sm text-emerald-900">
                        <li className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                          Unlimited active listings (no 7-listing cap)
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                          Cancel anytime
                        </li>
                      </ul>
                    </div>
                  </div>

                  <div className="mt-4 bg-white border border-emerald-200 rounded-lg p-4">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">VIP monthly price</span>
                      <span className="font-semibold text-gray-900">{formatCents(vipCents)}/mo</span>
                    </div>
                    {activeSubscription?.status !== 'admin_active' && (
                      <div className="flex items-center justify-between text-sm mt-1.5">
                        <span className="text-gray-600">Increase from Agent</span>
                        <span className="font-semibold text-emerald-700">
                          + {formatCents(upgradeDeltaCents)}/mo
                        </span>
                      </div>
                    )}
                    <p className="text-xs text-gray-500 mt-2 leading-relaxed">
                      {activeSubscription?.status === 'admin_active'
                        ? `Your Agent plan is currently complimentary. To move to VIP you'll enter a card and start a paid VIP subscription at ${formatCents(vipCents)}/mo.`
                        : `You're charged only the prorated difference for the rest of this billing cycle now — not a new ${formatCents(vipCents)}. From your next renewal you pay ${formatCents(vipCents)}/mo.`}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={
                      activeSubscription?.status === 'admin_active'
                        ? handleConvertCompedToVip
                        : handleUpgradeToVip
                    }
                    disabled={busy}
                    className="w-full mt-4 bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {busy ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <Crown className="w-4 h-4" />
                        {activeSubscription?.status === 'admin_active'
                          ? 'Continue to VIP checkout'
                          : `Upgrade now · + ${formatCents(upgradeDeltaCents)}/mo`}
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          {tab === 'subscribe' && !canUpgradeToVip && !upgradeDone && (
            <div className="space-y-5">
              {/* Free-trial banner — sits above the plan picker so it's the
                  first thing landlords see. Single CTA uses the plan picked
                  in the radio cards below. Only shown to trial-eligible
                  (genuinely new) listers. */}
              {trialEligible === true && (
                <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/40 border-2 border-emerald-200 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-white border border-emerald-200 flex items-center justify-center text-emerald-700 flex-shrink-0">
                      <Gift className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-emerald-900">
                        Try {TRIAL_SUBSCRIPTION_LENGTH_DAYS} days free
                      </div>
                      <p className="text-sm text-emerald-800 mt-0.5 leading-relaxed">
                        Post listings under your plan for {TRIAL_SUBSCRIPTION_LENGTH_DAYS} days.
                        Card required, but you won't be charged for {TRIAL_SUBSCRIPTION_LENGTH_DAYS} days.
                        Cancel anytime in the billing portal — no charge if you cancel before day {TRIAL_SUBSCRIPTION_LENGTH_DAYS}.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Plan picker */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {LISTING_SUBSCRIPTION_PLANS.map((p) => {
                  const selected = selectedPlan === p.plan;
                  const Icon = p.plan === 'vip' ? Crown : ShieldCheck;
                  return (
                    <button
                      key={p.plan}
                      type="button"
                      onClick={() => setSelectedPlan(p.plan)}
                      className={`text-left rounded-xl border-2 p-4 transition-colors relative ${
                        selected
                          ? 'border-accent-500 bg-accent-50/40 ring-2 ring-accent-200'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-start gap-3 mb-2">
                        <div className="w-9 h-9 rounded-lg bg-accent-100 border border-accent-200 flex items-center justify-center text-accent-700">
                          <Icon className="w-5 h-5" />
                        </div>
                        <div className="flex-1">
                          <div className="text-base font-semibold text-gray-900">{p.name}</div>
                          <div className="text-xs text-accent-700 font-semibold mt-0.5">
                            {formatCents(p.priceCents)} / month
                          </div>
                        </div>
                      </div>
                      <p className="text-sm text-gray-600 leading-relaxed">{p.description}</p>
                    </button>
                  );
                })}
              </div>

              {/* Concierge add-on */}
              <label
                className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-colors ${
                  includeAddon ? 'border-accent-500 bg-accent-50/40' : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={includeAddon}
                  onChange={(e) => setIncludeAddon(e.target.checked)}
                  className="mt-1 h-4 w-4 text-accent-500 focus:ring-accent-500"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-accent-600" />
                    <div className="text-sm font-semibold text-gray-900">Concierge add-on</div>
                    <div className="text-xs font-semibold text-accent-700">
                      + {formatCents(CONCIERGE_ADDON_PRICE_CENTS)}/mo
                    </div>
                  </div>
                  <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                    Forward your listings to us and we'll post them for you. Available only
                    bundled with an Agent or VIP plan.
                  </p>
                </div>
              </label>

              {/* Total */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 flex items-center justify-between">
                <div className="text-sm text-gray-600">Monthly total</div>
                <div className="text-xl font-bold text-gray-900">{formatCents(subscribeMonthlyCents)}</div>
              </div>

              <div className={`grid gap-2 ${trialEligible === true ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
                {trialEligible === true && (
                  <button
                    type="button"
                    onClick={handleStartTrial}
                    disabled={busy}
                    className="bg-white border-2 border-emerald-300 hover:border-emerald-400 text-emerald-800 py-3 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex flex-col items-center justify-center gap-0.5"
                  >
                    {busy ? (
                      <div className="w-4 h-4 border-2 border-emerald-700 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <span className="inline-flex items-center gap-2">
                          <Gift className="w-4 h-4" />
                          Start {TRIAL_SUBSCRIPTION_LENGTH_DAYS}-day free trial
                        </span>
                        <span className="text-[10px] font-normal text-emerald-700/80">Card required · charged on day {TRIAL_SUBSCRIPTION_LENGTH_DAYS}</span>
                      </>
                    )}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleSubscribe}
                  disabled={busy}
                  className="bg-accent-500 hover:bg-accent-600 text-white py-3 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {busy ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <ArrowRight className="w-4 h-4" />
                      Continue to checkout
                    </>
                  )}
                </button>
              </div>

              {trialEligible === true && (
                <div className="text-xs text-gray-500 text-center leading-relaxed">
                  <Check className="inline w-3 h-3 mr-1" /> Trials require a card on file.
                  Stripe auto-charges on day {TRIAL_SUBSCRIPTION_LENGTH_DAYS} unless cancelled.
                  Cancel anytime via the customer portal.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
