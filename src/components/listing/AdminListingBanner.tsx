import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Edit, EyeOff, Trash2, Eye, BarChart3 } from 'lucide-react';
import { Listing } from '@/config/supabase';
import { listingsService } from '@/services/listings';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';

interface AdminListingBannerProps {
  listing: Listing;
  userId: string;
  isAdmin?: boolean;
  onUnpublish?: () => void;
}

export function AdminListingBanner({ listing, userId, isAdmin = false, onUnpublish }: AdminListingBannerProps) {
  const navigate = useNavigate();
  const [showUnpublishDialog, setShowUnpublishDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOwner = listing.user_id === userId;
  if (!isOwner && !isAdmin) {
    return null;
  }

  const handleEdit = () => {
    navigate(`/edit/${listing.id}`);
  };

  const handleUnpublish = async () => {
    setLoading(true);
    setError(null);
    try {
      await listingsService.updateListing(listing.id, { is_active: false });
      setShowUnpublishDialog(false);
      if (onUnpublish) {
        onUnpublish();
      }
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

  const formatNumber = (num: number | undefined | null): string => {
    if (num === undefined || num === null) return '0';
    return num.toLocaleString();
  };

  const impressions = listing.impressions ?? 0;
  const directViews = listing.direct_views ?? 0;

  return (
    <>
      <div className="bg-gray-50 border-b border-gray-200 px-3 py-3 mb-6 -mx-4 sm:-mx-6 lg:-mx-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-gray-500" />
                <div>
                  <div className="text-xs text-gray-500">Impressions</div>
                  <div className="text-base font-semibold text-gray-900">
                    {formatNumber(impressions)}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-gray-500" />
                <div>
                  <div className="text-xs text-gray-500">Detail Views</div>
                  <div className="text-base font-semibold text-gray-900">
                    {formatNumber(directViews)}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleEdit}
                className="inline-flex items-center px-3 py-1.5 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400 transition-colors"
              >
                <Edit className="w-4 h-4 mr-1.5" />
                Edit
              </button>
              <button
                onClick={() => setShowUnpublishDialog(true)}
                className="inline-flex items-center px-3 py-1.5 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400 transition-colors"
              >
                <EyeOff className="w-4 h-4 mr-1.5" />
                Unpublish
              </button>
              <button
                onClick={() => setShowDeleteDialog(true)}
                className="inline-flex items-center px-3 py-1.5 border border-gray-300 rounded-md text-sm font-medium text-red-600 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors"
              >
                <Trash2 className="w-4 h-4 mr-1.5" />
                Delete
              </button>
            </div>
          </div>

          {error && (
            <div className="mt-3 text-sm text-red-600">
              {error}
            </div>
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
