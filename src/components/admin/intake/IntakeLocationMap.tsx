import React, { useRef, useEffect, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import { MapPin, MapPinOff } from 'lucide-react';
import { MAPBOX_ACCESS_TOKEN } from '@/config/env';

interface IntakeLocationMapProps {
  latitude: number | null;
  longitude: number | null;
  geocodeStatus: string | null;
  /** Human label for the pin popup, e.g. "Ave J & E 12th St". */
  label?: string | null;
  /** Raw un-geocoded cross-street text to show when there are no coordinates. */
  fallbackText?: string | null;
  height?: number;
}

/**
 * Inline Mapbox map for the intake workspace — shows the geocoded pin and
 * re-centers live when the coordinates change (e.g. after a re-geocode),
 * without the modal wrapper the old pipeline map used.
 */
export function IntakeLocationMap({
  latitude,
  longitude,
  geocodeStatus,
  label,
  fallbackText,
  height = 220,
}: IntakeLocationMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const marker = useRef<mapboxgl.Marker | null>(null);
  const [loaded, setLoaded] = useState(false);

  const hasCoords =
    latitude != null && longitude != null && geocodeStatus !== 'failed';

  // Initialise the map once we have both a container and coordinates.
  useEffect(() => {
    if (!hasCoords || !container.current || !MAPBOX_ACCESS_TOKEN) return;
    if (map.current) return;

    mapboxgl.accessToken = MAPBOX_ACCESS_TOKEN;

    const instance = new mapboxgl.Map({
      container: container.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [longitude!, latitude!],
      zoom: 15,
      interactive: true,
      pitchWithRotate: false,
      dragRotate: false,
      attributionControl: false,
    });
    instance.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
    instance.on('load', () => setLoaded(true));

    const el = document.createElement('div');
    el.innerHTML = `
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M21 10C21 17 12 23 12 23C12 23 3 17 3 10C3 7.61305 3.94821 5.32387 5.63604 3.63604C7.32387 1.94821 9.61305 1 12 1C14.3869 1 16.6761 1.94821 18.364 3.63604C20.0518 5.32387 21 7.61305 21 10Z" fill="#273140" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="12" cy="10" r="3" fill="white"/>
      </svg>`;
    marker.current = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
      .setLngLat([longitude!, latitude!])
      .addTo(instance);

    map.current = instance;

    return () => {
      instance.remove();
      map.current = null;
      marker.current = null;
      setLoaded(false);
    };
    // Re-init only when the map first gains coordinates; live moves are handled below.
  }, [hasCoords]);

  // Re-center + move the marker when the coordinates change (e.g. re-geocode).
  useEffect(() => {
    if (!map.current || !marker.current || !hasCoords) return;
    marker.current.setLngLat([longitude!, latitude!]);
    map.current.flyTo({ center: [longitude!, latitude!], zoom: 15, duration: 600 });
  }, [latitude, longitude, hasCoords]);

  if (!hasCoords) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 bg-gray-50 text-center px-4"
        style={{ height }}
      >
        <MapPinOff className="w-6 h-6 text-gray-300" />
        <p className="text-sm font-medium text-gray-500">Not placed on the map yet</p>
        {fallbackText && (
          <p className="text-xs text-gray-400 font-mono max-w-xs truncate">{fallbackText}</p>
        )}
        <p className="text-xs text-gray-400">Add cross streets and re-geocode to place a pin.</p>
      </div>
    );
  }

  return (
    <div className="relative rounded-lg overflow-hidden border border-gray-200" style={{ height }}>
      <div ref={container} className="w-full h-full bg-gray-50" />
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
          <MapPin className="w-6 h-6 text-gray-300 animate-pulse" />
        </div>
      )}
      {label && (
        <div className="absolute bottom-2 left-2 right-2 flex items-center gap-1.5 bg-white/95 backdrop-blur rounded-md px-2.5 py-1.5 shadow-sm">
          <MapPin className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
          <span className="text-xs font-medium text-gray-700 truncate">{label}</span>
        </div>
      )}
    </div>
  );
}
