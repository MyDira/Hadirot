import React, { useState, useEffect } from "react";
import {
  Users,
  Settings,
  FileText,
  Star,
  BarChart3,
  Search,
  Edit,
  Trash2,
  Plus,
  Save,
  X,
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { profilesService } from "../services/profiles";
import { agenciesService } from "../services/agencies";
import { staticPagesService } from "../services/staticPages";
import { listingsService } from "../services/listings";
import { emailService } from "../services/email";
import { Profile } from "../config/supabase";
import { StaticPageEditor } from "./admin/StaticPageEditor";
import { FeaturedSettingsAdmin } from "./admin/FeaturedSettingsAdmin";
import { InternalAnalytics } from "./InternalAnalytics";

interface ProfileWithCounts extends Profile {
  listing_count: number;
  featured_count: number;
}

export function AdminPanel() {
  const { user, profile } = useAuth();
  const [activeTab, setActiveTab] = useState("users");
  const [profiles, setProfiles] = useState<ProfileWithCounts[]>([]);
  const [filteredProfiles, setFilteredProfiles] = useState<ProfileWithCounts[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [updatingUser, setUpdatingUser] = useState<string | null>(null);
  const [deletingUser, setDeletingUser] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Get tab from URL params
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tab = urlParams.get("tab");
    if (tab && ["users", "static-pages", "featured", "analytics"].includes(tab)) {
      setActiveTab(tab);
    }
  }, []);

  // Update URL when tab changes
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", activeTab);
    window.history.replaceState({}, "", url.toString());
  }, [activeTab]);

  useEffect(() => {
    if (user && profile?.is_admin) {
      loadData();
    }
  }, [user, profile]);

  useEffect(() => {
    // Filter profiles based on search query
    if (searchQuery.trim() === "") {
      setFilteredProfiles(profiles);
    } else {
      const query = searchQuery.toLowerCase();
      const filtered = profiles.filter(
        (p) =>
          p.full_name.toLowerCase().includes(query) ||
          (p.email && p.email.toLowerCase().includes(query)) ||
          (p.agency && p.agency.toLowerCase().includes(query)) ||
          p.role.toLowerCase().includes(query),
      );
      setFilteredProfiles(filtered);
    }
  }, [searchQuery, profiles]);

  const loadData = async () => {
    try {
      setLoading(true);
      const profilesData = await profilesService.getProfilesWithListingCounts();
      setProfiles(profilesData);
      setFilteredProfiles(profilesData);
    } catch (error) {
      console.error("Error loading admin data:", error);
      setMessage({ type: "error", text: "Failed to load admin data" });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateUserPermissions = async (userId: string, updates: Partial<Profile>) => {
    setUpdatingUser(userId);
    try {
      await profilesService.updateProfile(userId, updates);

      // If can_manage_agency is being set to true, ensure an agency row exists for the user
      if (updates.can_manage_agency === true) {
        try {
          await agenciesService.ensureAgencyForOwner(userId);
          console.log(`[AdminPanel] Ensured agency for user ${userId} after setting can_manage_agency.`);
        } catch (agencyError: any) {
          console.error(`[AdminPanel] Failed to ensure agency for user ${userId}:`, agencyError.message);
          // Log the error but do not block the UI. AgencySettings page will re-attempt on mount.
          setMessage({ type: "error", text: `User permissions updated, but failed to ensure agency: ${agencyError.message}` });
        }
      }

      setMessage({ type: "success", text: "User permissions updated successfully!" });
      await loadData(); // Reload all data to reflect changes
    } catch (error: any) {
      console.error("Error updating user permissions:", error);
      setMessage({ type: "error", text: error.message || "Failed to update user permissions" });
    } finally {
      setUpdatingUser(null);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    const userToDelete = profiles.find((p) => p.id === userId);
    if (!userToDelete) return;

    if (
      !confirm(
        `Are you sure you want to permanently delete ${userToDelete.full_name}? This action cannot be undone and will delete all their listings.`,
      )
    ) {
      return;
    }

    setDeletingUser(userId);
    try {
      // Call the delete-user edge function
      const { data, error } = await supabase.functions.invoke("delete-user", {
        body: { userId, reason: "Deleted by admin" },
      });

      if (error) {
        throw new Error(error.message || "Failed to delete user");
      }

      console.log("✅ User deleted successfully:", data);
      setMessage({ type: "success", text: `User ${userToDelete.full_name} deleted successfully` });
      await loadData(); // Reload data to reflect changes
    } catch (error: any) {
      console.error("❌ Error deleting user:", error);
      setMessage({ type: "error", text: error.message || "Failed to delete user" });
    } finally {
      setDeletingUser(null);
    }
  };

  if (!user || !profile?.is_admin) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-red-600 text-lg">
            Access denied. Admin privileges required.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#273140] mx-auto"></div>
          <p className="text-gray-600 mt-4">Loading admin data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[#273140] flex items-center">
          <Settings className="w-8 h-8 mr-3" />
          Admin Panel
        </h1>
        <p className="text-gray-600 mt-2">
          Manage users, content, and platform settings
        </p>
      </div>

      {/* Message */}
      {message && (
        <div
          className={`mb-6 p-4 rounded-md ${
            message.type === "success"
              ? "bg-green-50 border border-green-200 text-green-800"
              : "bg-red-50 border border-red-200 text-red-800"
          }`}
        >
          <div className="flex items-center">
            {message.type === "success" ? (
              <CheckCircle2 className="w-5 h-5 mr-2" />
            ) : (
              <AlertTriangle className="w-5 h-5 mr-2" />
            )}
            {message.text}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-8">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab("users")}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === "users"
                ? "border-[#273140] text-[#273140]"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            <Users className="w-5 h-5 inline mr-2" />
            User Management
          </button>
          <button
            onClick={() => setActiveTab("static-pages")}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === "static-pages"
                ? "border-[#273140] text-[#273140]"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            <FileText className="w-5 h-5 inline mr-2" />
            Static Pages
          </button>
          <button
            onClick={() => setActiveTab("featured")}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === "featured"
                ? "border-[#273140] text-[#273140]"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            <Star className="w-5 h-5 inline mr-2" />
            Featured Settings
          </button>
          <button
            onClick={() => setActiveTab("analytics")}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === "analytics"
                ? "border-[#273140] text-[#273140]"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            <BarChart3 className="w-5 h-5 inline mr-2" />
            Analytics
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === "users" && (
        <div className="space-y-8">
          {/* Search */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-[#273140] flex items-center">
                <Users className="w-6 h-6 mr-2" />
                User Management
              </h2>
            </div>

            <div className="mb-6">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Search users by name, email, agency, or role..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
                />
              </div>
            </div>

            {/* Users Table */}
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      User
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Role
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Listings
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Featured
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Permissions
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredProfiles.map((userProfile) => (
                    <tr key={userProfile.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {userProfile.full_name}
                          </div>
                          <div className="text-sm text-gray-500">
                            {userProfile.email}
                          </div>
                          {userProfile.agency && (
                            <div className="text-xs text-gray-400">
                              {userProfile.agency}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            userProfile.is_admin
                              ? "bg-purple-100 text-purple-800"
                              : userProfile.role === "agent"
                                ? "bg-blue-100 text-blue-800"
                                : userProfile.role === "landlord"
                                  ? "bg-green-100 text-green-800"
                                  : "bg-gray-100 text-gray-800"
                          }`}
                        >
                          {userProfile.is_admin ? "Admin" : userProfile.role}
                        </span>
                        {userProfile.is_banned && (
                          <span className="ml-2 inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">
                            Banned
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {userProfile.listing_count}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <div className="flex items-center">
                          {userProfile.featured_count > 0 && (
                            <Star className="w-4 h-4 text-accent-600 mr-1" />
                          )}
                          {userProfile.featured_count}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-col space-y-1">
                          <div className="flex items-center space-x-2">
                            <span className="text-xs text-gray-500">Admin:</span>
                            <button
                              onClick={() =>
                                handleUpdateUserPermissions(userProfile.id, {
                                  is_admin: !userProfile.is_admin,
                                })
                              }
                              disabled={updatingUser === userProfile.id}
                              className={`w-5 h-5 ${
                                userProfile.is_admin
                                  ? "text-green-600"
                                  : "text-gray-400"
                              }`}
                            >
                              {userProfile.is_admin ? (
                                <CheckCircle2 className="w-5 h-5" />
                              ) : (
                                <div className="w-5 h-5 border-2 border-gray-300 rounded-full"></div>
                              )}
                            </button>
                          </div>
                          <div className="flex items-center space-x-2">
                            <span className="text-xs text-gray-500">Feature:</span>
                            <button
                              onClick={() =>
                                handleUpdateUserPermissions(userProfile.id, {
                                  can_feature_listings: !userProfile.can_feature_listings,
                                })
                              }
                              disabled={updatingUser === userProfile.id}
                              className={`w-5 h-5 ${
                                userProfile.can_feature_listings
                                  ? "text-green-600"
                                  : "text-gray-400"
                              }`}
                            >
                              {userProfile.can_feature_listings ? (
                                <CheckCircle2 className="w-5 h-5" />
                              ) : (
                                <div className="w-5 h-5 border-2 border-gray-300 rounded-full"></div>
                              )}
                            </button>
                          </div>
                          <div className="flex items-center space-x-2">
                            <span className="text-xs text-gray-500">Agency:</span>
                            <button
                              onClick={() =>
                                handleUpdateUserPermissions(userProfile.id, {
                                  can_manage_agency: !userProfile.can_manage_agency,
                                })
                              }
                              disabled={updatingUser === userProfile.id}
                              className={`w-5 h-5 ${
                                userProfile.can_manage_agency
                                  ? "text-green-600"
                                  : "text-gray-400"
                              }`}
                            >
                              {userProfile.can_manage_agency ? (
                                <CheckCircle2 className="w-5 h-5" />
                              ) : (
                                <div className="w-5 h-5 border-2 border-gray-300 rounded-full"></div>
                              )}
                            </button>
                          </div>
                          <div className="flex items-center space-x-2">
                            <span className="text-xs text-gray-500">Banned:</span>
                            <button
                              onClick={() =>
                                handleUpdateUserPermissions(userProfile.id, {
                                  is_banned: !userProfile.is_banned,
                                })
                              }
                              disabled={updatingUser === userProfile.id}
                              className={`w-5 h-5 ${
                                userProfile.is_banned
                                  ? "text-red-600"
                                  : "text-gray-400"
                              }`}
                            >
                              {userProfile.is_banned ? (
                                <EyeOff className="w-5 h-5" />
                              ) : (
                                <Eye className="w-5 h-5" />
                              )}
                            </button>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => handleDeleteUser(userProfile.id)}
                            disabled={
                              deletingUser === userProfile.id ||
                              userProfile.id === user.id
                            }
                            className="text-red-600 hover:text-red-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title={
                              userProfile.id === user.id
                                ? "Cannot delete your own account"
                                : "Delete user"
                            }
                          >
                            {deletingUser === userProfile.id ? (
                              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-red-600"></div>
                            ) : (
                              <Trash2 className="w-5 h-5" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {filteredProfiles.length === 0 && (
              <div className="text-center py-8">
                <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">
                  {searchQuery ? "No users found matching your search." : "No users found."}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "static-pages" && (
        <StaticPageEditor showHeader={false} />
      )}

      {activeTab === "featured" && (
        <FeaturedSettingsAdmin showHeader={false} />
      )}

      {activeTab === "analytics" && (
        <InternalAnalytics />
      )}
    </div>
  );
}