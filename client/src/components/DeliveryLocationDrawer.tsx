/**
 * DeliveryLocationDrawer — GPS, interactive map pin, and address form for checkout.
 * Three methods: Use Current Location, Search Address, Place Pin on Map.
 * Uses Google Maps via existing Forge proxy. Fixed-center pin approach.
 */
/// <reference types="@types/google.maps" />

import { useState, useCallback, useRef, useEffect, Suspense, lazy } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MapPin, Navigation, Search, AlertTriangle, Loader2, Check, Crosshair } from "lucide-react";
// Lazy: the Google Maps bundle only downloads when the pin step renders,
// keeping the initial storefront JS small on 2G / low-end phones.
const MapView = lazy(() => import("@/components/Map").then((m) => ({ default: m.MapView })));
import {
  searchPlaces,
  getPlaceDetails,
  reverseGeocode,
  type PlaceSearchResult,
} from "@/lib/geocodingProvider";

// =============================================================================
// Types
// =============================================================================

export type DeliveryLocation = {
  flatHouse: string;
  building?: string;
  street?: string;
  landmark?: string;
  area: string;
  city: string;
  postalCode: string;
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
  deviceAccuracyMeters?: number;
  locationSource: "device_gps" | "map_pin" | "place_search" | "saved_address";
  placeId?: string;
  confirmedAt?: string;
  confirmed: true;
};

type GeoStep = "choose_method" | "loading" | "map_confirm" | "address_form" | "confirmed";

type GeoLocationState = {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
  deviceAccuracyMeters?: number;
  source: "device_gps" | "map_pin" | "place_search";
  placeId?: string;
  area?: string;
  city?: string;
  postalCode?: string;
  street?: string;
  mapInteracted?: boolean;
};

type AccuracyLevel = "HIGH" | "GOOD" | "LOW" | "POOR" | "UNKNOWN";

function classifyAccuracy(meters: number | null | undefined): AccuracyLevel {
  if (meters == null || meters <= 0) return "UNKNOWN";
  if (meters <= 20) return "HIGH";
  if (meters <= 50) return "GOOD";
  if (meters <= 100) return "LOW";
  return "POOR";
}

function requiresMapConfirmation(level: AccuracyLevel): boolean {
  return level === "LOW" || level === "POOR" || level === "UNKNOWN";
}

// Default map center: center of India (used only until GPS or search provides real coordinates)
const DEFAULT_MAP_CENTER = { lat: 20.5937, lng: 78.9629 };

// =============================================================================
// Component
// =============================================================================

export default function DeliveryLocationDrawer({
  open,
  onOpenChange,
  onConfirm,
  existingLocation,
  initialCenter,
  cityBias,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (location: DeliveryLocation) => void;
  existingLocation?: DeliveryLocation | null;
  /** Bias the initial map pin (outlet coordinates when known). */
  initialCenter?: { lat: number; lng: number } | null;
  /** Bias place search toward the outlet city. */
  cityBias?: string | null;
}) {
  const [step, setStep] = useState<GeoStep>(
    existingLocation?.confirmed ? "confirmed" : "choose_method"
  );
  const [geoState, setGeoState] = useState<GeoLocationState | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  // Conditional Back: only offer Back when the user actually visited a prior step.
  const [visitedChoice, setVisitedChoice] = useState(step === "choose_method");
  const [cameViaMap, setCameViaMap] = useState(false);

  // Last confirmed pin (this device) — used to bias the initial map position.
  const [lastPin] = useState<{ lat: number; lng: number } | null>(() => {
    try {
      const raw = localStorage.getItem("ck_last_pin");
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { lat?: unknown; lng?: unknown };
      if (typeof parsed.lat === "number" && typeof parsed.lng === "number") {
        return { lat: parsed.lat, lng: parsed.lng };
      }
      return null;
    } catch {
      return null;
    }
  });
  const biasedCenter = initialCenter ?? lastPin ?? DEFAULT_MAP_CENTER;

  // Address form — re-synced whenever the drawer opens so edits always
  // start from the latest confirmed location (the drawer stays mounted).
  const [flatHouse, setFlatHouse] = useState(existingLocation?.flatHouse ?? "");
  const [building, setBuilding] = useState(existingLocation?.building ?? "");
  const [street, setStreet] = useState(existingLocation?.street ?? "");
  const [landmark, setLandmark] = useState(existingLocation?.landmark ?? "");
  const [area, setArea] = useState(existingLocation?.area ?? "");
  const [city, setCity] = useState(existingLocation?.city ?? "");
  const [postalCode, setPostalCode] = useState(existingLocation?.postalCode ?? "");
  useEffect(() => {
    if (!open) return;
    setFlatHouse(existingLocation?.flatHouse ?? "");
    setBuilding(existingLocation?.building ?? "");
    setStreet(existingLocation?.street ?? "");
    setLandmark(existingLocation?.landmark ?? "");
    setArea(existingLocation?.area ?? "");
    setCity(existingLocation?.city ?? "");
    setPostalCode(existingLocation?.postalCode ?? "");
  }, [open, existingLocation]);

  // Map state
  const mapRef = useRef<google.maps.Map | null>(null);
  const idleListenerRef = useRef<google.maps.MapsEventListener | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PlaceSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
  }, []);

  const reset = useCallback(() => {
    setStep("choose_method");
    setGeoState(null);
    setGpsError(null);
    setGeoError(null);
    setVisitedChoice(true);
    setCameViaMap(false);
    setSearchQuery("");
    setSearchResults([]);
    if (!existingLocation) {
      setFlatHouse("");
      setBuilding("");
      setStreet("");
      setLandmark("");
      setArea("");
      setCity("");
      setPostalCode("");
    }
  }, [existingLocation]);

  const handleOpenChange = useCallback((open: boolean) => {
    if (!open) reset();
    onOpenChange(open);
  }, [onOpenChange, reset]);

  // --- Method A: Use Current Location ---
  const useCurrentLocation = useCallback(() => {
    setStep("loading");
    setGpsError(null);
    setGeoError(null);
    setVisitedChoice(true);

    if (!navigator.geolocation) {
      setGpsError("Geolocation is not supported by your browser. Please search or place a pin instead.");
      setStep("choose_method");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        const level = classifyAccuracy(accuracy);

        setGeoState({
          latitude,
          longitude,
          accuracyMeters: accuracy,
          deviceAccuracyMeters: accuracy,
          source: "device_gps",
        });

        if (requiresMapConfirmation(level)) {
          setCameViaMap(true);
          setStep("map_confirm");
        } else {
          setCameViaMap(false);
          setStep("address_form");
        }

        reverseGeocode(latitude, longitude).then((result) => {
          if (result.area) setArea(result.area);
          if (result.city) setCity(result.city);
          if (result.postalCode) setPostalCode(result.postalCode);
          if (result.street) setStreet(result.street);
          if (!result.area && !result.city && !result.postalCode) {
            setGeoError("We found your coordinates but couldn't identify the area. Please fill the address fields manually.");
          }
        }).catch(() => {
          setGeoError("Address lookup failed. Please fill the address fields manually.");
        });
      },
      (error) => {
        let msg = "Unable to get your location.";
        if (error.code === 1) msg = "Location permission denied. Please search or place a pin on the map.";
        else if (error.code === 2) msg = "Location unavailable. Please search or place a pin on the map.";
        else if (error.code === 3) msg = "Location request timed out. Please try again or place a pin.";
        setGpsError(msg);
        setStep("choose_method");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  }, []);

  // --- Method B: Search Address (Google Places Autocomplete) ---
  const runSearchNow = useCallback(async (raw?: string) => {
    const value = (raw ?? searchQuery).trim();
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (value.length < 3) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    setGeoError(null);
    try {
      // Ignore placeholder outlet cities ("To be configured") — biasing with
      // them poisons the query and returns zero results.
      const biased = cityBias && cityBias !== "To be configured" ? `${value}, ${cityBias}` : value;
      const results = await searchPlaces(biased);
      setSearchResults(results);
      if (results.length === 0) {
        setGeoError("No places found for that search. Try a nearby landmark or place the pin on the map.");
      }
    } catch {
      setGeoError("Place search failed. Check your connection or place the pin on the map instead.");
    } finally {
      setSearching(false);
    }
  }, [searchQuery, cityBias]);

  const handleSearchInput = useCallback((value: string) => {
    setSearchQuery(value);
    setGeoError(null);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!value.trim() || value.length < 3) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    searchTimerRef.current = setTimeout(() => {
      void runSearchNow(value);
    }, 300);
  }, [runSearchNow]);

  const handlePlaceSelect = useCallback(async (placeId: string, description: string) => {
    setSearchQuery(description);
    setSearchResults([]);
    setSearching(true);
    setGeoError(null);

    let details: Awaited<ReturnType<typeof getPlaceDetails>>;
    try {
      details = await getPlaceDetails(placeId);
    } catch {
      details = null;
    }
    setSearching(false);

    if (details) {
      setGeoState({
        latitude: details.latitude,
        longitude: details.longitude,
        source: "place_search",
        placeId,
        area: details.area,
        city: details.city,
        postalCode: details.postalCode,
        street: details.street,
      });
      if (details.area) setArea(details.area);
      if (details.city) setCity(details.city);
      if (details.postalCode) setPostalCode(details.postalCode);
      if (details.street) setStreet(details.street);
      setCameViaMap(true);
      setStep("map_confirm");
    } else {
      setGeoError("Couldn't load that place's location. Pick another result or place the pin on the map.");
    }
  }, []);

  // --- Map ready handler ---
  const handleMapReady = useCallback((map: google.maps.Map) => {
    mapRef.current = map;

    if (idleListenerRef.current) {
      idleListenerRef.current.remove();
    }

    idleListenerRef.current = map.addListener("idle", () => {
      const center = map.getCenter();
      if (!center) return;

      setGeoState((prev) => {
        if (!prev) return prev;
        const newLat = center.lat();
        const newLng = center.lng();
        if (Math.abs(newLat - prev.latitude) < 0.000001 && Math.abs(newLng - prev.longitude) < 0.000001) {
          return prev;
        }
        return {
          ...prev,
          latitude: newLat,
          longitude: newLng,
          source: prev.source === "device_gps" ? "map_pin" : prev.source,
          mapInteracted: true,
        };
      });
    });
  }, []);

  // Center map when geoState changes and we're on map_confirm step.
  // Skip re-centering when the map is already there: idle-drag updates echo
  // the map center back into geoState, and re-centering would fight the user
  // (plus force-zoom them back to 16 after every pinch-zoom).
  useEffect(() => {
    if (step !== "map_confirm" || !geoState || !mapRef.current) return;
    const center = mapRef.current.getCenter();
    if (center) {
      const dLat = Math.abs(center.lat() - geoState.latitude);
      const dLng = Math.abs(center.lng() - geoState.longitude);
      if (dLat < 0.00005 && dLng < 0.00005) return;
    }
    mapRef.current.setCenter({ lat: geoState.latitude, lng: geoState.longitude });
    mapRef.current.setZoom(16);
  }, [step, geoState?.latitude, geoState?.longitude]);

  // Reverse geocode when map settles (debounced)
  useEffect(() => {
    if (step !== "map_confirm" || !geoState?.mapInteracted) return;
    const timer = setTimeout(() => {
      reverseGeocode(geoState.latitude, geoState.longitude).then((result) => {
        if (result.area) setArea(result.area);
        if (result.city) setCity(result.city);
        if (result.postalCode) setPostalCode(result.postalCode);
        if (result.street) setStreet(result.street);
      });
    }, 1000);
    return () => clearTimeout(timer);
  }, [step, geoState?.latitude, geoState?.longitude, geoState?.mapInteracted]);

  // Cleanup idle listener
  useEffect(() => {
    return () => {
      if (idleListenerRef.current) {
        idleListenerRef.current.remove();
      }
    };
  }, []);

  // --- Confirm address form ---
  const confirmAddress = useCallback(() => {
    if (!flatHouse.trim() || !area.trim() || !city.trim() || !/^\d{6}$/.test(postalCode)) return;
    if (!geoState) return;

    const location: DeliveryLocation = {
      flatHouse: flatHouse.trim(),
      building: building.trim() || undefined,
      street: street.trim() || undefined,
      landmark: landmark.trim() || undefined,
      area: area.trim(),
      city: city.trim(),
      postalCode: postalCode.trim(),
      latitude: geoState.latitude,
      longitude: geoState.longitude,
      accuracyMeters: geoState.accuracyMeters,
      deviceAccuracyMeters: geoState.deviceAccuracyMeters,
      locationSource: geoState.source,
      placeId: geoState.placeId,
      confirmedAt: new Date().toISOString(),
      confirmed: true,
    };
    try {
      localStorage.setItem("ck_last_pin", JSON.stringify({ lat: location.latitude, lng: location.longitude }));
    } catch {
      // storage unavailable — location still confirms for this session
    }
    onConfirm(location);
    onOpenChange(false);
  }, [flatHouse, building, street, landmark, area, city, postalCode, geoState, onConfirm, onOpenChange]);

  const formValid = Boolean(flatHouse.trim() && area.trim() && city.trim() && /^\d{6}$/.test(postalCode) && geoState);

  const accuracyLevel = geoState ? classifyAccuracy(geoState.deviceAccuracyMeters ?? geoState.accuracyMeters) : null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md rounded-[1.5rem] border-[#D8DFC0] bg-[#fffaf3] p-0 max-h-[90vh] overflow-y-auto">
        <div className="paper-grain rounded-t-[1.5rem] border-b border-[#D8DFC0] p-6">
          <DialogHeader>
            <DialogTitle className="font-display text-3xl text-[#2A3A0C]">
              Delivery Location
            </DialogTitle>
            <DialogDescription className="text-[#5F6B3C]">
              {step === "confirmed" && existingLocation
                ? "Your delivery location is confirmed."
                : "Choose how to set your delivery location."}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="space-y-4 p-6">
          {/* Step: Choose Method */}
          {step === "choose_method" && (
            <>
              {gpsError && (
                <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
                  <AlertTriangle className="mr-1 inline h-4 w-4" />
                  {gpsError}
                </div>
              )}
              {geoError && (
                <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
                  <AlertTriangle className="mr-1 inline h-4 w-4" />
                  {geoError}
                </div>
              )}

              <Button
                onClick={useCurrentLocation}
                className="h-12 w-full rounded-xl bg-[#B95509] font-bold text-white hover:bg-[#9C4A07]"
              >
                <Navigation className="mr-2 h-4 w-4" />
                Use My Current Location
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-[#e7d2c0]" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-[#fffaf3] px-2 text-[#5F6B3C]">or</span>
                </div>
              </div>

              <div className="relative">
                <div className="flex gap-2">
                  <Input
                    placeholder="Search address..."
                    aria-label="Search delivery address"
                    value={searchQuery}
                    onChange={(e) => handleSearchInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void runSearchNow();
                      }
                    }}
                    className="h-12 rounded-xl border-[#D8DFC0] bg-white text-[#2A3A0C]"
                  />
                  <Button
                    variant="outline"
                    aria-label="Search places"
                    onClick={() => void runSearchNow()}
                    className="h-12 rounded-xl border-[#D8DFC0] bg-white font-bold text-[#2A3A0C]"
                    disabled={!searchQuery.trim() || searching}
                  >
                    {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  </Button>
                </div>

                {searchResults.length > 0 && (
                  <div className="absolute left-0 right-0 top-14 z-50 max-h-48 overflow-y-auto rounded-xl border border-[#D8DFC0] bg-white shadow-lg">
                    {searchResults.map((result) => (
                      <button
                        key={result.placeId}
                        type="button"
                        onClick={() => handlePlaceSelect(result.placeId, result.description)}
                        className="w-full px-4 py-3 text-left text-sm text-[#2A3A0C] hover:bg-[#E9EFD6]"
                      >
                        <MapPin className="mr-2 inline h-3 w-3 text-[#B95509]" />
                        {result.description}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <Button
                onClick={() => {
                  setGeoState({
                    latitude: biasedCenter.lat,
                    longitude: biasedCenter.lng,
                    source: "map_pin",
                  });
                  setVisitedChoice(true);
                  setCameViaMap(true);
                  setStep("map_confirm");
                  // Autofill empty fields for a fresh pin — never overwrite
                  // what the user already typed or confirmed.
                  reverseGeocode(biasedCenter.lat, biasedCenter.lng).then((result) => {
                    if (result.area) setArea((prev) => prev || result.area || prev);
                    if (result.city) setCity((prev) => prev || result.city || prev);
                    if (result.postalCode) setPostalCode((prev) => prev || result.postalCode || prev);
                    if (result.street) setStreet((prev) => prev || result.street || prev);
                  }).catch(() => {
                    // Offline / lookup failed — the user fills the form manually.
                  });
                }}
                variant="outline"
                className="h-11 w-full rounded-xl border-[#D8DFC0] bg-white font-bold text-[#2A3A0C]"
              >
                <MapPin className="mr-2 h-4 w-4" />
                Place Pin on Map
              </Button>
            </>
          )}

          {/* Step: Loading */}
          {step === "loading" && (
            <div className="flex flex-col items-center gap-4 py-8">
              <Loader2 className="h-8 w-8 animate-spin text-[#B95509]" />
              <p className="text-sm text-[#5F6B3C]">Getting your location...</p>
            </div>
          )}

          {/* Step: Map Confirm — real interactive map with fixed-center pin */}
          {step === "map_confirm" && (
            <>
              <div className="rounded-xl border border-[#D8DFC0] bg-[#E9EFD6] p-4">
                <p className="text-sm font-semibold text-[#2A3A0C]">
                  <Crosshair className="mr-1 inline h-4 w-4 text-[#B95509]" />
                  Confirm your delivery pin
                </p>
                <p className="mt-1 text-xs text-[#885e43]">
                  Move the map so the pin points to your exact delivery location.
                </p>
              </div>

              {(accuracyLevel === "POOR" || accuracyLevel === "UNKNOWN") && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
                  <AlertTriangle className="mr-1 inline h-3 w-3" />
                  GPS location may be inaccurate. Move the map to your exact entrance.
                </div>
              )}

              {accuracyLevel === "LOW" && (
                <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-3 text-xs text-yellow-700">
                  <AlertTriangle className="mr-1 inline h-3 w-3" />
                  GPS accuracy is moderate. Please verify the pin position on the map.
                </div>
              )}

              {/* Interactive Map with fixed-center pin */}
              <div className="relative overflow-hidden rounded-xl border border-[#D8DFC0]">
                <Suspense
                  fallback={
                    <div className="grid h-[300px] place-items-center bg-[#f6ecdf] text-sm font-bold text-[#5F6B3C]">
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-5 w-5 animate-spin text-[#B95509]" aria-hidden="true" />
                        Loading the map…
                      </span>
                    </div>
                  }
                >
                  <MapView
                    className="h-[300px]"
                    initialCenter={geoState ? { lat: geoState.latitude, lng: geoState.longitude } : biasedCenter}
                    initialZoom={16}
                    onMapReady={handleMapReady}
                  />
                </Suspense>
                {/* Fixed center pin overlay */}
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="relative">
                    <MapPin className="h-8 w-8 -translate-y-1/2 text-[#B95509] drop-shadow-md" fill="#B95509" />
                    <div className="absolute -bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-black/20 blur-sm" />
                  </div>
                </div>
              </div>

              {geoState && (
                <div className="space-y-1 text-xs text-[#885e43]">
                  <p>Pin: {geoState.latitude.toFixed(6)}, {geoState.longitude.toFixed(6)}</p>
                  {geoState.deviceAccuracyMeters && (
                    <p>Device accuracy: ~{Math.round(geoState.deviceAccuracyMeters)}m ({accuracyLevel})</p>
                  )}
                </div>
              )}

              <div className="flex gap-2">
                {visitedChoice && (
                  <Button
                    onClick={() => setStep("choose_method")}
                    variant="outline"
                    className="h-11 flex-1 rounded-xl border-[#D8DFC0] bg-white font-bold text-[#2A3A0C]"
                  >
                    Back
                  </Button>
                )}
                <Button
                  onClick={() => {
                    if (geoState) {
                      setCameViaMap(true);
                      setStep("address_form");
                    }
                  }}
                  disabled={!geoState}
                  className="h-11 flex-1 rounded-xl bg-[#B95509] font-bold text-white hover:bg-[#9C4A07] disabled:opacity-50"
                >
                  <Check className="mr-1 h-4 w-4" />
                  Confirm delivery pin
                </Button>
              </div>
            </>
          )}

          {/* Step: Address Form */}
          {step === "address_form" && (
            <>
              {geoError && (
                <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
                  <AlertTriangle className="mr-1 inline h-3 w-3" />
                  {geoError}
                </div>
              )}
              {geoState && (
                <div className="rounded-xl border border-[#D8DFC0] bg-[#E9EFD6] p-3 text-xs text-[#885e43]">
                  Location: {geoState.latitude.toFixed(6)}, {geoState.longitude.toFixed(6)}
                  {geoState.deviceAccuracyMeters && <> · Accuracy: ~{Math.round(geoState.deviceAccuracyMeters)}m</>}
                  {geoState.source === "map_pin" && <> · Source: Map pin</>}
                </div>
              )}

              <div className="space-y-3">
                <Input
                  placeholder="Flat / House number *"
                  aria-label="Flat or house number"
                  value={flatHouse}
                  onChange={(e) => setFlatHouse(e.target.value)}
                  className="h-11 rounded-xl border-[#D8DFC0] bg-white text-[#2A3A0C]"
                />
                <Input
                  placeholder="Building / Apartment name"
                  aria-label="Building or apartment name"
                  value={building}
                  onChange={(e) => setBuilding(e.target.value)}
                  className="h-11 rounded-xl border-[#D8DFC0] bg-white text-[#2A3A0C]"
                />
                <Input
                  placeholder="Street"
                  aria-label="Street"
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
                  className="h-11 rounded-xl border-[#D8DFC0] bg-white text-[#2A3A0C]"
                />
                <Input
                  placeholder="Landmark"
                  aria-label="Landmark"
                  value={landmark}
                  onChange={(e) => setLandmark(e.target.value)}
                  className="h-11 rounded-xl border-[#D8DFC0] bg-white text-[#2A3A0C]"
                />
                <Input
                  placeholder="Area / Locality *"
                  aria-label="Area or locality"
                  value={area}
                  onChange={(e) => setArea(e.target.value)}
                  className="h-11 rounded-xl border-[#D8DFC0] bg-white text-[#2A3A0C]"
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="City *"
                    aria-label="City"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="h-11 rounded-xl border-[#D8DFC0] bg-white text-[#2A3A0C]"
                  />
                  <Input
                    placeholder="PIN code *"
                    aria-label="PIN code"
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value.replace(/[^\d]/g, ""))}
                    maxLength={6}
                    inputMode="numeric"
                    autoComplete="postal-code"
                    className="h-11 rounded-xl border-[#D8DFC0] bg-white text-[#2A3A0C]"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={() => setStep(cameViaMap ? "map_confirm" : "choose_method")}
                  variant="outline"
                  className="h-11 flex-1 rounded-xl border-[#D8DFC0] bg-white font-bold text-[#2A3A0C]"
                >
                  Back
                </Button>
                <Button
                  onClick={confirmAddress}
                  disabled={!formValid}
                  className="h-11 flex-1 rounded-xl bg-[#B95509] font-bold text-white hover:bg-[#9C4A07] disabled:opacity-50"
                >
                  <Check className="mr-1 h-4 w-4" />
                  Confirm Location
                </Button>
              </div>
            </>
          )}

          {/* Step: Confirmed */}
          {step === "confirmed" && existingLocation && (
            <div className="space-y-3">
              <div className="rounded-xl border border-green-200 bg-green-50 p-4">
                <p className="text-sm font-semibold text-green-800">
                  <Check className="mr-1 inline h-4 w-4" />
                  Delivery location confirmed
                </p>
                <p className="mt-1 text-xs text-green-700">
                  {existingLocation.flatHouse}, {existingLocation.area}, {existingLocation.city} {existingLocation.postalCode}
                </p>
                <p className="mt-1 text-xs text-green-600">
                  Pin: {existingLocation.latitude.toFixed(6)}, {existingLocation.longitude.toFixed(6)}
                  {existingLocation.accuracyMeters && <> · ~{existingLocation.accuracyMeters}m</>}
                </p>
              </div>
              <Button
                onClick={reset}
                variant="outline"
                className="h-11 w-full rounded-xl border-[#D8DFC0] bg-white font-bold text-[#2A3A0C]"
              >
                Change Location
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
