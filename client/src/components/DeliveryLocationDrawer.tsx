/**
 * DeliveryLocationDrawer — GPS, map pin, and address form for checkout.
 * Three methods: Use Current Location, Search Address, Manual Map Pin.
 */
import { useState, useCallback, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MapPin, Navigation, Search, AlertTriangle, Loader2, Check } from "lucide-react";

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
  locationSource: "device_gps" | "map_pin" | "place_search" | "saved_address";
  placeId?: string;
  confirmed: true;
};

type GeoStep = "choose_method" | "loading" | "map_confirm" | "address_form" | "confirmed";

type GeoLocationState = {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
  source: "device_gps" | "map_pin" | "place_search";
  area?: string;
  city?: string;
  postalCode?: string;
};

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

  const reset = useCallback(() => {
    setStep("choose_method");
    setGeoState(null);
    setGpsError(null);
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
        setGeoState({
          latitude,
          longitude,
          accuracyMeters: accuracy,
          source: "device_gps",
        });
        setStep("address_form");
        // Try reverse geocoding
        reverseGeocode(latitude, longitude);
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

  // --- Method B: Search Address (placeholder — integrates with Google Maps) ---
  const [searchQuery, setSearchQuery] = useState("");
  const handleSearch = useCallback(() => {
    // For now: parse a basic address search and move to manual pin
    // In production: integrate Google Places Autocomplete
    setStep("map_confirm");
  }, []);

  // --- Reverse geocoding (best-effort) ---
  const reverseGeocode = useCallback(async (lat: number, lng: number) => {
    try {
      // Use Nominatim for free reverse geocoding (no API key needed)
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=18`,
        { headers: { "Accept-Language": "en" } }
      );
      if (res.ok) {
        const data = await res.json();
        const addr = data.address ?? {};
        setArea(addr.suburb ?? addr.neighbourhood ?? addr.quarter ?? addr.city_district ?? "");
        setCity(addr.city ?? addr.town ?? addr.village ?? "");
        setPostalCode(addr.postcode ?? "");
        setStreet(addr.road ?? "");
      }
    } catch {
      // Best effort — customer fills in manually
    }
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
      locationSource: geoState.source,
      confirmed: true,
    };
    onConfirm(location);
    onOpenChange(false);
  }, [flatHouse, building, street, landmark, area, city, postalCode, geoState, onConfirm, onOpenChange]);

  const formValid = flatHouse.trim() && area.trim() && city.trim() && /^\d{6}$/.test(postalCode) && geoState;

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

              <div className="flex gap-2">
                <Input
                  placeholder="Search address..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  className="h-12 rounded-xl border-[#dfcbb9] bg-white text-[#382719]"
                />
                <Button
                  onClick={handleSearch}
                  variant="outline"
                  className="h-12 rounded-xl border-[#dfcbb9] bg-white font-bold text-[#5c4332]"
                >
                  <Search className="h-4 w-4" />
                </Button>
              </div>

              <Button
                onClick={() => setStep("map_confirm")}
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

          {/* Step: Map Confirm (shows accuracy info + placeholder for real map) */}
          {step === "map_confirm" && (
            <>
              <div className="rounded-xl border border-[#d9b89e] bg-[#fff4e9] p-4">
                <p className="text-sm font-semibold text-[#5c4332]">
                  <MapPin className="mr-1 inline h-4 w-4 text-[#C84630]" />
                  Confirm your delivery pin
                </p>
                <p className="mt-1 text-xs text-[#885e43]">
                  Drag the pin to your exact delivery location. In production, this shows an interactive map.
                </p>
              </div>

              {/* For MVP: use device GPS coordinates when available, or allow manual entry */}
              {geoState ? (
                <div className="space-y-1 text-xs text-[#885e43]">
                  <p>Pin coordinates: {geoState.latitude.toFixed(6)}, {geoState.longitude.toFixed(6)}</p>
                  {geoState.accuracyMeters && (
                    <p>Accuracy: ~{Math.round(geoState.accuracyMeters)}m</p>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <Input
                    placeholder="Latitude (e.g. 12.935192)"
                    type="number"
                    step="0.000001"
                    onChange={(e) => {
                      const lat = parseFloat(e.target.value);
                      if (!isNaN(lat)) {
                        setGeoState((prev) => ({
                          latitude: lat,
                          longitude: prev?.longitude ?? 77.6245,
                          source: "map_pin",
                        }));
                      }
                    }}
                    className="h-10 rounded-xl border-[#dfcbb9] bg-white text-[#382719]"
                  />
                  <Input
                    placeholder="Longitude (e.g. 77.624481)"
                    type="number"
                    step="0.000001"
                    onChange={(e) => {
                      const lng = parseFloat(e.target.value);
                      if (!isNaN(lng)) {
                        setGeoState((prev) => ({
                          latitude: prev?.latitude ?? 12.9352,
                          longitude: lng,
                          source: "map_pin",
                        }));
                      }
                    }}
                    className="h-10 rounded-xl border-[#dfcbb9] bg-white text-[#382719]"
                  />
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
                  Continue
                </Button>
              </div>
            </>
          )}

          {/* Step: Address Form */}
          {step === "address_form" && (
            <>
              {geoState && (
                <div className="rounded-xl border border-[#d9b89e] bg-[#fff4e9] p-3 text-xs text-[#885e43]">
                  📍 Location: {geoState.latitude.toFixed(6)}, {geoState.longitude.toFixed(6)}
                  {geoState.accuracyMeters && <> · Accuracy: ~{Math.round(geoState.accuracyMeters)}m</>}
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
                  onClick={() => setStep(geoState?.source === "device_gps" ? "choose_method" : "map_confirm")}
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
