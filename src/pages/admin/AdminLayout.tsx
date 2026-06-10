import React, { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Shield } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { adminPanelService } from '@/services/adminPanel';
import { AdminToastProvider } from './adminToast';
import { AdminSidebar } from './AdminSidebar';

function SectionFallback() {
  return (
    <div className="flex items-center justify-center py-24">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#4E4B43]" />
    </div>
  );
}

export function AdminLayout() {
  const { profile, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (authLoading || profile === undefined) return;
    if (!profile?.is_admin) {
      navigate('/', { replace: true });
    }
  }, [authLoading, profile, navigate]);

  // Refresh the pending badge on every in-admin navigation — two head-count
  // queries, cheap enough to keep the badge honest after approvals.
  useEffect(() => {
    if (!profile?.is_admin) return;
    adminPanelService.getPendingCount().then(setPendingCount).catch(() => {});
  }, [profile?.is_admin, location.pathname]);

  if (authLoading || profile === undefined) return null;
  if (!profile?.is_admin) return null;

  return (
    <AdminToastProvider>
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-[#4E4B43] flex items-center">
            <Shield className="w-7 h-7 mr-3" />
            Admin Panel
          </h1>
          <p className="text-gray-600 mt-1">Manage users, listings, and platform settings</p>
        </div>

        <div className="lg:flex lg:items-start lg:gap-6">
          <AdminSidebar pendingCount={pendingCount} />
          <main className="flex-1 min-w-0">
            <React.Suspense fallback={<SectionFallback />}>
              <Outlet />
            </React.Suspense>
          </main>
        </div>
      </div>
    </AdminToastProvider>
  );
}
