// Payment branch UI shown above the Submit button in the residential wizard.
// Three modes, all using the project's Tailwind + lucide style conventions.
//
//   subscription      → single calm panel: "Posting under your Agent plan"
//   trial_eligible    → two cards side-by-side: Free 14-day trial / Pay $25 = 74 days
//   must_pay          → single required panel: "Pay $25 to post — 30 days"
//   subscription_at_cap → blocking panel with upsell
//   admin             → no card shown
//
// Visual style mirrors the existing wizard cards (bg-white, rounded-xl, shadow-sm,
// border border-gray-200, p-6). Primary accent color is accent-500 (defined in
// the project's Tailwind theme).

import { Sparkles, ShieldCheck, Zap, Crown, ArrowUpRight, AlertTriangle } from 'lucide-react';
import type { MonetizationGateMode } from '../../../hooks/useMonetizationGate';
import type { ListingSubscription } from '../../../types/monetization';

export type WizardPaymentChoice = 'free_trial' | 'pay_at_posting' | 'must_pay' | 'subscription_covered' | 'admin';

// Persistence across sign-in (OAuth or modal). When a logged-out user fills
// the wizard, hits submit, and signs in, the resulting OAuth redirect (or
// modal-close + auth-replay effect) ends up calling handleSubmit with no
// args — losing the choice they just made. We stash it in sessionStorage so
// the submit replay can recover it.
export const WIZARD_PAYMENT_CHOICE_STORAGE_KEY = 'hadirot_wizard_payment_choice_v1';

export function isValidWizardPaymentChoice(v: unknown): v is WizardPaymentChoice {
  return (
    v === 'free_trial' ||
    v === 'pay_at_posting' ||
    v === 'must_pay' ||
    v === 'subscription_covered' ||
    v === 'admin'
  );
}

interface PaymentChoiceProps {
  mode: MonetizationGateMode;
  subscription: ListingSubscription | null;
  subscriptionListingsUsed: number;
  errorMessage: string | null;
  choice: WizardPaymentChoice | null;
  onChoiceChange: (choice: WizardPaymentChoice) => void;
  // Called when the "see subscription options" link is clicked from must_pay.
  onWantsToSubscribe?: () => void;
}

export function PaymentChoice({
  mode,
  subscription,
  subscriptionListingsUsed,
  errorMessage,
  choice,
  onChoiceChange,
  onWantsToSubscribe,
}: PaymentChoiceProps) {
  if (mode === 'admin') {
    // Admin posts as a normal user but with no cap. Still gated by phone-trial check
    // for the listing they're creating — fall through to the relevant branch.
    return null;
  }

  if (mode === 'loading') {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-3 text-gray-500">
          <div className="w-4 h-4 border-2 border-gray-300 border-t-accent-500 rounded-full animate-spin" />
          <span className="text-sm">Checking your posting options…</span>
        </div>
      </div>
    );
  }

  if (mode === 'error') {
    return (
      <div className="bg-amber-50 rounded-xl border border-amber-200 p-6">
        <div className="flex items-start gap-3 text-amber-800">
          <AlertTriangle className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <div className="text-sm">
            We couldn't load your posting options. You can still submit and we'll sort it out.
            <div className="text-xs text-amber-700 mt-1">{errorMessage}</div>
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'subscription') {
    const cap = subscription?.listing_cap;
    const usedText = cap !== null && cap !== undefined
      ? `${subscriptionListingsUsed} of ${cap} listings used`
      : `${subscriptionListingsUsed} listings active`;
    const planName = subscription?.plan === 'vip' ? 'VIP' : 'Agent';
    const Icon = subscription?.plan === 'vip' ? Crown : ShieldCheck;
    // Selection is forced to 'subscription_covered' by Step6's useEffect when mode='subscription'.
    void choice;
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 flex-shrink-0">
            <Icon className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-gray-900">Posting under your {planName} plan</h3>
            <p className="text-sm text-gray-500 mt-1">
              This listing is included in your subscription. {usedText}.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'subscription_at_cap') {
    const cap = subscription?.listing_cap ?? 0;
    return (
      <div className="bg-amber-50 rounded-xl border border-amber-200 p-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-lg bg-amber-100 border border-amber-200 flex items-center justify-center text-amber-700 flex-shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-amber-900">You're at your plan's listing limit</h3>
            <p className="text-sm text-amber-800 mt-1">
              Your Agent plan covers {cap} listings and all {cap} slots are currently used.
              Deactivate one to free a slot, or upgrade to VIP for unlimited listings.
            </p>
            <button
              type="button"
              onClick={onWantsToSubscribe}
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-amber-900 hover:text-amber-700"
            >
              Upgrade to VIP <ArrowUpRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'trial_eligible') {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-1">Pick your start</h2>
        <p className="text-sm text-gray-500 mb-5">
          Posting your first listing? You can start free, or pay today and get a big bonus.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Free trial card */}
          <button
            type="button"
            onClick={() => onChoiceChange('free_trial')}
            className={`text-left rounded-xl border-2 p-5 transition-all relative ${
              choice === 'free_trial'
                ? 'border-accent-500 bg-accent-50/40 ring-2 ring-accent-200'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="flex items-start gap-3 mb-3">
              <div className="w-9 h-9 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-700">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-semibold text-gray-900">Free 14-day trial</h3>
                <p className="text-xs text-gray-500 mt-0.5">Default</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed">
              Post now. Free for 14 days. We'll text you 3 days before it ends so you can decide
              what to do — pay $25 to keep it live for another 30 days, or let it expire.
            </p>
          </button>

          {/* Pay-at-posting card (primary) */}
          <button
            type="button"
            onClick={() => onChoiceChange('pay_at_posting')}
            className={`text-left rounded-xl border-2 p-5 transition-all relative ${
              choice === 'pay_at_posting'
                ? 'border-accent-500 bg-accent-50/60 ring-2 ring-accent-200'
                : 'border-accent-200 bg-gradient-to-br from-white to-accent-50/40 hover:border-accent-300'
            }`}
          >
            <div className="absolute -top-2.5 left-5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-accent-500 text-white rounded">
              Best value
            </div>
            <div className="flex items-start gap-3 mb-3">
              <div className="w-9 h-9 rounded-lg bg-accent-100 border border-accent-200 flex items-center justify-center text-accent-700">
                <Sparkles className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-semibold text-gray-900">Pay $25 now</h3>
                <p className="text-xs text-accent-700 font-semibold mt-0.5">Get 74 active days</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed mb-3">
              Skip the reminder texts. Get the most live days for your money.
            </p>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-white rounded-lg border border-gray-200 px-2 py-2">
                <div className="text-base font-semibold text-gray-900">14</div>
                <div className="text-[10px] uppercase tracking-wide text-gray-500">Trial</div>
              </div>
              <div className="bg-white rounded-lg border border-gray-200 px-2 py-2">
                <div className="text-base font-semibold text-gray-900">30</div>
                <div className="text-[10px] uppercase tracking-wide text-gray-500">Paid</div>
              </div>
              <div className="bg-accent-500 rounded-lg px-2 py-2 text-white">
                <div className="text-base font-semibold">+30</div>
                <div className="text-[10px] uppercase tracking-wide opacity-90">Bonus</div>
              </div>
            </div>
            <p className="text-[11px] text-gray-500 mt-3 italic">
              The 30 bonus days are only available right now, at posting.
            </p>
          </button>
        </div>
      </div>
    );
  }

  // must_pay
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-start gap-4 mb-5">
        <div className="w-10 h-10 rounded-lg bg-accent-100 border border-accent-200 flex items-center justify-center text-accent-700 flex-shrink-0">
          <Zap className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold text-gray-900">Post for 30 days — $25</h3>
          <p className="text-sm text-gray-500 mt-1">
            You're not eligible for the 14-day free trial because another active or recent
            listing shares this contact phone. After payment, your listing is live for 30 days.
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => onChoiceChange('must_pay')}
        className={`w-full rounded-xl border-2 p-4 transition-all text-left ${
          choice === 'must_pay'
            ? 'border-accent-500 bg-accent-50/40 ring-2 ring-accent-200'
            : 'border-gray-200 hover:border-accent-200'
        }`}
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-gray-900">Pay $25 and post</div>
            <div className="text-xs text-gray-500 mt-0.5">Stripe Checkout · secure</div>
          </div>
          <div className="text-xl font-bold text-accent-700">$25</div>
        </div>
      </button>
      <button
        type="button"
        onClick={onWantsToSubscribe}
        className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-accent-700"
      >
        Or — see subscription options <ArrowUpRight className="w-4 h-4" />
      </button>
    </div>
  );
}
