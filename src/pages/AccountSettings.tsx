import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Save,
  Eye,
  EyeOff,
  User,
  Mail,
  Phone,
  Briefcase,
  Lock,
  CreditCard,
  ExternalLink,
  Receipt,
  Clock,
  Star,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { agenciesService } from "@/services/agencies";
import { agencyNameToSlug } from "@/utils/agency";
import { supabase } from "../config/supabase";
import type { Agency } from "@/config/supabase";
import {
  queryClient,
  queryKeys,
  shareAgencyAcrossCaches,
} from "@/services/queryClient";
import { stripeService, type FeaturedPurchase } from "@/services/stripe";

interface ProfileFormData {
  full_name: string;
  phone: string;
  role: "tenant" | "landlord" | "agent";
  agency: string;
}

interface PasswordFormData {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

const AGENCY_IN_USE_MESSAGE =
  "This agency name is already in use on Had irot. If you meant to join that agency, ask the admin to enable your access; otherwise pick a unique name.";

export function AccountSettings() {
  const { user, profile, loading: authLoading, setProfile } = useAuth();

  const [profileData, setProfileData] = useState<ProfileFormData>({
    full_name: "",
    phone: "",
    role: "tenant",
    agency: "",
  });

  const [passwordData, setPasswordData] = useState<PasswordFormData>({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false,
  });

  const [loading, setLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const [purchases, setPurchases] = useState<FeaturedPurchase[]>([]);
  const [billingLoading, setBillingLoading] = useState(true);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);

  // Load profile data
  useEffect(() => {
    if (profile) {
      setProfileData({
        full_name: profile.full_name || "",
        phone: profile.phone || "",
        role: profile.role || "tenant",
        agency: profile.agency || "",
      });
    }
  }, [profile]);

  // Load purchase history
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

  const handleProfileInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setProfileData((prev) => ({ ...prev, [name]: value }));
  };

  const handlePasswordInputChange = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const { name, value } = e.target;
    setPasswordData((prev) => ({ ...prev, [name]: value }));
  };

  const togglePasswordVisibility = (field: "current" | "new" | "confirm") => {
    setShowPasswords((prev) => ({ ...prev, [field]: !prev[field] }));
  };

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    setMessage(null);

    try {
      let nextAgency: string | null = null;
      let trimmedAgencyName: string | null = null;
      let nextAgencySlug: string | null = null;
      const trimmedFullName = profileData.full_name.trim();
      const trimmedPhone = profileData.phone.trim();
      const normalizedRole = profileData.role;
      const nowIso = new Date().toISOString();
      const previousAgencyName = profile?.agency ?? null;
      const previousAgencySlug = previousAgencyName
        ? agencyNameToSlug(previousAgencyName)
        : null;

      if (normalizedRole === "agent") {
        const candidateName = profileData.agency.trim();

        if (candidateName) {
          const nextSlug = agencyNameToSlug(candidateName);

          if (!nextSlug) {
            setMessage({
              type: "error",
              text: "Please enter a valid agency name.",
            });
            return;
          }

          const currentSlug = profile?.agency
            ? agencyNameToSlug(profile.agency)
            : null;

          if (!currentSlug || currentSlug !== nextSlug) {
            try {
              const availability =
                await agenciesService.checkAgencyNameAvailable(
                  candidateName,
                );

              if (!availability.available) {
                setMessage({ type: "error", text: AGENCY_IN_USE_MESSAGE });
                return;
              }
            } catch (availabilityError) {
              console.error(
                "Error verifying agency availability:",
                availabilityError,
              );
              setMessage({
                type: "error",
                text: "We couldn't verify that agency name. Please try again.",
              });
              return;
            }
          }

          nextAgency = candidateName;
          trimmedAgencyName = candidateName;
          nextAgencySlug = nextSlug;
        }
      }

      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: trimmedFullName,
          phone: trimmedPhone ? trimmedPhone : null,
          role: normalizedRole,
          agency: normalizedRole === "agent" ? nextAgency : null,
          updated_at: nowIso,
        })
        .eq("id", user.id);

      if (error) throw error;

      setMessage({ type: "success", text: "Profile updated successfully!" });

      const nextProfileAgency =
        normalizedRole === "agent" ? trimmedAgencyName : null;

      setProfile((previousProfile) => {
        const baseProfile = previousProfile ?? profile ?? null;
        if (!baseProfile) {
          return previousProfile;
        }

        return {
          ...baseProfile,
          full_name: trimmedFullName,
          phone: trimmedPhone ? trimmedPhone : undefined,
          role: normalizedRole,
          agency: nextProfileAgency ?? undefined,
          updated_at: nowIso,
        };
      });

      setProfileData((prev) => ({
        ...prev,
        full_name: trimmedFullName,
        phone: trimmedPhone,
        agency: normalizedRole === "agent" ? trimmedAgencyName ?? "" : "",
      }));

      const profileId = profile?.id ?? null;
      const canManageAgency = profile?.can_manage_agency === true;
      let syncedAgency: Agency | null = null;

      if (
        normalizedRole === "agent" &&
        canManageAgency &&
        trimmedAgencyName &&
        profileId
      ) {
        try {
          const ensuredAgency = await agenciesService.ensureAgencyForOwner(
            profileId,
          );

          const updatedAgency = await agenciesService.updateAgencyById(
            ensuredAgency.id,
            {
              name: trimmedAgencyName,
            },
          );

          syncedAgency = updatedAgency ?? ensuredAgency;
          shareAgencyAcrossCaches(syncedAgency);
        } catch (syncError) {
          console.error(
            "[AccountSettings] Failed to sync agency name",
            syncError,
          );
        }
      } else if (profileId && normalizedRole !== "agent") {
        queryClient.setQueryData(queryKeys.ownedAgency(profileId), null);
        queryClient.setQueryData(queryKeys.agencyByOwner(profileId), null);
      }

      const computedNewSlug =
        normalizedRole === "agent"
          ? nextAgencySlug ??
            (trimmedAgencyName ? agencyNameToSlug(trimmedAgencyName) : null)
          : null;

      if (user.id) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.profile(user.id),
        });
      }

      if (profileId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.ownedAgency(profileId),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.agencyByOwner(profileId),
        });
      }

      if (previousAgencySlug) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.agencyBySlug(previousAgencySlug),
        });
      }

      const slugToInvalidate =
        syncedAgency?.slug ?? computedNewSlug ?? nextAgencySlug;
      if (slugToInvalidate) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.agencyBySlug(slugToInvalidate),
        });
      }

      // Clear message after 3 seconds
      setTimeout(() => setMessage(null), 3000);
    } catch (error: any) {
      console.error("Error updating profile:", error);
      setMessage({
        type: "error",
        text: error.message || "Failed to update profile",
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    // Validate passwords
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setPasswordMessage({ type: "error", text: "New passwords do not match" });
      return;
    }

    if (passwordData.newPassword.length < 6) {
      setPasswordMessage({
        type: "error",
        text: "New password must be at least 6 characters long",
      });
      return;
    }

    setPasswordLoading(true);
    setPasswordMessage(null);

    try {
      // First verify current password by attempting to sign in
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: user.email!,
        password: passwordData.currentPassword,
      });

      if (verifyError) {
        throw new Error("Current password is incorrect");
      }

      // Update password
      const { error: updateError } = await supabase.auth.updateUser({
        password: passwordData.newPassword,
      });

      if (updateError) throw updateError;

      setPasswordMessage({
        type: "success",
        text: "Password updated successfully!",
      });

      // Clear form
      setPasswordData({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });

      // Clear message after 3 seconds
      setTimeout(() => setPasswordMessage(null), 3000);
    } catch (error: any) {
      console.error("Error updating password:", error);
      setPasswordMessage({
        type: "error",
        text: error.message || "Failed to update password",
      });
    } finally {
      setPasswordLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#4E4B43] mx-auto"></div>
          <p className="text-gray-600 mt-4">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 text-center">
        <p className="text-gray-600">
          Please sign in to view your account settings.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <Link
          to="/dashboard"
          className="inline-flex items-center text-[#273140] hover:text-[#1e252f] mb-4 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Dashboard
        </Link>
        <h1 className="text-3xl font-bold text-[#273140] flex items-center">
          <User className="w-8 h-8 mr-3" />
          Account Settings
        </h1>
        <p className="text-gray-600 mt-2">
          Manage your account information and security settings
        </p>
      </div>

      <div className="space-y-8">
        {/* Profile Information */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-[#273140] mb-6">
            Profile Information
          </h2>

          {message && (
            <div
              className={`mb-6 p-4 rounded-md ${
                message.type === "success"
                  ? "bg-green-50 border border-green-200 text-green-800"
                  : "bg-red-50 border border-red-200 text-red-800"
              }`}
            >
              {message.text}
            </div>
          )}

          <form onSubmit={handleProfileSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Full Name */}
              <div>
                <label
                  htmlFor="full_name"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  <User className="w-4 h-4 inline mr-2" />
                  Full Name *
                </label>
                <input
                  type="text"
                  id="full_name"
                  name="full_name"
                  value={profileData.full_name}
                  onChange={handleProfileInputChange}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
                />
              </div>

              {/* Email (Read-only) */}
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  <Mail className="w-4 h-4 inline mr-2" />
                  Email Address
                </label>
                <input
                  type="email"
                  id="email"
                  value={user.email || ""}
                  disabled
                  className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-500 cursor-not-allowed"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Email cannot be changed
                </p>
              </div>

              {/* Phone Number */}
              <div>
                <label
                  htmlFor="phone"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  <Phone className="w-4 h-4 inline mr-2" />
                  Phone Number
                </label>
                <input
                  type="tel"
                  id="phone"
                  name="phone"
                  value={profileData.phone}
                  onChange={handleProfileInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
                  placeholder="(555) 123-4567"
                />
              </div>

              {/* Role */}
              <div>
                <label
                  htmlFor="role"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  <Briefcase className="w-4 h-4 inline mr-2" />
                  Role *
                </label>
                <select
                  id="role"
                  name="role"
                  value={profileData.role}
                  onChange={handleProfileInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
                >
                  <option value="tenant">Tenant</option>
                  <option value="landlord">Landlord</option>
                  <option value="agent">Real Estate Agent</option>
                </select>
              </div>

              {/* Agency (only for agents) */}
              {profileData.role === "agent" && (
                <div className="md:col-span-2">
                  <label
                    htmlFor="agency"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    <Briefcase className="w-4 h-4 inline mr-2" />
                    Agency Name *
                  </label>
                  <input
                    type="text"
                    id="agency"
                    name="agency"
                    value={profileData.agency}
                    onChange={handleProfileInputChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
                    placeholder="Enter your agency name"
                  />
                </div>
              )}
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={loading}
                className="bg-accent-500 text-white px-6 py-3 rounded-md font-semibold hover:bg-accent-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center"
              >
                <Save className="w-5 h-5 mr-2" />
                {loading ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
        </div>

        {/* Change Password */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-[#273140] mb-6">
            Change Password
          </h2>

          {passwordMessage && (
            <div
              className={`mb-6 p-4 rounded-md ${
                passwordMessage.type === "success"
                  ? "bg-green-50 border border-green-200 text-green-800"
                  : "bg-red-50 border border-red-200 text-red-800"
              }`}
            >
              {passwordMessage.text}
            </div>
          )}

          <form onSubmit={handlePasswordSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Current Password */}
              <div className="md:col-span-2">
                <label
                  htmlFor="currentPassword"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  <Lock className="w-4 h-4 inline mr-2" />
                  Current Password *
                </label>
                <div className="relative">
                  <input
                    type={showPasswords.current ? "text" : "password"}
                    id="currentPassword"
                    name="currentPassword"
                    value={passwordData.currentPassword}
                    onChange={handlePasswordInputChange}
                    required
                    className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                    onClick={() => togglePasswordVisibility("current")}
                  >
                    {showPasswords.current ? (
                      <EyeOff className="h-5 w-5 text-gray-400" />
                    ) : (
                      <Eye className="h-5 w-5 text-gray-400" />
                    )}
                  </button>
                </div>
              </div>

              {/* New Password */}
              <div>
                <label
                  htmlFor="newPassword"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  <Lock className="w-4 h-4 inline mr-2" />
                  New Password *
                </label>
                <div className="relative">
                  <input
                    type={showPasswords.new ? "text" : "password"}
                    id="newPassword"
                    name="newPassword"
                    value={passwordData.newPassword}
                    onChange={handlePasswordInputChange}
                    required
                    minLength={6}
                    className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                    onClick={() => togglePasswordVisibility("new")}
                  >
                    {showPasswords.new ? (
                      <EyeOff className="h-5 w-5 text-gray-400" />
                    ) : (
                      <Eye className="h-5 w-5 text-gray-400" />
                    )}
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Minimum 6 characters
                </p>
              </div>

              {/* Confirm New Password */}
              <div>
                <label
                  htmlFor="confirmPassword"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  <Lock className="w-4 h-4 inline mr-2" />
                  Confirm New Password *
                </label>
                <div className="relative">
                  <input
                    type={showPasswords.confirm ? "text" : "password"}
                    id="confirmPassword"
                    name="confirmPassword"
                    value={passwordData.confirmPassword}
                    onChange={handlePasswordInputChange}
                    required
                    className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                    onClick={() => togglePasswordVisibility("confirm")}
                  >
                    {showPasswords.confirm ? (
                      <EyeOff className="h-5 w-5 text-gray-400" />
                    ) : (
                      <Eye className="h-5 w-5 text-gray-400" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={passwordLoading}
                className="bg-[#667B9A] text-white px-6 py-3 rounded-md font-semibold hover:bg-[#5a6b85] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#667B9A] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center"
              >
                <Lock className="w-5 h-5 mr-2" />
                {passwordLoading ? "Updating..." : "Update Password"}
              </button>
            </div>
          </form>
        </div>

        {/* Billing & Payments */}
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
      </div>
    </div>
  );
}

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
