import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Save, Eye, Upload, X } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { agenciesService, Agency } from '@/services/agencies';
import { NotFound } from './NotFound';

export function AgencySettings() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [agency, setAgency] = useState<Agency | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [listingsCount, setListingsCount] = useState(0);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    tagline: '',
    logo_url: '',
    banner_url: '',
    theme_primary_color: '#1E4A74',
    theme_accent_color: '#7CB342',
    phone: '',
    email: '',
    website: '',
    social_links: {} as Record<string, string>,
    about_content: '',
    is_active: true,
  });

  // Check access
  useEffect(() => {
    if (!user || !profile?.can_manage_agency) {
      navigate('/dashboard');
      return;
    }

    const loadAgency = async () => {
      setLoading(true);
      const agencyData = await agenciesService.getUserAgency();
      
      if (agencyData) {
        setAgency(agencyData);
        setFormData({
          name: agencyData.name || '',
          slug: agencyData.slug || '',
          tagline: agencyData.tagline || '',
          logo_url: agencyData.logo_url || '',
          banner_url: agencyData.banner_url || '',
          theme_primary_color: agencyData.theme_primary_color || '#1E4A74',
          theme_accent_color: agencyData.theme_accent_color || '#7CB342',
          phone: agencyData.phone || '',
          email: agencyData.email || '',
          website: agencyData.website || '',
          social_links: agencyData.social_links || {},
          about_content: agencyData.about_content || '',
          is_active: agencyData.is_active,
        });

        // Load listings count
        const listingsResponse = await agenciesService.getAgencyListings(agencyData.id);
        if (listingsResponse) {
          setListingsCount(listingsResponse.pagination.total);
        }
      }
      
      setLoading(false);
    };

    loadAgency();
  }, [user, profile, navigate]);

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSocialLinkChange = (platform: string, url: string) => {
    setFormData(prev => ({
      ...prev,
      social_links: {
        ...prev.social_links,
        [platform]: url,
      },
    }));
  };

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  };

  const handleNameChange = (name: string) => {
    handleInputChange('name', name);
    if (!formData.slug || formData.slug === generateSlug(agency?.name || '')) {
      handleInputChange('slug', generateSlug(name));
    }
  };

  const handleSave = async () => {
    if (!agency) return;

    setSaving(true);
    try {
      const updatedAgency = await agenciesService.updateAgency(agency.id, formData);
      if (updatedAgency) {
        setAgency(updatedAgency);
        alert('Agency settings saved successfully!');
      } else {
        alert('Failed to save agency settings. Please try again.');
      }
    } catch (error) {
      console.error('Error saving agency:', error);
      alert('Failed to save agency settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleViewLive = () => {
    if (agency?.slug) {
      window.open(`/agencies/${agency.slug}`, '_blank');
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/3 mb-6"></div>
          <div className="space-y-4">
            <div className="h-4 bg-gray-200 rounded w-1/4"></div>
            <div className="h-10 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!profile?.can_manage_agency) {
    return <NotFound message="Access denied" />;
  }

  if (!agency) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="text-center py-12">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">No Agency Found</h1>
          <p className="text-gray-600 mb-6">
            You don't have an agency assigned yet. Please contact an administrator.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Agency Settings</h1>
          <p className="text-gray-600 mt-2">
            Manage your agency's public page and branding
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleViewLive}
            className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <Eye className="w-4 h-4" />
            View Live
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-6 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      <div className="space-y-8">
        {/* Basic Information */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Basic Information</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Agency Name *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => handleNameChange(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                URL Slug *
              </label>
              <div className="flex">
                <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm">
                  /agencies/
                </span>
                <input
                  type="text"
                  value={formData.slug}
                  onChange={(e) => handleInputChange('slug', e.target.value)}
                  className="flex-1 border border-gray-300 rounded-r-lg px-3 py-2 focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  required
                />
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tagline
              </label>
              <input
                type="text"
                value={formData.tagline}
                onChange={(e) => handleInputChange('tagline', e.target.value)}
                placeholder="A short description of your agency"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>

        {/* Branding */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Branding</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Logo URL
              </label>
              <input
                type="url"
                value={formData.logo_url}
                onChange={(e) => handleInputChange('logo_url', e.target.value)}
                placeholder="https://example.com/logo.png"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              />
              {formData.logo_url && (
                <div className="mt-2">
                  <img
                    src={formData.logo_url}
                    alt="Logo preview"
                    className="w-16 h-16 object-cover rounded-lg border"
                  />
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Banner URL
              </label>
              <input
                type="url"
                value={formData.banner_url}
                onChange={(e) => handleInputChange('banner_url', e.target.value)}
                placeholder="https://example.com/banner.jpg"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">
                Recommended: 1200x400px or larger
              </p>
              {formData.banner_url && (
                <div className="mt-2">
                  <img
                    src={formData.banner_url}
                    alt="Banner preview"
                    className="w-full h-24 object-cover rounded-lg border"
                  />
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Primary Color
              </label>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={formData.theme_primary_color}
                  onChange={(e) => handleInputChange('theme_primary_color', e.target.value)}
                  className="w-12 h-10 border border-gray-300 rounded cursor-pointer"
                />
                <input
                  type="text"
                  value={formData.theme_primary_color}
                  onChange={(e) => handleInputChange('theme_primary_color', e.target.value)}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Accent Color
              </label>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={formData.theme_accent_color}
                  onChange={(e) => handleInputChange('theme_accent_color', e.target.value)}
                  className="w-12 h-10 border border-gray-300 rounded cursor-pointer"
                />
                <input
                  type="text"
                  value={formData.theme_accent_color}
                  onChange={(e) => handleInputChange('theme_accent_color', e.target.value)}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Contact Information */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Contact Information</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Phone Number
              </label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => handleInputChange('phone', e.target.value)}
                placeholder="+1 (555) 123-4567"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email Address
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => handleInputChange('email', e.target.value)}
                placeholder="contact@agency.com"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Website
              </label>
              <input
                type="url"
                value={formData.website}
                onChange={(e) => handleInputChange('website', e.target.value)}
                placeholder="https://www.agency.com"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>

        {/* About Content */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">About Your Agency</h2>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              About Content
            </label>
            <textarea
              value={formData.about_content}
              onChange={(e) => handleInputChange('about_content', e.target.value)}
              rows={8}
              placeholder="Tell visitors about your agency, your experience, and what makes you special..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">
              Basic HTML is supported (p, br, strong, em, a, ul, ol, li)
            </p>
          </div>
        </div>

        {/* Settings */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Settings</h2>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-gray-900">Active Status</h3>
                <p className="text-sm text-gray-500">
                  When inactive, your agency page will not be visible to the public
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={(e) => handleInputChange('is_active', e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-brand-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-600"></div>
              </label>
            </div>

            <div className="pt-4 border-t">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium text-gray-900">Active Listings</h3>
                  <p className="text-sm text-gray-500">
                    Number of active properties on your agency page
                  </p>
                </div>
                <div className="text-2xl font-bold text-brand-600">
                  {listingsCount}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}