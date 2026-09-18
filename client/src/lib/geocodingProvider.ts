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
  // Legacy constructors can throw for newer API keys (Google disabled
  // AutocompleteService for new customers Mar 2025) — never let a lazy
  // singleton break the whole provider.
  try {
    if (!autocompleteService && window.google.maps.places?.AutocompleteService) {
      autocompleteService = new window.google.maps.places.AutocompleteService();
    }
  } catch {
    autocompleteService = null;
  }
  if (!geocoder) {
    geocoder = new window.google.maps.Geocoder();
  }
  return true;
}

/**
 * Places API (New): AutocompleteSuggestion. Required for keys created after
 * Mar 2025 — legacy AutocompleteService is unavailable to them. Returns null
 * when the new API can't run so callers can fall back.
 */
async function fetchAutocompleteNew(
  query: string,
  bias?: { lat: number; lng: number; radiusM?: number },
): Promise<PlaceSearchResult[] | null> {
  try {
    const ns = window.google.maps.places as unknown as Record<string, any>;
    const Suggestion = ns?.AutocompleteSuggestion;
    if (!Suggestion?.fetchAutocompleteSuggestions) return null;
    const req: Record<string, unknown> = { input: query, includedRegionCodes: ["in"] };
    if (bias && Number.isFinite(bias.lat) && Number.isFinite(bias.lng)) {
      req.locationBias = {
        center: { lat: bias.lat, lng: bias.lng },
        radius: bias.radiusM ?? 30000,
      };
    }
    const { suggestions } = await Suggestion.fetchAutocompleteSuggestions(req);
    const out: PlaceSearchResult[] = [];
    for (const s of suggestions ?? []) {
      const pred = s?.placePrediction;
      const pid = pred?.placeId;
      const text = pred?.text;
      const desc = typeof text === "string" ? text : text?.text;
      if (pid && desc) out.push({ description: String(desc), placeId: String(pid) });
    }
    return out;
  } catch {
    return null;
  }
}

/** Legacy autocomplete (old keys only) — null-safe, never throws. */
async function fetchAutocompleteLegacy(
  query: string,
  bias?: { lat: number; lng: number; radiusM?: number },
): Promise<PlaceSearchResult[] | null> {
  try {
    if (!autocompleteService) return null;
    const request: google.maps.places.AutocompletionRequest = {
      input: query,
      componentRestrictions: { country: "in" },
    };
    if (bias && Number.isFinite(bias.lat) && Number.isFinite(bias.lng)) {
      request.location = new window.google.maps.LatLng(bias.lat, bias.lng);
      request.radius = bias.radiusM ?? 30000;
    }
    const predictions = await new Promise<google.maps.places.AutocompletePrediction[] | null>((resolve) => {
      try {
        autocompleteService!.getPlacePredictions(request, (result, status) => {
          if (status !== window.google.maps.places.PlacesServiceStatus.OK || !result) {
            resolve(null);
            return;
          }
          resolve(result);
        });
      } catch {
        resolve(null);
      }
    });
    return (predictions ?? []).map((p) => ({
      description: p.description,
      placeId: p.place_id,
    }));
  } catch {
    return null;
  }
}

const reverseGeocodeCache = new Map<string, Partial<GeocodeResult>>();

export async function searchPlaces(
  query: string,
  bias?: { lat: number; lng: number; radiusM?: number },
): Promise<PlaceSearchResult[]> {
  if (!query.trim()) return [];
  // Fail loudly (not empty) when Maps never loaded — the drawer shows a
  // "maps unavailable" message instead of a misleading "no places found".
  if (!ensureGoogleMaps()) throw new Error("MAPS_UNAVAILABLE");

  // NOTE: no `types` filter. `types: ["geocode"]` restricts results to street
  // addresses and silently drops establishments — apartment complexes,
  // societies and named buildings live in Google's POI database, so typing
  // an apartment name returned nothing. Unfiltered + country restriction +
  // location bias returns both addresses and places.
  // Order: new API (works on all keys) → legacy (old keys) → text search.
  const fresh = await fetchAutocompleteNew(query, bias);
  if (fresh && fresh.length > 0) return fresh;

  const legacy = await fetchAutocompleteLegacy(query, bias);
  if (legacy && legacy.length > 0) return legacy;

  // Fallback: full text search catches named buildings the autocomplete
  // index misses (new societies, alternate spellings).
  return textSearchFallback(query, bias);
}

/** Places Text Search fallback for named buildings autocomplete misses. */
async function textSearchFallback(
  query: string,
  bias?: { lat: number; lng: number; radiusM?: number },
): Promise<PlaceSearchResult[]> {
  try {
    const { Place } = window.google.maps.places;
    const req: google.maps.places.SearchByTextRequest = {
      textQuery: query,
      fields: ["id", "displayName"],
      maxResultCount: 5,
    };
    if (bias && Number.isFinite(bias.lat) && Number.isFinite(bias.lng)) {
      req.locationBias = new window.google.maps.LatLng(bias.lat, bias.lng);
    }
    const { places } = await Place.searchByText(req);
    return (places ?? []).flatMap((p) => {
      const name = typeof p.displayName === "string" ? p.displayName : p.displayName;
      if (!p.id || !name) return [];
      return [{ description: String(name), placeId: p.id }];
    });
  } catch {
    return [];
  }
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
