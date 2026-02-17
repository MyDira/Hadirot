import React from "react";
import { useSearchParams, Navigate } from "react-router-dom";
import { LayoutDashboard, Heart, CreditCard, Settings } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Dashboard } from "./Dashboard";
import { Favorites } from "./Favorites";
import BillingTab from "../components/billing/BillingTab";
import SettingsTab from "../components/account/SettingsTab";

type AccountTab = "listings" | "favorites" | "billing" | "settings";

const ACCOUNT_TABS: { id: AccountTab; label: string; icon: React.ElementType }[] = [
  { id: "listings", label: "My Listings", icon: LayoutDashboard },
  { id: "favorites", label: "Favorites", icon: Heart },
  { id: "billing", label: "Billing", icon: CreditCard },
  { id: "settings", label: "Settings", icon: Settings },
];

export function Account() {
  const { user, loading } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const rawTab = searchParams.get("tab");
  const activeTab: AccountTab =
    rawTab === "favorites" || rawTab === "billing" || rawTab === "settings"
      ? rawTab
      : "listings";

  const handleTabChange = (tab: AccountTab) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("tab", tab);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#4E4B43] mx-auto"></div>
          <p className="text-gray-600 mt-4">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <nav className="flex space-x-2 sm:space-x-4 lg:space-x-8 border-b border-gray-200 overflow-x-auto pb-px scrollbar-hide mb-8">
        {ACCOUNT_TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => handleTabChange(id)}
            className={`flex items-center px-2 sm:px-3 py-2 border-b-2 font-medium text-xs sm:text-sm whitespace-nowrap transition-colors flex-shrink-0 ${
              activeTab === id
                ? "border-[#4E4B43] text-[#4E4B43]"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            <Icon className="w-4 h-4 mr-1 sm:mr-2" />
            {label}
          </button>
        ))}
      </nav>

      {activeTab === "listings" && <Dashboard />}
      {activeTab === "favorites" && <Favorites />}
      {activeTab === "billing" && <BillingTab />}
      {activeTab === "settings" && <SettingsTab />}
    </div>
  );
}
