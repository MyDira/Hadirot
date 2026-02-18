import React, { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Home, Search, Plus, User, Heart, LogOut, Settings, LayoutDashboard, Menu, X, Building2, Paintbrush, CreditCard } from "lucide-react";
import { useAuth, AUTH_CONTEXT_ID } from "@/hooks/useAuth";
import { useAnalyticsInit } from "@/hooks/useAnalyticsInit";
import { Footer } from "./Footer";
import { ModalManager } from "./ModalManager";
import { capitalizeName } from "../../utils/formatters";
import { supabase, type Agency } from "@/config/supabase";
import { agenciesService } from "@/services/agencies";
import { salesService } from "@/services/sales";
import {
  queryClient,
  queryKeys,
  shareAgencyAcrossCaches,
} from "@/services/queryClient";

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { user, profile, signOut, loading, authContextId } = useAuth();

  // Initialize analytics tracking
  useAnalyticsInit();
  
  const navigate = useNavigate();
  const location = useLocation();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showSignOutMessage, setShowSignOutMessage] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [ownedAgency, setOwnedAgency] = useState<Agency | null>(null);
  const [salesFeatureEnabled, setSalesFeatureEnabled] = useState(false);
  const userMenuRef = React.useRef<HTMLDivElement>(null);
  const prevUserRef = React.useRef<typeof user>(null);
  const prevPathnameRef = React.useRef<string>(location.pathname);

  // Load sales feature status
  useEffect(() => {
    const loadSalesFeatureStatus = async () => {
      try {
        const enabled = await salesService.isSalesFeatureEnabled();
        setSalesFeatureEnabled(enabled);
      } catch (error) {
        console.error('Error loading sales feature status:', error);
        setSalesFeatureEnabled(false);
      }
    };
    loadSalesFeatureStatus();
  }, []);

  // Close dropdown menu when user logs in
  useEffect(() => {
    // If user was null (logged out) and now has a value (logged in)
    if (prevUserRef.current === null && user !== null) {
      setShowUserMenu(false);
    }
    prevUserRef.current = user;
  }, [user]);

  // Close dropdown menu on navigation
  useEffect(() => {
    if (location.pathname !== prevPathnameRef.current) {
      setShowUserMenu(false);
      setIsMobileMenuOpen(false);
      prevPathnameRef.current = location.pathname;
    }
  }, [location.pathname]);


  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(event.target as Node)
      ) {
        setShowUserMenu(false);
      }
    };

    if (showUserMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showUserMenu]);

  useEffect(() => {
    const payload = {
      loading,
      userPresent: !!user,
      profilePresent: profile !== undefined,
      isAdmin: !!profile?.is_admin,
      authContextId,
    };
    if (authContextId !== AUTH_CONTEXT_ID) {
      console.warn("[Layout] auth context mismatch", payload);
    } else {
      console.log("[Layout] auth", payload);
    }
  }, [loading, user, profile, authContextId]);

  useEffect(() => {
    // Load agency data for users with management access
    const profileId = profile?.id;
    const hasManagementAccess = Boolean(
      profile?.is_admin || profile?.can_manage_agency,
    );

    if (!profileId || !hasManagementAccess) {
      setOwnedAgency(null);
      if (profile?.id) {
        queryClient.setQueryData(queryKeys.ownedAgency(profile.id), null);
        queryClient.setQueryData(queryKeys.agencyByOwner(profile.id), null);
      }
      return;
    }

    let isActive = true;
    const ownedAgencyKey = queryKeys.ownedAgency(profileId);

    const loadAgency = async () => {
      try {
        const agency = await agenciesService.getAgencyOwnedByProfile(profileId);
        if (!isActive) {
          return;
        }
        setOwnedAgency(agency);
        queryClient.setQueryData(ownedAgencyKey, agency);
        queryClient.setQueryData(queryKeys.agencyByOwner(profileId), agency);
        if (agency?.slug) {
          queryClient.setQueryData(queryKeys.agencyBySlug(agency.slug), agency);
        }
      } catch (error) {
        if (!isActive) {
          return;
        }
        console.error("[Layout] failed to load owned agency", error);
        setOwnedAgency(null);
        queryClient.setQueryData(ownedAgencyKey, null);
        queryClient.setQueryData(queryKeys.agencyByOwner(profileId), null);
      }
    };

    const handleCacheUpdate = (cached?: Agency | null) => {
      if (!isActive) {
        return;
      }
      if (cached === undefined) {
        void loadAgency();
        return;
      }
      setOwnedAgency(cached ?? null);
    };

    const cachedValue = queryClient.getQueryData<Agency | null>(ownedAgencyKey);
    if (cachedValue !== undefined) {
      setOwnedAgency(cachedValue ?? null);
    } else {
      void loadAgency();
    }

    const unsubscribe = queryClient.subscribe<Agency | null>(
      ownedAgencyKey,
      handleCacheUpdate,
    );

    return () => {
      isActive = false;
      unsubscribe();
    };
  }, [profile?.id, profile?.can_manage_agency, profile?.is_admin]);

  useEffect(() => {
    const agencyId = ownedAgency?.id;

    if (!agencyId) {
      return;
    }

    const channel = supabase
      .channel(`agency-updates-${agencyId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "agencies",
          filter: `id=eq.${agencyId}`,
        },
        (payload) => {
          const newAgency = (payload.new ?? null) as Agency | null;
          const oldAgency = (payload.old ?? null) as Agency | null;

          if (newAgency) {
            shareAgencyAcrossCaches(newAgency);
            setOwnedAgency((current) => {
              if (!current || current.id !== newAgency.id) {
                return newAgency;
              }
              return { ...current, ...newAgency };
            });
          }

          if (oldAgency?.slug && oldAgency.slug !== newAgency?.slug) {
            queryClient.invalidateQueries({
              queryKey: queryKeys.agencyBySlug(oldAgency.slug),
            });
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [ownedAgency?.id]);

  const agencyName = ownedAgency?.name?.trim() ?? "";
  const agencySlug = ownedAgency?.slug ?? null;
  const ownsAgency = Boolean(ownedAgency);
  const canAccessAgencyPage = ownsAgency;

  const handleSignOut = async () => {
    try {
      await signOut();
      setIsMobileMenuOpen(false);
      setShowSignOutMessage(true);
      setTimeout(() => setShowSignOutMessage(false), 3000);
      navigate("/");
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  const Logo = () => (
    <div className="logo-font uppercase tracking-wide text-xl md:text-2xl">
      HADIROT
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-[60] bg-brand-800 text-white border-b border-black/5 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 md:px-6 h-14 md:h-16 flex items-center justify-between">
          {/* Left spacer for balance */}
          <div className="flex-1"></div>

          {/* Centered Logo */}
          <Link to="/" className="flex-shrink-0">
            <Logo />
          </Link>

          {/* Right side navigation */}
          <div className="flex-1 flex justify-end">
            <nav className="hidden md:flex items-center space-x-4">
              {salesFeatureEnabled ? (
                <>
                  <Link
                    to="/browse"
                    className={`flex items-center px-3 py-2 text-sm font-medium rounded-md transition-opacity text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-white/40 ${
                      location.pathname === "/browse" ? "opacity-90" : ""
                    }`}
                  >
                    <Search className="w-4 h-4 mr-2" />
                    Rent
                  </Link>
                  <Link
                    to="/browse-sales"
                    className={`flex items-center px-3 py-2 text-sm font-medium rounded-md transition-opacity text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-white/40 ${
                      location.pathname === "/browse-sales" ? "opacity-90" : ""
                    }`}
                  >
                    <Search className="w-4 h-4 mr-2" />
                    Buy
                  </Link>
                </>
              ) : (
                <Link
                  to="/browse"
                  className={`flex items-center px-3 py-2 text-sm font-medium rounded-md transition-opacity text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-white/40 ${
                    location.pathname === "/browse" ? "opacity-90" : ""
                  }`}
                >
                  <Search className="w-4 h-4 mr-2" />
                  Browse
                </Link>
              )}
              <Link
                to="/post"
                className={`flex items-center px-3 py-2 text-sm font-medium rounded-md transition-opacity text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-white/40 ${
                  location.pathname === "/post" ? "opacity-90" : ""
                }`}
              >
                <Plus className="w-4 h-4 mr-2" />
                Post
              </Link>
            </nav>

            <div className="hidden md:flex items-center ml-4">
              {user ? (
                <div className="relative" ref={userMenuRef}>
                  <button
                    onClick={() => setShowUserMenu(!showUserMenu)}
                    className="flex items-center space-x-2 text-white hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-white/40"
                  >
                    <User className="w-5 h-5" />
                    <span className="hidden sm:flex flex-col leading-tight">
                      <span className="text-sm font-medium">My Account</span>
                      {(agencyName || profile?.full_name) && (
                        <span className="text-xs text-white/70">
                          {agencyName || capitalizeName(profile!.full_name)}
                        </span>
                      )}
                    </span>
                  </button>

                  {showUserMenu && (
                    <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg border border-gray-200 z-50">
                      <div className="py-1">
                        <div className="px-4 py-2 text-sm text-gray-500 border-b">
                          {profile?.role === "agent" && agencyName && (
                            <span className="block">{agencyName}</span>
                          )}
                          <span className="capitalize">{profile?.role}</span>
                        </div>
                        <Link
                          to="/account?tab=listings"
                          className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                          onClick={() => setShowUserMenu(false)}
                        >
                          <LayoutDashboard className="w-4 h-4 mr-2" />
                          My Listings
                        </Link>
                        <Link
                          to="/account?tab=favorites"
                          className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                          onClick={() => setShowUserMenu(false)}
                        >
                          <Heart className="w-4 h-4 mr-2" />
                          Favorites
                        </Link>
                        <Link
                          to="/account?tab=billing"
                          className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                          onClick={() => setShowUserMenu(false)}
                        >
                          <CreditCard className="w-4 h-4 mr-2" />
                          Billing
                        </Link>
                        <Link
                          to="/account?tab=settings"
                          className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                          onClick={() => setShowUserMenu(false)}
                        >
                          <Settings className="w-4 h-4 mr-2" />
                          Settings
                        </Link>
                        {/* Agency feature temporarily disabled - do not delete */}
                        {/*
                        {canAccessAgencyPage && agencySlug && (
                          <Link
                            to={`/agencies/${agencySlug}`}
                            className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                            onClick={() => setShowUserMenu(false)}
                          >
                            <Building2 className="w-4 h-4 mr-2" />
                            My Agency Page
                          </Link>
                        )}
                        {canAccessAgencyPage && (
                          <Link
                            to="/dashboard/agency-settings"
                            className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                            onClick={() => setShowUserMenu(false)}
                          >
                            <Paintbrush className="w-4 h-4 mr-2" />
                            Agency Settings
                          </Link>
                        )}
                        */}

                        {!loading && profile?.is_admin && (
                          <>
                            <Link
                              to="/admin"
                              className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                              onClick={() => setShowUserMenu(false)}
                            >
                              <Settings className="w-4 h-4 mr-2" />
                              Admin Panel
                            </Link>
                          </>
                        )}
                        <button
                          onClick={handleSignOut}
                          className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 text-left"
                        >
                          <LogOut className="w-4 h-4 mr-2" />
                          Sign Out
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <Link
                  to="/auth"
                  className="bg-brand-700 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-brand-800 transition-colors"
                >
                  Sign In
                </Link>
              )}
            </div>

            {/* Mobile menu button */}
            <div className="md:hidden flex items-center">
              <button
                onClick={() => setIsMobileMenuOpen(true)}
                className="p-2 text-white hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-white/40"
              >
                <Menu className="w-6 h-6" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Sidebar */}
      {isMobileMenuOpen && (
        <>
          {/* Overlay */}
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
            onClick={() => setIsMobileMenuOpen(false)}
          />

          {/* Sidebar */}
          <div className="fixed top-0 right-0 h-full w-80 bg-white shadow-xl z-50 md:hidden transform transition-transform duration-300 ease-in-out">
            <div className="flex flex-col h-full">
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-gray-200">
                <div className="flex items-center">
                  <div className="text-brand-700">
                    <Logo />
                  </div>
                </div>
                <button
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors p-1"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Navigation */}
              <div className="flex-1 overflow-y-auto">
                <nav className="p-4 space-y-2">
                  <Link
                    to="/"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`flex items-center px-4 py-3 text-base font-medium rounded-md transition-colors ${
                      location.pathname === "/"
                        ? "text-brand-700 bg-gray-100"
                        : "text-gray-600 hover:text-brand-700 hover:bg-gray-50"
                    }`}
                  >
                    <Home className="w-5 h-5 mr-3" />
                    Home
                  </Link>
                  {salesFeatureEnabled ? (
                    <>
                      <Link
                        to="/browse"
                        onClick={() => setIsMobileMenuOpen(false)}
                        className={`flex items-center px-4 py-3 text-base font-medium rounded-md transition-colors ${
                          location.pathname === "/browse"
                            ? "text-brand-700 bg-gray-100"
                            : "text-gray-600 hover:text-brand-700 hover:bg-gray-50"
                        }`}
                      >
                        <Search className="w-5 h-5 mr-3" />
                        Rent
                      </Link>
                      <Link
                        to="/browse-sales"
                        onClick={() => setIsMobileMenuOpen(false)}
                        className={`flex items-center px-4 py-3 text-base font-medium rounded-md transition-colors ${
                          location.pathname === "/browse-sales"
                            ? "text-brand-700 bg-gray-100"
                            : "text-gray-600 hover:text-brand-700 hover:bg-gray-50"
                        }`}
                      >
                        <Search className="w-5 h-5 mr-3" />
                        Buy
                      </Link>
                    </>
                  ) : (
                    <Link
                      to="/browse"
                      onClick={() => setIsMobileMenuOpen(false)}
                      className={`flex items-center px-4 py-3 text-base font-medium rounded-md transition-colors ${
                        location.pathname === "/browse"
                          ? "text-brand-700 bg-gray-100"
                          : "text-gray-600 hover:text-brand-700 hover:bg-gray-50"
                      }`}
                    >
                      <Search className="w-5 h-5 mr-3" />
                      Browse Listings
                    </Link>
                  )}
                  <Link
                    to="/post"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`flex items-center px-4 py-3 text-base font-medium rounded-md transition-colors ${
                      location.pathname === "/post"
                        ? "text-brand-700 bg-gray-100"
                        : "text-gray-600 hover:text-brand-700 hover:bg-gray-50"
                    }`}
                  >
                    <Plus className="w-5 h-5 mr-3" />
                    Post Listing
                  </Link>

                  {user && (
                    <>
                      <div className="border-t border-gray-200 my-4"></div>
                      <div className="px-4 py-2">
                        <div className="text-sm font-medium text-gray-900">
                          My Account
                        </div>
                        <div className="text-sm text-gray-500">
                          {agencyName
                            ? agencyName
                            : profile?.full_name
                            ? capitalizeName(profile.full_name)
                            : <span className="capitalize">{profile?.role}</span>
                          }
                        </div>
                      </div>

                      <Link
                        to="/account?tab=listings"
                        onClick={() => setIsMobileMenuOpen(false)}
                        className="flex items-center px-4 py-3 text-base font-medium text-gray-600 hover:text-[#273140] hover:bg-gray-50 rounded-md transition-colors"
                      >
                        <LayoutDashboard className="w-5 h-5 mr-3" />
                        My Listings
                      </Link>
                      <Link
                        to="/account?tab=favorites"
                        onClick={() => setIsMobileMenuOpen(false)}
                        className="flex items-center px-4 py-3 text-base font-medium text-gray-600 hover:text-[#273140] hover:bg-gray-50 rounded-md transition-colors"
                      >
                        <Heart className="w-5 h-5 mr-3" />
                        Favorites
                      </Link>
                      <Link
                        to="/account?tab=billing"
                        onClick={() => setIsMobileMenuOpen(false)}
                        className="flex items-center px-4 py-3 text-base font-medium text-gray-600 hover:text-[#273140] hover:bg-gray-50 rounded-md transition-colors"
                      >
                        <CreditCard className="w-5 h-5 mr-3" />
                        Billing
                      </Link>
                      <Link
                        to="/account?tab=settings"
                        onClick={() => setIsMobileMenuOpen(false)}
                        className="flex items-center px-4 py-3 text-base font-medium text-gray-600 hover:text-[#273140] hover:bg-gray-50 rounded-md transition-colors"
                      >
                        <Settings className="w-5 h-5 mr-3" />
                        Settings
                      </Link>
                      {/* Agency feature temporarily disabled - do not delete */}
                      {/*
                      {canAccessAgencyPage && agencySlug && (
                        <Link
                          to={`/agencies/${agencySlug}`}
                          onClick={() => setIsMobileMenuOpen(false)}
                          className="flex items-center px-4 py-3 text-base font-medium text-gray-600 hover:text-[#273140] hover:bg-gray-50 rounded-md transition-colors"
                        >
                          <Building2 className="w-5 h-5 mr-3" />
                          My Agency Page
                        </Link>
                      )}
                      {canAccessAgencyPage && (
                        <Link
                          to="/dashboard/agency-settings"
                          onClick={() => setIsMobileMenuOpen(false)}
                          className="flex items-center px-4 py-3 text-base font-medium text-gray-600 hover:text-[#273140] hover:bg-gray-50 rounded-md transition-colors"
                        >
                          <Paintbrush className="w-5 h-5 mr-3" />
                          Agency Settings
                        </Link>
                      )}
                      */}

                      {!loading && profile?.is_admin && (
                        <>
                          <div className="border-t border-gray-200 my-4"></div>
                          <div className="px-4 py-2">
                            <div className="text-sm font-medium text-gray-500 uppercase tracking-wider">
                              Admin
                            </div>
                          </div>
                          <Link
                            to="/admin"
                            onClick={() => setIsMobileMenuOpen(false)}
                            className="flex items-center px-4 py-3 text-base font-medium text-gray-600 hover:text-[#273140] hover:bg-gray-50 rounded-md transition-colors"
                          >
                            <Settings className="w-5 h-5 mr-3" />
                            Admin Panel
                          </Link>
                        </>
                      )}

                      <div className="border-t border-gray-200 my-4"></div>
                      <button
                        onClick={handleSignOut}
                        className="flex items-center w-full px-4 py-3 text-base font-medium text-gray-600 hover:text-[#273140] hover:bg-gray-50 rounded-md transition-colors text-left"
                      >
                        <LogOut className="w-5 h-5 mr-3" />
                        Sign Out
                      </button>
                    </>
                  )}

                  {!user && (
                    <>
                      <div className="border-t border-gray-200 my-4"></div>
                      <Link
                        to="/auth"
                        onClick={() => setIsMobileMenuOpen(false)}
                        className="flex items-center px-4 py-3 text-base font-medium bg-accent-500 text-white rounded-md hover:bg-accent-600 transition-colors"
                      >
                        <User className="w-5 h-5 mr-3" />
                        Sign In
                      </Link>
                    </>
                  )}
                </nav>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Sign Out Success Message */}
      {showSignOutMessage && (
        <div className="fixed top-20 right-4 bg-green-500 text-white px-4 py-2 rounded-md shadow-lg z-50 animate-fade-in">
          Successfully signed out!
        </div>
      )}

      <main className="flex-1">
        {loading ? (
          <div className="min-h-screen bg-gray-50 flex items-center justify-center">
            <div className="text-center">
              <div className="flex items-center justify-center mb-4">
                <div className="text-brand-700">
                  <Logo />
                </div>
              </div>
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-700 mx-auto"></div>
              <p className="text-gray-600 mt-4">Loading...</p>
            </div>
          </div>
        ) : (
          children
        )}
      </main>

      <Footer />

      {!loading && <ModalManager userId={user?.id} />}
    </div>
  );
}