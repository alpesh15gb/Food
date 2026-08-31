/// <reference types="@types/google.maps" />

/**
 * Geocoding Provider — abstracts Google Places/Geocoder behind a stable interface.
 * Reverse geocode falls back to Nominatim only for manually-triggered calls.
 * Never use Nominatim for autocomplete (violates usage policy).
 */

export interface PlaceSearchResult {
  description: string;
  placeId: string;
  lat?: number;
  lng?: number;
}

export interface GeocodeResult {
  latitude: number;
  longitude: number;
  formattedAddress?: string;
  area?: string;
  city?: string;
  postalCode?: string;
  street?: string;
  placeId?: string;
}

let autocompleteService: google.maps.places.AutocompleteService | null = null;
let geocoder: google.maps.Geocoder | null = null;
let placesService: google.maps.places.PlacesService | null = null;

function ensureGoogleMaps(): boolean {
  if (!window.google?.maps) return false;
  if (!autocompleteService) {
    autocompleteService = new window.google.maps.places.AutocompleteService();
  }
  if (!geocoder) {
    geocoder = new window.google.maps.Geocoder();
  }
  return true;
}

const reverseGeocodeCache = new Map<string, Partial<GeocodeResult>>();

export async function searchPlaces(query: string): Promise<PlaceSearchResult[]> {
  if (!query.trim() || !ensureGoogleMaps()) return [];

  return new Promise((resolve) => {
    autocompleteService!.getPlacePredictions(
      { input: query, types: ["geocode"], componentRestrictions: { country: "in" } },
      (predictions, status) => {
        if (status !== window.google.maps.places.PlacesServiceStatus.OK || !predictions) {
          resolve([]);
          return;
        }
        resolve(
          predictions.map((p) => ({
            description: p.description,
            placeId: p.place_id,
          }))
        );
      }
    );
  });
}

export async function getPlaceDetails(placeId: string): Promise<GeocodeResult | null> {
  if (!ensureGoogleMaps()) return null;

  const place = new window.google.maps.places.Place({ id: placeId });
  try {
    await place.fetchFields({ fields: ["location", "displayName", "addressComponents"] });
    const loc = place.location;
    if (!loc) return null;

    const result: GeocodeResult = {
      latitude: loc.lat(),
      longitude: loc.lng(),
      placeId,
      formattedAddress: place.displayName ?? undefined,
    };

    const components = place.addressComponents;
    if (components) {
      for (const comp of components) {
        const types = comp.types;
        if (types.includes("locality") || types.includes("postal_town")) {
          result.city = comp.longText ?? undefined;
        } else if (types.includes("sublocality") || types.includes("neighborhood")) {
          result.area = comp.longText ?? undefined;
        } else if (types.includes("postal_code")) {
          result.postalCode = comp.longText ?? undefined;
        } else if (types.includes("route")) {
          result.street = comp.longText ?? undefined;
        }
      }
    }

    return result;
  } catch {
    return null;
  }
}

export async function reverseGeocode(lat: number, lng: number): Promise<Partial<GeocodeResult>> {
  const cacheKey = `${lat.toFixed(5)},${lng.toFixed(5)}`;
  const cached = reverseGeocodeCache.get(cacheKey);
  if (cached) return cached;

  if (ensureGoogleMaps()) {
    return new Promise((resolve) => {
      geocoder!.geocode({ location: { lat, lng } }, (results, status) => {
        if (status !== "OK" || !results?.[0]) {
          resolve(fallbackNominatimReverse(lat, lng));
          return;
        }

        const result: GeocodeResult = {
          latitude: lat,
          longitude: lng,
          formattedAddress: results[0].formatted_address,
        };

        for (const comp of results[0].address_components) {
          if (comp.types.includes("locality") || comp.types.includes("postal_town")) {
            result.city = comp.long_name;
          } else if (comp.types.includes("sublocality") || comp.types.includes("neighborhood")) {
            result.area = comp.long_name;
          } else if (comp.types.includes("postal_code")) {
            result.postalCode = comp.long_name;
          } else if (comp.types.includes("route")) {
            result.street = comp.long_name;
          }
        }

        reverseGeocodeCache.set(cacheKey, result);
        resolve(result);
      });
    });
  }

  return fallbackNominatimReverse(lat, lng);
}

async function fallbackNominatimReverse(lat: number, lng: number): Promise<Partial<GeocodeResult>> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=18`,
      { headers: { "Accept-Language": "en" } }
    );
    if (!res.ok) return {};
    const data = await res.json();
    const addr = data.address ?? {};
    const result: Partial<GeocodeResult> = {
      latitude: lat,
      longitude: lng,
      area: addr.suburb ?? addr.neighbourhood ?? addr.quarter ?? addr.city_district ?? undefined,
      city: addr.city ?? addr.town ?? addr.village ?? undefined,
      postalCode: addr.postcode ?? undefined,
      street: addr.road ?? undefined,
    };
    const cacheKey = `${lat.toFixed(5)},${lng.toFixed(5)}`;
    reverseGeocodeCache.set(cacheKey, result);
    return result;
  } catch {
    return {};
  }
}
