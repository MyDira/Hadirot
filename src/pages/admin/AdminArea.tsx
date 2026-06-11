import React, { lazy } from 'react';
import { Navigate, Route, Routes, useSearchParams } from 'react-router-dom';
import { AdminLayout } from './AdminLayout';

// Every section is its own chunk — visiting one admin page doesn't load the rest.
const OverviewSection = lazy(() => import('./sections/OverviewSection').then((m) => ({ default: m.OverviewSection })));
const UsersSection = lazy(() => import('./sections/UsersSection').then((m) => ({ default: m.UsersSection })));
const ListingsSection = lazy(() => import('./sections/ListingsSection').then((m) => ({ default: m.ListingsSection })));
const PendingSection = lazy(() => import('./sections/PendingSection').then((m) => ({ default: m.PendingSection })));
const SalesManagement = lazy(() => import('@/components/admin/SalesManagement').then((m) => ({ default: m.SalesManagement })));
const ConciergeManagement = lazy(() => import('@/components/admin/ConciergeManagement').then((m) => ({ default: m.ConciergeManagement })));
const PipelineManagement = lazy(() => import('@/components/admin/PipelineManagement').then((m) => ({ default: m.PipelineManagement })));
const AiIntakeSection = lazy(() => import('./sections/AiIntakeSection').then((m) => ({ default: m.AiIntakeSection })));
const AdminSubscriptions = lazy(() => import('@/pages/AdminSubscriptions').then((m) => ({ default: m.AdminSubscriptions })));
const ContentManagement = lazy(() => import('@/pages/ContentManagement').then((m) => ({ default: m.ContentManagement })));
const DigestManager = lazy(() => import('@/pages/DigestManager').then((m) => ({ default: m.DigestManager })));
const DigestGlobalSettings = lazy(() => import('@/pages/DigestGlobalSettings').then((m) => ({ default: m.DigestGlobalSettings })));
const InternalAnalytics = lazy(() => import('@/pages/InternalAnalytics').then((m) => ({ default: m.InternalAnalytics })));

const LEGACY_TABS = ['users', 'listings', 'pending', 'sales', 'concierge', 'pipeline'] as const;

/** Keeps old bookmarks alive: /admin?tab=users → /admin/users. */
function LegacyTabRedirect() {
  const [params] = useSearchParams();
  const tab = params.get('tab');
  if (tab && (LEGACY_TABS as readonly string[]).includes(tab)) {
    return <Navigate to={`/admin/${tab}`} replace />;
  }
  return <OverviewSection />;
}

export function AdminArea() {
  return (
    <Routes>
      <Route element={<AdminLayout />}>
        <Route index element={<LegacyTabRedirect />} />
        <Route path="users" element={<UsersSection />} />
        <Route path="listings" element={<ListingsSection />} />
        <Route path="pending" element={<PendingSection />} />
        <Route path="sales" element={<SalesManagement />} />
        <Route path="concierge" element={<ConciergeManagement />} />
        <Route path="pipeline" element={<PipelineManagement />} />
        <Route path="ai-intake" element={<AiIntakeSection />} />
        <Route path="subscriptions" element={<AdminSubscriptions />} />
        <Route path="content-management" element={<ContentManagement />} />
        <Route path="digest" element={<DigestManager />} />
        <Route path="digest-settings" element={<DigestGlobalSettings />} />
        <Route path="analytics" element={<InternalAnalytics />} />
        <Route path="digest-manager" element={<Navigate to="/admin/digest" replace />} />
        <Route path="static-pages" element={<Navigate to="/admin/content-management?tab=static-pages" replace />} />
        <Route path="featured-settings" element={<Navigate to="/admin/content-management?tab=featured" replace />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Route>
    </Routes>
  );
}
