import React from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation, Navigate, useSearchParams } from 'react-router-dom';
import { Layout } from './components/shared/Layout';
import { ErrorBoundary } from './components/shared/ErrorBoundary';
import { Home } from './pages/Home';
import { BrowseListings } from './pages/BrowseListings';
import { BrowseSales } from './pages/BrowseSales';
import { AuthForm } from './components/auth/AuthForm';
import PasswordRecoveryGate from './components/auth/PasswordRecoveryGate';
import { PostListing } from './pages/PostListing';
import { EditListing } from './pages/EditListing';
import { ListingDetail } from './pages/ListingDetail';
import { AdminPanel } from './pages/AdminPanel';
import { InternalAnalytics } from './pages/InternalAnalytics';
import { AgencySettings } from './pages/AgencySettings';
import { AccountSettings } from './pages/AccountSettings';
import { Account } from './pages/Account';
import { About } from './pages/About';
import { Contact } from './pages/Contact';
import { Privacy } from './pages/Privacy';
import { Terms } from './pages/Terms';
import { StaticPage } from './pages/StaticPage';
import { NotFound } from './pages/NotFound';
import { AgencyPage } from './pages/AgencyPage';
import { HelpCenter } from './pages/HelpCenter';
import { HelpCategory } from './pages/HelpCategory';
import { HelpArticle } from './pages/HelpArticle';
import { ContentManagement } from './pages/ContentManagement';
import { DigestManager } from './pages/DigestManager';
import { DigestGlobalSettings } from './pages/DigestGlobalSettings';
import { ShortUrlRedirect } from './pages/ShortUrlRedirect';
import { useAuth } from '@/hooks/useAuth';
import GASmokeTest from '@/dev/gaSmokeTest';

function ScrollToTop() {
  const location = useLocation();

  React.useEffect(() => {
    // Don't scroll to top if we're returning to browse page from a listing
    // The useBrowseFilters hook will handle scroll restoration in that case
    const isReturningToBrowse = location.pathname === '/browse' &&
      sessionStorage.getItem('browse_scroll_restore') === 'true';

    if (!isReturningToBrowse) {
      window.scrollTo(0, 0);
    }
  }, [location.pathname]);

  return null;
}

function DashboardRedirect() {
  const [searchParams] = useSearchParams();
  const params = new URLSearchParams(searchParams);
  params.set('tab', 'listings');
  return <Navigate to={`/account?${params.toString()}`} replace />;
}

function ShouldMountSmoke() {
  const isDev = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.PROD === false;
  const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const flagged = params?.get('ga_test') === '1';
  return (isDev || flagged) ? <GASmokeTest /> : null;
}

function App() {
  const { user } = useAuth();

  return (
    <ErrorBoundary>
      <Router>
        <ShouldMountSmoke />
        <ScrollToTop />
        <Routes>
        <Route
          path="/*"
          element={
            <Layout>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/browse" element={<BrowseListings />} />
                <Route path="/browse-sales" element={<BrowseSales />} />
                <Route path="/post" element={<PostListing />} />
                <Route path="/edit/:id" element={<EditListing />} />
                <Route path="/listing/:id" element={<ListingDetail />} />
                <Route path="/l/:code" element={<ShortUrlRedirect />} />
                <Route path="/favorites" element={<Navigate to="/account?tab=favorites" replace />} />
                <Route path="/admin" element={<AdminPanel />} />
                <Route path="/admin/analytics" element={<InternalAnalytics />} />
                <Route path="/admin/content-management" element={<ContentManagement />} />
                <Route path="/admin/digest" element={<DigestManager />} />
                <Route path="/admin/digest-manager" element={<Navigate to="/admin/digest" replace />} />
                <Route path="/admin/digest-settings" element={<DigestGlobalSettings />} />
                <Route path="/admin/static-pages" element={<Navigate to="/admin/content-management?tab=static-pages" replace />} />
                <Route path="/admin/featured-settings" element={<Navigate to="/admin/content-management?tab=featured" replace />} />
                <Route path="/account" element={<Account />} />
                <Route path="/dashboard" element={<DashboardRedirect />} />
                <Route path="/dashboard/agency-settings" element={<AgencySettings />} />
                <Route path="/account-settings" element={<Navigate to="/account?tab=settings" replace />} />
                <Route path="/internal-analytics" element={<Navigate to="/admin/analytics" replace />} />
                <Route path="/analytics" element={<Navigate to="/admin/analytics" replace />} />
                <Route path="/static-pages" element={<Navigate to="/admin/content-management?tab=static-pages" replace />} />
                <Route path="/featured-settings" element={<Navigate to="/admin/content-management?tab=featured" replace />} />
                <Route path="/about" element={<About />} />
                <Route path="/contact" element={<Contact />} />
                <Route path="/privacy" element={<Privacy />} />
                <Route path="/terms" element={<Terms />} />
                <Route path="/help" element={<HelpCenter />} />
                <Route path="/help/:categorySlug" element={<HelpCategory />} />
                <Route path="/help/:categorySlug/:articleSlug" element={<HelpArticle />} />
                <Route path="/agencies/:slug" element={<AgencyPage />} />
                <Route path="/:id" element={<StaticPage />} />
                <Route
                  path="/auth"
                  element={
                    <PasswordRecoveryGate onSuccessPath="/">
                      <AuthForm />
                    </PasswordRecoveryGate>
                  }
                />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Layout>
          }
        />
      </Routes>
    </Router>
    </ErrorBoundary>
  );
}

export default App;

