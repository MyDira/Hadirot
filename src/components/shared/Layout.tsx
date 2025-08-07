import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Home, Search, Plus, User, Heart, LogOut, Settings, LayoutDashboard, FileText, Edit3, Star, Menu, X } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { Footer } from './Footer';

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { user, profile, signOut, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showSignOutMessage, setShowSignOutMessage] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const userMenuRef = React.useRef<HTMLDivElement>(null);
  const prevUserRef = React.useRef<typeof user>(null);
  const prevPathnameRef = React.useRef<string>(location.pathname);

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
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    };

    if (showUserMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showUserMenu]);

  const handleSignOut = async () => {
    try {
      await signOut();
      setIsMobileMenuOpen(false);
      setShowSignOutMessage(true);
      setTimeout(() => setShowSignOutMessage(false), 3000);
      navigate('/');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const Logo = () => (
    <div className="flex items-center space-x-2">
      <div className="relative">
        <svg width="32" height="32" viewBox="0 0 32 32" className="text-[#273140]">
          <path
            d="M16 4L6 12v16h5v-8h10v8h5V12L16 4z"
            stroke="currentColor"
            strokeWidth="2"
            fill="none"
            strokeLinejoin="round"
          />
          <circle cx="23" cy="8" r="1" fill="currentColor" />
        </svg>
      </div>
      <span className="text-xl font-bold text-[#273140]">HaDirot</span>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Left spacer for balance */}
            <div className="flex-1"></div>
            
            {/* Centered Logo */}
            <Link to="/" className="flex-shrink-0">
              <Logo />
            </Link>

            {/* Right side navigation */}
            <div className="flex-1 flex justify-end">
              <nav className="hidden md:flex items-center space-x-4">
                <Link
                  to="/browse"
                  className={`flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    location.pathname === '/browse'
                      ? 'text-[#273140] bg-[#F0E6D5]'
                      : 'text-gray-600 hover:text-[#273140]'
                  }`}
                >
                  <Search className="w-4 h-4 mr-2" />
                  Browse
                </Link>
                <Link
                  to="/post"
                  className={`flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    location.pathname === '/post'
                      ? 'text-[#273140] bg-[#F0E6D5]'
                      : 'text-gray-600 hover:text-[#273140]'
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
                      className="flex items-center space-x-2 text-gray-600 hover:text-[#273140] transition-colors"
                    >
                      <User className="w-5 h-5" />
                      <span className="hidden sm:inline text-sm font-medium">
                        {profile?.full_name}
                      </span>
                    </button>

                    {showUserMenu && (
                      <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg border border-gray-200 z-50">
                        <div className="py-1">
                          <div className="px-4 py-2 text-sm text-gray-500 border-b">
                            {profile?.role === 'agent' && profile?.agency && (
                              <span className="block">{profile.agency}</span>
                            )}
                            <span className="capitalize">{profile?.role}</span>
                          </div>
                          <Link
                            to="/account-settings"
                            className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                            onClick={() => setShowUserMenu(false)}
                          >
                            <User className="w-4 h-4 mr-2" />
                            Account
                          </Link>
                          <Link
                            to="/dashboard"
                            className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                            onClick={() => setShowUserMenu(false)}
                          >
                            <LayoutDashboard className="w-4 h-4 mr-2" />
                            My Dashboard
                          </Link>
                          <Link
                            to="/favorites"
                            className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                            onClick={() => setShowUserMenu(false)}
                          >
                            <Heart className="w-4 h-4 mr-2" />
                            My Favorites
                          </Link>
                          {/* Debug log to check profile and loading state */}
                          
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
                              <Link
                                to="/admin/static-pages"
                                className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                                onClick={() => setShowUserMenu(false)}
                              >
                                <FileText className="w-4 h-4 mr-2" />
                                Static Pages
                              </Link>
                              <Link
                                to="/admin/footer"
                                className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                                onClick={() => setShowUserMenu(false)}
                              >
                                <Edit3 className="w-4 h-4 mr-2" />
                                Footer Editor
                              </Link>
                              <Link
                                to="/admin/featured-settings"
                                className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                                onClick={() => setShowUserMenu(false)}
                              >
                                <Star className="w-4 h-4 mr-2" />
                                Featured Settings
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
                    className="bg-[#273140] text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-[#1e252f] transition-colors"
                  >
                    Sign In
                  </Link>
                )}
              </div>

              {/* Mobile menu button */}
              <div className="md:hidden flex items-center">
                <button
                  onClick={() => setIsMobileMenuOpen(true)}
                  className="text-gray-600 hover:text-[#273140] transition-colors p-2"
                >
                  <Menu className="w-6 h-6" />
                </button>
              </div>
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
                <div className="flex items-center space-x-2">
                  <svg width="24" height="24" viewBox="0 0 32 32" className="text-[#273140]">
                    <path
                      d="M16 4L6 12v16h5v-8h10v8h5V12L16 4z"
                      stroke="currentColor"
                      strokeWidth="2"
                      fill="none"
                      strokeLinejoin="round"
                    />
                    <circle cx="23" cy="8" r="1" fill="currentColor" />
                  </svg>
                  <span className="text-lg font-bold text-[#273140]">HaDirot</span>
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
                      location.pathname === '/'
                        ? 'text-[#273140] bg-[#F0E6D5]'
                        : 'text-gray-600 hover:text-[#273140] hover:bg-gray-50'
                    }`}
                  >
                    <Home className="w-5 h-5 mr-3" />
                    Home
                  </Link>
                  <Link
                    to="/browse"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`flex items-center px-4 py-3 text-base font-medium rounded-md transition-colors ${
                      location.pathname === '/browse'
                        ? 'text-[#273140] bg-[#F0E6D5]'
                        : 'text-gray-600 hover:text-[#273140] hover:bg-gray-50'
                    }`}
                  >
                    <Search className="w-5 h-5 mr-3" />
                    Browse Listings
                  </Link>
                  <Link
                    to="/post"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`flex items-center px-4 py-3 text-base font-medium rounded-md transition-colors ${
                      location.pathname === '/post'
                        ? 'text-[#273140] bg-[#F0E6D5]'
                        : 'text-gray-600 hover:text-[#273140] hover:bg-gray-50'
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
                          {profile?.full_name}
                        </div>
                        <div className="text-sm text-gray-500">
                          {profile?.role === 'agent' && profile?.agency && (
                            <span className="block">{profile.agency}</span>
                          )}
                          <span className="capitalize">{profile?.role}</span>
                        </div>
                      </div>
                      
                      <Link
                        to="/account-settings"
                        onClick={() => setIsMobileMenuOpen(false)}
                        className="flex items-center px-4 py-3 text-base font-medium text-gray-600 hover:text-[#273140] hover:bg-gray-50 rounded-md transition-colors"
                      >
                        <User className="w-5 h-5 mr-3" />
                        Account Settings
                      </Link>
                      <Link
                        to="/dashboard"
                        onClick={() => setIsMobileMenuOpen(false)}
                        className="flex items-center px-4 py-3 text-base font-medium text-gray-600 hover:text-[#273140] hover:bg-gray-50 rounded-md transition-colors"
                      >
                        <LayoutDashboard className="w-5 h-5 mr-3" />
                        My Dashboard
                      </Link>
                      <Link
                        to="/favorites"
                        onClick={() => setIsMobileMenuOpen(false)}
                        className="flex items-center px-4 py-3 text-base font-medium text-gray-600 hover:text-[#273140] hover:bg-gray-50 rounded-md transition-colors"
                      >
                        <Heart className="w-5 h-5 mr-3" />
                        My Favorites
                      </Link>
                      
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
                          <Link
                            to="/admin/static-pages"
                            onClick={() => setIsMobileMenuOpen(false)}
                            className="flex items-center px-4 py-3 text-base font-medium text-gray-600 hover:text-[#273140] hover:bg-gray-50 rounded-md transition-colors"
                          >
                            <FileText className="w-5 h-5 mr-3" />
                            Static Pages
                          </Link>
                          <Link
                            to="/admin/footer"
                            onClick={() => setIsMobileMenuOpen(false)}
                            className="flex items-center px-4 py-3 text-base font-medium text-gray-600 hover:text-[#273140] hover:bg-gray-50 rounded-md transition-colors"
                          >
                            <Edit3 className="w-5 h-5 mr-3" />
                            Footer Editor
                          </Link>
                          <Link
                            to="/admin/featured-settings"
                            onClick={() => setIsMobileMenuOpen(false)}
                            className="flex items-center px-4 py-3 text-base font-medium text-gray-600 hover:text-[#273140] hover:bg-gray-50 rounded-md transition-colors"
                          >
                            <Star className="w-5 h-5 mr-3" />
                            Featured Settings
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
                        className="flex items-center px-4 py-3 text-base font-medium bg-[#273140] text-white rounded-md hover:bg-[#1e252f] transition-colors"
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
          <div className="min-h-screen bg-[#F0E6D5] flex items-center justify-center">
            <div className="text-center">
              <div className="flex items-center space-x-2 mb-4">
                <svg width="40" height="40" viewBox="0 0 32 32" className="text-[#273140]">
                  <path
                    d="M16 4L6 12v16h5v-8h10v8h5V12L16 4z"
                    stroke="currentColor"
                    strokeWidth="2"
                    fill="none"
                    strokeLinejoin="round"
                  />
                  <circle cx="23" cy="8" r="1" fill="currentColor" />
                </svg>
                <span className="text-2xl font-bold text-[#273140]">HaDirot</span>
              </div>
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#273140] mx-auto"></div>
              <p className="text-gray-600 mt-4">Loading...</p>
            </div>
          </div>
        ) : (
          children
        )}
      </main>

      <Footer />

    </div>
  );
}