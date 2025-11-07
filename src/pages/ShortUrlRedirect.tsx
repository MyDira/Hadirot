import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/config/supabase';

export function ShortUrlRedirect() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    async function handleRedirect() {
      if (!code) {
        navigate('/404');
        return;
      }

      try {
        // Call the redirect Edge Function
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/redirect-short-url/${code}`,
          {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
            redirect: 'manual', // Don't follow redirects automatically
          }
        );

        // Get the redirect location from the response headers
        const location = response.headers.get('Location');

        if (location) {
          // Navigate to the destination URL
          window.location.href = location;
        } else {
          // If no redirect location, check response
          if (response.status === 404) {
            navigate('/404');
          } else if (response.status === 410) {
            // Expired link
            navigate('/', { replace: true });
          } else {
            navigate('/404');
          }
        }
      } catch (error) {
        console.error('Error handling short URL redirect:', error);
        navigate('/404');
      }
    }

    handleRedirect();
  }, [code, navigate]);

  // Show loading state while redirecting
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Redirecting...</p>
      </div>
    </div>
  );
}
