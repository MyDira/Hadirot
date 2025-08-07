import React, { useState, useEffect } from 'react';
import { Heart } from 'lucide-react';
import { ListingCard } from '../components/listings/ListingCard';
import { Listing } from '../config/supabase';
import { listingsService } from '../services/listings';
import { useAuth } from '../hooks/useAuth';

export function Favorites() {
  const { user } = useAuth();
  const [favoriteListings, setFavoriteListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      loadFavorites();
    }
  }, [user]);

  const loadFavorites = async () => {
    if (!user) return;
    
    try {
      console.log('🔄 Loading favorites for user:', user.id);
      const data = await listingsService.getFavorites(user.id);
      console.log('✅ Loaded favorites:', data);
      setFavoriteListings(data);
    } catch (error) {
      console.error('Error loading favorites:', error);
      alert('Failed to load favorites. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center">
        <p className="text-gray-600">Please sign in to view your favorites.</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[#273140] mb-2 flex items-center">
          <Heart className="w-8 h-8 mr-3 text-red-500" />
          My Favorites
        </h1>
        <p className="text-gray-600">
          {loading ? 'Loading...' : `${favoriteListings.length} saved listings`}
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="bg-white rounded-lg shadow-sm animate-pulse">
              <div className="h-48 bg-gray-200 rounded-t-lg"></div>
              <div className="p-4">
                <div className="h-4 bg-gray-200 rounded mb-2"></div>
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                <div className="h-4 bg-gray-200 rounded w-1/2"></div>
              </div>
            </div>
          ))}
        </div>
      ) : favoriteListings.length === 0 ? (
        <div className="text-center py-12">
          <Heart className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No favorites yet</h3>
          <p className="text-gray-500 mb-6">
            Start browsing listings and save your favorites for easy access later.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {favoriteListings.map((listing) => (
            <ListingCard
              key={listing.id}
              listing={listing}
              isFavorited={true}
              onFavoriteChange={loadFavorites}
            />
          ))}
        </div>
      )}
    </div>
  );
}