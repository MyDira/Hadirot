import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Pencil,
  Eye,
  MousePointerClick,
  MessageSquare,
  EyeOff,
  RefreshCw,
  Trash2,
  CheckCircle,
  XCircle,
  ShieldCheck,
  CreditCard,
  CalendarClock,
  Loader2,
} from 'lucide-react';
import { Listing, supabase } from '@/config/supabase';
import { listingsService, getDaysUntilExpiration } from '@/services/listings';
import { paymentsService, type MonetizationListingFields } from '@/services/payments';
import { monetizationStatusService } from '@/services/monetizationStatus';
import { subscriptionsService } from '@/services/subscriptions';
import { agentFreePostingService } from '@/services/agentFreePosting';
import { getRentalStatusLine } from '@/utils/listingStatusLine';
import type { ListingSubscription, PaymentKind } from '@/types/monetization';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';

interface AdminListingBannerProps {
  listing: Listing;
  userId: string;
  isAdmin?: boolean;
  onUnpublish?: () => void;
  onApprove?: () => void;
  onRefresh?: () => void;
}

// Map a Listing row to the fields the payment-state deriver needs. New
// monetization columns may be absent on some fetched shapes; default to null.
function toMonetizationFields(l: Listing): MonetizationListingFields {
  const row = l as Listing & {
    payment_kind?: PaymentKind | null;
    trial_started_at?: string | null;
    paid_until?: string | null;
    paused_paid_days?: number | null;
    deactivated_at?: string | null;
  };
  return {
    id: row.id,
    user_id: row.user_id,
    listing_type: row.listing_type ?? 'rental',
    is_active: row.is_active ?? false,
    approved: row.approved ?? null,
    payment_kind: row.payment_kind ?? null,
    trial_started_at: row.trial_started_at ?? null,
    paid_until: row.paid_until ?? null,
    paused_paid_days: row.paused_paid_days ?? 0,
    expires_at: row.expires_at ?? null,
    deactivated_at: row.deactivated_at ?? null,
    created_at: row.created_at ?? null,
  };
}

export function AdminListingBanner({
  listing,
  userId,
  isAdmin = false,
  onUnpublish,
  onApprove,
  onRefresh,
}: AdminListingBannerProps) {
  const navigate = useNavigate();
  const [showUnpublishDialog, setShowUnpublishDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [approveLoading, setApproveLoading] = useState(false);
  const [rejectLoading, setRejectLoading] = useState(false);
  const [republishLoading, setRepublishLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Live stats + monetization context (fetched for owner/admin only).
  const [metrics, setMetrics] = useState<{ impressions: number; directViews: number }>({
    impressions: listing.impressions ?? 0,
    directViews: listing.direct_views ?? 0,
  });
  const [inquiries, setInquiries] = useState<number>(0);
  const [monetizationEnabled, setMonetizationEnabled] = useState<boolean>(false);
  const [subscription, setSubscription] = useState<ListingSubscription | null>(null);
  const [isFreeAgent, setIsFreeAgent] = useState<boolean>(false);

  const isOwner = listing.user_id === userId;
  const canManage = isOwner || isAdmin;

  useEffect(() => {
    if (!canManage) return;
    let cancelled = false;

    (async () => {
      // Stats: impressions/direct_views live in listing_metrics_v1 (the detail
      // fetch doesn't join it), inquiries via the owner-scoped RPC.
      try {
        const { data } = await supabase
          .from('listing_metrics_v1')
          .select('impressions, direct_views')
          .eq('listing_id', listing.id)
          .maybeSingle();
        if (!cancelled && data) {
          setMetrics({
            impressions: Number((data as { impressions?: number }).impressions ?? 0) || 0,
            directViews: Number((data as { direct_views?: number }).direct_views ?? 0) || 0,
          });
        }
      } catch (err) {
        console.warn('[AdminListingBanner] metrics fetch failed:', err);
      }

      try {
        const { data } = await supabase.rpc('get_owner_listing_inquiry_counts');
        if (!cancelled && Array.isArray(data)) {
          const row = (data as Array<{ listing_id: string; inquiry_count: number }>).find(
            (r) => r.listing_id === listing.id,
          );
          setInquiries(row?.inquiry_count ?? 0);
        }
      } catch (err) {
        console.warn('[AdminListingBanner] inquiry count fetch failed:', err);
      }

      try {
        const status = await monetizationStatusService.get();
        if (!cancelled) setMonetizationEnabled(status.enabled);
      } catch (err) {
        console.warn('[AdminListingBanner] monetization status fetch failed:', err);
      }

      // Subscription + free-agent status only meaningful for the owner viewing
      // their own listing (both are caller-scoped).
      if (isOwner) {
        try {
          const sub = await subscriptionsService.getMyActiveSubscription();
          if (!cancelled) setSubscription(sub);
        } catch (err) {
          console.warn('[AdminListingBanner] subscription fetch failed:', err);
        }
        try {
          const fa = await agentFreePostingService.isUserFreeAgent(listing.user_id);
          if (!cancelled) setIsFreeAgent(fa);
        } catch (err) {
          console.warn('[AdminListingBanner] free-agent check failed:', err);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [listing.id, listing.user_id, isOwner, canManage]);

  if (!canManage) {
    return null;
  }

  const isRental = (listing.listing_type ?? 'rental') === 'rental';
  const daysUntilExpiration = getDaysUntilExpiration(listing.expires_at);
  const payState =
    monetizationEnabled && isRental
      ? paymentsService.derivePaymentState(toMonetizationFields(listing), {
          hasActiveSubscription: subscription !== null,
          isAdmin,
        })
      : null;
  const status = getRentalStatusLine(listing, payState, daysUntilExpiration, isFreeAgent);
  const showPayAction =
    !isFreeAgent &&
    !!payState?.nextActionUrl &&
    payState.nextActionUrl.includes('action=pay');

  const expiryText = listing.expires_at
    ? new Date(listing.expires_at).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  const handleEdit = () => navigate(`/edit/${listing.id}`);

  const handleRepublish = async () => {
    setRepublishLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      await listingsService.renewListing(
        listing.id,
        (listing.listing_type ?? 'rental') as 'rental' | 'sale',
        listing.sale_status ?? null,
      );
      setSuccessMessage('Listing is live again.');
      onRefresh?.();
    } catch (err) {
      console.error('Error republishing listing:', err);
      setError('Failed to republish listing. Please try again.');
    } finally {
      setRepublishLoading(false);
    }
  };

  const handleUnpublish = async () => {
    setLoading(true);
    setError(null);
    try {
      await listingsService.updateListing(listing.id, { is_active: false });
      setShowUnpublishDialog(false);
      onUnpublish?.();
    } catch (err) {
      console.error('Error unpublishing listing:', err);
      setError('Failed to unpublish listing. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setLoading(true);
    setError(null);
    try {
      await listingsService.deleteListing(listing.id);
      setShowDeleteDialog(false);
      navigate('/dashboard');
    } catch (err) {
      console.error('Error deleting listing:', err);
      setError('Failed to delete listing. Please try again.');
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    setApproveLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      await listingsService.updateListing(listing.id, { approved: true, is_active: true });
      setSuccessMessage('Listing approved successfully!');
      onApprove?.();
    } catch (err) {
      console.error('Error approving listing:', err);
      setError('Failed to approve listing. Please try again.');
    } finally {
      setApproveLoading(false);
    }
  };

  const handleReject = async () => {
    if (!confirm('Are you sure you want to reject this listing? This will permanently delete it.')) {
      return;
    }
    setRejectLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      await listingsService.deleteListing(listing.id);
      navigate('/admin?tab=pending');
    } catch (err) {
      console.error('Error rejecting listing:', err);
      setError('Failed to reject listing. Please try again.');
      setRejectLoading(false);
    }
  };

  // Contextual primary action (mirrors the dashboard card priority).
  type Primary = {
    label: string;
    onClick: () => void;
    cls: string;
    icon: 'pay' | 'refresh';
    busy?: boolean;
  } | null;
  let primary: Primary = null;
  const lr = listing as Listing & {
    trial_started_at?: string | null;
    paused_paid_days?: number | null;
  };
  if (showPayAction && payState?.nextActionUrl) {
    primary = {
      label: payState.label === 'paid_expired' ? 'Relist — add days' : 'Keep it active',
      onClick: () => navigate(payState.nextActionUrl!),
      cls: 'bg-emerald-600 hover:bg-emerald-700 text-white',
      icon: 'pay',
    };
  } else if (!listing.is_active && listing.approved) {
    const trialExpired =
      payState?.paymentKind === 'individual_trial' &&
      !!lr.trial_started_at &&
      Date.now() > new Date(lr.trial_started_at).getTime() + 14 * 86400000;
    const paidExhausted =
      payState?.paymentKind === 'individual_paid' && (lr.paused_paid_days ?? 0) <= 0;
    const unpaid = payState?.paymentKind === 'pending_payment';
    const needsPaymentToRepublish =
      !isFreeAgent && monetizationEnabled && isRental && (trialExpired || paidExhausted || unpaid);
    primary = needsPaymentToRepublish
      ? {
          label: 'Add days to relist',
          onClick: () => navigate(`/dashboard?listing=${listing.id}&action=pay`),
          cls: 'bg-emerald-600 hover:bg-emerald-700 text-white',
          icon: 'pay',
        }
      : {
          label: 'Republish',
          onClick: handleRepublish,
          cls: 'bg-brand-600 hover:bg-brand-700 text-white',
          icon: 'refresh',
          busy: republishLoading,
        };
  } else if (listing.is_active && daysUntilExpiration != null && daysUntilExpiration <= 7) {
    primary = {
      label: 'Extend',
      onClick: handleRepublish,
      cls: 'bg-brand-600 hover:bg-brand-700 text-white',
      icon: 'refresh',
      busy: republishLoading,
    };
  }

  const stats: Array<{ icon: typeof Eye; label: string; value: number }> = [
    { icon: Eye, label: 'Impressions', value: metrics.impressions },
    { icon: MousePointerClick, label: 'Direct views', value: metrics.directViews },
    { icon: MessageSquare, label: 'Inquiries', value: inquiries },
  ];

  const secondaryBtn =
    'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

  return (
    <>
      <div className="mb-6 rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        {/* Pending-approval notice */}
        {!listing.approved && (
          <div className="flex items-center gap-2 bg-amber-50 border-b border-amber-200 px-4 sm:px-5 py-2.5">
            <CalendarClock className="w-4 h-4 text-amber-500 flex-shrink-0" />
            <span className="text-sm font-medium text-amber-800">
              This listing is pending approval
            </span>
          </div>
        )}

        <div className="p-4 sm:p-5 space-y-4">
          {/* Header: ownership tag + friendly status */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 text-brand-700 border border-brand-100 px-2.5 py-1 text-xs font-semibold">
              <ShieldCheck className="w-3.5 h-3.5" />
              {isOwner ? 'Your listing' : 'Admin controls'}
            </span>
            <span
              className={`inline-flex items-center gap-1.5 text-sm font-medium ${
                status.tone === 'good'
                  ? 'text-emerald-700'
                  : status.tone === 'warn'
                    ? 'text-amber-700'
                    : 'text-gray-500'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${status.dot}`} />
              {status.text}
            </span>
            {expiryText && (
              <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                <CalendarClock className="w-3.5 h-3.5" />
                Expires {expiryText}
              </span>
            )}
          </div>

          {/* Stats + actions */}
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="grid grid-cols-3 gap-2 sm:flex sm:gap-2">
              {stats.map(({ icon: Icon, label, value }) => (
                <div
                  key={label}
                  className="flex items-center gap-2.5 rounded-xl bg-gray-50 border border-gray-100 px-3 py-2 min-w-0 sm:min-w-[104px]"
                >
                  <Icon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <div className="leading-tight min-w-0">
                    <div className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold truncate">
                      {label}
                    </div>
                    <div className="text-base font-bold text-gray-900 tabular-nums">
                      {value.toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Admin approve/reject for pending listings */}
              {isAdmin && !listing.approved && (
                <>
                  <button
                    onClick={handleApprove}
                    disabled={approveLoading || loading}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-emerald-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {approveLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                    Approve
                  </button>
                  <button
                    onClick={handleReject}
                    disabled={rejectLoading || loading}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-red-700 bg-white border border-red-200 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-red-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {rejectLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                    Reject
                  </button>
                </>
              )}

              {/* Contextual primary action */}
              {primary && (
                <button
                  onClick={primary.onClick}
                  disabled={!!primary.busy}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-brand-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${primary.cls}`}
                >
                  {primary.busy ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : primary.icon === 'pay' ? (
                    <CreditCard className="w-4 h-4" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                  {primary.label}
                </button>
              )}

              <button onClick={handleEdit} className={secondaryBtn}>
                <Pencil className="w-4 h-4" />
                Edit
              </button>

              {listing.is_active && (
                <button onClick={() => setShowUnpublishDialog(true)} className={secondaryBtn}>
                  <EyeOff className="w-4 h-4" />
                  Pause
                </button>
              )}

              {!listing.is_active && listing.approved && !primary && (
                <button onClick={handleRepublish} disabled={republishLoading} className={secondaryBtn}>
                  {republishLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  Republish
                </button>
              )}

              <button
                onClick={() => setShowDeleteDialog(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-red-600 bg-white border border-gray-200 hover:bg-red-50 hover:border-red-200 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-red-400 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            </div>
          </div>

          {error && <div className="text-sm text-red-600">{error}</div>}
          {successMessage && (
            <div className="text-sm text-emerald-600 font-medium">{successMessage}</div>
          )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={showUnpublishDialog}
        onClose={() => setShowUnpublishDialog(false)}
        onConfirm={handleUnpublish}
        title="Unpublish Listing"
        message="Are you sure you want to unpublish this listing? It will be hidden from public view but can be republished later from your dashboard."
        confirmText="Unpublish"
        cancelText="Cancel"
        severity="warning"
        loading={loading}
      />

      <ConfirmDialog
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={handleDelete}
        title="Delete Listing"
        message="This action cannot be undone. All listing data, images, and analytics will be permanently deleted."
        confirmText="Delete Permanently"
        cancelText="Cancel"
        severity="danger"
        requireTextConfirmation
        confirmationText="DELETE"
        loading={loading}
      />
    </>
  );
}
