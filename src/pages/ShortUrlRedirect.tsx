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
        console.log('[ShortUrlRedirect] Looking up short code:', code);

        // Look up the short URL in the database
        const { data: shortUrl, error: lookupError } = await supabase
          .from('short_urls')
          .select('*')
          .eq('short_code', code)
          .maybeSingle();

        if (lookupError) {
          console.error('[ShortUrlRedirect] Error looking up short URL:', lookupError);
          navigate('/404');
          return;
        }

        if (!shortUrl) {
          console.error('[ShortUrlRedirect] Short URL not found:', code);
          navigate('/404');
          return;
        }

        console.log('[ShortUrlRedirect] Found short URL:', {
          code,
          originalUrl: shortUrl.original_url,
          listingId: shortUrl.listing_id,
          expiresAt: shortUrl.expires_at
        });

        // Check if expired
        if (shortUrl.expires_at && new Date(shortUrl.expires_at) < new Date()) {
          console.log('[ShortUrlRedirect] Short URL expired:', code);
          navigate('/', { replace: true });
          return;
        }

        // Increment click count in the background (don't wait for it)
        supabase.rpc('increment_short_url_clicks', { p_short_code: code }).catch((error) => {
          console.error('[ShortUrlRedirect] Error incrementing click count:', error);
        });

        // Track the click in analytics (in the background)
        const userAgent = navigator.userAgent;
        const referer = document.referrer;

        // Generate session and anon IDs (fallback for browsers without crypto.randomUUID)
        const generateUUID = () => {
          if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            return crypto.randomUUID();
          }
          // Fallback UUID generator
          return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
          });
        };

        supabase.from('analytics_events').insert({
          session_id: generateUUID(),
          anon_id: generateUUID(),
          user_id: null,
          event_name: 'digest_link_click',
          event_props: {
            short_code: code,
            listing_id: shortUrl.listing_id,
            source: shortUrl.source,
            referer: referer || null,
          },
          occurred_at: new Date().toISOString(),
          ua: userAgent,
          ip_hash: null,
        }).catch((error) => {
          console.error('[ShortUrlRedirect] Error tracking click in analytics:', error);
        });

        // Extract the listing ID from the original URL to navigate within the app
        // Expected format: https://hadirot.com/listing/{id}
        const urlMatch = shortUrl.original_url.match(/\/listing\/([a-f0-9-]+)/i);

        if (urlMatch && urlMatch[1]) {
          console.log('[ShortUrlRedirect] Navigating to listing:', urlMatch[1]);
          // Navigate to the listing page using React Router (faster, no page reload)
          navigate(`/listing/${urlMatch[1]}`, { replace: true });
        } else {
          console.log('[ShortUrlRedirect] URL pattern did not match, using full redirect to:', shortUrl.original_url);
          // Fallback: use the original URL if pattern doesn't match
          window.location.href = shortUrl.original_url;
        }
      } catch (error) {
        console.error('[ShortUrlRedirect] Error handling short URL redirect:', error);
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
