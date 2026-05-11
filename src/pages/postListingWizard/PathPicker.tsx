import React from 'react';
import { Home, Building2, Store, DollarSign, Star } from 'lucide-react';
import type { WizardPath } from './useWizardState';

interface PathCard {
  path: WizardPath;
  icon: React.ReactNode;
  title: string;
  description: string;
  active: boolean;
  wide?: boolean;
}

const CARDS: PathCard[] = [
  {
    path: 'residential_rent',
    icon: <Home className="w-7 h-7" />,
    title: 'Residential Rental',
    description: 'Apartments, houses & rooms for rent',
    active: true,
  },
  {
    path: 'residential_sale',
    icon: <Building2 className="w-7 h-7" />,
    title: 'Residential Sale',
    description: 'Single-family, condos & multi-family',
    active: false,
  },
  {
    path: 'commercial_lease',
    icon: <Store className="w-7 h-7" />,
    title: 'Commercial Lease',
    description: 'Office, retail & industrial spaces',
    active: false,
  },
  {
    path: 'commercial_sale',
    icon: <DollarSign className="w-7 h-7" />,
    title: 'Commercial Sale',
    description: 'Investment & owner-occupied properties',
    active: false,
  },
  {
    path: 'concierge',
    icon: <Star className="w-7 h-7" />,
    title: 'Concierge Listing',
    description: 'We write and post your listing for you — hands-free',
    active: false,
    wide: true,
  },
];

interface PathPickerProps {
  onSelect: (path: WizardPath) => void;
}

export function PathPicker({ onSelect }: PathPickerProps) {
  const gridCards = CARDS.filter(c => !c.wide);
  const wideCard = CARDS.find(c => c.wide);

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Post a Listing</h1>
        <p className="text-gray-500 text-base">What type of listing are you posting?</p>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        {gridCards.map((card) => (
          <button
            key={card.path}
            type="button"
            onClick={() => card.active && onSelect(card.path)}
            disabled={!card.active}
            className={`flex flex-col items-center justify-center gap-3 p-6 rounded-2xl border-2 text-center transition-all aspect-square ${
              card.active
                ? 'border-gray-200 bg-white hover:border-accent-500 hover:shadow-md cursor-pointer'
                : 'border-gray-100 bg-gray-50 cursor-not-allowed opacity-60'
            }`}
          >
            <div
              className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
                card.active ? 'bg-accent-50 text-accent-600' : 'bg-gray-100 text-gray-400'
              }`}
            >
              {card.icon}
            </div>
            <div>
              <div className="font-semibold text-gray-900 text-sm leading-tight">{card.title}</div>
              {!card.active && (
                <span className="text-xs font-medium bg-gray-200 text-gray-500 px-2 py-0.5 rounded-full mt-1 inline-block">
                  Coming Soon
                </span>
              )}
              {card.active && (
                <p className="text-xs text-gray-500 mt-1">{card.description}</p>
              )}
            </div>
          </button>
        ))}
      </div>

      {wideCard && (
        <button
          type="button"
          onClick={() => wideCard.active && onSelect(wideCard.path)}
          disabled={!wideCard.active}
          className={`w-full flex items-center gap-5 p-6 rounded-2xl border-2 text-left transition-all ${
            wideCard.active
              ? 'border-gray-200 bg-white hover:border-accent-500 hover:shadow-md cursor-pointer'
              : 'border-gray-100 bg-gray-50 cursor-not-allowed opacity-60'
          }`}
        >
          <div className="w-14 h-14 flex-shrink-0 rounded-2xl flex items-center justify-center bg-gray-100 text-gray-400">
            {wideCard.icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-gray-900">{wideCard.title}</div>
            <p className="text-sm text-gray-500 mt-0.5">{wideCard.description}</p>
          </div>
          <span className="text-xs font-medium bg-gray-200 text-gray-500 px-2 py-0.5 rounded-full flex-shrink-0">
            Coming Soon
          </span>
        </button>
      )}
    </div>
  );
}
