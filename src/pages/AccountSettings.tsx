import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Eye, EyeOff, User, Mail, Phone, Briefcase, Lock } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../config/supabase';

interface ProfileFormData {
  full_name: string;
  phone: string;
  role: 'tenant' | 'landlord' | 'agent';
  agency: string;
}

interface PasswordFormData {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export function AccountSettings() {
  const { user, profile, loading: authLoading } = useAuth();
  
  const [profileData, setProfileData] = useState<ProfileFormData>({
    full_name: '',
    phone: '',
    role: 'tenant',
    agency: '',
  });
  
  const [passwordData, setPasswordData] = useState<PasswordFormData>({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false,
  });
  
  const [loading, setLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Load profile data
  useEffect(() => {
    if (profile) {
      setProfileData({
        full_name: profile.full_name || '',
        phone: profile.phone || '',
        role: profile.role || 'tenant',
        agency: profile.agency || '',
      });
    }
  }, [profile]);

  const handleProfileInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setProfileData(prev => ({ ...prev, [name]: value }));
  };

  const handlePasswordInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setPasswordData(prev => ({ ...prev, [name]: value }));
  };

  const togglePasswordVisibility = (field: 'current' | 'new' | 'confirm') => {
    setShowPasswords(prev => ({ ...prev, [field]: !prev[field] }));
  };

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    setMessage(null);

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: profileData.full_name.trim(),
          phone: profileData.phone.trim() || null,
          role: profileData.role,
          agency: profileData.role === 'agent' ? profileData.agency.trim() : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (error) throw error;

      setMessage({ type: 'success', text: 'Profile updated successfully!' });
      
      // Clear message after 3 seconds
      setTimeout(() => setMessage(null), 3000);
    } catch (error: any) {
      console.error('Error updating profile:', error);
      setMessage({ type: 'error', text: error.message || 'Failed to update profile' });
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    // Validate passwords
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setPasswordMessage({ type: 'error', text: 'New passwords do not match' });
      return;
    }

    if (passwordData.newPassword.length < 6) {
      setPasswordMessage({ type: 'error', text: 'New password must be at least 6 characters long' });
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
        throw new Error('Current password is incorrect');
      }

      // Update password
      const { error: updateError } = await supabase.auth.updateUser({
        password: passwordData.newPassword,
      });

      if (updateError) throw updateError;

      setPasswordMessage({ type: 'success', text: 'Password updated successfully!' });
      
      // Clear form
      setPasswordData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
      
      // Clear message after 3 seconds
      setTimeout(() => setPasswordMessage(null), 3000);
    } catch (error: any) {
      console.error('Error updating password:', error);
      setPasswordMessage({ type: 'error', text: error.message || 'Failed to update password' });
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
        <p className="text-gray-600">Please sign in to view your account settings.</p>
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
          <h2 className="text-xl font-semibold text-[#273140] mb-6">Profile Information</h2>
          
          {message && (
            <div className={`mb-6 p-4 rounded-md ${
              message.type === 'success' 
                ? 'bg-green-50 border border-green-200 text-green-800' 
                : 'bg-red-50 border border-red-200 text-red-800'
            }`}>
              {message.text}
            </div>
          )}

          <form onSubmit={handleProfileSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Full Name */}
              <div>
                <label htmlFor="full_name" className="block text-sm font-medium text-gray-700 mb-2">
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
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                  <Mail className="w-4 h-4 inline mr-2" />
                  Email Address
                </label>
                <input
                  type="email"
                  id="email"
                  value={user.email || ''}
                  disabled
                  className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-500 cursor-not-allowed"
                />
                <p className="text-xs text-gray-500 mt-1">Email cannot be changed</p>
              </div>

              {/* Phone Number */}
              <div>
                <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-2">
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
                <label htmlFor="role" className="block text-sm font-medium text-gray-700 mb-2">
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
              {profileData.role === 'agent' && (
                <div className="md:col-span-2">
                  <label htmlFor="agency" className="block text-sm font-medium text-gray-700 mb-2">
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
                className="bg-[#C5594C] text-white px-6 py-3 rounded-md font-semibold hover:bg-[#b04d42] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#C5594C] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center"
              >
                <Save className="w-5 h-5 mr-2" />
                {loading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>

        {/* Change Password */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-[#273140] mb-6">Change Password</h2>
          
          {passwordMessage && (
            <div className={`mb-6 p-4 rounded-md ${
              passwordMessage.type === 'success' 
                ? 'bg-green-50 border border-green-200 text-green-800' 
                : 'bg-red-50 border border-red-200 text-red-800'
            }`}>
              {passwordMessage.text}
            </div>
          )}

          <form onSubmit={handlePasswordSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Current Password */}
              <div className="md:col-span-2">
                <label htmlFor="currentPassword" className="block text-sm font-medium text-gray-700 mb-2">
                  <Lock className="w-4 h-4 inline mr-2" />
                  Current Password *
                </label>
                <div className="relative">
                  <input
                    type={showPasswords.current ? 'text' : 'password'}
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
                    onClick={() => togglePasswordVisibility('current')}
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
                <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-2">
                  <Lock className="w-4 h-4 inline mr-2" />
                  New Password *
                </label>
                <div className="relative">
                  <input
                    type={showPasswords.new ? 'text' : 'password'}
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
                    onClick={() => togglePasswordVisibility('new')}
                  >
                    {showPasswords.new ? (
                      <EyeOff className="h-5 w-5 text-gray-400" />
                    ) : (
                      <Eye className="h-5 w-5 text-gray-400" />
                    )}
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">Minimum 6 characters</p>
              </div>

              {/* Confirm New Password */}
              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-2">
                  <Lock className="w-4 h-4 inline mr-2" />
                  Confirm New Password *
                </label>
                <div className="relative">
                  <input
                    type={showPasswords.confirm ? 'text' : 'password'}
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
                    onClick={() => togglePasswordVisibility('confirm')}
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
                {passwordLoading ? 'Updating...' : 'Update Password'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}