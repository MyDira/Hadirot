import React, { useState, useEffect } from "react";
import { CreditCard, ExternalLink, Receipt, Clock, Star } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/config/supabase";
import { stripeService, type FeaturedPurchase } from "@/services/stripe";

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

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
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
      ? `${formatDate(purchase.featured_start)} – ${formatDate(purchase.featured_end)}`
      : "—";

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

  useEffect(() => {
    if (!user) return;
    setBillingLoading(true);
    setBillingError(null);
    stripeService
      .getUserPurchases()
      .then((data) => setPurchases(data))
      .catch(() => setBillingError("Failed to load billing history."))
      .finally(() => setBillingLoading(false));
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
          ? "No billing account found. Complete a featured listing purchase first."
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

      <p className="text-sm text-gray-500 mb-6">
        View your featured listing purchase history. Use "Manage Billing" to access invoices and receipts for purchases made after connecting your billing account.
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
