import React from 'react';
import { Check, Star, Mail, Eye } from 'lucide-react';
import type { ConciergeSubscription } from '../../config/supabase';

interface TierCardsProps {
  compact?: boolean;
  activeSubscription?: ConciergeSubscription | null;
  onSelectTier1: () => void;
  onSelectTier2: () => void;
  onSelectTier3: () => void;
}

const tiers = [
  {
    id: 'tier1',
    tier: 'tier1_quick' as const,
    name: 'Quick Post',
    price: '$25',
    priceLabel: 'per listing',
    icon: Star,
    features: [
      'Describe your listing in your own words',
      'We create and post it within 24 hours',
      'One-time payment per listing',
    ],
    cta: 'Submit a Listing',
    recommended: false,
  },
  {
    id: 'tier2',
    tier: 'tier2_forward' as const,
    name: 'Forward & Post',
    price: '$125',
    priceLabel: '/month',
    icon: Mail,
    features: [
      'Get your own @list.hadirot.com email',
      'Forward listings anytime \u2014 we post them',
      'Unlimited listings per month',
      'No per-listing fees',
    ],
    cta: 'Subscribe',
    recommended: true,
  },
  {
    id: 'tier3',
    tier: 'tier3_vip' as const,
    name: 'VIP / Full Service',
    price: '$200',
    priceLabel: '/month',
    icon: Eye,
    features: [
      'We check your posting sources for you',
      'Twice-weekly source monitoring',
      'We find and post your new listings',
      'Completely hands-off experience',
    ],
    cta: 'Subscribe',
    recommended: false,
  },
];

export function TierCards({
  compact,
  activeSubscription,
  onSelectTier1,
  onSelectTier2,
  onSelectTier3,
}: TierCardsProps) {
  const handlers = [onSelectTier1, onSelectTier2, onSelectTier3];

  const hasActiveSub = activeSubscription &&
    (activeSubscription.status === 'active' || activeSubscription.status === 'pending');

  return (
    <div className={`grid gap-6 ${compact ? 'grid-cols-1 md:grid-cols-3' : 'grid-cols-1 md:grid-cols-3 lg:gap-8'}`}>
      {tiers.map((tier, idx) => {
        const Icon = tier.icon;
        const isCurrentPlan =
          hasActiveSub && activeSubscription.tier === tier.tier;
        const isSubscriptionTier = tier.tier !== 'tier1_quick';

        return (
          <div
            key={tier.id}
            className={`relative rounded-xl border-2 bg-white transition-all ${
              tier.recommended
                ? 'border-[#1E4A74] shadow-lg scale-[1.02]'
                : 'border-gray-200 hover:border-gray-300 shadow-sm'
            } ${compact ? 'p-5' : 'p-6 lg:p-8'}`}
          >
            {tier.recommended && (
              <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                <span className="bg-[#1E4A74] text-white text-xs font-semibold px-4 py-1.5 rounded-full tracking-wide uppercase">
                  Best Value
                </span>
              </div>
            )}

            <div className={compact ? 'space-y-3' : 'space-y-4'}>
              <div className="flex items-center gap-3">
                <div className={`rounded-lg p-2 ${tier.recommended ? 'bg-[#1E4A74]/10' : 'bg-gray-100'}`}>
                  <Icon className={`w-5 h-5 ${tier.recommended ? 'text-[#1E4A74]' : 'text-gray-600'}`} />
                </div>
                <h3 className={`font-bold text-gray-900 ${compact ? 'text-base' : 'text-lg'}`}>
                  {tier.name}
                </h3>
              </div>

              <div className="flex items-baseline gap-1">
                <span className={`font-bold text-gray-900 ${compact ? 'text-2xl' : 'text-3xl'}`}>
                  {tier.price}
                </span>
                <span className="text-sm text-gray-500">{tier.priceLabel}</span>
              </div>

              <ul className={`space-y-2 ${compact ? 'text-sm' : ''}`}>
                {tier.features.map((feature, i) => (
                  <li key={i} className="flex items-start gap-2 text-gray-600">
                    <Check className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              {isCurrentPlan ? (
                <div className="w-full py-2.5 px-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-center text-sm font-medium">
                  Your Current Plan
                </div>
              ) : isSubscriptionTier && hasActiveSub ? (
                <button
                  disabled
                  className="w-full py-2.5 px-4 rounded-lg bg-gray-100 text-gray-400 text-sm font-medium cursor-not-allowed"
                >
                  {tier.cta}
                </button>
              ) : (
                <button
                  onClick={handlers[idx]}
                  className={`w-full py-2.5 px-4 rounded-lg text-sm font-semibold transition-colors ${
                    tier.recommended
                      ? 'bg-[#1E4A74] text-white hover:bg-[#163a5e]'
                      : 'bg-gray-900 text-white hover:bg-gray-800'
                  }`}
                >
                  {tier.cta} &mdash; {tier.price}{tier.priceLabel !== 'per listing' ? '/mo' : ''}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
