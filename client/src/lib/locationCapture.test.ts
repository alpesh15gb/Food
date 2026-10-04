import { describe, expect, it } from "vitest";
import {
  capturePreciseLocation,
  classifyAccuracy,
  effectiveAccuracy,
  isValidCoordinate,
  requiresMapConfirmation,
  weightedMedian,
  describeAccuracy,
  type Fix,
} from "./locationCapture";

const fix = (latitude: number, longitude: number, accuracyMeters: number | null, timestampMs = 0): Fix => ({
  latitude,
  longitude,
  accuracyMeters,
  timestampMs,
});

describe("classifyAccuracy", () => {
  it("bands metres the way the server does", () => {
    expect(classifyAccuracy(10)).toBe("HIGH");
    expect(classifyAccuracy(40)).toBe("GOOD");
    expect(classifyAccuracy(80)).toBe("LOW");
    expect(classifyAccuracy(400)).toBe("POOR");
  });

  it("treats a missing accuracy as unknown rather than perfect", () => {
    expect(classifyAccuracy(null)).toBe("UNKNOWN");
    expect(classifyAccuracy(undefined)).toBe("UNKNOWN");
    expect(classifyAccuracy(0)).toBe("UNKNOWN");
  });

  it("forces map confirmation for anything below GOOD", () => {
    expect(requiresMapConfirmation("HIGH")).toBe(false);
    expect(requiresMapConfirmation("GOOD")).toBe(false);
    expect(requiresMapConfirmation("LOW")).toBe(true);
    expect(requiresMapConfirmation("POOR")).toBe(true);
    expect(requiresMapConfirmation("UNKNOWN")).toBe(true);
  });
});

describe("isValidCoordinate", () => {
  it("rejects out-of-range and the null-island sentinel", () => {
    expect(isValidCoordinate(17.4, 78.4)).toBe(true);
    expect(isValidCoordinate(91, 0)).toBe(false);
    expect(isValidCoordinate(0, 181)).toBe(false);
    expect(isValidCoordinate(Number.NaN, 78)).toBe(false);
    expect(isValidCoordinate(0, 0)).toBe(false);
    expect(isValidCoordinate("17", 78)).toBe(false);
  });
});

describe("weightedMedian", () => {
  it("returns the single sample when only one exists", () => {
    expect(weightedMedian([fix(17.4, 78.4, 10)])).toEqual({ latitude: 17.4, longitude: 78.4 });
  });

  it("returns null for no samples", () => {
    expect(weightedMedian([])).toBeNull();
  });

  it("discards a low-weight outlier instead of averaging it in", () => {
    // Three good fixes on the same street, plus one stray 300m to the east whose
    // declared accuracy is terrible. A mean would drag the answer ~75m east.
    const samples = [
      fix(17.4000, 78.4000, 10),
      fix(17.4001, 78.4001, 12),
      fix(17.3999, 78.3999, 11),
      fix(17.4000, 78.4027, 2000),
    ];
    const centre = weightedMedian(samples)!;
    expect(centre.longitude).toBeLessThan(78.401);
    expect(centre.latitude).toBeCloseTo(17.4, 2);
  });

  it("weights by precision, not by count: two sharp fixes beat three vague ones", () => {
    // Accuracy weighting is the whole point of a weighted median. A plain majority
    // vote would hand the answer to the cluster of three ~900m-accuracy fixes.
    const samples = [
      fix(17.4000, 78.4000, 8),
      fix(17.4001, 78.4001, 8),
      fix(17.4000, 78.4030, 900),
      fix(17.4000, 78.4029, 900),
      fix(17.4000, 78.4031, 900),
    ];
    const centre = weightedMedian(samples)!;
    expect(centre.longitude).toBeLessThan(78.401);
    expect(centre.longitude).toBeGreaterThan(78.3999);
  });

  it("follows the majority when the samples are equally precise", () => {
    const samples = [
      fix(17.4000, 78.4000, 50),
      fix(17.4000, 78.4030, 50),
      fix(17.4000, 78.4031, 50),
    ];
    expect(weightedMedian(samples)!.longitude).toBeGreaterThan(78.402);
  });
});

describe("effectiveAccuracy", () => {
  it("is null with no samples", () => {
    expect(effectiveAccuracy([])).toBeNull();
  });

  it("widens the declared accuracy by the observed spread", () => {
    // Device claims 5m, but the fixes are ~110m apart. Trusting the claim alone
    // would show "precise" for a 100m-scattered result.
    const samples = [fix(17.4000, 78.4000, 5), fix(17.4010, 78.4000, 5)];
    const accuracy = effectiveAccuracy(samples)!;
    expect(accuracy).toBeGreaterThan(100);
  });

  it("keeps the declared accuracy when the samples agree", () => {
    const samples = [fix(17.4000, 78.4000, 8), fix(17.40001, 78.40001, 9)];
    expect(effectiveAccuracy(samples)).toBe(8);
  });
});

describe("capturePreciseLocation", () => {
  it("escalates to the IP fallback when geolocation is unsupported", async () => {
    const result = await capturePreciseLocation({
      geolocation: null,
      ipFallback: async () => ({ latitude: 17.4, longitude: 78.4, accuracyMeters: 20000 }),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.method).toBe("network_ip");
      expect(result.sampleCount).toBe(0);
      expect(result.level).toBe("POOR");
      // A network pin must never be presented as confident.
      expect(requiresMapConfirmation(result.level)).toBe(true);
    }
  });

  it("reports a denial when there is also no IP fallback to offer", async () => {
    const result = await capturePreciseLocation({ geolocation: null });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("unsupported");
      expect(result.message).toMatch(/cannot share your location/i);
    }
  });

  it("collects multiple samples and reduces them to a weighted median", async () => {
    const emitted: Array<{ latitude: number; longitude: number; accuracy: number }> = [
      { latitude: 17.4, longitude: 78.4, accuracy: 12 },
      { latitude: 17.4002, longitude: 78.4001, accuracy: 14 },
      { latitude: 17.3999, longitude: 78.3999, accuracy: 11 },
    ];
    let cleared = false;
    const result = await capturePreciseLocation({
      targetSamples: 3,
      budgetMs: 500,
      geolocation: {
        watchPosition: (success) => {
          emitted.forEach((coords, i) => success({ coords, timestamp: i } as never));
          return 7 as unknown as number;
        },
        clearWatch: () => {
          cleared = true;
        },
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.method).toBe("gps_multi_sample");
      expect(result.sampleCount).toBe(3);
      expect(result.longitude).toBeCloseTo(78.4, 2);
      // The watch must be torn down, or the capture leaks a live GPS subscription.
      expect(cleared).toBe(true);
    }
  });

  it("never uses a cached fix: it always requests maximumAge 0", async () => {
    const seen: Array<{ maximumAge?: number; enableHighAccuracy?: boolean }> = [];
    await capturePreciseLocation({
      targetSamples: 1,
      budgetMs: 300,
      geolocation: {
        getCurrentPosition: (success, _error, options) => {
          seen.push(options ?? {});
          success({ coords: { latitude: 17.4, longitude: 78.4, accuracy: 10 }, timestamp: 1 } as never);
          return 0 as unknown as number;
        },
        clearWatch: () => {},
      },
    });
    expect(seen.length).toBeGreaterThan(0);
    for (const opts of seen) expect(opts.maximumAge).toBe(0);
  });

  it("escalates to a coarse fix when the precise phase yields nothing", async () => {
    const requests: Array<{ enableHighAccuracy?: boolean }> = [];
    const result = await capturePreciseLocation({
      targetSamples: 1,
      budgetMs: 200,
      geolocation: {
        watchPosition: (_success, error) => {
          requests.push({ enableHighAccuracy: true });
          error?.({ code: 2, message: "unavailable" });
          requests.push({ enableHighAccuracy: false });
          return 3 as unknown as number;
        },
        clearWatch: () => {},
      },
    });
    // The precise attempt errored, so the fix must come from the coarse attempt —
    // which emits nothing here, so the ladder ends at the IP fallback / failure.
    expect(requests[0]?.enableHighAccuracy).toBe(true);
    expect(requests[1]?.enableHighAccuracy).toBe(false);
    expect(result.ok).toBe(false);
  });
});

describe("describeAccuracy", () => {
  it("tells the customer to verify an imprecise fix", () => {
    expect(describeAccuracy("POOR", 400)).toMatch(/drag the pin/i);
    expect(describeAccuracy("LOW", 80)).toMatch(/correct it/i);
    expect(describeAccuracy("HIGH", 10)).toMatch(/precise/i);
  });
});