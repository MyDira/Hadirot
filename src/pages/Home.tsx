import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Search,
  Star,
  Users,
  Home as HomeIcon,
  ChevronRight,
  Plus,
} from "lucide-react";
import { ListingCard } from "../components/listings/ListingCard";
import { Listing } from "../config/supabase";
import { listingsService } from "../services/listings";
import { useAuth } from "@/hooks/useAuth";
import { useListingImpressions } from "../hooks/useListingImpressions";

export function Home() {
  const [recentListings, setRecentListings] = useState<Listing[]>([]);
  const [twoBedroomListings, setTwoBedroomListings] = useState<Listing[]>([]);
  const [threeBedroomListings, setThreeBedroomListings] = useState<Listing[]>(
    [],
  );
  const [userFavorites, setUserFavorites] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore2BR, setLoadingMore2BR] = useState(false);
  const [loadingMore3BR, setLoadingMore3BR] = useState(false);
  const { user } = useAuth();
  
  // Set up impression tracking for all listings on home page
  const allListingIds = [
    ...recentListings.map(l => l.id),
    ...twoBedroomListings.map(l => l.id),
    ...threeBedroomListings.map(l => l.id),
  ];
  const { observeElement, unobserveElement } = useListingImpressions({
    listingIds: allListingIds,
  });

  // Load user favorites on mount and when user changes
  useEffect(() => {
    if (user) {
      loadUserFavorites();
    } else {
      setUserFavorites([]);
    }
  }, [user]);

  const loadUserFavorites = async () => {
    if (!user) return;

    try {
      const favorites = await listingsService.getUserFavoriteIds(user.id);
      setUserFavorites(favorites);
    } catch (error) {
      console.error("Error loading user favorites:", error);
    }
  };

  useEffect(() => {
    loadListings();
  }, []);

  const loadListings = async () => {
    try {
      // Load recently added listings
      const recentResult = await listingsService.getListings({}, 4, user?.id);

      // Load 2 bedroom listings
      const twoBedroomResult = await listingsService.getListings(
        { bedrooms: [2] },
        4,
        user?.id,
      );

      // Load 3 bedroom listings
      const threeBedroomResult = await listingsService.getListings(
        { bedrooms: [3] },
        4,
        user?.id,
      );

      setRecentListings(recentResult.data);
      setTwoBedroomListings(twoBedroomResult.data);
      setThreeBedroomListings(threeBedroomResult.data);
    } catch (error) {
      console.error("Error loading listings:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadMore2BR = async () => {
    if (loadingMore2BR) return;

    setLoadingMore2BR(true);
    try {
      const currentIds = twoBedroomListings.map((l) => l.id);
      const moreResult = await listingsService.getListings(
        { bedrooms: [2] },
        8, // Load more to ensure we get 4 new ones after filtering
        user?.id,
        twoBedroomListings.length,
      );

      // Filter out duplicates and take only 4 new listings
      const newListings = moreResult.data
        .filter((listing) => !currentIds.includes(listing.id))
        .slice(0, 4);

      setTwoBedroomListings((prev) => [...prev, ...newListings]);
    } catch (error) {
      console.error("Error loading more 2BR listings:", error);
    } finally {
      setLoadingMore2BR(false);
    }
  };

  const loadMore3BR = async () => {
    if (loadingMore3BR) return;

    setLoadingMore3BR(true);
    try {
      const currentIds = threeBedroomListings.map((l) => l.id);
      const moreResult = await listingsService.getListings(
        { bedrooms: [3] },
        8, // Load more to ensure we get 4 new ones after filtering
        user?.id,
        threeBedroomListings.length,
        true,
        0, // No featured limit for "load more"
      );

      // Filter out duplicates and take only 4 new listings
      const newListings = moreResult.data
        .filter((listing) => !currentIds.includes(listing.id))
        .slice(0, 4);

      setThreeBedroomListings((prev) => [...prev, ...newListings]);
    } catch (error) {
      console.error("Error loading more 3BR listings:", error);
    } finally {
      setLoadingMore3BR(false);
    }
  };

  const handleFavoriteChange = () => {
    // Reload user favorites when any favorite is toggled
    loadUserFavorites();
  };

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <div>
        <section className="bg-brand-700 text-center py-20 text-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h1 className="text-3xl md:text-5xl font-semibold font-brand text-white mb-6">
              The Heart of Local Rentals
            </h1>
            <p className="text-2xl md:text-3xl text-white/90 mb-8 max-w-2xl mx-auto">
              Where your family finds their next home
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                to="/browse"
                className="inline-flex items-center justify-center bg-accent-500 text-white px-8 py-4 rounded-lg text-lg font-medium hover:bg-accent-600 focus:outline-none focus:ring-2 focus:ring-accent-400 transition-colors"
              >
                <Search className="w-6 h-6 mr-2" />
                Find Yours
              </Link>
              <Link
                to="/post"
                className="inline-flex items-center justify-center border border-accent-500 text-accent-600 px-8 py-4 rounded-lg text-lg font-medium hover:bg-accent-500 hover:text-white focus:outline-none focus:ring-2 focus:ring-accent-400 transition-colors"
              >
                <Plus className="w-6 h-6 mr-2" />
                List a Property
              </Link>
            </div>
          </div>
        </section>
      </div>

      {/* Recently Added Listings */}
      <section className="py-16 bg-[var(--bg-soft)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-8">
            <h2 className="text-3xl font-bold font-brand text-brand-700">
              Recently Added
            </h2>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="bg-white rounded-lg shadow-sm animate-pulse"
                >
                  <div className="h-48 bg-gray-200 rounded-t-lg"></div>
                  <div className="p-4">
                    <div className="h-4 bg-gray-200 rounded mb-2"></div>
                    <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div className="flex gap-6 pb-4" style={{ width: "max-content" }}>
                {recentListings.map((listing) => (
                  <div 
                    key={listing.id} 
                    className="flex-shrink-0 w-80"
                    ref={(el) => {
                      if (el) {
                        observeElement(el, listing.id);
                      }
                    }}
                  >
                    <ListingCard
                      listing={listing}
                      isFavorited={userFavorites.includes(listing.id)}
                      onFavoriteChange={handleFavoriteChange}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 2 Bedroom Listings */}
      <section className="py-16 bg-[#FAF7F3]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-3xl font-bold font-brand text-[#273140]">
              2 Bedroom
            </h2>
            <Link
              to="/browse?bedrooms=2"
              className="text-[#273140] hover:text-[#1e252f] font-medium transition-colors"
            >
              View All →
            </Link>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="bg-white rounded-lg shadow-sm animate-pulse"
                >
                  <div className="h-48 bg-gray-200 rounded-t-lg"></div>
                  <div className="p-4">
                    <div className="h-4 bg-gray-200 rounded mb-2"></div>
                    <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="relative">
              <div className="overflow-x-auto">
                <div
                  className="flex gap-6 pb-4"
                  style={{ width: "max-content" }}
                >
                  {twoBedroomListings.map((listing) => (
                    <div 
                      key={listing.id} 
                      className="flex-shrink-0 w-80"
                      ref={(el) => {
                        if (el) {
                          observeElement(el, listing.id);
                        }
                      }}
                    >
                      <ListingCard
                        listing={listing}
                        isFavorited={userFavorites.includes(listing.id)}
                        onFavoriteChange={handleFavoriteChange}
                      />
                    </div>
                  ))}

                  {/* Load More Button */}
                  <div className="flex-shrink-0 w-20 flex items-center justify-center">
                    <button
                      onClick={loadMore2BR}
                      disabled={loadingMore2BR}
                      className="p-4 bg-white border-2 border-dashed border-gray-300 rounded-lg hover:border-[#4E4B43] hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Load 4 more 2BR listings"
                    >
                      {loadingMore2BR ? (
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#273140]"></div>
                      ) : (
                        <ChevronRight className="w-6 h-6 text-gray-400" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 3 Bedroom Listings */}
      <section className="py-16 bg-[var(--bg-soft)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-3xl font-bold font-brand text-brand-700">
              3 Bedroom
            </h2>
            <Link
              to="/browse?bedrooms=3"
              className="text-brand-700 hover:text-brand-800 font-medium transition-colors"
            >
              View All →
            </Link>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="bg-white rounded-lg shadow-sm animate-pulse"
                >
                  <div className="h-48 bg-gray-200 rounded-t-lg"></div>
                  <div className="p-4">
                    <div className="h-4 bg-gray-200 rounded mb-2"></div>
                    <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="relative">
              <div className="overflow-x-auto">
                <div
                  className="flex gap-6 pb-4"
                  style={{ width: "max-content" }}
                >
                  {threeBedroomListings.map((listing) => (
                    <div 
                      key={listing.id} 
                      className="flex-shrink-0 w-80"
                      ref={(el) => {
                        if (el) {
                          observeElement(el, listing.id);
                        }
                      }}
                    >
                      <ListingCard
                        listing={listing}
                        isFavorited={userFavorites.includes(listing.id)}
                        onFavoriteChange={handleFavoriteChange}
                      />
                    </div>
                  ))}

                  {/* Load More Button */}
                  <div className="flex-shrink-0 w-20 flex items-center justify-center">
                    <button
                      onClick={loadMore3BR}
                      disabled={loadingMore3BR}
                      className="p-4 bg-white border-2 border-dashed border-gray-300 rounded-lg hover:border-[#273140] hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Load 4 more 3BR listings"
                    >
                      {loadingMore3BR ? (
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#273140]"></div>
                      ) : (
                        <ChevronRight className="w-6 h-6 text-gray-400" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
