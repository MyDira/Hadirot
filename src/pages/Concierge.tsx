import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Briefcase } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { conciergeService, generateEmailHandle } from '../services/concierge';
import { TierCards } from '../components/concierge/TierCards';
import { Tier1BlurbForm } from '../components/concierge/Tier1BlurbForm';
import { Tier2Confirmation } from '../components/concierge/Tier2Confirmation';
import { Tier3SourcesForm } from '../components/concierge/Tier3SourcesForm';
import { Modal } from '../components/shared/Modal';
import { AuthForm } from '../components/auth/AuthForm';
import type { ConciergeSubscription } from '../config/supabase';

type ActiveFlow = null | 'tier1' | 'tier2' | 'tier3';

export function Concierge() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [activeFlow, setActiveFlow] = useState<ActiveFlow>(null);
  const [loading, setLoading] = useState(false);
  const [activeSub, setActiveSub] = useState<ConciergeSubscription | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [pendingTier, setPendingTier] = useState<ActiveFlow>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      conciergeService.getUserActiveSubscription().then(setActiveSub).catch(() => {});
    }
  }, [user]);

  useEffect(() => {
    if (user && pendingTier) {
      setShowAuthModal(false);
      setActiveFlow(pendingTier);
      setPendingTier(null);
    }
  }, [user, pendingTier]);

  const requireAuth = (tier: ActiveFlow) => {
    if (!user) {
      setPendingTier(tier);
      setShowAuthModal(true);
      return;
    }
    setActiveFlow(tier);
  };

  const emailHandle = profile?.full_name
    ? generateEmailHandle(profile.full_name)
    : 'yourname';

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

  const handleTier2Confirm = async () => {
    setLoading(true);
    setError(null);
    try {
      const { url } = await conciergeService.createCheckoutSession({
        tier: 'tier2_forward',
      });
      if (url) window.location.href = url;
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const handleTier3Submit = async (sources: { name: string; link: string }[]) => {
    setLoading(true);
    setError(null);
    try {
      const { url } = await conciergeService.createCheckoutSession({
        tier: 'tier3_vip',
        sources,
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

      {activeFlow === 'tier1' ? (
        <div className="max-w-2xl mx-auto bg-white rounded-xl border border-gray-200 shadow-sm p-6 sm:p-8">
          <Tier1BlurbForm
            onSubmit={handleTier1Submit}
            onBack={() => setActiveFlow(null)}
            loading={loading}
          />
        </div>
      ) : activeFlow === 'tier2' ? (
        <div className="max-w-2xl mx-auto bg-white rounded-xl border border-gray-200 shadow-sm p-6 sm:p-8">
          <Tier2Confirmation
            emailHandle={emailHandle}
            onConfirm={handleTier2Confirm}
            onBack={() => setActiveFlow(null)}
            loading={loading}
          />
        </div>
      ) : activeFlow === 'tier3' ? (
        <div className="max-w-2xl mx-auto bg-white rounded-xl border border-gray-200 shadow-sm p-6 sm:p-8">
          <Tier3SourcesForm
            onSubmit={handleTier3Submit}
            onBack={() => setActiveFlow(null)}
            loading={loading}
          />
        </div>
      ) : (
        <TierCards
          activeSubscription={activeSub}
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
