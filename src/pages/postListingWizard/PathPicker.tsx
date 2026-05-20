import React from 'react';
import { Home, Building2, Store, Star, Clock } from 'lucide-react';
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
    icon: <Home className="w-9 h-9" />,
    title: 'Residential Rental',
    description: 'Apartments & houses for rent',
    active: true,
  },
  {
    path: 'residential_sale',
    icon: <Building2 className="w-9 h-9" />,
    title: 'Residential Sale',
    description: 'Single-family, condos & multi-family',
    active: true,
  },
  {
    path: 'commercial_lease',
    icon: <Store className="w-9 h-9" />,
    title: 'Commercial Rental',
    description: 'Office, retail & industrial spaces',
    active: true,
  },
  {
    path: 'commercial_sale',
    icon: <Store className="w-9 h-9" />,
    title: 'Commercial Sale',
    description: 'Investment & owner-occupied properties',
    active: true,
  },
  {
    path: 'concierge',
    icon: <Star className="w-9 h-9" />,
    title: 'List with AI',
    description: 'Describe your property and AI writes, prices, and posts your listing for you',
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
    <div className="max-w-xl mx-auto px-4 py-6">
      <div className="text-center mb-5">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Post a Listing</h1>
        <p className="text-gray-500 text-sm">What type of listing are you posting?</p>
        <p className="flex items-center justify-center gap-1.5 text-xs text-gray-400 mt-1.5">
          <Clock className="w-3.5 h-3.5" />
          Takes 1–2 minutes
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        {gridCards.map((card) => (
          <button
            key={card.path}
            type="button"
            onClick={() => card.active && onSelect(card.path)}
            disabled={!card.active}
            className={`aspect-[1/0.88] flex flex-col items-center justify-center gap-2 p-3 rounded-2xl border-2 text-center transition-all ${
              card.active
                ? 'border-gray-200 bg-white hover:border-accent-500 hover:shadow-md cursor-pointer'
                : 'border-gray-100 bg-gray-50 cursor-not-allowed opacity-60'
            }`}
          >
            <div
              className={`w-14 h-14 rounded-xl flex items-center justify-center ${
                card.active ? 'bg-accent-50 text-accent-600' : 'bg-gray-100 text-gray-400'
              }`}
            >
              {card.icon}
            </div>
            <div>
              <div className="font-semibold text-gray-900 text-sm leading-tight">{card.title}</div>
              {!card.active && (
                <span className="text-[11px] font-medium bg-gray-200 text-gray-500 px-2 py-0.5 rounded-full mt-1 inline-block">
                  Coming Soon
                </span>
              )}
              {card.active && (
                <p className="text-xs text-gray-500 mt-1 leading-snug">{card.description}</p>
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
          className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 text-left transition-all ${
            wideCard.active
              ? 'border-gray-200 bg-white hover:border-accent-500 hover:shadow-md cursor-pointer'
              : 'border-gray-100 bg-gray-50 cursor-not-allowed opacity-60'
          }`}
        >
          <div className="w-14 h-14 flex-shrink-0 rounded-xl flex items-center justify-center bg-gray-100 text-gray-400">
            {wideCard.icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-gray-900 text-sm">{wideCard.title}</div>
            <p className="text-xs text-gray-500 mt-0.5 leading-snug">{wideCard.description}</p>
          </div>
          <span className="text-[11px] font-medium bg-gray-200 text-gray-500 px-2 py-0.5 rounded-full flex-shrink-0">
            Coming Soon
          </span>
        </button>
      )}
    </div>
  );
}
