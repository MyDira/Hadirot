import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation, Navigate, useSearchParams } from 'react-router-dom';
import { Layout } from './components/shared/Layout';
import { ErrorBoundary } from './components/shared/ErrorBoundary';
import { Home } from './pages/Home';
import { BrowseListings } from './pages/BrowseListings';
import { BrowseSales } from './pages/BrowseSales';
import { AuthForm } from './components/auth/AuthForm';
import PasswordRecoveryGate from './components/auth/PasswordRecoveryGate';
import { ListingDetail } from './pages/ListingDetail';
import { CommercialListingDetail } from './pages/CommercialListingDetail';
import { AgencyPage } from './pages/AgencyPage';
import { ShortUrlRedirect } from './pages/ShortUrlRedirect';
import { NotFound } from './pages/NotFound';
import { useAuth } from '@/hooks/useAuth';
import GASmokeTest from '@/dev/gaSmokeTest';

// Cold-path routes — lazy-loaded into their own chunks so they don't ship in
// the initial bundle. Admin pages won't load for non-admin visitors; form
// pages (post/edit) only for authenticated users taking action; info pages
// only when someone navigates there.
const AdminPanel = lazy(() => import('./pages/AdminPanel').then(m => ({ default: m.AdminPanel })));
const InternalAnalytics = lazy(() => import('./pages/InternalAnalytics').then(m => ({ default: m.InternalAnalytics })));
const ContentManagement = lazy(() => import('./pages/ContentManagement').then(m => ({ default: m.ContentManagement })));
const DigestManager = lazy(() => import('./pages/DigestManager').then(m => ({ default: m.DigestManager })));
const DigestGlobalSettings = lazy(() => import('./pages/DigestGlobalSettings').then(m => ({ default: m.DigestGlobalSettings })));
const PostListing = lazy(() => import('./pages/PostListing').then(m => ({ default: m.PostListing })));
const PostCommercialListing = lazy(() => import('./pages/PostCommercialListing').then(m => ({ default: m.PostCommercialListing })));
const EditListing = lazy(() => import('./pages/EditListing').then(m => ({ default: m.EditListing })));
const Account = lazy(() => import('./pages/Account').then(m => ({ default: m.Account })));
const AgencySettings = lazy(() => import('./pages/AgencySettings').then(m => ({ default: m.AgencySettings })));
const About = lazy(() => import('./pages/About').then(m => ({ default: m.About })));
const Contact = lazy(() => import('./pages/Contact').then(m => ({ default: m.Contact })));
const Privacy = lazy(() => import('./pages/Privacy').then(m => ({ default: m.Privacy })));
const Terms = lazy(() => import('./pages/Terms').then(m => ({ default: m.Terms })));
const StaticPage = lazy(() => import('./pages/StaticPage').then(m => ({ default: m.StaticPage })));
const HelpCenter = lazy(() => import('./pages/HelpCenter').then(m => ({ default: m.HelpCenter })));
const HelpCategory = lazy(() => import('./pages/HelpCategory').then(m => ({ default: m.HelpCategory })));
const HelpArticle = lazy(() => import('./pages/HelpArticle').then(m => ({ default: m.HelpArticle })));
const BoostListingPage = lazy(() => import('./pages/BoostListingPage').then(m => ({ default: m.BoostListingPage })));
const BoostSuccessPage = lazy(() => import('./pages/BoostSuccessPage').then(m => ({ default: m.BoostSuccessPage })));
const Concierge = lazy(() => import('./pages/Concierge').then(m => ({ default: m.Concierge })));
const ConciergeSuccess = lazy(() => import('./pages/ConciergeSuccess').then(m => ({ default: m.ConciergeSuccess })));

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

function RouteFallback() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#273140]"></div>
    </div>
  );
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
              <Suspense fallback={<RouteFallback />}>
                <Routes>
                  <Route path="/" element={<Home />} />
                  <Route path="/browse" element={<BrowseListings />} />
                  <Route path="/browse-sales" element={<BrowseSales />} />
                  <Route path="/post" element={<PostListing />} />
                  <Route path="/post-commercial" element={<PostCommercialListing />} />
                  <Route path="/edit/:id" element={<EditListing />} />
                  <Route path="/listing/:id" element={<ListingDetail />} />
                  <Route path="/commercial-listing/:id" element={<CommercialListingDetail />} />
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
                  <Route path="/boost/success" element={<BoostSuccessPage />} />
                  <Route path="/boost/:listingId" element={<BoostListingPage />} />
                  <Route path="/concierge" element={<Concierge />} />
                  <Route path="/concierge/success" element={<ConciergeSuccess />} />
                  <Route path="/:id" element={<StaticPage />} />
                  <Route
                    path="/auth"
                    element={
                      <PasswordRecoveryGate onSuccessPath="/">
                        <AuthForm />
                      </PasswordRecoveryGate>
                    }
                  />
                  <Route path="/404" element={<NotFound />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </Layout>
          }
        />
      </Routes>
    </Router>
    </ErrorBoundary>
  );
}

export default App;
