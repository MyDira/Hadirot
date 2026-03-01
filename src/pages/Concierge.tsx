import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Briefcase } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { conciergeService } from '../services/concierge';
import { TierCards } from '../components/concierge/TierCards';
import { Tier1BlurbForm } from '../components/concierge/Tier1BlurbForm';
import { Modal } from '../components/shared/Modal';
import { AuthForm } from '../components/auth/AuthForm';
import type { ConciergeSubscription, ConciergeTier } from '../config/supabase';

export function Concierge() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [showBlurbForm, setShowBlurbForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingTier, setLoadingTier] = useState<ConciergeTier | null>(null);
  const [activeSub, setActiveSub] = useState<ConciergeSubscription | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [pendingTier, setPendingTier] = useState<'tier1' | 'tier2' | 'tier3' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      conciergeService.getUserActiveSubscription().then(setActiveSub).catch(() => {});
    }
  }, [user]);

  useEffect(() => {
    if (user && pendingTier) {
      setShowAuthModal(false);
      const tier = pendingTier;
      setPendingTier(null);
      if (tier === 'tier1') {
        setShowBlurbForm(true);
      } else if (tier === 'tier2') {
        handleDirectCheckout('tier2_forward');
      } else if (tier === 'tier3') {
        handleDirectCheckout('tier3_vip');
      }
    }
  }, [user, pendingTier]);

  const requireAuth = (tier: 'tier1' | 'tier2' | 'tier3') => {
    if (!user) {
      setPendingTier(tier);
      setShowAuthModal(true);
      return;
    }
    if (tier === 'tier1') {
      setShowBlurbForm(true);
    } else if (tier === 'tier2') {
      handleDirectCheckout('tier2_forward');
    } else if (tier === 'tier3') {
      handleDirectCheckout('tier3_vip');
    }
  };

  const handleDirectCheckout = async (tier: ConciergeTier) => {
    setLoadingTier(tier);
    setError(null);
    try {
      const { url } = await conciergeService.createCheckoutSession({ tier });
      if (url) window.location.href = url;
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
      setLoadingTier(null);
    }
  };

  const handleTier1Submit = async (blurb: string) => {
    setLoading(true);
    setError(null);
    try {
      const { url } = await conciergeService.createCheckoutSession({
        tier: 'tier1_quick',
        blurb,
      });
      if (url) window.location.href = url;
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const cancelled = searchParams.get('cancelled') === 'true';

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {cancelled && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          Payment was cancelled. You can try again anytime.
        </div>
      )}

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="text-center mb-10">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#1E4A74]/10 mb-4">
          <Briefcase className="w-7 h-7 text-[#1E4A74]" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-3">
          Hadirot Concierge
        </h1>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
          Too busy to post? Let us handle your listings. Choose the level of service that works for you.
        </p>
      </div>

      {showBlurbForm ? (
        <div className="max-w-2xl mx-auto bg-white rounded-xl border border-gray-200 shadow-sm p-6 sm:p-8">
          <Tier1BlurbForm
            onSubmit={handleTier1Submit}
            onBack={() => setShowBlurbForm(false)}
            loading={loading}
          />
        </div>
      ) : (
        <TierCards
          activeSubscription={activeSub}
          loadingTier={loadingTier}
          onSelectTier1={() => requireAuth('tier1')}
          onSelectTier2={() => requireAuth('tier2')}
          onSelectTier3={() => requireAuth('tier3')}
        />
      )}

      {showAuthModal && (
        <Modal isOpen={showAuthModal} onClose={() => { setShowAuthModal(false); setPendingTier(null); }}>
          <AuthForm onSuccess={() => {}} />
        </Modal>
      )}
    </div>
  );
}
