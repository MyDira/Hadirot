import React, { useRef, useEffect, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import { X, MapPin, AlertTriangle } from 'lucide-react';
import { MAPBOX_ACCESS_TOKEN } from '@/config/env';
import type { Listing } from '@/config/supabase';

interface AdminListingMapModalProps {
  listing: Listing | null;
  onClose: () => void;
}

function getLocationText(listing: Listing): string {
  const isSale = listing.listing_type === 'sale';
  if (isSale) {
    return listing.full_address || listing.location || '';
  }
  return listing.cross_streets ?? listing.location ?? '';
}

export function AdminListingMapModal({ listing, onClose }: AdminListingMapModalProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  const hasCoords = listing && listing.latitude != null && listing.longitude != null;

  useEffect(() => {
    if (!listing || !hasCoords || !mapContainer.current || !MAPBOX_ACCESS_TOKEN) return;

    mapboxgl.accessToken = MAPBOX_ACCESS_TOKEN;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [listing.longitude!, listing.latitude!],
      zoom: 15,
      interactive: true,
      pitchWithRotate: false,
      dragRotate: false,
    });

    map.current.addControl(
      new mapboxgl.NavigationControl({ showCompass: false }),
      'top-right',
    );

    const markerEl = document.createElement('div');
    markerEl.innerHTML = `
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M21 10C21 17 12 23 12 23C12 23 3 17 3 10C3 7.61305 3.94821 5.32387 5.63604 3.63604C7.32387 1.94821 9.61305 1 12 1C14.3869 1 16.6761 1.94821 18.364 3.63604C20.0518 5.32387 21 7.61305 21 10Z" fill="#273140" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="12" cy="10" r="3" fill="white"/>
      </svg>
    `;

    const locationText = getLocationText(listing);
    const popupHtml = `
      <div style="font-family: system-ui, sans-serif; max-width: 220px;">
        <p style="font-weight: 600; margin: 0 0 4px;">${listing.title || locationText || 'Listing'}</p>
        ${locationText ? `<p style="font-size: 13px; color: #555; margin: 0 0 4px;">${locationText}</p>` : ''}
        ${listing.neighborhood ? `<p style="font-size: 12px; color: #888; margin: 0;">${listing.neighborhood}</p>` : ''}
      </div>
    `;

    new mapboxgl.Marker({ element: markerEl, anchor: 'bottom' })
      .setLngLat([listing.longitude!, listing.latitude!])
      .setPopup(new mapboxgl.Popup({ offset: 25 }).setHTML(popupHtml))
      .addTo(map.current)
      .togglePopup();

    map.current.on('load', () => setIsLoaded(true));

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
      setIsLoaded(false);
    };
  }, [listing, hasCoords]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (listing) document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [listing, onClose]);

  if (!listing) return null;

  const locationText = getLocationText(listing);
  const headerText = locationText
    ? `${locationText}${listing.neighborhood ? ` · ${listing.neighborhood}` : ''}`
    : listing.neighborhood || 'Location';

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={onClose} />

        <div className="relative z-10 w-full max-w-2xl bg-white rounded-lg shadow-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
            <div className="min-w-0 flex-1 mr-4">
              <h3 className="text-base font-semibold text-gray-900 truncate">{listing.title}</h3>
              <p className="text-sm text-gray-500 truncate mt-0.5">{headerText}</p>
            </div>
            <button onClick={onClose} className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          {hasCoords ? (
            <div ref={mapContainer} className="w-full bg-gray-50" style={{ height: 400 }}>
              {!isLoaded && (
                <div className="w-full h-full flex items-center justify-center">
                  <MapPin className="w-8 h-8 text-gray-300 animate-pulse" />
                </div>
              )}
            </div>
          ) : (
            <div className="p-8 text-center">
              <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto mb-3" />
              <p className="text-gray-700 font-medium mb-2">No coordinates available for this listing</p>
              {locationText && (
                <p className="text-sm text-gray-500 font-mono bg-gray-50 rounded p-3 mt-2">
                  {locationText}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
