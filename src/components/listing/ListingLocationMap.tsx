import React, { useRef, useEffect, useState } from "react";
import mapboxgl from "mapbox-gl";
import { MapPin } from "lucide-react";
import { MAPBOX_ACCESS_TOKEN } from "@/config/env";

interface ListingLocationMapProps {
  latitude: number;
  longitude: number;
  className?: string;
}

export function ListingLocationMap({
  latitude,
  longitude,
  className = "",
}: ListingLocationMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (!mapContainer.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            observer.disconnect();
          }
        });
      },
      {
        rootMargin: "100px",
      }
    );

    observer.observe(mapContainer.current);

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!isVisible || !mapContainer.current || !MAPBOX_ACCESS_TOKEN || map.current) {
      return;
    }

    mapboxgl.accessToken = MAPBOX_ACCESS_TOKEN;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/light-v11",
      center: [longitude, latitude],
      zoom: 15,
      interactive: true,
      preserveDrawingBuffer: false,
      pitchWithRotate: false,
      dragRotate: false,
    });

    map.current.addControl(
      new mapboxgl.NavigationControl({
        showCompass: false,
      }),
      "top-right"
    );

    const markerElement = document.createElement("div");
    markerElement.className = "custom-marker";
    markerElement.innerHTML = `
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M21 10C21 17 12 23 12 23C12 23 3 17 3 10C3 7.61305 3.94821 5.32387 5.63604 3.63604C7.32387 1.94821 9.61305 1 12 1C14.3869 1 16.6761 1.94821 18.364 3.63604C20.0518 5.32387 21 7.61305 21 10Z" fill="#273140" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="12" cy="10" r="3" fill="white"/>
      </svg>
    `;

    new mapboxgl.Marker({ element: markerElement, anchor: "bottom" })
      .setLngLat([longitude, latitude])
      .addTo(map.current);

    map.current.on("load", () => {
      setIsLoaded(true);
    });

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, [isVisible, latitude, longitude]);

  return (
    <div
      ref={mapContainer}
      className={`w-full rounded-lg border border-gray-200 overflow-hidden bg-gray-50 ${className}`}
      style={{
        minHeight: "inherit",
      }}
    >
      {!isLoaded && isVisible && (
        <div className="w-full h-full flex items-center justify-center">
          <MapPin className="w-8 h-8 text-gray-300 animate-pulse" />
        </div>
      )}
    </div>
  );
}
