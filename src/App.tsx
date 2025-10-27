import React from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { Layout } from './components/shared/Layout';
import { Home } from './pages/Home';
import { BrowseListings } from './pages/BrowseListings';
import { AuthForm } from './components/auth/AuthForm';
import PasswordRecoveryGate from './components/auth/PasswordRecoveryGate';
import { PostListing } from './pages/PostListing';
import { EditListing } from './pages/EditListing';
import { ListingDetail } from './pages/ListingDetail';
import { Favorites } from './pages/Favorites';
import { AdminPanel } from './pages/AdminPanel';
import { Dashboard } from './pages/Dashboard';
import { AgencySettings } from './pages/AgencySettings';
import { AccountSettings } from './pages/AccountSettings';
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

function ShouldMountSmoke() {
  const isDev = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.PROD === false;
  const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const flagged = params?.get('ga_test') === '1';
  return (isDev || flagged) ? <GASmokeTest /> : null;
}

function App() {
  const { user } = useAuth();
  
  return (
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
                <Route path="/post" element={<PostListing />} />
                <Route path="/edit/:id" element={<EditListing />} />
                <Route path="/listing/:id" element={<ListingDetail />} />
                <Route path="/favorites" element={<Favorites />} />
                <Route path="/admin" element={<AdminPanel />} />
                <Route path="/admin/static-pages" element={<Navigate to="/admin?tab=static-pages" replace />} />
                <Route path="/admin/footer" element={<Navigate to="/admin?tab=footer" replace />} />
                <Route path="/admin/featured-settings" element={<Navigate to="/admin?tab=featured" replace />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/dashboard/agency-settings" element={<AgencySettings />} />
                <Route path="/account-settings" element={<AccountSettings />} />
                <Route path="/internal-analytics" element={<Navigate to="/admin?tab=analytics" replace />} />
                <Route path="/analytics" element={<Navigate to="/admin?tab=analytics" replace />} />
                <Route path="/static-pages" element={<Navigate to="/admin?tab=static-pages" replace />} />
                <Route path="/featured-settings" element={<Navigate to="/admin?tab=featured" replace />} />
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
  );
}

export default App;

