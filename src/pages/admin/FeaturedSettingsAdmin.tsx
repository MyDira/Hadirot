import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Save, Settings, Users, Star, Search, Check, X, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { listingsService } from '../../services/listings';
import { profilesService } from '../../services/profiles';
import { emailService } from '../../services/email';
import { Profile } from '../../config/supabase';

interface AdminSettings {
  max_featured_listings: number;
  max_featured_per_user: number;
}

interface ProfileWithCounts extends Profile {
  listing_count: number;
  featured_count: number;
}

export function FeaturedSettingsAdmin() {
  const { user, profile } = useAuth();
  const [settings, setSettings] = useState<AdminSettings>({
    max_featured_listings: 8,
    max_featured_per_user: 2,
  });
  const [profiles, setProfiles] = useState<ProfileWithCounts[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredProfiles, setFilteredProfiles] = useState<ProfileWithCounts[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingUser, setUpdatingUser] = useState<string | null>(null);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [editingUserLimits, setEditingUserLimits] = useState<{ [userId: string]: number }>({});
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (user && profile?.is_admin) {
      loadData();
    }
  }, [user, profile]);

  useEffect(() => {
    // Filter profiles based on search query
    if (searchQuery.trim() === '') {
      setFilteredProfiles(profiles);
    } else {
      const query = searchQuery.toLowerCase();
      const filtered = profiles.filter(p => 
        p.full_name.toLowerCase().includes(query) ||
        (p.email && p.email.toLowerCase().includes(query)) ||
        (p.agency && p.agency.toLowerCase().includes(query)) ||
        p.role.toLowerCase().includes(query)
      );
      setFilteredProfiles(filtered);
    }
  }, [searchQuery, profiles]);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Load admin settings
      const adminSettings = await listingsService.getAdminSettings();
      setSettings(adminSettings);
      
      // Load profiles with listing counts
      const profilesData = await profilesService.getProfilesWithListingCounts();
      setProfiles(profilesData);
      setFilteredProfiles(profilesData);
    } catch (error) {
      console.error('Error loading admin data:', error);
      setMessage({ type: 'error', text: 'Failed to load admin data' });
    } finally {
      setLoading(false);
    }
  };

  const handleSettingsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    
    try {
      await listingsService.updateAdminSettings(settings);
      setMessage({ type: 'success', text: 'Settings updated successfully!' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error('Error updating settings:', error);
      setMessage({ type: 'error', text: 'Failed to update settings' });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateUserFeaturedLimit = async (userId: string, newLimit: number) => {
    setUpdatingUser(userId);
    
    try {
      // Get the current user's data before updating
      const currentUser = profiles.find(p => p.id === userId);
      const previousLimit = currentUser?.max_featured_listings_per_user ?? settings.max_featured_per_user;
      
      await profilesService.updateProfile(userId, {
        max_featured_listings_per_user: newLimit,
        can_feature_listings: newLimit > 0,
      });
      
      // Send email notification if limit changed
      try {
        if (currentUser?.email && currentUser?.full_name && newLimit !== previousLimit) {
          await emailService.sendPermissionChangedEmail(
            currentUser.email,
            currentUser.full_name,
            newLimit,
            previousLimit
          );
          console.log('✅ Permission change email sent successfully');
        }
      } catch (emailError) {
        console.error('⚠️ Failed to send permission change email:', emailError);
        // Don't block the user flow if email fails
      }
      
      // Update local state
      setProfiles(prev => prev.map(p => 
        p.id === userId 
          ? { ...p, max_featured_listings_per_user: newLimit, can_feature_listings: newLimit > 0 }
          : p
      ));
      
      // Clear editing state
      setEditingUserLimits(prev => {
        const newState = { ...prev };
        delete newState[userId];
        return newState;
      });
      
      setMessage({ 
        type: 'success', 
        text: `User featured listing limit updated to ${newLimit}` 
      });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error('Error updating user featured limit:', error);
      setMessage({ type: 'error', text: 'Failed to update user featured limit' });
    } finally {
      setUpdatingUser(null);
    }
  };

  const handleBulkUpdate = async (maxFeaturedListings: number) => {
    if (selectedUsers.length === 0) {
      setMessage({ type: 'error', text: 'Please select users to update' });
      return;
    }

    setBulkUpdating(true);
    
    try {
      // Get current user data before updating for email notifications
      const usersToUpdate = profiles.filter(p => selectedUsers.includes(p.id));
      
      await profilesService.bulkUpdateFeaturedPermissions(selectedUsers, maxFeaturedListings, maxFeaturedListings > 0);
      
      // Send email notifications to affected users
      for (const userProfile of usersToUpdate) {
        try {
          if (userProfile.email && userProfile.full_name) {
            const previousLimit = userProfile.max_featured_listings_per_user ?? settings.max_featured_per_user;
            if (maxFeaturedListings !== previousLimit) {
              await emailService.sendPermissionChangedEmail(
                userProfile.email,
                userProfile.full_name,
                maxFeaturedListings,
                previousLimit
              );
              console.log(`✅ Permission change email sent to ${userProfile.full_name}`);
            }
          }
        } catch (emailError) {
          console.error(`⚠️ Failed to send permission change email to ${userProfile.full_name}:`, emailError);
          // Don't block the bulk operation if individual emails fail
        }
      }
      
      // Update local state
      setProfiles(prev => prev.map(p => 
        selectedUsers.includes(p.id)
          ? { ...p, max_featured_listings_per_user: maxFeaturedListings, can_feature_listings: maxFeaturedListings > 0 }
          : p
      ));
      
      setSelectedUsers([]);
      setMessage({ 
        type: 'success', 
        text: `${selectedUsers.length} users updated with featured limit of ${maxFeaturedListings}` 
      });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error('Error bulk updating featured limits:', error);
      setMessage({ type: 'error', text: `Failed to bulk update featured limits: ${error.message}` });
    } finally {
      setBulkUpdating(false);
    }
  };

  const handleSelectUser = (userId: string) => {
    setSelectedUsers(prev => 
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const handleSelectAll = () => {
    if (selectedUsers.length === filteredProfiles.length) {
      setSelectedUsers([]);
    } else {
      setSelectedUsers(filteredProfiles.map(p => p.id));
    }
  };

  if (!user || !profile?.is_admin) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-red-600 text-lg">Access denied. Admin privileges required.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#273140] mx-auto"></div>
          <p className="text-gray-600 mt-4">Loading admin settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <Link
          to="/admin"
          className="inline-flex items-center text-[#273140] hover:text-[#1e252f] mb-4 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Admin Panel
        </Link>
        <h1 className="text-3xl font-bold text-[#273140] flex items-center">
          <Star className="w-8 h-8 mr-3 text-[#C5594C]" />
          Featured Listings Settings
        </h1>
        <p className="text-gray-600 mt-2">
          Manage global featured listing limits and user permissions
        </p>
      </div>

      {/* Message */}
      {message && (
        <div className={`mb-6 p-4 rounded-md ${
          message.type === 'success' 
            ? 'bg-green-50 border border-green-200 text-green-800' 
            : 'bg-red-50 border border-red-200 text-red-800'
        }`}>
          {message.text}
        </div>
      )}

      <div className="space-y-8">
        {/* Global Settings */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-[#273140] mb-6 flex items-center">
            <Settings className="w-6 h-6 mr-2" />
            Global Limits
          </h2>
          
          <form onSubmit={handleSettingsSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label htmlFor="max_featured_listings" className="block text-sm font-medium text-gray-700 mb-2">
                  Maximum Featured Listings (Platform-wide)
                </label>
                <input
                  type="number"
                  id="max_featured_listings"
                  min="1"
                  max="50"
                  value={settings.max_featured_listings}
                  onChange={(e) => setSettings(prev => ({ 
                    ...prev, 
                    max_featured_listings: parseInt(e.target.value) || 1 
                  }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Total number of listings that can be featured at once across the entire platform
                </p>
              </div>

              <div>
                <label htmlFor="max_featured_per_user" className="block text-sm font-medium text-gray-700 mb-2">
                  Maximum Per User
                </label>
                <input
                  type="number"
                  id="max_featured_per_user"
                  min="0"
                  max="10"
                  value={settings.max_featured_per_user}
                  onChange={(e) => {
                    const value = parseInt(e.target.value);
                    setSettings(prev => ({ 
                      ...prev, 
                      max_featured_per_user: isNaN(value) ? 0 : value 
                    }));
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Maximum number of listings each user can feature simultaneously
                </p>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="bg-[#C5594C] text-white px-6 py-3 rounded-md font-semibold hover:bg-[#b04d42] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#C5594C] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center"
              >
                <Save className="w-5 h-5 mr-2" />
                {saving ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </form>
        </div>

        {/* User Permissions */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-[#273140] flex items-center">
              <Users className="w-6 h-6 mr-2" />
              User Permissions
            </h2>
            
            {/* Bulk Actions */}
            {selectedUsers.length > 0 && (
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-600">
                  {selectedUsers.length} selected
                </span>
                <button
                  onClick={() => handleBulkUpdate(settings.max_featured_per_user)}
                  disabled={bulkUpdating}
                  className="bg-green-600 text-white px-3 py-1 rounded text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  Set Default Limit
                </button>
                <button
                  onClick={() => handleBulkUpdate(0)}
                  disabled={bulkUpdating}
                  className="bg-red-600 text-white px-3 py-1 rounded text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  Remove Featuring
                </button>
              </div>
            )}
          </div>

          {/* Search */}
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
                    <input
                      type="checkbox"
                      checked={selectedUsers.length === filteredProfiles.length && filteredProfiles.length > 0}
                      onChange={handleSelectAll}
                      className="h-4 w-4 text-[#273140] focus:ring-[#273140] border-gray-300 rounded"
                    />
                  </th>
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
                    Max Featured (User)
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
                      <input
                        type="checkbox"
                        checked={selectedUsers.includes(userProfile.id)}
                        onChange={() => handleSelectUser(userProfile.id)}
                        className="h-4 w-4 text-[#273140] focus:ring-[#273140] border-gray-300 rounded"
                      />
                    </td>
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
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        userProfile.is_admin 
                          ? 'bg-purple-100 text-purple-800'
                          : userProfile.role === 'agent'
                          ? 'bg-blue-100 text-blue-800'
                          : userProfile.role === 'landlord'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {userProfile.is_admin ? 'Admin' : userProfile.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {userProfile.listing_count}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <div className="flex items-center">
                        {userProfile.featured_count > 0 && (
                          <Star className="w-4 h-4 text-[#C5594C] mr-1" />
                        )}
                        {userProfile.featured_count} / {userProfile.max_featured_listings_per_user ?? settings.max_featured_per_user}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        <input
                          type="number"
                          min="0"
                          max="10"
                          value={editingUserLimits[userProfile.id] ?? userProfile.max_featured_listings_per_user ?? settings.max_featured_per_user}
                          onChange={(e) => setEditingUserLimits(prev => ({
                            ...prev,
                            [userProfile.id]: parseInt(e.target.value) || 0
                          }))}
                          className="w-16 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-[#273140] focus:border-[#273140]"
                          disabled={userProfile.is_admin}
                          title={userProfile.is_admin ? 'Admins have unlimited featured listings' : ''}
                        />
                        {editingUserLimits[userProfile.id] !== undefined && editingUserLimits[userProfile.id] !== (userProfile.max_featured_listings_per_user ?? settings.max_featured_per_user) && (
                          <button
                            onClick={() => handleUpdateUserFeaturedLimit(userProfile.id, editingUserLimits[userProfile.id])}
                            disabled={updatingUser === userProfile.id}
                            className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
                          >
                            Save
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => setEditingUserLimits(prev => ({
                            ...prev,
                            [userProfile.id]: settings.max_featured_per_user
                          }))}
                          disabled={userProfile.is_admin}
                          className="text-blue-600 hover:text-blue-800 text-sm transition-colors disabled:opacity-50"
                          title="Set to default limit"
                        >
                          Default
                        </button>
                        <button
                          onClick={() => setEditingUserLimits(prev => ({
                            ...prev,
                            [userProfile.id]: 0
                          }))}
                          disabled={userProfile.is_admin}
                          className="text-red-600 hover:text-red-800 text-sm transition-colors disabled:opacity-50"
                          title="Remove featuring ability"
                        >
                          Remove
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
                Maximum number of listings each user can feature simultaneously (0 = no featuring allowed)
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}