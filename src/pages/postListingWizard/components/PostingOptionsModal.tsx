// The "how do you want to post?" modal shown after a logged-in poster (without
// an active subscription) clicks "Continue" on the wizard's review step.
//
// Three options side-by-side, styled to match FeatureListingModal:
//   LEFT   — Post today, free 14-day trial         (free; just posts)
//   MIDDLE — Pay $25 today                          (individual Stripe checkout)
//   RIGHT  — Upgrade to Agent / VIP account         (subscription Stripe checkout)
//            with a Basic(Agent) ↔ VIP toggle that swaps bullets + price.
//
// For posters who are NOT trial-eligible (another active/recent listing shares
// their contact phone) the trial card is shown disabled with an explanation —
// they must pick $25 or a subscription.
//
// Clicking the backdrop / X returns to the review page (onClose) without posting.

import { useState } from 'react';
import {
  X,
  ShieldCheck,
  Sparkles,
  Crown,
  Check,
  Loader2,
  Clock,
  CreditCard,
  AlertCircle,
} from 'lucide-react';

type UpgradePlan = 'agent' | 'vip';

interface PostingOptionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** False when the poster's phone is tied to another active/recent listing. */
  trialEligible: boolean;
  /** Post now, free for 14 days. */
  onChooseTrial: () => void;
  /** Pay $25 today → individual Stripe checkout. */
  onChoosePay: () => void;
  /** Subscribe (Agent/VIP) → subscription Stripe checkout; listing is posted + held. */
  onChooseSubscribe: (plan: UpgradePlan) => void;
  /** Disables all actions while a post / redirect is in flight. */
  busy?: boolean;
  /** Optional error surfaced from the post/checkout attempt. */
  error?: string | null;
}

// What a free listing actually gets you — short, concrete, a little salesy.
const FREE_BULLETS = [
  'Live free for a full 14 days',
  'Seen by hundreds of renters daily — on our site & groups',
  'Pinned on the map so renters find your spot',
  'Callback requests texted straight to your phone',
  'Live updates by SMS — no logging in',
];

// Pay-$25 bullets, ordered: (1) everything free has, (2) pay-today bonus,
// (3) the 74-day math. Shown when the poster is trial-eligible.
const PAY_BULLETS_TRIAL = [
  'Everything in the free listing, included',
  'Pay today and we gift you 30 bonus days',
  '74 days live: 14 trial + 30 paid + 30 bonus',
  'No reminder texts — it just stays up',
];

// Pay-$25 bullets when the poster is NOT trial-eligible (no 14-day trial).
const PAY_BULLETS_NOTRIAL = [
  'Your listing goes live right away',
  'A full 30 days of active exposure',
  'Seen by hundreds daily, pinned on the map',
  'No reminder texts to chase',
];

const PLAN_DETAILS: Record<
  UpgradePlan,
  { label: string; price: number; tagline: string; bullets: string[] }
> = {
  agent: {
    label: 'Agent',
    price: 50,
    tagline: 'For active landlords & small agencies',
    bullets: [
      'Post up to 7 listings at once',
      'Every listing included — no per-post fees',
      'Listings stay live as long as you subscribe',
      'Cancel anytime',
    ],
  },
  vip: {
    label: 'VIP',
    price: 100,
    tagline: 'For high-volume agencies',
    bullets: [
      'Unlimited active listings',
      'Everything in Agent, with no listing cap',
      'Cancel anytime',
    ],
  },
};

export function PostingOptionsModal({
  isOpen,
  onClose,
  trialEligible,
  onChooseTrial,
  onChoosePay,
  onChooseSubscribe,
  busy = false,
  error = null,
}: PostingOptionsModalProps) {
  const [upgradePlan, setUpgradePlan] = useState<UpgradePlan>('agent');

  if (!isOpen) return null;

  const plan = PLAN_DETAILS[upgradePlan];
  const payBullets = trialEligible ? PAY_BULLETS_TRIAL : PAY_BULLETS_NOTRIAL;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black bg-opacity-50 p-4"
      onClick={busy ? undefined : onClose}
    >
      <div
        className="relative bg-white rounded-xl shadow-2xl max-w-3xl w-full mx-auto overflow-hidden max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-accent-50 rounded-lg flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-4.5 h-4.5 text-accent-500" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-[#273140] leading-tight">Choose how to post</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Pick what fits you — you can change it later from your dashboard.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={busy}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-5 overflow-y-auto">
          {error && (
            <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4">
              <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* LEFT — Free 14-day trial */}
            <div
              className={`flex flex-col rounded-xl border-2 p-4 transition-all ${
                trialEligible ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50'
              }`}
            >
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-9 h-9 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-700 flex-shrink-0">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h4 className="text-sm font-semibold text-gray-900 leading-tight">
                    Post free
                  </h4>
                  <p className="text-xs text-gray-500">Live 14 days, no card</p>
                </div>
              </div>
              <ul className="space-y-2 text-[13px] leading-snug text-gray-600 flex-1">
                {FREE_BULLETS.map((b) => (
                  <li key={b} className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex items-start gap-2 text-[11px] leading-snug text-gray-400 border-t border-gray-100 pt-3">
                <Clock className="w-3.5 h-3.5 mt-px flex-shrink-0" />
                <span>Keep it live after for $25 / 30 days.</span>
              </div>
              {trialEligible ? (
                <button
                  onClick={onChooseTrial}
                  disabled={busy}
                  className="w-full mt-4 border-2 border-gray-300 bg-white text-gray-800 font-semibold py-2.5 px-4 rounded-lg transition-all hover:border-gray-400 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Start free trial'}
                </button>
              ) : (
                <div className="mt-4 text-xs text-gray-500 bg-gray-100 border border-gray-200 rounded-lg px-3 py-2.5 text-center">
                  Not available — another active or recent listing uses this phone number.
                </div>
              )}
            </div>

            {/* MIDDLE — Pay $25 today */}
            <div className="flex flex-col rounded-xl border-2 border-accent-300 bg-gradient-to-br from-white to-accent-50/50 p-4 relative shadow-sm">
              <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2.5 py-0.5 bg-accent-500 text-white text-[10px] font-semibold uppercase tracking-wider rounded-full whitespace-nowrap shadow-sm">
                Most popular
              </span>
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-9 h-9 rounded-lg bg-accent-100 border border-accent-200 flex items-center justify-center text-accent-700 flex-shrink-0">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h4 className="text-sm font-semibold text-gray-900 leading-tight">Pay $25 today</h4>
                  <p className="text-xs text-accent-700 font-semibold">
                    {trialEligible ? '74 active days' : '30 active days'}
                  </p>
                </div>
              </div>
              <ul className="space-y-2 text-[13px] leading-snug text-gray-600 flex-1">
                {payBullets.map((b) => (
                  <li key={b} className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
              <button
                onClick={onChoosePay}
                disabled={busy}
                className="w-full mt-4 border-2 border-accent-500 bg-transparent text-black font-bold py-2.5 px-4 rounded-lg transition-all hover:bg-accent-600 hover:text-white hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {busy ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <CreditCard className="w-4 h-4" />
                    Pay $25 &amp; post
                  </>
                )}
              </button>
            </div>

            {/* RIGHT — Upgrade to Agent / VIP */}
            <div className="flex flex-col rounded-xl border-2 border-gray-200 bg-white p-4">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-9 h-9 rounded-lg bg-accent-50 border border-accent-200 flex items-center justify-center text-accent-700 flex-shrink-0">
                  {upgradePlan === 'vip' ? <Crown className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
                </div>
                <div className="min-w-0">
                  <h4 className="text-sm font-semibold text-gray-900 leading-tight">Upgrade account</h4>
                  <p className="text-xs text-gray-500">Post multiple listings</p>
                </div>
              </div>

              {/* Agent / VIP toggle */}
              <div className="grid grid-cols-2 gap-1 p-1 bg-gray-100 rounded-lg mb-3">
                {(['agent', 'vip'] as UpgradePlan[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setUpgradePlan(p)}
                    className={`text-xs font-semibold py-1.5 rounded-md transition-colors ${
                      upgradePlan === p
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {PLAN_DETAILS[p].label}
                  </button>
                ))}
              </div>

              <div className="mb-3">
                <span className="text-2xl font-bold text-[#273140]">${plan.price}</span>
                <span className="text-sm text-gray-500">/mo</span>
                <p className="text-xs text-gray-500 mt-0.5">{plan.tagline}</p>
              </div>

              {/* min-height keeps the card from resizing when toggling Agent (4
                  bullets) ↔ VIP (3 bullets). */}
              <ul className="space-y-2 text-[13px] leading-snug text-gray-600 flex-1 min-h-[132px]">
                {plan.bullets.map((b) => (
                  <li key={b} className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
              <button
                onClick={() => onChooseSubscribe(upgradePlan)}
                disabled={busy}
                className="w-full mt-4 border-2 border-accent-500 bg-transparent text-accent-700 font-bold py-2.5 px-4 rounded-lg transition-all hover:bg-accent-600 hover:text-white hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {busy ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  `Subscribe to ${plan.label} → $${plan.price}/mo`
                )}
              </button>
            </div>
          </div>

          <p className="text-xs text-gray-400 text-center mt-4">
            Paid options redirect you securely to Stripe. Your listing is saved and held until checkout
            completes.
          </p>
        </div>
      </div>
    </div>
  );
}
