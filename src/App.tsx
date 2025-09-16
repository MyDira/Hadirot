import React from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
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
import { StaticPageEditor } from './pages/admin/StaticPageEditor';
import { FooterEditor } from './pages/admin/FooterEditor';
import { FeaturedSettingsAdmin } from './pages/admin/FeaturedSettingsAdmin';
import { AccountSettings } from './pages/AccountSettings';
import { InternalAnalytics } from './pages/InternalAnalytics';
import { About } from './pages/About';
import { Contact } from './pages/Contact';
import { Privacy } from './pages/Privacy';
import { Terms } from './pages/Terms';
import { StaticPage } from './pages/StaticPage';
import { NotFound } from './pages/NotFound';
import { AgencyPage } from './pages/AgencyPage';
import { useAuth } from '@/hooks/useAuth';
import GASmokeTest from '@/dev/gaSmokeTest';

function ScrollToTop() {
  const location = useLocation();
  
  React.useEffect(() => {
    window.scrollTo(0, 0);
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
                <Route path="/admin/static-pages" element={<StaticPageEditor />} />
                <Route path="/admin/footer" element={<FooterEditor />} />
                <Route path="/admin/featured-settings" element={<FeaturedSettingsAdmin />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/account-settings" element={<AccountSettings />} />
               <Route path="/internal-analytics" element={<InternalAnalytics />} />
                <Route path="/internal-analytics" element={<InternalAnalytics />} />
                <Route path="/about" element={<About />} />
                <Route path="/contact" element={<Contact />} />
                <Route path="/privacy" element={<Privacy />} />
                <Route path="/terms" element={<Terms />} />
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

