import React, { useState, useEffect } from "react";
import { CreditCard, ExternalLink, Receipt, Clock, Star, Mail, Crown, Briefcase, Plus, Trash2, CheckCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/config/supabase";
import { stripeService, type FeaturedPurchase } from "@/services/stripe";
import { conciergeService } from "@/services/concierge";
import type { ConciergeSubscription } from "@/config/supabase";

const PLAN_LABELS: Record<string, string> = {
  "7day": "1 Week",
  "14day": "2 Weeks",
  "30day": "1 Month",
};

const STATUS_STYLES: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  paid: "bg-blue-100 text-blue-800",
  pending: "bg-yellow-100 text-yellow-800",
  expired: "bg-gray-100 text-gray-600",
  cancelled: "bg-gray-100 text-gray-600",
  refunded: "bg-orange-100 text-orange-700",
  free: "bg-teal-100 text-teal-800",
};

const TIER_DISPLAY: Record<string, { name: string; price: string; icon: typeof Star }> = {
  tier1_quick: { name: "Quick Post", price: "$25 per listing", icon: Star },
  tier2_forward: { name: "Forward & Post", price: "$125/mo", icon: Mail },
  tier3_vip: { name: "VIP / Full Service", price: "$200/mo", icon: Crown },
};

function formatDate(iso: string | null): string {
  if (!iso) return "\u2014";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

interface SourceEntry {
  name: string;
  link: string;
}

function EditSourcesForm({ initialSources, onSaved }: { initialSources: SourceEntry[]; onSaved: (sources: SourceEntry[]) => void }) {
  const [sources, setSources] = useState<SourceEntry[]>(
    initialSources.length > 0 ? initialSources : [{ name: '', link: '' }]
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addSource = () => {
    if (sources.length < 10) setSources([...sources, { name: '', link: '' }]);
  };

  const removeSource = (idx: number) => {
    if (sources.length > 1) setSources(sources.filter((_, i) => i !== idx));
  };

  const updateSource = (idx: number, field: keyof SourceEntry, value: string) => {
    setSources(sources.map((s, i) => (i === idx ? { ...s, [field]: value } : s)));
  };

  const validSources = sources.filter((s) => s.name.trim());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (validSources.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      await conciergeService.updateSubscriptionSources(validSources);
      onSaved(validSources);
    } catch (err: any) {
      setError(err.message || 'Failed to save sources');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-4 space-y-3">
      {error && (
        <div className="p-3 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      <label className="block text-sm font-medium text-gray-700">Your listing sources</label>
      {sources.map((source, idx) => (
        <div key={idx} className="flex items-start gap-2">
          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              type="text"
              value={source.name}
              onChange={(e) => updateSource(idx, 'name', e.target.value)}
              placeholder="Source name"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#1E4A74] focus:ring-1 focus:ring-[#1E4A74] outline-none"
            />
            <input
              type="text"
              value={source.link}
              onChange={(e) => updateSource(idx, 'link', e.target.value)}
              placeholder="Link / URL (optional)"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#1E4A74] focus:ring-1 focus:ring-[#1E4A74] outline-none"
            />
          </div>
          {sources.length > 1 && (
            <button type="button" onClick={() => removeSource(idx)} className="p-2 mt-0.5 text-gray-400 hover:text-red-500 transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      ))}

      {sources.length < 10 && (
        <button type="button" onClick={addSource} className="flex items-center gap-1.5 text-sm text-[#1E4A74] hover:text-[#163a5e] font-medium transition-colors">
          <Plus className="w-4 h-4" />
          Add another source
        </button>
      )}

      <button
        type="submit"
        disabled={validSources.length === 0 || loading}
        className="flex items-center gap-2 bg-[#1E4A74] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#163a5e] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? (
          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
        ) : (
          <CheckCircle className="w-4 h-4" />
        )}
        Save Sources
      </button>
    </form>
  );
}

function ConciergeSubscriptionCard({ subscription, onManageBilling }: { subscription: ConciergeSubscription; onManageBilling: () => void }) {
  const tierInfo = TIER_DISPLAY[subscription.tier] || TIER_DISPLAY.tier1_quick;
  const Icon = tierInfo.icon;
  const [showEditSources, setShowEditSources] = useState(false);
  const [currentSources, setCurrentSources] = useState(subscription.sources || []);

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5 mb-6">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#1E4A74]/10 flex items-center justify-center">
            <Icon className="w-5 h-5 text-[#1E4A74]" />
          </div>
          <div>
            <h3 className="font-semibold text-[#273140]">Concierge: {tierInfo.name}</h3>
            <p className="text-sm text-gray-500">{tierInfo.price}</p>
          </div>
        </div>
        <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_STYLES[subscription.status] || 'bg-gray-100 text-gray-600'}`}>
          {subscription.status}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <div>
          <span className="text-gray-500">Subscribed since</span>
          <p className="font-medium text-gray-800">{formatDate(subscription.created_at)}</p>
        </div>

        {subscription.tier === 'tier2_forward' && subscription.email_handle && (
          <div>
            <span className="text-gray-500">Your email address</span>
            <div className="mt-1 bg-[#F0F9FF] border border-[#1E4A74]/20 rounded-md px-3 py-1.5 inline-flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-[#1E4A74]" />
              <span className="text-sm font-medium text-[#1E4A74]">{subscription.email_handle}@list.hadirot.com</span>
            </div>
          </div>
        )}

        {subscription.tier === 'tier3_vip' && (
          <div>
            <span className="text-gray-500">Listing sources</span>
            {currentSources.length > 0 ? (
              <ul className="mt-1 space-y-0.5">
                {currentSources.map((s, i) => (
                  <li key={i} className="text-sm text-gray-700">{s.name}{s.link ? ` \u2014 ${s.link}` : ''}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-amber-600 mt-1">No sources configured yet</p>
            )}
          </div>
        )}
      </div>

      {subscription.tier === 'tier3_vip' && (
        <>
          {!showEditSources ? (
            <button
              onClick={() => setShowEditSources(true)}
              className="mt-3 text-sm text-[#1E4A74] hover:text-[#163a5e] font-medium transition-colors"
            >
              {currentSources.length > 0 ? 'Edit Sources' : 'Add Sources'}
            </button>
          ) : (
            <>
              <EditSourcesForm
                initialSources={currentSources}
                onSaved={(saved) => {
                  setCurrentSources(saved);
                  setShowEditSources(false);
                }}
              />
              <button
                onClick={() => setShowEditSources(false)}
                className="mt-2 text-sm text-gray-400 hover:text-gray-600 transition-colors"
              >
                Cancel
              </button>
            </>
          )}
        </>
      )}

      <div className="mt-4 pt-4 border-t border-gray-100 flex gap-3">
        <button
          onClick={onManageBilling}
          className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
          Manage Subscription
        </button>
      </div>
    </div>
  );
}

function PurchaseRow({ purchase }: { purchase: FeaturedPurchase }) {
  const listingTitle =
    purchase.listings?.title || `Listing ${purchase.listing_id.slice(0, 8)}`;
  const planLabel =
    PLAN_LABELS[purchase.plan] || purchase.plan || `${purchase.duration_days}d`;
  const amount =
    purchase.is_admin_granted && purchase.amount_cents === 0
      ? "Free"
      : `$${(purchase.amount_cents / 100).toFixed(2)}`;
  const statusStyle =
    STATUS_STYLES[purchase.status] || "bg-gray-100 text-gray-600";
  const boostPeriod =
    purchase.featured_start && purchase.featured_end
      ? `${formatDate(purchase.featured_start)} \u2013 ${formatDate(purchase.featured_end)}`
      : "\u2014";

  return (
    <tr className="hover:bg-gray-50 transition-colors">
      <td className="py-3 pr-4">
        <div className="font-medium text-[#273140] truncate max-w-[180px]" title={listingTitle}>
          {listingTitle}
        </div>
        {purchase.listings?.neighborhood && (
          <div className="text-xs text-gray-400 mt-0.5">
            {purchase.listings.neighborhood}
          </div>
        )}
      </td>
      <td className="py-3 pr-4">
        <span className="inline-flex items-center gap-1 text-gray-700">
          <Star className="w-3 h-3 text-yellow-500" />
          {planLabel}
        </span>
      </td>
      <td className="py-3 pr-4 text-gray-700 font-medium">{amount}</td>
      <td className="py-3 pr-4 text-gray-500">
        <span className="inline-flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {formatDate(purchase.purchased_at || purchase.created_at)}
        </span>
      </td>
      <td className="py-3 pr-4 text-gray-500 whitespace-nowrap">{boostPeriod}</td>
      <td className="py-3">
        <span
          className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize ${statusStyle}`}
        >
          {purchase.status}
        </span>
      </td>
    </tr>
  );
}

export default function BillingTab() {
  const { user } = useAuth();
  const [purchases, setPurchases] = useState<FeaturedPurchase[]>([]);
  const [billingLoading, setBillingLoading] = useState(true);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);
  const [conciergeSub, setConciergeSub] = useState<ConciergeSubscription | null>(null);

  useEffect(() => {
    if (!user) return;
    setBillingLoading(true);
    setBillingError(null);

    Promise.all([
      stripeService.getUserPurchases().catch(() => [] as FeaturedPurchase[]),
      conciergeService.getUserActiveSubscription().catch(() => null),
    ]).then(([purchasesData, sub]) => {
      setPurchases(purchasesData);
      setConciergeSub(sub);
    }).catch(() => {
      setBillingError("Failed to load billing history.");
    }).finally(() => {
      setBillingLoading(false);
    });
  }, [user]);

  const handleManageBilling = async () => {
    setPortalLoading(true);
    setPortalError(null);
    try {
      const { data, error } = await supabase.functions.invoke(
        "create-portal-session",
        {}
      );
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      window.location.href = data.url;
    } catch (err: any) {
      setPortalError(
        err.message?.includes("No billing account")
          ? "No billing account found. Subscribe to a service or boost a listing to set up billing."
          : "Unable to open billing portal. Please try again."
      );
      setPortalLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-[#273140] flex items-center">
          <CreditCard className="w-5 h-5 mr-2" />
          Billing &amp; Payments
        </h2>
        <button
          onClick={handleManageBilling}
          disabled={portalLoading}
          className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#273140] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <ExternalLink className="w-4 h-4 mr-2" />
          {portalLoading ? "Opening..." : "Manage Billing"}
        </button>
      </div>

      {portalError && (
        <div className="mb-4 p-3 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm">
          {portalError}
        </div>
      )}

      {conciergeSub && (
        <ConciergeSubscriptionCard
          subscription={conciergeSub}
          onManageBilling={handleManageBilling}
        />
      )}

      {!conciergeSub && !billingLoading && (
        <div className="mb-6 p-4 rounded-lg bg-gray-50 border border-gray-200">
          <div className="flex items-center gap-3">
            <Briefcase className="w-5 h-5 text-gray-400" />
            <p className="text-sm text-gray-600">
              Need help posting listings?{" "}
              <Link to="/concierge" className="text-[#1E4A74] hover:underline font-medium">
                Try our Concierge service
              </Link>
            </p>
          </div>
        </div>
      )}

      <p className="text-sm text-gray-500 mb-6">
        View your featured listing purchase history. Use "Manage Billing" to access invoices and receipts.
      </p>

      {billingLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 bg-gray-100 rounded-md animate-pulse" />
          ))}
        </div>
      ) : billingError ? (
        <div className="p-4 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm">
          {billingError}
        </div>
      ) : purchases.length === 0 ? (
        <div className="text-center py-10 text-gray-500">
          <Receipt className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          <p className="font-medium text-gray-600">No purchases yet</p>
          <p className="text-sm mt-1">
            Feature a listing from your dashboard to boost its visibility.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left">
                <th className="pb-3 pr-4 font-medium text-gray-600">Listing</th>
                <th className="pb-3 pr-4 font-medium text-gray-600">Plan</th>
                <th className="pb-3 pr-4 font-medium text-gray-600">Amount</th>
                <th className="pb-3 pr-4 font-medium text-gray-600">Date</th>
                <th className="pb-3 pr-4 font-medium text-gray-600">Boost Period</th>
                <th className="pb-3 font-medium text-gray-600">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {purchases.map((p) => (
                <PurchaseRow key={p.id} purchase={p} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
