/**
 * DeliveryLocationDrawer — GPS, interactive map pin, and address form for checkout.
 * Three methods: Use Current Location, Search Address, Place Pin on Map.
 * Uses Google Maps via existing Forge proxy. Fixed-center pin approach.
 */
/// <reference types="@types/google.maps" />

import { useState, useCallback, useRef, useEffect } from "react";
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
import { MapView } from "@/components/Map";
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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (location: DeliveryLocation) => void;
  existingLocation?: DeliveryLocation | null;
}) {
  const [step, setStep] = useState<GeoStep>(
    existingLocation?.confirmed ? "confirmed" : "choose_method"
  );
  const [geoState, setGeoState] = useState<GeoLocationState | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);

  // Address form
  const [flatHouse, setFlatHouse] = useState(existingLocation?.flatHouse ?? "");
  const [building, setBuilding] = useState(existingLocation?.building ?? "");
  const [street, setStreet] = useState(existingLocation?.street ?? "");
  const [landmark, setLandmark] = useState(existingLocation?.landmark ?? "");
  const [area, setArea] = useState(existingLocation?.area ?? "");
  const [city, setCity] = useState(existingLocation?.city ?? "");
  const [postalCode, setPostalCode] = useState(existingLocation?.postalCode ?? "");

  // Map state
  const mapRef = useRef<google.maps.Map | null>(null);
  const idleListenerRef = useRef<google.maps.MapsEventListener | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PlaceSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reset = useCallback(() => {
    setStep("choose_method");
    setGeoState(null);
    setGpsError(null);
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
          setStep("map_confirm");
        } else {
          setStep("address_form");
        }

        reverseGeocode(latitude, longitude).then((result) => {
          if (result.area) setArea(result.area);
          if (result.city) setCity(result.city);
          if (result.postalCode) setPostalCode(result.postalCode);
          if (result.street) setStreet(result.street);
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
  const handleSearchInput = useCallback((value: string) => {
    setSearchQuery(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!value.trim() || value.length < 3) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    searchTimerRef.current = setTimeout(async () => {
      const results = await searchPlaces(value);
      setSearchResults(results);
      setSearching(false);
    }, 300);
  }, []);

  const handlePlaceSelect = useCallback(async (placeId: string, description: string) => {
    setSearchQuery(description);
    setSearchResults([]);
    setSearching(true);

    const details = await getPlaceDetails(placeId);
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
      setStep("map_confirm");
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

  // Center map when geoState changes and we're on map_confirm step
  useEffect(() => {
    if (step === "map_confirm" && geoState && mapRef.current) {
      mapRef.current.setCenter({ lat: geoState.latitude, lng: geoState.longitude });
      mapRef.current.setZoom(16);
    }
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
    onConfirm(location);
    onOpenChange(false);
  }, [flatHouse, building, street, landmark, area, city, postalCode, geoState, onConfirm, onOpenChange]);

  const formValid = flatHouse.trim() && area.trim() && city.trim() && /^\d{6}$/.test(postalCode) && geoState;

  const accuracyLevel = geoState ? classifyAccuracy(geoState.deviceAccuracyMeters ?? geoState.accuracyMeters) : null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md rounded-[1.5rem] border-[#dfcbb9] bg-[#fffaf3] p-0 max-h-[90vh] overflow-y-auto">
        <div className="paper-grain rounded-t-[1.5rem] border-b border-[#ead8c6] p-6">
          <DialogHeader>
            <DialogTitle className="font-display text-3xl text-[#382719]">
              Delivery Location
            </DialogTitle>
            <DialogDescription className="text-[#856653]">
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
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
                  <AlertTriangle className="mr-1 inline h-4 w-4" />
                  {gpsError}
                </div>
              )}

              <Button
                onClick={useCurrentLocation}
                className="h-12 w-full rounded-xl bg-[#C84630] font-bold text-white hover:bg-[#b03d28]"
              >
                <Navigation className="mr-2 h-4 w-4" />
                Use My Current Location
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-[#e7d2c0]" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-[#fffaf3] px-2 text-[#a37960]">or</span>
                </div>
              </div>

              <div className="relative">
                <div className="flex gap-2">
                  <Input
                    placeholder="Search address..."
                    value={searchQuery}
                    onChange={(e) => handleSearchInput(e.target.value)}
                    className="h-12 rounded-xl border-[#dfcbb9] bg-white text-[#382719]"
                  />
                  <Button
                    variant="outline"
                    className="h-12 rounded-xl border-[#dfcbb9] bg-white font-bold text-[#5c4332]"
                    disabled={!searchQuery.trim()}
                  >
                    {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  </Button>
                </div>

                {searchResults.length > 0 && (
                  <div className="absolute left-0 right-0 top-14 z-50 max-h-48 overflow-y-auto rounded-xl border border-[#dfcbb9] bg-white shadow-lg">
                    {searchResults.map((result) => (
                      <button
                        key={result.placeId}
                        onClick={() => handlePlaceSelect(result.placeId, result.description)}
                        className="w-full px-4 py-3 text-left text-sm text-[#382719] hover:bg-[#fff4e9]"
                      >
                        <MapPin className="mr-2 inline h-3 w-3 text-[#C84630]" />
                        {result.description}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <Button
                onClick={() => {
                  setGeoState({
                    latitude: DEFAULT_MAP_CENTER.lat,
                    longitude: DEFAULT_MAP_CENTER.lng,
                    source: "map_pin",
                  });
                  setStep("map_confirm");
                }}
                variant="outline"
                className="h-11 w-full rounded-xl border-[#dfcbb9] bg-white font-bold text-[#5c4332]"
              >
                <MapPin className="mr-2 h-4 w-4" />
                Place Pin on Map
              </Button>
            </>
          )}

          {/* Step: Loading */}
          {step === "loading" && (
            <div className="flex flex-col items-center gap-4 py-8">
              <Loader2 className="h-8 w-8 animate-spin text-[#C84630]" />
              <p className="text-sm text-[#856653]">Getting your location...</p>
            </div>
          )}

          {/* Step: Map Confirm — real interactive map with fixed-center pin */}
          {step === "map_confirm" && (
            <>
              <div className="rounded-xl border border-[#d9b89e] bg-[#fff4e9] p-4">
                <p className="text-sm font-semibold text-[#5c4332]">
                  <Crosshair className="mr-1 inline h-4 w-4 text-[#C84630]" />
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
              <div className="relative overflow-hidden rounded-xl border border-[#dfcbb9]">
                <MapView
                  className="h-[300px]"
                  initialCenter={geoState ? { lat: geoState.latitude, lng: geoState.longitude } : DEFAULT_MAP_CENTER}
                  initialZoom={16}
                  onMapReady={handleMapReady}
                />
                {/* Fixed center pin overlay */}
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="relative">
                    <MapPin className="h-8 w-8 -translate-y-1/2 text-[#C84630] drop-shadow-md" fill="#C84630" />
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
                <Button
                  onClick={() => setStep("choose_method")}
                  variant="outline"
                  className="h-11 flex-1 rounded-xl border-[#dfcbb9] bg-white font-bold text-[#5c4332]"
                >
                  Back
                </Button>
                <Button
                  onClick={() => geoState && setStep("address_form")}
                  disabled={!geoState}
                  className="h-11 flex-1 rounded-xl bg-[#C84630] font-bold text-white hover:bg-[#b03d28] disabled:opacity-50"
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
              {geoState && (
                <div className="rounded-xl border border-[#d9b89e] bg-[#fff4e9] p-3 text-xs text-[#885e43]">
                  Location: {geoState.latitude.toFixed(6)}, {geoState.longitude.toFixed(6)}
                  {geoState.deviceAccuracyMeters && <> · Accuracy: ~{Math.round(geoState.deviceAccuracyMeters)}m</>}
                  {geoState.source === "map_pin" && <> · Source: Map pin</>}
                </div>
              )}

              <div className="space-y-3">
                <Input
                  placeholder="Flat / House number *"
                  value={flatHouse}
                  onChange={(e) => setFlatHouse(e.target.value)}
                  className="h-11 rounded-xl border-[#dfcbb9] bg-white text-[#382719]"
                />
                <Input
                  placeholder="Building / Apartment name"
                  value={building}
                  onChange={(e) => setBuilding(e.target.value)}
                  className="h-11 rounded-xl border-[#dfcbb9] bg-white text-[#382719]"
                />
                <Input
                  placeholder="Street"
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
                  className="h-11 rounded-xl border-[#dfcbb9] bg-white text-[#382719]"
                />
                <Input
                  placeholder="Landmark"
                  value={landmark}
                  onChange={(e) => setLandmark(e.target.value)}
                  className="h-11 rounded-xl border-[#dfcbb9] bg-white text-[#382719]"
                />
                <Input
                  placeholder="Area / Locality *"
                  value={area}
                  onChange={(e) => setArea(e.target.value)}
                  className="h-11 rounded-xl border-[#dfcbb9] bg-white text-[#382719]"
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="City *"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="h-11 rounded-xl border-[#dfcbb9] bg-white text-[#382719]"
                  />
                  <Input
                    placeholder="PIN code *"
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                    maxLength={6}
                    className="h-11 rounded-xl border-[#dfcbb9] bg-white text-[#382719]"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={() => setStep("map_confirm")}
                  variant="outline"
                  className="h-11 flex-1 rounded-xl border-[#dfcbb9] bg-white font-bold text-[#5c4332]"
                >
                  Back
                </Button>
                <Button
                  onClick={confirmAddress}
                  disabled={!formValid}
                  className="h-11 flex-1 rounded-xl bg-[#C84630] font-bold text-white hover:bg-[#b03d28] disabled:opacity-50"
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
                className="h-11 w-full rounded-xl border-[#dfcbb9] bg-white font-bold text-[#5c4332]"
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
