import React, { useState, useEffect } from 'react';
import {
  DollarSign,
  ToggleLeft,
  ToggleRight,
  Edit2,
  Save,
  X,
  Plus,
  Gift,
  TrendingUp,
  Users as UsersIcon,
  CreditCard,
  Calendar,
} from 'lucide-react';
import { monetizationService } from '@/services/monetization';
import type {
  MonetizationFeature,
  SubscriptionPlan,
  FeaturePricing,
  PaymentTransaction,
  UserSubscription,
} from '@/services/monetization';

export function MonetizationPanel() {
  const [features, setFeatures] = useState<MonetizationFeature[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [pricing, setPricing] = useState<FeaturePricing[]>([]);
  const [transactions, setTransactions] = useState<PaymentTransaction[]>([]);
  const [subscriptions, setSubscriptions] = useState<UserSubscription[]>([]);
  const [revenueStats, setRevenueStats] = useState({
    totalRevenue: 0,
    subscriptionRevenue: 0,
    oneTimeRevenue: 0,
    transactionCount: 0,
    activeSubscriptions: 0,
  });
  const [loading, setLoading] = useState(true);
  const [editingPlan, setEditingPlan] = useState<string | null>(null);
  const [editingPricing, setEditingPricing] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<any>({});

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [
        featuresData,
        plansData,
        pricingData,
        transactionsData,
        subscriptionsData,
        statsData,
      ] = await Promise.all([
        monetizationService.getAllFeatures(),
        monetizationService.getAllSubscriptionPlans(),
        monetizationService.getAllFeaturePricing(),
        monetizationService.getAllTransactions(100),
        monetizationService.getAllActiveSubscriptions(),
        monetizationService.getRevenueStats(),
      ]);

      setFeatures(featuresData);
      setPlans(plansData);
      setPricing(pricingData);
      setTransactions(transactionsData);
      setSubscriptions(subscriptionsData);
      setRevenueStats(statsData);
    } catch (error) {
      console.error('Error loading monetization data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleFeature = async (featureKey: string, currentState: boolean) => {
    try {
      await monetizationService.toggleFeature(featureKey, !currentState);
      await loadData();
    } catch (error) {
      console.error('Error toggling feature:', error);
      alert('Failed to toggle feature');
    }
  };

  const handleTogglePlan = async (planId: string, currentState: boolean) => {
    try {
      await monetizationService.toggleSubscriptionPlan(planId, !currentState);
      await loadData();
    } catch (error) {
      console.error('Error toggling plan:', error);
      alert('Failed to toggle plan');
    }
  };

  const handleEditPlan = (plan: SubscriptionPlan) => {
    setEditingPlan(plan.id);
    setEditFormData({
      plan_name: plan.plan_name,
      price_cents: plan.price_cents,
      listings_per_month: plan.listings_per_month,
      stripe_price_id: plan.stripe_price_id || '',
    });
  };

  const handleSavePlan = async (planId: string) => {
    try {
      await monetizationService.updateSubscriptionPlan(planId, {
        plan_name: editFormData.plan_name,
        price_cents: parseInt(editFormData.price_cents),
        listings_per_month: parseInt(editFormData.listings_per_month),
        stripe_price_id: editFormData.stripe_price_id || null,
      });
      setEditingPlan(null);
      await loadData();
    } catch (error) {
      console.error('Error saving plan:', error);
      alert('Failed to save plan');
    }
  };

  const handleEditPricing = (price: FeaturePricing) => {
    setEditingPricing(price.id);
    setEditFormData({
      price_cents: price.price_cents,
      duration_days: price.duration_days || '',
      stripe_price_id: price.stripe_price_id || '',
    });
  };

  const handleSavePricing = async (pricingId: string) => {
    try {
      await monetizationService.updateFeaturePricing(pricingId, {
        price_cents: parseInt(editFormData.price_cents),
        duration_days: editFormData.duration_days ? parseInt(editFormData.duration_days) : null,
        stripe_price_id: editFormData.stripe_price_id || null,
      });
      setEditingPricing(null);
      await loadData();
    } catch (error) {
      console.error('Error saving pricing:', error);
      alert('Failed to save pricing');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">Loading monetization data...</div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="bg-gradient-to-r from-green-500 to-emerald-600 rounded-lg p-6 text-white">
        <div className="flex items-center gap-3 mb-4">
          <DollarSign className="h-8 w-8" />
          <h2 className="text-2xl font-bold">Monetization Control Center</h2>
        </div>
        <p className="text-green-50">
          Manage pricing, features, and subscriptions. All features are disabled by default until you're ready.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Revenue</p>
              <p className="text-2xl font-bold text-gray-900">
                {monetizationService.formatPrice(revenueStats.totalRevenue)}
              </p>
            </div>
            <TrendingUp className="h-8 w-8 text-green-500" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Subscriptions</p>
              <p className="text-2xl font-bold text-gray-900">{revenueStats.activeSubscriptions}</p>
            </div>
            <UsersIcon className="h-8 w-8 text-blue-500" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Transactions</p>
              <p className="text-2xl font-bold text-gray-900">{revenueStats.transactionCount}</p>
            </div>
            <CreditCard className="h-8 w-8 text-purple-500" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">One-Time Revenue</p>
              <p className="text-2xl font-bold text-gray-900">
                {monetizationService.formatPrice(revenueStats.oneTimeRevenue)}
              </p>
            </div>
            <DollarSign className="h-8 w-8 text-orange-500" />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Feature Controls</h3>
          <p className="text-sm text-gray-500 mt-1">
            Enable or disable individual monetization features
          </p>
        </div>
        <div className="p-6">
          <div className="space-y-4">
            {features.map((feature) => (
              <div
                key={feature.id}
                className="flex items-center justify-between p-4 border border-gray-200 rounded-lg"
              >
                <div>
                  <h4 className="font-medium text-gray-900">{feature.feature_name}</h4>
                  <p className="text-sm text-gray-500">{feature.description}</p>
                  <div className="mt-1">
                    <span
                      className={`inline-block px-2 py-1 text-xs rounded ${
                        feature.feature_type === 'subscription'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-green-100 text-green-800'
                      }`}
                    >
                      {feature.feature_type === 'subscription' ? 'Subscription' : 'One-Time'}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => handleToggleFeature(feature.feature_key, feature.is_enabled)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                    feature.is_enabled
                      ? 'bg-green-500 text-white hover:bg-green-600'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  {feature.is_enabled ? (
                    <>
                      <ToggleRight className="h-5 w-5" />
                      Enabled
                    </>
                  ) : (
                    <>
                      <ToggleLeft className="h-5 w-5" />
                      Disabled
                    </>
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">One-Time Feature Pricing</h3>
          <p className="text-sm text-gray-500 mt-1">
            Configure pricing for one-time purchases
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Feature
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Price
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Duration
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Stripe Price ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {pricing.map((price) => (
                <tr key={price.id}>
                  <td className="px-6 py-4 text-sm text-gray-900">{price.feature_key}</td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {editingPricing === price.id ? (
                      <input
                        type="number"
                        value={editFormData.price_cents}
                        onChange={(e) =>
                          setEditFormData({ ...editFormData, price_cents: e.target.value })
                        }
                        className="w-24 px-2 py-1 border border-gray-300 rounded"
                        placeholder="Cents"
                      />
                    ) : (
                      monetizationService.formatPrice(price.price_cents)
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {editingPricing === price.id ? (
                      <input
                        type="number"
                        value={editFormData.duration_days}
                        onChange={(e) =>
                          setEditFormData({ ...editFormData, duration_days: e.target.value })
                        }
                        className="w-20 px-2 py-1 border border-gray-300 rounded"
                        placeholder="Days"
                      />
                    ) : price.duration_days ? (
                      `${price.duration_days} days`
                    ) : (
                      'Permanent'
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {editingPricing === price.id ? (
                      <input
                        type="text"
                        value={editFormData.stripe_price_id}
                        onChange={(e) =>
                          setEditFormData({ ...editFormData, stripe_price_id: e.target.value })
                        }
                        className="w-32 px-2 py-1 border border-gray-300 rounded text-xs"
                        placeholder="price_..."
                      />
                    ) : (
                      <span className="font-mono text-xs">{price.stripe_price_id || 'Not set'}</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-block px-2 py-1 text-xs rounded ${
                        price.is_active
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {price.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right text-sm">
                    {editingPricing === price.id ? (
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleSavePricing(price.id)}
                          className="text-green-600 hover:text-green-800"
                        >
                          <Save className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setEditingPricing(null)}
                          className="text-gray-600 hover:text-gray-800"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleEditPricing(price)}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Subscription Plans</h3>
          <p className="text-sm text-gray-500 mt-1">
            Manage subscription tiers and quotas
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Plan
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Price
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Listings/Month
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Stripe Price ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {plans.map((plan) => (
                <tr key={plan.id}>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">
                    {editingPlan === plan.id ? (
                      <input
                        type="text"
                        value={editFormData.plan_name}
                        onChange={(e) =>
                          setEditFormData({ ...editFormData, plan_name: e.target.value })
                        }
                        className="w-full px-2 py-1 border border-gray-300 rounded"
                      />
                    ) : (
                      plan.plan_name
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <span
                      className={`inline-block px-2 py-1 text-xs rounded ${
                        plan.account_type === 'agency'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-purple-100 text-purple-800'
                      }`}
                    >
                      {plan.account_type}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {editingPlan === plan.id ? (
                      <input
                        type="number"
                        value={editFormData.price_cents}
                        onChange={(e) =>
                          setEditFormData({ ...editFormData, price_cents: e.target.value })
                        }
                        className="w-24 px-2 py-1 border border-gray-300 rounded"
                        placeholder="Cents"
                      />
                    ) : (
                      monetizationService.formatPrice(plan.price_cents)
                    )}
                    <span className="text-xs text-gray-500 ml-1">/{plan.billing_period}</span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {editingPlan === plan.id ? (
                      <input
                        type="number"
                        value={editFormData.listings_per_month}
                        onChange={(e) =>
                          setEditFormData({ ...editFormData, listings_per_month: e.target.value })
                        }
                        className="w-20 px-2 py-1 border border-gray-300 rounded"
                      />
                    ) : (
                      plan.listings_per_month
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {editingPlan === plan.id ? (
                      <input
                        type="text"
                        value={editFormData.stripe_price_id}
                        onChange={(e) =>
                          setEditFormData({ ...editFormData, stripe_price_id: e.target.value })
                        }
                        className="w-32 px-2 py-1 border border-gray-300 rounded text-xs"
                        placeholder="price_..."
                      />
                    ) : (
                      <span className="font-mono text-xs">{plan.stripe_price_id || 'Not set'}</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => handleTogglePlan(plan.id, plan.is_active)}
                      className={`inline-block px-2 py-1 text-xs rounded cursor-pointer ${
                        plan.is_active
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {plan.is_active ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="px-6 py-4 text-right text-sm">
                    {editingPlan === plan.id ? (
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleSavePlan(plan.id)}
                          className="text-green-600 hover:text-green-800"
                        >
                          <Save className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setEditingPlan(null)}
                          className="text-gray-600 hover:text-gray-800"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleEditPlan(plan)}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Recent Transactions</h3>
          <p className="text-sm text-gray-500 mt-1">
            Latest payment activity (last 100 transactions)
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Feature
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                    No transactions yet
                  </td>
                </tr>
              ) : (
                transactions.slice(0, 20).map((tx) => (
                  <tr key={tx.id}>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {new Date(tx.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span
                        className={`inline-block px-2 py-1 text-xs rounded ${
                          tx.transaction_type === 'subscription'
                            ? 'bg-blue-100 text-blue-800'
                            : tx.transaction_type === 'one_time'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {tx.transaction_type}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {tx.feature_key || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">
                      {monetizationService.formatPrice(tx.amount_cents)}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-block px-2 py-1 text-xs rounded ${
                          tx.status === 'succeeded'
                            ? 'bg-green-100 text-green-800'
                            : tx.status === 'pending'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {tx.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <div className="flex items-start gap-3">
          <Gift className="h-6 w-6 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-medium text-blue-900 mb-1">Manual Access Grants</h4>
            <p className="text-sm text-blue-700">
              To manually grant users free access to features, use the user management section or run SQL queries directly. See STRIPE_INTEGRATION_GUIDE.md for examples.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
