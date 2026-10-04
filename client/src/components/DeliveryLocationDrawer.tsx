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
import {
  capturePreciseLocation,
  classifyAccuracy,
  requiresMapConfirmation,
  describeAccuracy,
} from "@/lib/locationCapture";
import { trpc } from "@/lib/trpc";
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
  /** How the pin was obtained — shown as a trust cue next to the address. */
  captureMethod?: "gps_multi_sample" | "gps_single" | "gps_coarse" | "network_ip";
};

type AccuracyLevel = "HIGH" | "GOOD" | "LOW" | "POOR" | "UNKNOWN";

// Default map center: center of India (used only until GPS or search provides real coordinates)
const DEFAULT_MAP_CENTER = { lat: 20.5937, lng: 78.9629 };

/**
 * Normalise a PIN code to six bare digits.
 *
 * Reverse geocoding and place lookup routinely return "560 038", "560038, IN" or a
 * "+91" prefix. `formValid` and `confirmAddress` both demand /^\d{6}$/, so an
 * autofilled value containing a space silently left "Confirm Location" disabled
 * with no field to fix and no message. Applied to EVERY path that writes a
 * postcode — typing, reverse geocode, place details, and a seeded existing
 * location — not just the keystroke handler.
 */
const normalizePincode = (value: string | null | undefined): string =>
  (value ?? "").replace(/\D/g, "").slice(0, 6);

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
  /** Accuracy copy for the map/address steps (gpsError only renders on choose_method). */
  const [accuracyNote, setAccuracyNote] = useState<string | null>(null);

  // Address form
  const [flatHouse, setFlatHouse] = useState(existingLocation?.flatHouse ?? "");
  const [building, setBuilding] = useState(existingLocation?.building ?? "");
  const [street, setStreet] = useState(existingLocation?.street ?? "");
  const [landmark, setLandmark] = useState(existingLocation?.landmark ?? "");
  const [area, setArea] = useState(existingLocation?.area ?? "");
  const [city, setCity] = useState(existingLocation?.city ?? "");
  const [postalCode, setPostalCode] = useState(normalizePincode(existingLocation?.postalCode));

  // Map state
  const mapRef = useRef<google.maps.Map | null>(null);
  const idleListenerRef = useRef<google.maps.MapsEventListener | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);

  /** A pin is only confirmable with real coordinates — never the untouched
   * India-center seed, (0,0), or non-finite values. Prevents ghost pins that
   * pass validation but fail serviceability hundreds of km away. */
  const hasUsablePin = (g: GeoLocationState | null): g is GeoLocationState => {
    if (!g) return false;
    const { latitude, longitude } = g;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return false;
    if (latitude === 0 && longitude === 0) return false;
    const nearDefault =
      Math.abs(latitude - DEFAULT_MAP_CENTER.lat) < 0.000001 &&
      Math.abs(longitude - DEFAULT_MAP_CENTER.lng) < 0.000001;
    if (nearDefault && g.source === "map_pin" && !g.mapInteracted) return false;
    return true;
  };

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PlaceSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * Monotonic token guarding every async write of address fields.
   *
   * `reverseGeocode` and `getPlaceDetails` both resolve out of order with no
   * cancellation, so a slow GPS reverse-geocode could land AFTER the customer had
   * already searched and picked a place, overwriting the place's area/city/PIN with
   * stale GPS-derived values while the coordinates still came from the place. That
   * mismatched pair (Jayanagar pin + Koramangala PIN) then failed serviceability or,
   * worse, passed it. Every async field write now checks its token first.
   */
  const geoTokenRef = useRef(0);
  const beginGeoWrite = () => ++geoTokenRef.current;
  const isCurrentGeoWrite = (token: number) => token === geoTokenRef.current;

  const reset = useCallback(() => {
    // Drop any in-flight debounce: a pending lookup resolving after a reset
    // repopulated the suggestion list the customer had just dismissed.
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
      searchTimerRef.current = null;
    }
    setStep("choose_method");
    setGeoState(null);
    setGpsError(null);
    setSearchQuery("");
    setSearchResults([]);
    setSearching(false);
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
  //
  // Delegates to capturePreciseLocation, which escalates rather than failing:
  // multiple GPS samples reduced to a weighted median, then a coarse fix, then an
  // IP-derived starting point. A single getCurrentPosition call with a 30s cache
  // could hand back a fix from several minutes ago and present it as current.
  const locateByIp = trpc.storefront.locateByIp.useQuery(undefined, {
    enabled: false,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const useCurrentLocation = useCallback(async () => {
    setStep("loading");
    setGpsError(null);

    const result = await capturePreciseLocation({
      ipFallback: async () => {
        const data = await locateByIp.refetch();
        const value = data.data;
        if (!value?.found) return null;
        return {
          latitude: value.latitude,
          longitude: value.longitude,
          accuracyMeters: value.accuracyMeters,
        };
      },
    });

    if (!result.ok) {
      setGpsError(result.message);
      setStep("choose_method");
      return;
    }

    setGeoState({
      latitude: result.latitude,
      longitude: result.longitude,
      accuracyMeters: result.accuracyMeters ?? undefined,
      deviceAccuracyMeters: result.accuracyMeters ?? undefined,
      source: result.method === "network_ip" ? "map_pin" : "device_gps",
      captureMethod: result.method,
    });

    // Any fix we are not confident about — including every IP pin — goes to the map
    // for confirmation before an address form is shown.
    const needsConfirmation = result.method === "network_ip" || requiresMapConfirmation(result.level);
    setStep(needsConfirmation ? "map_confirm" : "address_form");

    // Any subsequent user action (Back, a place search) invalidates this write.
    const token = beginGeoWrite();
    reverseGeocode(result.latitude, result.longitude)
      .then((geocode) => {
        if (!isCurrentGeoWrite(token)) return;
        if (geocode.area) setArea(geocode.area);
        if (geocode.city) setCity(geocode.city);
        if (geocode.postalCode) setPostalCode(normalizePincode(geocode.postalCode));
        if (geocode.street) setStreet(geocode.street);
      })
      .catch(() => {
        // Silently unhandled rejections left the address form permanently
        // unfillable by autofill, with no error anywhere.
      });

    // Tell the customer how much to trust the pin instead of silently showing it.
    // This must be a value the map step actually renders: `gpsError` is only shown
    // on choose_method, so the metre-bearing accuracy copy was written to a banner
    // that was not mounted and never seen.
    if (needsConfirmation) {
      const note = describeAccuracy(result.level, result.accuracyMeters);
      if (result.level !== "HIGH" && result.level !== "GOOD") {
        setGpsError(note);
        setAccuracyNote(note);
      }
    }
  }, [locateByIp, beginGeoWrite, isCurrentGeoWrite]);

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
      // Any throw (Maps not loaded yet, blocked request) must still clear
      // the spinner — otherwise it circles forever with no error shown.
      try {
        const results = await searchPlaces(value);
        setSearchResults(results);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  }, []);

  const handlePlaceSelect = useCallback(async (placeId: string, description: string) => {
    setSearchQuery(description);
    setSearchResults([]);
    setSearching(true);

    // A place selection supersedes any in-flight GPS reverse-geocode.
    const token = beginGeoWrite();
    const details = await getPlaceDetails(placeId);
    if (!isCurrentGeoWrite(token)) return;
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
      if (details.postalCode) setPostalCode(normalizePincode(details.postalCode));
      if (details.street) setStreet(details.street);
      setStep("map_confirm");
    }
  }, [beginGeoWrite, isCurrentGeoWrite]);

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
      // Dragging the pin is a deliberate user action, so it takes ownership of the
      // address fields from here on.
      const token = beginGeoWrite();
      reverseGeocode(geoState.latitude, geoState.longitude)
        .then((result) => {
          if (!isCurrentGeoWrite(token)) return;
          if (result.area) setArea(result.area);
          if (result.city) setCity(result.city);
          if (result.postalCode) setPostalCode(normalizePincode(result.postalCode));
          if (result.street) setStreet(result.street);
        })
        .catch(() => {
          /* a failed reverse-geocode must not throw unhandled */
        });
    }, 1000);
    return () => clearTimeout(timer);
  }, [step, geoState?.latitude, geoState?.longitude, geoState?.mapInteracted, beginGeoWrite, isCurrentGeoWrite]);

  // Cleanup idle listener and the debounced lookup
  useEffect(() => {
    return () => {
      if (idleListenerRef.current) {
        idleListenerRef.current.remove();
      }
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  // --- Confirm address form ---
  const confirmAddress = useCallback(() => {
    if (!flatHouse.trim() || !area.trim() || !city.trim() || !/^\d{6}$/.test(postalCode)) return;
    if (!hasUsablePin(geoState)) return;

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
    // Land on the summary step. `confirmAddress` closes via the raw prop rather
    // than `handleOpenChange`, so `reset()` never ran and reopening the drawer
    // replayed the address form instead of showing the saved location the parent
    // now holds — which made the "confirmed" state unreachable in practice.
    setStep("confirmed");
    onOpenChange(false);
  }, [flatHouse, building, street, landmark, area, city, postalCode, geoState, onConfirm, onOpenChange]);

  const formValid = Boolean(flatHouse.trim() && area.trim() && city.trim() && /^\d{6}$/.test(postalCode) && hasUsablePin(geoState));

  const accuracyLevel = geoState ? classifyAccuracy(geoState.deviceAccuracyMeters ?? geoState.accuracyMeters) : null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="storefront max-h-[90dvh] w-[calc(100vw-2rem)] max-w-md overflow-y-auto rounded-[1.5rem] p-0" style={{ background: "var(--sf-bg)", borderColor: "var(--sf-border)" }}>
        <div className="rounded-t-[1.5rem] border-b p-6" style={{ borderColor: "var(--sf-border)" }}>
          <DialogHeader>
            <DialogTitle className="font-extrabold tracking-tight text-3xl" style={{ color: "var(--sf-text)" }}>
              Delivery Location
            </DialogTitle>
            <DialogDescription style={{ color: "var(--sf-text-muted)" }}>
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
                className="h-12 w-full cursor-pointer touch-manipulation rounded-xl bg-[var(--sf-primary)] font-bold text-white transition-all duration-200 hover:brightness-90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 [-webkit-tap-highlight-color:transparent]"
              >
                <Navigation className="mr-2 h-4 w-4" />
                Use My Current Location
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-[var(--sf-border)]" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-[var(--sf-surface)] px-2" style={{ color: "var(--sf-text-muted)" }}>or</span>
                </div>
              </div>

              <div className="relative">
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2"
                    style={{ color: "var(--sf-text-muted)" }}
                    aria-hidden="true"
                  />
                  <Input
                    placeholder="Search address..."
                    value={searchQuery}
                    onChange={(e) => handleSearchInput(e.target.value)}
                    aria-label="Search address"
                    autoComplete="off"
                    className="h-12 rounded-xl border-[var(--sf-border)] bg-[var(--sf-surface)] pl-11"
                    style={{ color: "var(--sf-text)" }}
                  />
                  {searching && (
                    <Loader2
                      className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin"
                      style={{ color: "var(--sf-text-muted)" }}
                      role="status"
                      aria-label="Searching"
                    />
                  )}
                </div>

                {searchResults.length > 0 && (
                  <div className="absolute left-0 right-0 top-14 z-50 max-h-48 overflow-y-auto rounded-xl border border-[var(--sf-border)] bg-[var(--sf-surface)] shadow-lg">
                    {searchResults.map((result) => (
                      <button
                        key={result.placeId}
                        onClick={() => handlePlaceSelect(result.placeId, result.description)}
                        className="w-full cursor-pointer touch-manipulation px-4 py-3 text-left text-sm transition-colors duration-150 hover:bg-white/10 [-webkit-tap-highlight-color:transparent]"
                        style={{ color: "var(--sf-text)" }}
                      >
                        <MapPin className="mr-2 inline h-3 w-3 text-[var(--sf-primary)]" />
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
                className="h-11 w-full cursor-pointer touch-manipulation rounded-xl border-[var(--sf-border)] bg-[var(--sf-surface)] font-bold transition-colors duration-200 hover:bg-white/10 active:scale-95 [-webkit-tap-highlight-color:transparent]"
                style={{ color: "var(--sf-text)" }}
              >
                <MapPin className="mr-2 h-4 w-4" />
                Place Pin on Map
              </Button>
            </>
          )}

          {/* Step: Loading */}
          {step === "loading" && (
            <div className="flex flex-col items-center gap-4 py-8">
              <Loader2 className="h-8 w-8 animate-spin text-[var(--sf-primary)]" />
              <p className="text-sm" style={{ color: "var(--sf-text-muted)" }}>Getting your location...</p>
            </div>
          )}

          {/* Step: Map Confirm — real interactive map with fixed-center pin */}
          {step === "map_confirm" && (
            <>
              <div className="rounded-xl border border-[var(--sf-border)] bg-[var(--sf-bg-subtle)] p-4">
                <p className="text-sm font-semibold" style={{ color: "var(--sf-text)" }}>
                  <Crosshair className="mr-1 inline h-4 w-4 text-[var(--sf-primary)]" />
                  Confirm your delivery pin
                </p>
                <p className="mt-1 text-xs" style={{ color: "var(--sf-text-secondary)" }}>
                  Move the map so the pin points to your exact delivery location.
                </p>
              </div>

              {/* The measured accuracy, on the step where the pin is corrected.
                  Previously written to `gpsError`, which renders only on
                  choose_method — so the customer was told nothing here. */}
              {accuracyNote && (
                <div
                  role="status"
                  className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700"
                >
                  <AlertTriangle className="mr-1 inline h-3 w-3" />
                  {accuracyNote}
                </div>
              )}

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
              <div className="relative overflow-hidden rounded-xl border border-[var(--sf-border)]">
                <MapView
                  className="h-[300px]"
                  initialCenter={geoState ? { lat: geoState.latitude, lng: geoState.longitude } : DEFAULT_MAP_CENTER}
                  initialZoom={16}
                  onMapReady={(map) => {
                    setMapError(null);
                    handleMapReady(map);
                  }}
                  onLoadError={(message) => setMapError(message)}
                />
                {mapError && (
                  <div role="alert" className="mt-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700">
                    Map failed to load ({mapError}). Check your connection and reopen this picker — the pin cannot be confirmed without the map.
                  </div>
                )}
                {/* Fixed center pin overlay */}
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="relative">
                    <MapPin className="h-8 w-8 -translate-y-1/2 text-[var(--sf-primary)] drop-shadow-md" fill="currentColor" />
                    <div className="absolute -bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-black/20 blur-sm" />
                  </div>
                </div>
              </div>

              {geoState && (
                <div className="space-y-1 text-xs tabular-nums" style={{ color: "var(--sf-text-secondary)" }}>
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
                  className="h-11 flex-1 cursor-pointer touch-manipulation rounded-xl border-[var(--sf-border)] bg-[var(--sf-surface)] font-bold transition-colors duration-200 hover:bg-white/10 active:scale-95 [-webkit-tap-highlight-color:transparent]"
                  style={{ color: "var(--sf-text)" }}
                >
                  Back
                </Button>
                <Button
                  onClick={() => hasUsablePin(geoState) && setStep("address_form")}
                  disabled={!hasUsablePin(geoState) || !!mapError}
                  title={
                    mapError
                      ? "Map failed to load — reopen the picker and try again"
                      : !hasUsablePin(geoState)
                        ? "Move the map so the pin points to your exact location"
                        : undefined
                  }
                  className="h-11 flex-1 cursor-pointer touch-manipulation rounded-xl bg-[var(--sf-primary)] font-bold text-white transition-all duration-200 hover:brightness-90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 [-webkit-tap-highlight-color:transparent]"
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
                <div className="rounded-xl border border-[var(--sf-border)] bg-[var(--sf-bg-subtle)] p-3 text-xs tabular-nums" style={{ color: "var(--sf-text-secondary)" }}>
                  Pin: {geoState.latitude.toFixed(6)}, {geoState.longitude.toFixed(6)}
                  {geoState.deviceAccuracyMeters && <> · Accuracy: ~{Math.round(geoState.deviceAccuracyMeters)}m</>}
                  {geoState.source === "map_pin" && <> · Source: Map pin</>}
                  <br />
                  Pincode to be checked: {postalCode || geoState.postalCode || "not detected yet"}
                </div>
              )}

              <div className="space-y-3">
                <Input
                  placeholder="Flat / House number *"
                  value={flatHouse}
                  onChange={(e) => setFlatHouse(e.target.value)}
                  className="h-11 rounded-xl border-[var(--sf-border)] bg-[var(--sf-surface)]" style={{ color: "var(--sf-text)" }}
                />
                <Input
                  placeholder="Building / Apartment name"
                  value={building}
                  onChange={(e) => setBuilding(e.target.value)}
                  className="h-11 rounded-xl border-[var(--sf-border)] bg-[var(--sf-surface)]" style={{ color: "var(--sf-text)" }}
                />
                <Input
                  placeholder="Street"
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
                  className="h-11 rounded-xl border-[var(--sf-border)] bg-[var(--sf-surface)]" style={{ color: "var(--sf-text)" }}
                />
                <Input
                  placeholder="Landmark"
                  value={landmark}
                  onChange={(e) => setLandmark(e.target.value)}
                  className="h-11 rounded-xl border-[var(--sf-border)] bg-[var(--sf-surface)]" style={{ color: "var(--sf-text)" }}
                />
                <Input
                  placeholder="Area / Locality *"
                  value={area}
                  onChange={(e) => setArea(e.target.value)}
                  className="h-11 rounded-xl border-[var(--sf-border)] bg-[var(--sf-surface)]" style={{ color: "var(--sf-text)" }}
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="City *"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="h-11 rounded-xl border-[var(--sf-border)] bg-[var(--sf-surface)]" style={{ color: "var(--sf-text)" }}
                  />
                  <Input
                    placeholder="PIN code *"
                    value={postalCode}
                    // Reverse geocoding often returns "560 038". `formValid`
                    // demands six bare digits, so an autofilled value with a space
                    // or "+91" silently left the Confirm button disabled with no
                    // field to fix — strip to digits as the customer types.
                    onChange={(e) => setPostalCode(normalizePincode(e.target.value))}
                    inputMode="numeric"
                    autoComplete="postal-code"
                    maxLength={6}
                    className="h-11 rounded-xl border-[var(--sf-border)] bg-[var(--sf-surface)] tabular-nums" style={{ color: "var(--sf-text)" }}
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={() => setStep("map_confirm")}
                  variant="outline"
                  className="h-11 flex-1 cursor-pointer touch-manipulation rounded-xl border-[var(--sf-border)] bg-[var(--sf-surface)] font-bold transition-colors duration-200 hover:bg-white/10 active:scale-95 [-webkit-tap-highlight-color:transparent]"
                  style={{ color: "var(--sf-text)" }}
                >
                  Back
                </Button>
                <Button
                  onClick={confirmAddress}
                  disabled={!formValid}
                  className="h-11 flex-1 cursor-pointer touch-manipulation rounded-xl bg-[var(--sf-primary)] font-bold text-white transition-all duration-200 hover:brightness-90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 [-webkit-tap-highlight-color:transparent]"
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
                className="h-11 w-full cursor-pointer touch-manipulation rounded-xl border-[var(--sf-border)] bg-[var(--sf-surface)] font-bold transition-colors duration-200 hover:bg-white/10 active:scale-95 [-webkit-tap-highlight-color:transparent]"
                style={{ color: "var(--sf-text)" }}
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
