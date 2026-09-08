/**
 * GOOGLE MAPS FRONTEND INTEGRATION - ESSENTIAL GUIDE
 *
 * USAGE FROM PARENT COMPONENT:
 * ======
 *
 * const mapRef = useRef<google.maps.Map | null>(null);
 *
 * <MapView
 *   initialCenter={{ lat: 40.7128, lng: -74.0060 }}
 *   initialZoom={15}
 *   onMapReady={(map) => {
 *     mapRef.current = map; // Store to control map from parent anytime, google map itself is in charge of the re-rendering, not react state.
 * </MapView>
 *
 * ======
 * Available Libraries and Core Features:
 * -------------------------------
 * 📍 MARKER (from `marker` library)
 * - Attaches to map using { map, position }
 * new google.maps.marker.AdvancedMarkerElement({
 *   map,
 *   position: { lat: 37.7749, lng: -122.4194 },
 *   title: "San Francisco",
 * });
 *
 * -------------------------------
 * 🏢 PLACES (from `places` library)
 * - Does not attach directly to map; use data with your map manually.
 * const place = new google.maps.places.Place({ id: PLACE_ID });
 * await place.fetchFields({ fields: ["displayName", "location"] });
 * map.setCenter(place.location);
 * new google.maps.marker.AdvancedMarkerElement({ map, position: place.location });
 *
 * -------------------------------
 * 🧭 GEOCODER (from `geocoding` library)
 * - Standalone service; manually apply results to map.
 * const geocoder = new google.maps.Geocoder();
 * geocoder.geocode({ address: "New York" }, (results, status) => {
 *   if (status === "OK" && results[0]) {
 *     map.setCenter(results[0].geometry.location);
 *     new google.maps.marker.AdvancedMarkerElement({
 *       map,
 *       position: results[0].geometry.location,
 *     });
 *   }
 * });
 *
 * -------------------------------
 * 📐 GEOMETRY (from `geometry` library)
 * - Pure utility functions; not attached to map.
 * const dist = google.maps.geometry.spherical.computeDistanceBetween(p1, p2);
 *
 * -------------------------------
 * 🛣️ ROUTES (from `routes` library)
 * - Combines DirectionsService (standalone) + DirectionsRenderer (map-attached)
 * const directionsService = new google.maps.DirectionsService();
 * const directionsRenderer = new google.maps.DirectionsRenderer({ map });
 * directionsService.route(
 *   { origin, destination, travelMode: "DRIVING" },
 *   (res, status) => status === "OK" && directionsRenderer.setDirections(res)
 * );
 *
 * -------------------------------
 * 🌦️ MAP LAYERS (attach directly to map)
 * - new google.maps.TrafficLayer().setMap(map);
 * - new google.maps.TransitLayer().setMap(map);
 * - new google.maps.BicyclingLayer().setMap(map);
 *
 * -------------------------------
 * ✅ SUMMARY
 * - “map-attached” → AdvancedMarkerElement, DirectionsRenderer, Layers.
 * - “standalone” → Geocoder, DirectionsService, DistanceMatrixService, ElevationService.
 * - “data-only” → Place, Geometry utilities.
 */

/// <reference types="@types/google.maps" />

import { useEffect, useRef, useState } from "react";
import { usePersistFn } from "@/hooks/usePersistFn";
import { cn } from "@/lib/utils";

declare global {
  interface Window {
    google?: typeof google;
  }
}

// Preferred: your own Google Cloud key (Maps JavaScript API + Places API +
// Geocoding API). Resolution order: runtime /api/maps-config (no rebuild on
// rotation) → baked VITE_GOOGLE_MAPS_API_KEY → legacy Forge proxy pair
// (managed-platform only — unset on self-hosted VPS).
const BAKED_GOOGLE_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
const FORGE_KEY = import.meta.env.VITE_FRONTEND_FORGE_API_KEY as string | undefined;
const FORGE_BASE_URL =
  import.meta.env.VITE_FRONTEND_FORGE_API_URL ||
  "https://forge.butterfly-effect.dev";

let runtimeKey: string | null | undefined;
async function runtimeGoogleKey(): Promise<string | null> {
  if (runtimeKey !== undefined) return runtimeKey;
  try {
    const res = await fetch("/api/maps-config", { headers: { Accept: "application/json" } });
    if (!res.ok) {
      runtimeKey = null;
      return null;
    }
    const data = (await res.json()) as { key?: unknown };
    runtimeKey = typeof data.key === "string" && data.key.trim() ? data.key.trim() : null;
  } catch {
    runtimeKey = null;
  }
  return runtimeKey;
}

async function mapsScriptUrl(): Promise<string> {
  const live = await runtimeGoogleKey();
  const googleKey = live
    ?? (BAKED_GOOGLE_KEY && BAKED_GOOGLE_KEY !== "undefined" && BAKED_GOOGLE_KEY.trim() ? BAKED_GOOGLE_KEY.trim() : null);
  if (googleKey) {
    return `https://maps.googleapis.com/maps/api/js?key=${googleKey}&v=weekly&libraries=marker,places,geocoding,geometry`;
  }
  if (FORGE_KEY && FORGE_KEY !== "undefined" && FORGE_KEY.trim()) {
    return `${FORGE_BASE_URL}/v1/maps/proxy/maps/api/js?key=${FORGE_KEY.trim()}&v=weekly&libraries=marker,places,geocoding,geometry`;
  }
  throw new Error("MAPS_KEY_MISSING");
}

/** Warm up the Maps script (drawer open, first search keystroke). Resolves
 * true when google.maps is ready, false otherwise — never throws. */
export async function preloadMaps(): Promise<boolean> {
  try {
    await loadMapScript();
    return Boolean(window.google?.maps);
  } catch {
    return false;
  }
}

const LOAD_TIMEOUT_MS = 25000;

function loadMapScript(): Promise<void> {
  // Already loaded (drawer remounts, StrictMode, retries).
  if (window.google?.maps) return Promise.resolve();
  const existing = document.querySelector<HTMLScriptElement>('script[data-maps-loader="1"]');
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("MAPS_SCRIPT_ERROR")), { once: true });
    });
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      document.querySelector<HTMLScriptElement>('script[data-maps-loader="1"]')?.remove();
      reject(new Error("MAPS_SCRIPT_TIMEOUT"));
    }, LOAD_TIMEOUT_MS);
    mapsScriptUrl().then((src) => {
      const script = document.createElement("script");
      script.dataset.mapsLoader = "1";
      script.src = src;
      script.async = true;
      // NOTE: no crossOrigin attribute — Google's documented embed has none,
      // and anonymous CORS on a CDN without ACAO headers blocks execution.
      script.onload = () => {
        clearTimeout(timer);
        resolve();
      };
      script.onerror = () => {
        clearTimeout(timer);
        console.error("Failed to load Google Maps script");
        script.remove();
        reject(new Error("MAPS_SCRIPT_ERROR"));
      };
      document.head.appendChild(script);
    }, (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

interface MapViewProps {
  className?: string;
  initialCenter?: google.maps.LatLngLiteral;
  initialZoom?: number;
  onMapReady?: (map: google.maps.Map) => void;
  onLoadError?: (message: string) => void;
}

export function MapView({
  className,
  initialCenter = { lat: 37.7749, lng: -122.4194 },
  initialZoom = 12,
  onMapReady,
  onLoadError,
}: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const init = usePersistFn(async () => {
    try {
      await loadMapScript();
    } catch (err) {
      const missing = err instanceof Error && err.message === "MAPS_KEY_MISSING";
      const message = missing
        ? "Map configuration missing — the restaurant needs to add a Google Maps key."
        : "Could not load the map. Check your connection (or ad-blocker) and retry.";
      setLoadError(message);
      onLoadError?.(message);
      return;
    }
    if (!mapContainer.current) {
      console.error("Map container not found");
      return;
    }
    if (!window.google?.maps) {
      const message = "Could not load the map. Check your connection (or ad-blocker) and retry.";
      setLoadError(message);
      onLoadError?.(message);
      return;
    }
    map.current = new window.google.maps.Map(mapContainer.current, {
      zoom: initialZoom,
      center: initialCenter,
      // NOTE: never set mapId to "DEMO_MAP_ID" — Google's demo map ID is
      // roadmap-only and silently disables satellite tiles. No mapId means
      // the default raster map with full Map + Satellite type support.
      mapTypeControl: true,
      mapTypeControlOptions: {
        style: window.google.maps.MapTypeControlStyle.HORIZONTAL_BAR,
        position: window.google.maps.ControlPosition.TOP_RIGHT,
      },
      fullscreenControl: true,
      zoomControl: true,
      streetViewControl: false,
    });
    if (onMapReady) {
      onMapReady(map.current);
    }
  });

  useEffect(() => {
    init();
  }, [init]);

  if (loadError) {
    return (
      <div role="alert" className={cn("grid w-full place-items-center bg-[#f6ecdf] p-6 text-center", className)}>
        <p className="max-w-xs text-sm font-bold leading-relaxed text-[#9C4A07]">{loadError}</p>
      </div>
    );
  }

  return (
    <div ref={mapContainer} className={cn("w-full h-[500px]", className)} />
  );
}
