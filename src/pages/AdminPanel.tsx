import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Users, FileText, Settings, Eye, Check, X, Ban, UserCheck, Trash2, ChevronLeft, Shield, TrendingUp, Home, Star, Power, ChevronDown, Search, UserX, Mail, ChevronRight } from 'lucide-react';
import { emailService } from '../services/email';
import { useAuth } from '../hooks/useAuth';
import { supabase, Profile, Listing } from '../config/supabase';

interface AdminStats {
  totalUsers: number;
  totalListings: number;
  featuredListings: number;
  activeUsers: number;
}

interface ListingFilters {
  ownerRole: string;
  status: string;
  active: string;
}

interface ListingSorting {
  field: 'title' | 'owner' | 'price' | 'created_at' | 'is_active' | 'is_featured';
  direction: 'asc' | 'desc';
}
// Helper function to check if a listing is currently featured (not expired)
const isListingCurrentlyFeatured = (listing: Listing) => {
  return listing.is_featured && 
         listing.featured_expires_at && 
         new Date(listing.featured_expires_at) > new Date();
};


export function AdminPanel() {
  const { user, profile } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [stats, setStats] = useState<AdminStats>({
    totalUsers: 0,
    totalListings: 0,
    featuredListings: 0,
    activeUsers: 0,
  });
  const [users, setUsers] = useState<Profile[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [pendingListings, setPendingListings] = useState<Listing[]>([]);
  const [allListings, setAllListings] = useState<Listing[]>([]);
  const [filteredListings, setFilteredListings] = useState<Listing[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredPendingListings, setFilteredPendingListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [userFilters, setUserFilters] = useState({
    role: '',
    agency: '',
    search: '',
  });
  const [usersSortField, setUsersSortField] = useState<string>('');
  const [usersSortDirection, setUsersSortDirection] = useState<'asc' | 'desc'>('asc');
  const [currentUserPage, setCurrentUserPage] = useState(1);
  const USERS_PER_PAGE = 25;
  const [listingFilters, setListingFilters] = useState<ListingFilters>({
    ownerRole: '',
    status: '',
    active: '',
  });
  const [listingSorting, setListingSorting] = useState<ListingSorting>({
    field: 'created_at', 
    direction: 'desc',
  });
  const [currentPage, setCurrentPage] = useState(1);
  const LISTINGS_PER_PAGE = 25;
  const [currentPendingPage, setCurrentPendingPage] = useState(1);
  const PENDING_PER_PAGE = 25;
  const [agencies, setAgencies] = useState<string[]>([]);
  const [showApproveSuccess, setShowApproveSuccess] = useState(false);
  const [approvedListingTitle, setApprovedListingTitle] = useState('');
  const [pendingSort, setPendingSort] = useState<{ field: string; direction: 'asc' | 'desc' }>({ 
    field: 'created_at', 
    direction: 'desc' 
  });
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState({ startDate: '', endDate: '' });

  useEffect(() => {
    if (profile?.is_admin) {
      loadAdminData();
    }
  }, [user, profile, pendingSort]);

  useEffect(() => {
    if (profile?.is_admin) {
      loadAdminData();
    }
  }, [profile]);

  // Auto-hide approve success message after 3 seconds
  useEffect(() => {
    if (showApproveSuccess) {
      const timer = setTimeout(() => {
        setShowApproveSuccess(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [showApproveSuccess]);

  // Filter pending listings based on search term
  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredPendingListings(pendingListings);
    } else {
      const filtered = pendingListings.filter(listing => 
        listing.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        listing.owner?.full_name.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredPendingListings(filtered);
    }
  }, [pendingListings, searchTerm]);

  // Auto-hide success message after 3 seconds
  useEffect(() => {
    if (showApproveSuccess) {
      const timeout = setTimeout(() => {
        setShowApproveSuccess(false);
      }, 3000);
      return () => clearTimeout(timeout);
    }
  }, [showApproveSuccess]);

  // Apply filters and sorting to listings
  useEffect(() => {
    let filtered = [...allListings];

    // Apply filters
    if (listingFilters.ownerRole) {
      filtered = filtered.filter(listing => listing.owner?.role === listingFilters.ownerRole);
    }
    if (listingFilters.status) {
      if (listingFilters.status === 'featured') {
        filtered = filtered.filter(listing => listing.is_featured);
      } else if (listingFilters.status === 'standard') {
        filtered = filtered.filter(listing => !isListingCurrentlyFeatured(listing));
      }
    }
    if (listingFilters.active) {
      const isActive = listingFilters.active === 'yes';
      filtered = filtered.filter(listing => listing.is_active === isActive);
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let aValue: any, bValue: any;
      
      switch (listingSorting.field) {
        case 'title':
          aValue = (a.title || '').toLowerCase();
          bValue = (b.title || '').toLowerCase();
          break;
        case 'owner':
          aValue = (a.owner?.full_name || '').toLowerCase();
          bValue = (b.owner?.full_name || '').toLowerCase();
          break;
        case 'price':
          aValue = a.price;
          bValue = b.price;
          break;
        case 'created_at':
          aValue = new Date(a.created_at).getTime();
          bValue = new Date(b.created_at).getTime();
          break;
        case 'is_active':
        case 'is_featured':
          aValue = a[listingSorting.field] ? 1 : 0;
          bValue = b[listingSorting.field] ? 1 : 0;
          break;
        default:
          return 0;
      }

      return ['title', 'owner'].includes(listingSorting.field)
        ? (listingSorting.direction === 'asc'
            ? aValue.localeCompare(bValue)
            : bValue.localeCompare(aValue))
        : (listingSorting.direction === 'asc'
            ? aValue - bValue
            : bValue - aValue);
    });

    setFilteredListings(filtered);
    // Reset to page 1 when filters or sorting change
    setCurrentPage(1);
  }, [allListings, listingFilters, listingSorting]);

  const handleColumnSort = (field: ListingSorting['field']) => {
    setListingSorting(prev => {
      if (prev.field === field) {
        // Toggle direction if same field
        return { ...prev, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      } else {
        // Set default direction for new field
        let defaultDirection: 'asc' | 'desc' = 'asc';
        
        // For certain fields, default to desc (newest first, highest first, yes first)
        if (field === 'created_at' || field === 'price') {
          defaultDirection = 'desc';
        } else if (field === 'is_active' || field === 'is_featured') {
          defaultDirection = 'desc'; // Yes/Featured first
        }
        
        return { field, direction: defaultDirection };
      }
    });
  };

  const getSortIcon = (field: ListingSorting['field']) => {
    if (listingSorting.field !== field) return null;
    return listingSorting.direction === 'asc' ? '↑' : '↓';
  };

  const getSortableHeaderClass = () => {
    return "cursor-pointer hover:bg-gray-100 transition-colors select-none";
  };

  const handlePendingSort = (field: string) => {
    setPendingSort(prev => {
      if (prev.field === field) {
        return { ...prev, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      } else {
        return { field, direction: 'asc' };
      }
    });
  };

  const getPendingSortIcon = (field: string) => {
    if (pendingSort.field !== field) return '';
    return pendingSort.direction === 'asc' ? '↑' : '↓';
  };

  const loadAdminData = async () => {
    try {
      // Load stats
      const [usersRes, listingsRes, featuredRes] = await Promise.all([
        supabase.from('profiles').select('*', { count: 'exact' }),
        supabase.from('listings').select('*', { count: 'exact' }),
        supabase.from('listings').select('*', { count: 'exact' }).eq('is_featured', true).eq('is_active', true),
      ]);

      const { data: allListingsRaw } = await supabase
       .from('listings')
       .select('is_featured, featured_expires_at');

      const currentlyFeaturedCount = (allListingsRaw || []).filter(isListingCurrentlyFeatured).length;

      setStats({
        totalUsers: usersRes.count || 0,
        totalListings: listingsRes.count || 0,
        featuredListings: currentlyFeaturedCount,
        activeUsers: usersRes.count || 0, // Simplified for now
      });

      // Load full data for tables
      const { data: allUsers } = await supabase
        .from('profiles')
        .select('id, full_name, email, role, phone, agency, is_admin, is_banned, created_at')
        .order('created_at', { ascending: false })
        .limit(50);

      const { data: allListings } = await supabase
        .from('listings')
        .select(`
          *,
          owner:profiles!listings_user_id_fkey(full_name, role, agency)
        `);

      // Load pending listings
      let query = supabase
        .from('listings')
        .select(`
          *,
          owner:profiles!listings_user_id_fkey(full_name, role, agency)
        `)
        .eq('approved', false);

      if (pendingSort.field !== 'owner') {
        query = query.order(pendingSort.field, { ascending: pendingSort.direction === 'asc' });
      }

      const { data: pending } = await query;

      setPendingListings(pending || []);
      setUsers(allUsers || []);
      
      // Apply date filtering
      let filteredData = allListings || [];
      
      if (dateFilter.startDate || dateFilter.endDate) {
        filteredData = filteredData.filter(listing => {
          const createdAt = new Date(listing.created_at);
          const startDate = dateFilter.startDate ? new Date(dateFilter.startDate) : null;
          const endDate = dateFilter.endDate ? new Date(dateFilter.endDate) : null;
          
          if (startDate && createdAt < startDate) return false;
          if (endDate && createdAt > endDate) return false;
          return true;
        });
      }
      
      setAllListings(filteredData);
      
      // Extract unique agencies for filter
      const uniqueAgencies = Array.from(
        new Set(
          (allUsers || [])
            .filter(user => user.agency)
            .map(user => user.agency!)
        )
      ).sort();
      setAgencies(uniqueAgencies);
    } catch (error) {
      console.error('Error loading admin data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Load all listings when sort changes
  useEffect(() => {
    if (profile?.is_admin) {
      loadAdminData();
    }
  }, [dateFilter]);

  const clearListingFilters = () => {
    setListingFilters({
      ownerRole: '',
      status: '',
      active: '',
    });
  };

  const getActiveFilterCount = () => {
    return Object.values(listingFilters).filter(value => value !== '').length;
  };

  const handleDateFilterChange = (field: 'startDate' | 'endDate', value: string) => {
    setDateFilter(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Pagination calculations
  const totalPages = Math.ceil(filteredListings.length / LISTINGS_PER_PAGE);
  const startIndex = (currentPage - 1) * LISTINGS_PER_PAGE;
  const endIndex = startIndex + LISTINGS_PER_PAGE;
  const currentListings = filteredListings.slice(startIndex, endIndex);

  // Pending listings pagination
  const totalPendingPages = Math.ceil(filteredPendingListings.length / PENDING_PER_PAGE);
  const startPendingIndex = (currentPendingPage - 1) * PENDING_PER_PAGE;
  const endPendingIndex = startPendingIndex + PENDING_PER_PAGE;
  const currentPendingListings = filteredPendingListings.slice(startPendingIndex, endPendingIndex);

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const makeAdmin = async (userId: string) => {
    setActionLoading(userId);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_admin: true })
        .eq('id', userId);
      
      if (error) {
        console.error('Error making user admin:', error);
        alert('Failed to make user admin. Please try again.');
        return;
      }
      
      await loadAdminData();
      alert('User successfully made admin!');
    } catch (error) {
      console.error('Error making user admin:', error);
      alert('Failed to make user admin. Please try again.');
    } finally {
      setActionLoading(null);
    }
  };

  const toggleBanStatus = async (userId: string, isBanned: boolean) => {
    setActionLoading(userId);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_banned: !isBanned })
        .eq('id', userId);
      
      if (error) {
        console.error('Error updating ban status:', error);
        alert('Failed to update ban status. Please try again.');
        return;
      }
      
      await loadAdminData();
      alert(`User successfully ${!isBanned ? 'banned' : 'unbanned'}!`);
    } catch (error) {
      console.error('Error updating ban status:', error);
      alert('Failed to update ban status. Please try again.');
    } finally {
      setActionLoading(null);
    }
  };

  const updateUserRole = async (userId: string, newRole: string) => {
    setActionLoading(userId);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ role: newRole })
        .eq('id', userId);
      
      if (error) {
        console.error('Error updating user role:', error);
        alert('Failed to update user role. Please try again.');
        return;
      }
      
      await loadAdminData();
      alert('User role updated successfully!');
    } catch (error) {
      console.error('Error updating user role:', error);
      alert('Failed to update user role. Please try again.');
    } finally {
      setActionLoading(null);
    }
  };

  const resetPassword = async (userId: string, email: string) => {
    setActionLoading(userId);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth`
      });
      
      console.log('🔄 Admin sending password reset email to:', email);
      const result = await emailService.sendPasswordResetEmail(email);
      
      if (!result.success) {
        console.error('❌ Password reset failed:', result.error);
        throw new Error(result.error || 'Failed to send password reset email');
      }
      
      console.log('✅ Password reset email sent successfully');
      alert('Password reset email sent successfully!');
    } catch (error) {
      console.error('❌ Error sending password reset:', error);
      alert('Error sending password reset: ' + (error.message || 'Failed to send email'));
    } finally {
      setActionLoading(null);
    }
  };

  const deleteUser = async (userId: string, userName: string) => {
    if (!confirm(`Are you sure you want to permanently delete ${userName}? This action cannot be undone and will remove all their listings.`)) {
      return;
    }

    setActionLoading(userId);
    try {
      // Call the Edge Function to delete the user from both profiles and auth
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      if (!token) {
        throw new Error('No valid access token found');
     }

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-user`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
      },
        body: JSON.stringify({ userId }),
     });


      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete user');
      }

      // Remove the user from the local state to update UI immediately
      setUsers(prev => prev.filter(user => user.id !== userId));
      
      alert('User deleted successfully from both profile and authentication system!');
    } catch (error) {
      console.error('Error deleting user:', error);
      alert(`Failed to delete user: ${error.message}. Please try again.`);
    } finally {
      setActionLoading(null);
    }
  };

  const toggleListingActive = async (listingId: string, isActive: boolean) => {
    try {
      await supabase
        .from('listings')
        .update({ is_active: !isActive })
        .eq('id', listingId);
      
      await loadAdminData();
    } catch (error) {
      console.error('Error updating listing active status:', error);
    }
  };

  const toggleListingFeatured = async (listingId: string, isFeatured: boolean) => {
    try {
      const updates: any = { is_featured: !isFeatured };
      
      if (!isFeatured) {
        // Set featured until 30 days from now
        const featuredUntil = new Date();
        featuredUntil.setDate(featuredUntil.getDate() + 30);
        updates.featured_until = featuredUntil.toISOString();
      } else {
        updates.featured_until = null;
      }

      await supabase
        .from('listings')
        .update(updates)
        .eq('id', listingId);
      
      await loadAdminData();
    } catch (error) {
      console.error('Error updating listing status:', error);
    }
  };

  const deleteListing = async (listingId: string, listingTitle: string) => {
    if (!confirm(`Are you sure you want to delete "${listingTitle}" permanently? This action cannot be undone.`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('listings')
        .delete()
        .eq('id', listingId);

      if (error) {
        console.error('Error deleting listing:', error);
        alert('Failed to delete listing. Please try again.');
        return;
      }

      await loadAdminData();
      alert('Listing deleted successfully!');
    } catch (error) {
      console.error('Error deleting listing:', error);
      alert('Failed to delete listing. Please try again.');
    }
  };

  const approveListing = async (listingId: string) => {
    try {
      const { error } = await supabase
        .from('listings')
        .update({ 
          approved: true,
          is_active: true
        })
        .eq('id', listingId);
      
      if (error) {
        console.error('Error approving listing:', error);
        alert('Failed to approve listing. Please try again.');
        return;
      }
      
      await loadAdminData();
      setShowApproveSuccess(true);
    } catch (error) {
      console.error('Error approving listing:', error);
      alert('Failed to approve listing. Please try again.');
    }
  };

  const rejectListing = async (listingId: string) => {
    if (!confirm('Are you sure you want to reject this listing? This action cannot be undone.')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('listings')
        .delete()
        .eq('id', listingId);

      if (error) {
        console.error('Error rejecting listing:', error);
        alert('Failed to reject listing. Please try again.');
        return;
      }

      await loadAdminData();
      alert('Listing rejected successfully!');
    } catch (error) {
      console.error('Error rejecting listing:', error);
      alert('Failed to reject listing. Please try again.');
    }
  };

  const handleUsersSort = (field: string) => {
    if (usersSortField === field) {
      setUsersSortDirection(usersSortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setUsersSortField(field);
      setUsersSortDirection('asc');
    }
    setCurrentUserPage(1); // Reset to first page when sorting
  };

  const getUserSortIcon = (field: string) => {
    if (usersSortField !== field) return null;
    return usersSortDirection === 'asc' ? '↑' : '↓';
  };


  const filteredUsers = users.filter(user => {
    if (userFilters.role && user.role !== userFilters.role) return false;
    if (userFilters.agency && user.agency !== userFilters.agency) return false;
    if (userFilters.search && !user.full_name.toLowerCase().includes(userFilters.search.toLowerCase())) return false;
    return true;
  }).sort((a, b) => {
    if (!usersSortField) return 0;

    let aValue: any;
    let bValue: any;

    switch (usersSortField) {
      case 'full_name':
        aValue = a.full_name.toLowerCase();
        bValue = b.full_name.toLowerCase();
        break;
      case 'phone':
        aValue = (a.phone || '').toLowerCase();
        bValue = (b.phone || '').toLowerCase();
        break;
      case 'role':
        aValue = a.role.toLowerCase();
        bValue = b.role.toLowerCase();
        break;
      case 'agency':
        aValue = (a.agency || '').toLowerCase();
        bValue = (b.agency || '').toLowerCase();
        break;
      case 'created_at':
        aValue = new Date(a.created_at).getTime();
        bValue = new Date(b.created_at).getTime();
        break;
      case 'status':
        // Admins first, then banned, then regular users
        const getStatusPriority = (user: any) => {
          if (user.is_admin) return 0;
          if (user.is_banned) return 1;
          return 2;
        };
        aValue = getStatusPriority(a);
        bValue = getStatusPriority(b);
        break;
      default:
        return 0;
    }

    if (aValue < bValue) return usersSortDirection === 'asc' ? -1 : 1;
    if (aValue > bValue) return usersSortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  // Paginate filtered users
  const paginatedUsers = (() => {
    const startIndex = (currentUserPage - 1) * USERS_PER_PAGE;
    const endIndex = startIndex + USERS_PER_PAGE;
    return filteredUsers.slice(startIndex, endIndex);
  })();

  const totalUserPages = Math.ceil(filteredUsers.length / USERS_PER_PAGE);
  const startUserIndex = (currentUserPage - 1) * USERS_PER_PAGE + 1;
  const endUserIndex = Math.min(currentUserPage * USERS_PER_PAGE, filteredUsers.length);

  const StatCard = ({ icon: Icon, title, value, color }: {
    icon: React.ElementType;
    title: string;
    value: number;
    color: string;
  }) => (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center">
        <div className={`p-3 rounded-lg ${color} mr-4`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
        <div>
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="text-3xl font-bold text-gray-900">{value}</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Approval Success Message */}
      {showApproveSuccess && (
        <div className="fixed top-20 right-4 bg-green-500 text-white px-4 py-2 rounded-md shadow-lg z-50">
          Listing approved successfully!
        </div>
      )}

      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[#4E4B43] mb-2 flex items-center">
          <Shield className="w-8 h-8 mr-3" />
          Admin Panel
        </h1>
        <p className="text-gray-600">Manage users, listings, and platform settings</p>
      </div>

      {/* Navigation Tabs */}
      <div className="mb-8">
        <nav className="flex space-x-8 border-b border-gray-200">
          {[
            { id: 'overview', label: 'Overview', icon: TrendingUp },
            { id: 'users', label: 'Users', icon: Users },
            { id: 'listings', label: 'Listings', icon: Home },
            { id: 'pending', label: 'Pending', icon: Eye },
            { id: 'settings', label: 'Settings', icon: Settings },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id as any)}
              className={`flex items-center px-3 py-2 border-b-2 font-medium text-sm transition-colors ${
                activeTab === id
                  ? 'border-[#4E4B43] text-[#4E4B43]'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Icon className="w-4 h-4 mr-2" />
              {label}
            </button>
          ))}
        </nav>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#4E4B43] mx-auto"></div>
          <p className="text-gray-600 mt-4">Loading admin data...</p>
        </div>
      ) : (
        <>
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard
                  icon={Users}
                  title="Total Users"
                  value={stats.totalUsers}
                  color="bg-blue-500"
                />
                <StatCard
                  icon={Home}
                  title="Active Listings"
                  value={stats.totalListings}
                  color="bg-green-500"
                />
                <StatCard
                  icon={Star}
                  title="Featured Listings"
                  value={stats.featuredListings}
                  color="bg-yellow-500"
                />
                <StatCard
                  icon={TrendingUp}
                  title="Active Users"
                  value={stats.activeUsers}
                  color="bg-purple-500"
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Recent Users */}
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                  <h3 className="text-lg font-semibold text-[#4E4B43] mb-4">Recent Users</h3>
                  <div className="space-y-3">
                    {users.slice(0, 5).map((user) => (
                      <div key={user.id} className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{user.full_name}</p>
                          <p className="text-sm text-gray-500 capitalize">{user.role}</p>
                        </div>
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          user.is_admin ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                        }`}>
                          {user.is_admin ? 'Admin' : 'User'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Recent Listings */}
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                  <h3 className="text-lg font-semibold text-[#4E4B43] mb-4">Recent Listings</h3>
                  <div className="space-y-3">
                    {listings.slice(0, 5).map((listing) => (
                      <div key={listing.id} className="flex items-center justify-between">
                        <div>
                          <p className="font-medium truncate">{listing.title}</p>
                          <p className="text-sm text-gray-500">${listing.price}/month</p>
                        </div>
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          listing.is_featured ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-800'
                        }`}>
                          {listing.is_featured ? 'Featured' : 'Standard'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Users Tab */}
          {activeTab === 'users' && (
            <div className="space-y-6">
              {/* User Filters */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <div className="flex items-center mb-4">
                  <h3 className="text-lg font-semibold text-[#4E4B43] mr-4">Filter Users</h3>
                  <button
                    onClick={() => {
                      setUserFilters({ role: '', agency: '', search: '' });
                      setCurrentUserPage(1);
                    }}
                    className="text-sm text-gray-500 hover:text-[#4E4B43] transition-colors"
                  >
                    Clear Filters
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Search by Name
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search className="h-4 w-4 text-gray-400" />
                      </div>
                      <input
                        type="text"
                        placeholder="Search users..."
                        value={userFilters.search}
                        onChange={(e) => {
                          setUserFilters(prev => ({ ...prev, search: e.target.value }));
                          setCurrentUserPage(1);
                        }}
                        className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-md focus:ring-[#4E4B43] focus:border-[#4E4B43]"
                      />
                      {userFilters.search && (
                        <button
                          onClick={() => {
                            setUserFilters(prev => ({ ...prev, search: '' }));
                            setCurrentUserPage(1);
                          }}
                          className="absolute inset-y-0 right-0 pr-3 flex items-center"
                        >
                          <X className="h-4 w-4 text-gray-400 hover:text-gray-600" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Filter by Role
                    </label>
                    <select
                      value={userFilters.role}
                      onChange={(e) => {
                        setUserFilters(prev => ({ ...prev, role: e.target.value }));
                        setCurrentUserPage(1);
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#4E4B43] focus:border-[#4E4B43]"
                    >
                      <option value="">All Roles</option>
                      <option value="tenant">Tenant</option>
                      <option value="landlord">Landlord</option>
                      <option value="agent">Agent</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Filter by Agency
                    </label>
                    <select
                      value={userFilters.agency}
                      onChange={(e) => {
                        setUserFilters(prev => ({ ...prev, agency: e.target.value }));
                        setCurrentUserPage(1);
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#4E4B43] focus:border-[#4E4B43]"
                    >
                      <option value="">All Agencies</option>
                      {agencies.map((agency) => (
                        <option key={agency} value={agency}>
                          {agency}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Users count and pagination info */}
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-gray-700">
                  {filteredUsers.length === 0 ? (
                    'No users found'
                  ) : (
                    <>
                      Showing <span className="font-medium">{startUserIndex}</span> to{' '}
                      <span className="font-medium">{endUserIndex}</span> of{' '}
                      <span className="font-medium">{filteredUsers.length}</span> users
                    </>
                  )}
                </p>
              </div>

              {/* Users Table */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h3 className="text-lg font-semibold text-[#4E4B43]">
                    All Users ({filteredUsers.length})
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          <button
                            onClick={() => handleUsersSort('full_name')}
                            className="flex items-center space-x-1 hover:text-gray-700 transition-colors"
                          >
                            <span>Name</span>
                            <span className="text-gray-400">{getUserSortIcon('full_name')}</span>
                          </button>
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Email
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          <button
                            onClick={() => handleUsersSort('phone')}
                            className="flex items-center space-x-1 hover:text-gray-700 transition-colors"
                          >
                            <span>Contact</span>
                            <span className="text-gray-400">{getUserSortIcon('phone')}</span>
                          </button>
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          <button
                            onClick={() => handleUsersSort('role')}
                            className="flex items-center space-x-1 hover:text-gray-700 transition-colors"
                          >
                            <span>Role</span>
                            <span className="text-gray-400">{getUserSortIcon('role')}</span>
                          </button>
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          <button
                            onClick={() => handleUsersSort('agency')}
                            className="flex items-center space-x-1 hover:text-gray-700 transition-colors"
                          >
                            <span>Agency</span>
                            <span className="text-gray-400">{getUserSortIcon('agency')}</span>
                          </button>
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          <button
                            onClick={() => handleUsersSort('created_at')}
                            className="flex items-center space-x-1 hover:text-gray-700 transition-colors"
                          >
                            <span>Joined</span>
                            <span className="text-gray-400">{getUserSortIcon('created_at')}</span>
                          </button>
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          <button
                            onClick={() => handleUsersSort('status')}
                            className="flex items-center space-x-1 hover:text-gray-700 transition-colors"
                          >
                            <span>Status</span>
                            <span className="text-gray-400">{getUserSortIcon('status')}</span>
                          </button>
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {paginatedUsers.map((user) => (
                        <tr key={user.id} className={user.is_banned ? 'bg-red-50' : ''}>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="font-medium text-gray-900">{user.full_name}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {user.email || 'No email'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">{user.phone || 'No phone'}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="relative">
                              <select
                                value={user.role}
                                onChange={(e) => updateUserRole(user.id, e.target.value)}
                                disabled={actionLoading === user.id || user.id === profile.id}
                                className="appearance-none bg-transparent border border-gray-300 rounded px-3 py-1 pr-8 text-sm focus:ring-[#4E4B43] focus:border-[#4E4B43] disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                <option value="tenant">Tenant</option>
                                <option value="landlord">Landlord</option>
                                <option value="agent">Agent</option>
                              </select>
                              <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {user.agency || '-'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {new Date(user.created_at).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex flex-col space-y-1">
                              <span className={`px-2 py-1 text-xs rounded-full ${
                                user.is_admin ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                              }`}>
                                {user.is_admin ? 'Admin' : 'User'}
                              </span>
                              <span className={`px-2 py-1 text-xs rounded-full ${
                                user.is_banned ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                              }`}>
                                {user.is_banned ? 'Banned' : 'Active'}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                            <div className="flex flex-wrap gap-2">
                              {/* Make Admin Button */}
                              {!user.is_admin && user.id !== profile.id && (
                                <button
                                  onClick={() => makeAdmin(user.id)}
                                  disabled={actionLoading === user.id}
                                  className="text-blue-600 hover:text-blue-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-xs"
                                  title="Make Admin"
                                >
                                  <Shield className="w-4 h-4" />
                                </button>
                              )}
                              
                              {/* Ban/Unban Button */}
                              {user.id !== profile.id && (
                                <button
                                  onClick={() => toggleBanStatus(user.id, user.is_banned || false)}
                                  disabled={actionLoading === user.id}
                                  className={`transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                                    user.is_banned 
                                      ? 'text-green-600 hover:text-green-800' 
                                      : 'text-orange-600 hover:text-orange-800'
                                  }`}
                                  title={user.is_banned ? 'Unban User' : 'Ban User'}
                                >
                                  {user.is_banned ? <UserCheck className="w-4 h-4" /> : <UserX className="w-4 h-4" />}
                                </button>
                              )}
                              
                              {/* Reset Password Button */}
                              <button
                                onClick={() => {
                                  const email = prompt('Enter user email for password reset:');
                                  if (email) resetPassword(user.id, email);
                                }}
                                disabled={actionLoading === user.id}
                                className="text-purple-600 hover:text-purple-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Reset Password"
                              >
                                <Mail className="w-4 h-4" />
                              </button>
                              
                              {/* Delete User Button */}
                              {user.id !== profile.id && (
                                <button
                                  onClick={() => deleteUser(user.id, user.full_name)}
                                  disabled={actionLoading === user.id}
                                  className="text-red-600 hover:text-red-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                  title="Delete User"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Users Pagination */}
                {totalUserPages > 1 && (
                  <div className="flex items-center justify-between mt-6">
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => setCurrentUserPage(Math.max(1, currentUserPage - 1))}
                        disabled={currentUserPage === 1}
                        className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Previous
                      </button>
                      
                      <div className="flex items-center space-x-1">
                        {Array.from({ length: Math.min(10, totalUserPages) }, (_, i) => {
                          const pageNum = i + 1;
                          const isCurrentPage = pageNum === currentUserPage;
                          
                          return (
                            <button
                              key={pageNum}
                              onClick={() => setCurrentUserPage(pageNum)}
                              className={`px-3 py-2 text-sm font-medium rounded-md ${
                                isCurrentPage
                                  ? 'bg-[#4E4B43] text-white'
                                  : 'text-gray-500 bg-white border border-gray-300 hover:bg-gray-50'
                              }`}
                            >
                              {pageNum}
                            </button>
                          );
                        })}
                        
                        {totalUserPages > 10 && (
                          <>
                            <span className="px-2 text-gray-500">...</span>
                            <button
                              onClick={() => setCurrentUserPage(totalUserPages)}
                              className={`px-3 py-2 text-sm font-medium rounded-md ${
                                currentUserPage === totalUserPages
                                  ? 'bg-[#4E4B43] text-white'
                                  : 'text-gray-500 bg-white border border-gray-300 hover:bg-gray-50'
                              }`}
                            >
                              {totalUserPages}
                            </button>
                          </>
                        )}
                      </div>
                      
                      <button
                        onClick={() => setCurrentUserPage(Math.min(totalUserPages, currentUserPage + 1))}
                        disabled={currentUserPage === totalUserPages}
                        className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Listings Tab */}
          {activeTab === 'listings' && (
            <div className="space-y-6">
              {/* Listing Filters and Sorting */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-[#4E4B43]">Filter & Sort Listings</h3>
                  <div className="flex items-center space-x-4">
                    {getActiveFilterCount() > 0 && (
                      <span className="text-sm text-gray-500">
                        {getActiveFilterCount()} filter{getActiveFilterCount() > 1 ? 's' : ''} active
                      </span>
                    )}
                    <button
                      onClick={clearListingFilters}
                      className="text-sm text-gray-500 hover:text-[#4E4B43] transition-colors"
                    >
                      Clear All Filters
                    </button>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {/* Owner Role Filter */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Owner Role
                    </label>
                    <select
                      value={listingFilters.ownerRole}
                      onChange={(e) => setListingFilters(prev => ({ ...prev, ownerRole: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#4E4B43] focus:border-[#4E4B43]"
                    >
                      <option value="">All Roles</option>
                      <option value="landlord">Landlord</option>
                      <option value="agent">Agent</option>
                      <option value="tenant">Tenant</option>
                    </select>
                  </div>

                  {/* Status Filter */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Status
                    </label>
                    <select
                      value={listingFilters.status}
                      onChange={(e) => setListingFilters(prev => ({ ...prev, status: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#4E4B43] focus:border-[#4E4B43]"
                    >
                      <option value="">All Status</option>
                      <option value="featured">Featured</option>
                      <option value="standard">Standard</option>
                    </select>
                  </div>

                  {/* Active Filter */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Active
                    </label>
                    <select
                      value={listingFilters.active}
                      onChange={(e) => setListingFilters(prev => ({ ...prev, active: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#4E4B43] focus:border-[#4E4B43]"
                    >
                      <option value="">All</option>
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Listings Table */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                <div className="mb-6 flex justify-between items-center">
                  <h3 className="text-xl font-semibold text-[#4E4B43]">All Listings</h3>
                  
                  {/* Date Filter */}
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-2">
                      <label className="text-sm font-medium text-gray-700">Date Created:</label>
                      <input
                        type="date"
                        value={dateFilter.startDate}
                        onChange={(e) => handleDateFilterChange('startDate', e.target.value)}
                        className="px-3 py-1 border border-gray-300 rounded-md text-sm focus:ring-[#4E4B43] focus:border-[#4E4B43]"
                        placeholder="Start date"
                      />
                      <span className="text-gray-500">to</span>
                      <input
                        type="date"
                        value={dateFilter.endDate}
                        onChange={(e) => handleDateFilterChange('endDate', e.target.value)}
                        className="px-3 py-1 border border-gray-300 rounded-md text-sm focus:ring-[#4E4B43] focus:border-[#4E4B43]"
                        placeholder="End date"
                      />
                      {(dateFilter.startDate || dateFilter.endDate) && (
                        <button
                          onClick={() => setDateFilter({ startDate: '', endDate: '' })}
                          className="text-sm text-gray-500 hover:text-[#4E4B43] transition-colors"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="px-6 py-4 border-b border-gray-200">
                  <h3 className="text-lg font-semibold text-[#4E4B43]">
                    All Listings ({filteredListings.length}) - Page {currentPage} of {totalPages}
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th 
                          className={`px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${getSortableHeaderClass()}`}
                          onClick={() => handleColumnSort('title')}
                        >
                          <div className="flex items-center space-x-1">
                            <span>Property</span>
                            <span className="text-gray-400">{getSortIcon('title')}</span>
                          </div>
                        </th>
                        <th 
                          className={`px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${getSortableHeaderClass()}`}
                          onClick={() => handleColumnSort('owner')}
                        >
                          <div className="flex items-center space-x-1">
                            <span>Owner</span>
                            <span className="text-gray-400">{getSortIcon('owner')}</span>
                          </div>
                        </th>
                        <th 
                          className={`px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${getSortableHeaderClass()}`}
                          onClick={() => handleColumnSort('price')}
                        >
                          <div className="flex items-center space-x-1">
                            <span>Price</span>
                            <span className="text-gray-400">{getSortIcon('price')}</span>
                          </div>
                        </th>
                        <th 
                          className={`px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${getSortableHeaderClass()}`}
                          onClick={() => handleColumnSort('created_at')}
                        >
                          <div className="flex items-center space-x-1">
                            <span>Created</span>
                            <span className="text-gray-400">{getSortIcon('created_at')}</span>
                          </div>
                        </th>
                        <th 
                          className={`px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${getSortableHeaderClass()}`}
                          onClick={() => handleColumnSort('is_active')}
                        >
                          <div className="flex items-center space-x-1">
                            <span>Active</span>
                            <span className="text-gray-400">{getSortIcon('is_active')}</span>
                          </div>
                        </th>
                        <th 
                          className={`px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${getSortableHeaderClass()}`}
                          onClick={() => handleColumnSort('is_featured')}
                        >
                          <div className="flex items-center space-x-1">
                            <span>Status</span>
                            <span className="text-gray-400">{getSortIcon('is_featured')}</span>
                          </div>
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {currentListings.map((listing) => (
                        <tr key={listing.id}>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div>
                              <div className="font-medium text-gray-900 truncate max-w-xs">{listing.title}</div>
                              <div className="text-sm text-gray-500">{listing.location}</div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            <div>
                              <div className="font-medium text-gray-900">
                                {listing.owner?.full_name || 'Unknown'}
                              </div>
                              <div className="text-sm text-gray-500 capitalize">
                                {listing.owner?.role === 'agent'
                                  ? listing.owner.agency || 'Unknown Agency'
                                  : listing.owner?.role || 'Unknown role'}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            ${listing.price}/month
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {new Date(listing.created_at).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 py-1 text-xs rounded-full ${
                              listing.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                            }`}>
                              {listing.is_active ? 'Yes' : 'No'}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 py-1 text-xs rounded-full ${
                              isListingCurrentlyFeatured(listing)
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-gray-100 text-gray-800'
                            }`}>
                              {isListingCurrentlyFeatured(listing) ? 'Featured' : 'Standard'}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                            <div className="flex items-center space-x-4">
                              <Link
                                to={`/listing/${listing.id}`}
                                className="text-blue-600 hover:text-blue-800 transition-colors"
                                title="View Listing"
                              >
                                <Eye className="w-5 h-5" />
                              </Link>
                              <button
                                onClick={() => toggleListingFeatured(listing.id, listing.is_featured)}
                                className={`transition-colors ${
                                  listing.is_featured
                                    ? 'text-yellow-500 hover:text-yellow-600'
                                    : 'text-gray-400 hover:text-yellow-500'
                                }`}
                                title={listing.is_featured ? 'Remove Featured' : 'Make Featured'}
                              >
                                <Star className={`w-5 h-5 ${listing.is_featured ? 'fill-current' : ''}`} />
                              </button>
                              <button
                                onClick={() => toggleListingActive(listing.id, listing.is_active)}
                                className={`transition-colors ${
                                  listing.is_active 
                                    ? 'text-red-500 hover:text-red-600'
                                    : 'text-green-500 hover:text-green-600'
                                }`}
                                title={listing.is_active ? 'Deactivate' : 'Activate'}
                              >
                                <Power className="w-5 h-5" />
                              </button>
                              <button
                                onClick={() => deleteListing(listing.id, listing.title)}
                                className="text-red-600 hover:text-red-800 transition-colors"
                                title="Delete Listing"
                              >
                                <Trash2 className="w-5 h-5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                
                {/* Pagination Controls */}
                {totalPages > 1 && (
                  <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
                    <div className="text-sm text-gray-700">
                      Showing {startIndex + 1} to {Math.min(endIndex, filteredListings.length)} of {filteredListings.length} listings
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => goToPage(currentPage - 1)}
                        disabled={currentPage === 1}
                        className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        Previous
                      </button>
                      
                      {/* Page Numbers */}
                      <div className="flex items-center space-x-1">
                        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                          let pageNum;
                          if (totalPages <= 5) {
                            pageNum = i + 1;
                          } else if (currentPage <= 3) {
                            pageNum = i + 1;
                          } else if (currentPage >= totalPages - 2) {
                            pageNum = totalPages - 4 + i;
                          } else {
                            pageNum = currentPage - 2 + i;
                          }
                          
                          return (
                            <button
                              key={pageNum}
                              onClick={() => goToPage(pageNum)}
                              className={`px-3 py-1 text-sm border rounded-md transition-colors ${
                                currentPage === pageNum
                                  ? 'bg-[#4E4B43] text-white border-[#4E4B43]'
                                  : 'border-gray-300 hover:bg-gray-50'
                              }`}
                            >
                              {pageNum}
                            </button>
                          );
                        })}
                      </div>
                      
                      <button
                        onClick={() => goToPage(currentPage + 1)}
                        disabled={currentPage === totalPages}
                        className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Pending Listings Tab */}
          {activeTab === 'pending' && (
            <div className="space-y-6">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h2 className="text-xl font-semibold text-[#4E4B43]">Pending Listings</h2>
                  
                  {/* Search Bar */}
                  <div className="mt-4 relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Search className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      type="text"
                      placeholder="Search by title or owner..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-[#4E4B43] focus:border-[#4E4B43]"
                    />
                  </div>
                </div>
              
                {filteredPendingListings.length === 0 ? (
                  <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
                    <Eye className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No pending listings</h3>
                    <p className="text-gray-500">All listings have been reviewed.</p>
                  </div>
                ) : (
                  <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th 
                            className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                            onClick={() => handlePendingSort('title')}
                          >
                            Title {getPendingSortIcon('title')}
                          </th>
                          <th 
                            className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                            onClick={() => handlePendingSort('owner')}
                          >
                            <div className="flex items-center">
                              Owner
                              {getPendingSortIcon('owner')}
                            </div>
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Price
                          </th>
                          <th 
                            className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                            onClick={() => handlePendingSort('created_at')}
                          >
                            Created {getPendingSortIcon('created_at')}
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {filteredPendingListings.map((listing) => (
                          <tr key={listing.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm font-medium text-gray-900 truncate max-w-xs">
                                {listing.title}
                              </div>
                              <div className="text-sm text-gray-500">
                                {listing.bedrooms === 0 ? 'Studio' : `${listing.bedrooms} bed`}, {listing.bathrooms} bath
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-900">{listing.owner?.full_name || 'Unknown'}</div>
                              <div className="text-sm text-gray-500 capitalize">{listing.owner?.role || 'N/A'}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              ${listing.price.toLocaleString()}/month
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {new Date(listing.created_at).toLocaleDateString()}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                              <div className="flex items-center space-x-3">
                                <Link
                                  to={`/listing/${listing.id}`}
                                  className="text-blue-600 hover:text-blue-800 transition-colors"
                                  title="View Listing"
                                >
                                  <Eye className="w-4 h-4" />
                                </Link>
                                <button
                                  onClick={() => approveListing(listing.id)}
                                  className="text-green-600 hover:text-green-800 transition-colors"
                                  title="Approve Listing"
                                >
                                  ✅
                                </button>
                                <button
                                  onClick={() => rejectListing(listing.id)}
                                  className="text-red-600 hover:text-red-800 transition-colors"
                                  title="Reject Listing"
                                >
                                  ❌
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {/* Pagination for Pending Listings */}
                    {totalPendingPages > 1 && (
                      <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 sm:px-6 mt-4">
                        <div className="flex flex-1 justify-between sm:hidden">
                          <button
                            onClick={() => setCurrentPendingPage(Math.max(1, currentPendingPage - 1))}
                            disabled={currentPendingPage === 1}
                            className="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Previous
                          </button>
                          <button
                            onClick={() => setCurrentPendingPage(Math.min(totalPendingPages, currentPendingPage + 1))}
                            disabled={currentPendingPage === totalPendingPages}
                            className="relative ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Next
                          </button>
                        </div>
                        <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
                          <div>
                            <p className="text-sm text-gray-700">
                              Showing <span className="font-medium">{startPendingIndex + 1}</span> to{' '}
                              <span className="font-medium">{Math.min(endPendingIndex, filteredPendingListings.length)}</span> of{' '}
                              <span className="font-medium">{filteredPendingListings.length}</span> pending listings
                            </p>
                          </div>
                          <div>
                            <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
                              <button
                                onClick={() => setCurrentPendingPage(Math.max(1, currentPendingPage - 1))}
                                disabled={currentPendingPage === 1}
                                className="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                <ChevronLeft className="h-5 w-5" />
                              </button>
                              
                              {Array.from({ length: Math.min(10, totalPendingPages) }, (_, i) => {
                                const pageNum = i + 1;
                                return (
                                  <button
                                    key={pageNum}
                                    onClick={() => setCurrentPendingPage(pageNum)}
                                    className={`relative inline-flex items-center px-4 py-2 text-sm font-semibold ${
                                      currentPendingPage === pageNum
                                        ? 'z-10 bg-[#4E4B43] text-white focus:z-20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4E4B43]'
                                        : 'text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0'
                                    }`}
                                  >
                                    {pageNum}
                                  </button>
                                );
                              })}
                              
                              <button
                                onClick={() => setCurrentPendingPage(Math.min(totalPendingPages, currentPendingPage + 1))}
                                disabled={currentPendingPage === totalPendingPages}
                                className="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                <ChevronRight className="h-5 w-5" />
                              </button>
                            </nav>
                          </div>
                        </div>
                      </div>
                    )}

                    {filteredPendingListings.length === 0 && (
                      <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
                        <Eye className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-gray-900 mb-2">No pending listings</h3>
                        <p className="text-gray-500">All listings have been reviewed.</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Settings Tab */}
          {activeTab === 'settings' && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-[#4E4B43] mb-6">Platform Settings</h3>
              
              <div className="space-y-6">
                <div>
                  <h4 className="text-md font-medium text-gray-900 mb-3">Featured Listings</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Maximum Featured Listings
                      </label>
                      <input
                        type="number"
                        defaultValue={10}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#4E4B43] focus:border-[#4E4B43]"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Featured Duration (days)
                      </label>
                      <input
                        type="number"
                        defaultValue={30}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#4E4B43] focus:border-[#4E4B43]"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-md font-medium text-gray-900 mb-3">System Status</h4>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Database Status</span>
                      <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">Connected</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Storage Status</span>
                      <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">Active</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Stripe Integration</span>
                      <span className="px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded-full">Pending</span>
                    </div>
                  </div>
                </div>

                <div className="pt-4">
                  <button className="bg-[#4E4B43] text-white px-6 py-2 rounded-md font-medium hover:bg-[#3a3832] transition-colors">
                    Save Settings
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}