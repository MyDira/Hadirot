import React from 'react';
import { Clock, ArrowLeft } from 'lucide-react';

interface ComingSoonProps {
  onBack: () => void;
}

export function ComingSoon({ onBack }: ComingSoonProps) {
  return (
    <div className="max-w-lg mx-auto px-4 py-16 text-center">
      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-5">
        <Clock className="w-8 h-8 text-gray-400" />
      </div>
      <h2 className="text-2xl font-bold text-gray-900 mb-2">Coming Soon</h2>
      <p className="text-gray-500 mb-8">
        This listing type is not yet available in the new wizard. Check back soon!
      </p>
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 text-sm font-medium text-brand-700 hover:text-brand-900 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to listing types
      </button>
    </div>
  );
}
