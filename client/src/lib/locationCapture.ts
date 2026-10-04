/**
 * Precise location capture.
 *
 * A single `getCurrentPosition()` call is what most apps use and it is what makes
 * addresses land on the wrong floor. Zomato's own engineering write-up on the topic
 * reports average GPS accuracy of 60–150m on mid-range devices — and up to 2–3km in
 * bad conditions — and describes how they work around it. Three habits from that
 * write-up are implemented here:
 *
 *  1. Take SEVERAL fixes and reduce them to a weighted median. One sample can be a
 *     stray fix from a neighbouring tower; a weighted median discards outliers that
 *     a naive average would smear into the middle of the street.
 *  2. Escalate rather than fail. A high-accuracy request times out on plenty of
 *     devices; a coarse request almost always succeeds quickly. Try high accuracy,
 *     then coarse, then fall back to the network (IP) location — and always let the
 *     customer correct the result.
 *  3. Never present a low-confidence fix as an answer. The accuracy that comes back
 *     with the fix drives both the UI copy and whether the map is forced open.
 *
 * Nothing here trusts itself: every coordinate is validated before it is returned,
 * and an unknown accuracy is treated as unusable rather than perfect.
 */

export type AccuracyLevel = "HIGH" | "GOOD" | "LOW" | "POOR" | "UNKNOWN";

export type Fix = {
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  timestampMs: number;
};

export type CaptureResult =
  | {
      ok: true;
      latitude: number;
      longitude: number;
      accuracyMeters: number | null;
      level: AccuracyLevel;
      /** How the fix was obtained, surfaced in the UI. */
      method: "gps_multi_sample" | "gps_single" | "gps_coarse" | "network_ip";
      sampleCount: number;
    }
  | { ok: false; reason: CaptureFailure; message: string };

export type CaptureFailure = "unsupported" | "denied" | "unavailable" | "timeout" | "no_fix";

const FAILURE_MESSAGES: Record<CaptureFailure, string> = {
  unsupported: "This browser cannot share your location. Search for your address instead.",
  denied: "Location access is blocked. Allow it in your browser settings, or search for your address.",
  unavailable: "We could not read your device's location. Search for your address instead.",
  timeout: "Your location took too long to load. Try again, or search for your address.",
  no_fix: "We could not get a usable GPS fix. Search for your address or place a pin.",
};

/**
 * Map a W3C `GeolocationPositionError.code` to our failure taxonomy.
 *
 * The error callback used to ignore the code entirely and treat every error as
 * "no samples", so a customer who had explicitly DENIED location permission was
 * told "We could not get a usable GPS fix" — and the app then burned the full
 * ~9 s budget escalating to a coarse fix and an IP lookup that could never
 * succeed either. Reporting the real cause lets the UI say the actionable thing
 * ("allow it in your browser settings") and stop escalating for a permission
 * that will never be granted.
 */
export function failureFromGeolocationError(
  err: { code?: number } | null | undefined
): CaptureFailure {
  switch (err?.code) {
    case 1:
      return "denied";
    case 2:
      return "unavailable";
    case 3:
      return "timeout";
    default:
      return "no_fix";
  }
}

/** Accuracy bands, in metres. Mirrors the server's own classification. */
export function classifyAccuracy(meters: number | null | undefined): AccuracyLevel {
  if (meters == null || !Number.isFinite(meters) || meters <= 0) return "UNKNOWN";
  if (meters <= 20) return "HIGH";
  if (meters <= 50) return "GOOD";
  if (meters <= 100) return "LOW";
  return "POOR";
}

/** A fix this coarse must be confirmed on the map before it reaches an address form. */
export function requiresMapConfirmation(level: AccuracyLevel): boolean {
  return level === "LOW" || level === "POOR" || level === "UNKNOWN";
}

export function isValidCoordinate(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180 &&
    // Null Island is the classic "the fix failed" sentinel.
    !(lat === 0 && lng === 0)
  );
}

/**
 * Weighted median across samples.
 *
 * Each fix is weighted by how precise it claims to be (1/accuracy). Sorting by
 * longitude and walking the cumulative weight to the halfway point gives a centre
 * that ignores the sparse, badly-accurate outliers a plain average would absorb.
 */
export function weightedMedian(fixes: Fix[]): { latitude: number; longitude: number } | null {
  if (fixes.length === 0) return null;
  if (fixes.length === 1) return { latitude: fixes[0].latitude, longitude: fixes[0].longitude };

  // Weight each fix by how precise it claims to be. An ABSENT or zero accuracy
  // (both legal: the spec defines accuracy 0 as "unknown") must not be treated as
  // maximally precise. It previously fell back to weight 1 — the same weight as a
  // 1-metre fix — so one unknown-accuracy fix could outvote a cluster of coarse
  // fixes and drag the centre onto an outlier, contradicting the module's own
  // stated invariant. Unknown accuracy now gets the WEAKEST weight.
  const UNKNOWN_ACCURACY_WEIGHT = 1e-6;
  const weightOf = (f: Fix) =>
    f.accuracyMeters != null && Number.isFinite(f.accuracyMeters) && f.accuracyMeters > 0
      ? 1 / f.accuracyMeters
      : UNKNOWN_ACCURACY_WEIGHT;

  const byLng = [...fixes].sort((a, b) => a.longitude - b.longitude);
  const totalWeight = byLng.reduce((sum, f) => sum + weightOf(f), 0);
  const half = totalWeight / 2;
  let running = 0;
  let medianLng = byLng[byLng.length - 1].longitude;
  for (const f of byLng) {
    running += weightOf(f);
    if (running >= half) {
      medianLng = f.longitude;
      break;
    }
  }

  // Take the samples closest to the chosen longitude and median their latitude.
  const near = fixes
    .filter((f) => Math.abs(f.longitude - medianLng) <= 0.0005)
    .sort((a, b) => a.latitude - b.latitude);
  const medianLat = near.length
    ? near[Math.floor((near.length - 1) / 2)].latitude
    : fixes.map((f) => f.latitude).sort((a, b) => a - b)[Math.floor((fixes.length - 1) / 2)];

  return { latitude: medianLat, longitude: medianLng };
}

/**
 * Best accuracy across samples, widened by the spread of the accepted samples.
 *
 * A device can report "accurate to 5m" while three fixes sit 200m apart; reporting
 * the spread is what stops a wrong address being presented as a confident one.
 */
export function effectiveAccuracy(fixes: Fix[]): number | null {
  if (fixes.length === 0) return null;
  const declared = fixes
    .map((f) => f.accuracyMeters)
    .filter((a): a is number => typeof a === "number" && Number.isFinite(a) && a > 0);
  const best = declared.length ? Math.min(...declared) : null;
  if (fixes.length < 2) return best;

  const lats = fixes.map((f) => f.latitude);
  const lngs = fixes.map((f) => f.longitude);
  const spreadMeters =
    Math.max(...lats.map((l) => Math.abs(l - Math.min(...lats)))) * 111_320;
  const spreadLng =
    Math.max(...lngs.map((l) => Math.abs(l - Math.min(...lngs)))) * 111_320 * Math.cos((Math.max(...lats) * Math.PI) / 180);
  const spread = Math.hypot(spreadMeters, Number.isFinite(spreadLng) ? spreadLng : 0);

  return best == null ? Math.round(spread) : Math.round(Math.max(best, spread));
}

/**
 * Minimal structural shape of a W3C Geolocation fix. Declared locally rather than
 * using the DOM `Position` type so this module stays unit-testable in a plain Node
 * environment with no DOM lib and no injection framework.
 */
type PositionLike = {
  coords: { latitude: number; longitude: number; accuracy?: number | null };
  timestamp: number;
};

type GeolocationLike = {
  getCurrentPosition?: (
    success: (pos: PositionLike) => void,
    error?: (err: { code?: number; message?: string }) => void,
    options?: { enableHighAccuracy?: boolean; timeout?: number; maximumAge?: number },
  ) => number;
  watchPosition?: (
    success: (pos: PositionLike) => void,
    error?: (err: { code?: number; message?: string }) => void,
    options?: { enableHighAccuracy?: boolean; timeout?: number; maximumAge?: number },
  ) => number;
  clearWatch?: (id: number) => void;
};

export type CaptureOptions = {
  /** Resolves an approximate location from the caller's network (IP). */
  ipFallback?: () => Promise<{ latitude: number; longitude: number; accuracyMeters?: number } | null>;
  /** Overall budget for the GPS phase. */
  budgetMs?: number;
  targetSamples?: number;
  /** Injected for tests. */
  geolocation?: GeolocationLike | null;
};

const DEFAULT_BUDGET_MS = 9000;
const DEFAULT_SAMPLES = 3;

/**
 * Acquire the best location we can, escalating rather than failing.
 */
export async function capturePreciseLocation(
  options: CaptureOptions = {},
): Promise<CaptureResult> {
  const geo = (options.geolocation !== undefined
    ? options.geolocation
    : typeof navigator !== "undefined"
      ? (navigator.geolocation as unknown as GeolocationLike | undefined) ?? null
    : null) ?? null;

  const budgetMs = options.budgetMs ?? DEFAULT_BUDGET_MS;
  const targetSamples = Math.max(1, options.targetSamples ?? DEFAULT_SAMPLES);

  // Either API is enough: watchPosition is preferred (it is what enables multi-sample),
  // but a browser that only exposes the one-shot call must still work.
  const hasAnyApi = typeof geo?.getCurrentPosition === "function" || typeof geo?.watchPosition === "function";
  if (!geo || !hasAnyApi) {
    return await ipFallback(options, "unsupported");
  }

  // Phase 1 — multi-sample high-accuracy fix.
  const precise = await collectSamples(geo, targetSamples, budgetMs * 0.6, true);
  if (precise.fixes.length > 0) {
    return finish(precise.fixes, precise.fixes.length >= targetSamples ? "gps_multi_sample" : "gps_single");
  }

  // A denied permission will never be granted by retrying, so stop escalating
  // and tell the customer the actionable thing instead of burning the remaining
  // budget on a coarse fix and an IP lookup that cannot succeed either.
  if (precise.failure === "denied") {
    return { ok: false, reason: "denied", message: FAILURE_MESSAGES.denied };
  }

  // Phase 2 — coarse fix. Fast, near-universally available, often only accurate to
  // a few hundred metres — which the UI is told about rather than hidden.
  const coarse = await collectSamples(geo, 1, budgetMs * 0.4, false);
  if (coarse.fixes.length > 0) {
    return finish(coarse.fixes, "gps_coarse");
  }

  // Report the real cause when the provider gave us one, rather than always
  // claiming a generic missing fix.
  return await ipFallback(options, coarse.failure ?? precise.failure ?? "no_fix");
}

function finish(fixes: Fix[], method: CaptureResult extends { ok: true } ? never : string): CaptureResult {
  const centre = weightedMedian(fixes);
  if (!centre || !isValidCoordinate(centre.latitude, centre.longitude)) {
    return { ok: false, reason: "no_fix", message: FAILURE_MESSAGES.no_fix };
  }
  return {
    ok: true,
    latitude: centre.latitude,
    longitude: centre.longitude,
    accuracyMeters: effectiveAccuracy(fixes),
    level: classifyAccuracy(effectiveAccuracy(fixes)),
    method: method as "gps_multi_sample",
    sampleCount: fixes.length,
  };
}

/**
 * Take up to `count` fixes within `windowMs`.
 *
 * `maximumAge: 0` matters — the previous implementation allowed a 30-second-old
 * cached fix and reported it as fresh, which is exactly how a customer ends up on a
 * map pin from their lunch break.
 */
function collectSamples(
  geo: GeolocationLike,
  count: number,
  windowMs: number,
  enableHighAccuracy: boolean,
): Promise<{ fixes: Fix[]; failure: CaptureFailure | null }> {
  return new Promise((resolve) => {
    const fixes: Fix[] = [];
    let watchId: number | null = null;
    let settled = false;
    let failure: CaptureFailure | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const clearTimer = () => {
      if (timer != null) {
        clearTimeout(timer);
        timer = undefined;
      }
    };
    const clearWatch = (id: number) => {
      try {
        geo.clearWatch?.(id);
      } catch {
        /* already cleared */
      }
    };

    const done = (err?: { code?: number } | null) => {
      if (settled) return;
      settled = true;
      if (err) failure = failureFromGeolocationError(err);
      clearTimer();
      if (watchId != null) clearWatch(watchId);
      resolve({ fixes, failure });
    };

    const onFix = (pos: PositionLike) => {
      const { latitude, longitude, accuracy } = pos.coords;
      if (!isValidCoordinate(latitude, longitude)) return;
      fixes.push({
        latitude,
        longitude,
        accuracyMeters: typeof accuracy === "number" && Number.isFinite(accuracy) ? accuracy : null,
        timestampMs: pos.timestamp,
      });
      if (fixes.length >= count) done();
    };

    timer = setTimeout(done, windowMs);

    try {
      if (typeof geo.watchPosition === "function") {
        const id = geo.watchPosition(onFix, (err) => done(err), {
          enableHighAccuracy,
          timeout: windowMs,
          maximumAge: 0,
        });
        // Some devices emit their buffered fixes synchronously, so `done()` can run
        // BEFORE this assignment. Releasing the subscription has to happen either way
        // or the capture leaks a live GPS watch.
        if (settled) clearWatch(id);
        else watchId = id;
      } else {
        geo.getCurrentPosition!(
          onFix,
          (err) => done(err),
          { enableHighAccuracy, timeout: windowMs, maximumAge: 0 },
        );
      }
    } catch {
      done();
    }
  });
}

async function ipFallback(
  options: CaptureOptions,
  failure: CaptureFailure,
): Promise<CaptureResult> {
  if (options.ipFallback) {
    try {
      const approx = await options.ipFallback();
      if (approx && isValidCoordinate(approx.latitude, approx.longitude)) {
        const accuracyMeters = approx.accuracyMeters ?? 20000;
        return {
          ok: true,
          latitude: approx.latitude,
          longitude: approx.longitude,
          accuracyMeters,
          level: classifyAccuracy(accuracyMeters),
          method: "network_ip",
          sampleCount: 0,
        };
      }
    } catch {
      /* fall through to the hard failure below */
    }
  }
  return { ok: false, reason: failure, message: FAILURE_MESSAGES[failure] };
}

/** Human-readable confidence copy. Shown next to the pin, not hidden from the user. */
export function describeAccuracy(level: AccuracyLevel, meters: number | null): string {
  const rounded = meters == null ? null : Math.round(meters);
  switch (level) {
    case "HIGH":
      return "Location is precise.";
    case "GOOD":
      return rounded ? `Location is accurate to about ${rounded} m.` : "Location is reasonably accurate.";
    case "LOW":
      return rounded
        ? `Your device's location is only accurate to about ${rounded} m. Please check the pin and correct it.`
        : "Your device's location is imprecise. Please check the pin and correct it.";
    case "POOR":
      return "Your device could not get a precise fix. Please drag the pin to your exact location.";
    default:
      return "We could not determine how precise this location is. Please confirm the pin.";
  }
}

export { FAILURE_MESSAGES };