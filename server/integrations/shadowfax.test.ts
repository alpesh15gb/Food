/**
 * Shadowfax Unified API tests (spec sections 45-46).
 * Pure unit tests against the documented contract — no network, no DB.
 * fetch is stubbed per-test; env is saved/restored around token tests.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  shadowfaxAuthHeader,
  isPincodeMarkedServiceable,
  mapOrderFinancialsToShadowfax,
  buildShadowfaxCreatePayload,
  mapShadowfaxStatusToDeliveryStatus,
  mapDeliveryStatusToOrderStatus,
  buildWebhookDedupeKey,
  normalizeShadowfaxWebhook,
  validatePincode,
  validateIndianPhone,
  resolveIndianState,
  getDeliveryProvider,
  ShadowfaxValidationError,
  ShadowfaxDuplicateOrderError,
  ShadowfaxTimeoutError,
} from "./shadowfax";
import { isValidShadowfaxCallbackSecret } from "./webhookVerify";

const ENV_KEYS = ["SHADOWFAX_ENABLED", "SHADOWFAX_TOKEN", "SHADOWFAX_API_BASE_URL"] as const;
let savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  savedEnv = {};
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
  process.env.SHADOWFAX_ENABLED = "true";
  process.env.SHADOWFAX_TOKEN = "test-token-123";
  delete process.env.SHADOWFAX_API_BASE_URL;
  vi.unstubAllGlobals();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  vi.unstubAllGlobals();
});

function stubFetchJson(json: unknown, status = 200) {
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => json,
  })));
}

const baseInput = {
  clientOrderId: "ORD-TEST-000001",
  paymentMode: "Prepaid" as const,
  productValue: 590,
  totalAmount: 649,
  codAmount: 0,
  customer: {
    name: "Rahul Sharma", contact: "9810273645",
    addressLine1: "Flat 302, ABC Apartments", addressLine2: "Near Central Mall",
    city: "Bengaluru", state: "Karnataka", pincode: "560034",
    latitude: 12.9352, longitude: 77.6245,
  },
  pickup: {
    name: "Test Kitchen", contact: "9810273646",
    addressLine1: "12, 80 Feet Road", addressLine2: "Koramangala",
    city: "Bengaluru", state: "Karnataka", pincode: "560038",
    latitude: 12.9784, longitude: 77.6408, uniqueCode: "REST_abc",
  },
  rts: {
    name: "Test Kitchen", contact: "9810273646",
    addressLine1: "12, 80 Feet Road", addressLine2: "Koramangala",
    city: "Bengaluru", state: "Karnataka", pincode: "560038",
    latitude: 12.9784, longitude: 77.6408, uniqueCode: "REST_abc",
  },
  items: [{ skuId: "ITEM_101", skuName: "Margherita Pizza", category: "Food", price: 399, quantity: 1 }],
};

describe("authorization header (spec C)", () => {
  it("is exactly `Token <token>`, never Bearer", () => {
    const h = shadowfaxAuthHeader("abc123");
    expect(h.Authorization).toBe("Token abc123");
    expect(h.Authorization).not.toContain("Bearer");
    expect(h["Content-Type"]).toBe("application/json");
  });
});

describe("serviceability mapping (spec A)", () => {
  it("treats explicit serviceable:true as serviceable", () => {
    expect(isPincodeMarkedServiceable({ data: [{ pincode: "560034", serviceable: true }] }, "560034")).toBe(true);
  });
  it("treats serviceable:false as not serviceable", () => {
    expect(isPincodeMarkedServiceable({ data: [{ pincode: "560034", serviceable: false }] }, "560034")).toBe(false);
  });
  it("fails closed on unknown shapes (never assumes serviceable)", () => {
    expect(isPincodeMarkedServiceable({}, "560034")).toBe(false);
    expect(isPincodeMarkedServiceable({ message: "Success" }, "560034")).toBe(false);
    expect(isPincodeMarkedServiceable(null, "560034")).toBe(false);
  });
  it("ignores entries for other pincodes", () => {
    expect(isPincodeMarkedServiceable({ data: [{ pincode: "560001", serviceable: true }] }, "560034")).toBe(false);
  });
  it("end-to-end pair check requires BOTH sides", async () => {
    stubFetchJson({ data: [{ pincode: "560038", serviceable: true }] });
    const provider = getDeliveryProvider();
    // Mock fetch returns same payload for both calls: delivery pincode entry
    // missing → deliveryServiceable false → overall false.
    const res = await provider.checkPincodeServiceability({ pickupPincode: "560038", deliveryPincode: "560034" });
    expect(res.provider).toBe("SHADOWFAX");
    expect(res.pickupServiceable).toBe(true);
    expect(res.deliveryServiceable).toBe(false);
    expect(res.serviceable).toBe(false);
  });
});

describe("financial mapping (spec section 11)", () => {
  it("backs tax out of product_value, keeps fees out", () => {
    // itemTotal 59000 (incl 5% GST) - coupon 0 → 59000/1.05 = 56190.48 paise → Rs 561.9
    const f = mapOrderFinancialsToShadowfax({
      itemTotalPaise: 59000, couponDiscountPaise: 0, gstPercent: 5, totalPaise: 64900, paymentMode: "Prepaid",
    });
    expect(f.productValue).toBeCloseTo(561.9, 1);
    expect(f.totalAmount).toBe(649);
    expect(f.codAmount).toBe(0);
    expect(f.paymentMode).toBe("Prepaid");
  });
  it("COD carries the collectable amount; Prepaid never does", () => {
    const cod = mapOrderFinancialsToShadowfax({
      itemTotalPaise: 59000, gstPercent: 5, totalPaise: 64900, paymentMode: "COD",
    });
    expect(cod.codAmount).toBe(649);
    expect(() => mapOrderFinancialsToShadowfax({
      itemTotalPaise: -5, totalPaise: 100, paymentMode: "Prepaid",
    })).toThrow(ShadowfaxValidationError);
  });
});

describe("create payload (spec sections 7-9)", () => {
  it("builds a marketplace payload with pickup + rts + items", () => {
    const p = buildShadowfaxCreatePayload(baseInput) as Record<string, Record<string, unknown>>;
    expect(p.order_type).toBe("marketplace");
    expect((p.order_details as Record<string, unknown>).client_order_id).toBe("ORD-TEST-000001");
    expect((p.order_details as Record<string, unknown>).payment_mode).toBe("Prepaid");
    expect((p.order_details as Record<string, unknown>).cod_amount).toBe(0);
    expect(p.pickup_details).toBeDefined();
    expect(p.rts_details).toBeDefined();
    expect(Array.isArray(p.product_details)).toBe(true);
  });
  it("rejects empty items, bad pincodes, bad phones, zero value", () => {
    expect(() => buildShadowfaxCreatePayload({ ...baseInput, items: [] })).toThrow(ShadowfaxValidationError);
    expect(() => buildShadowfaxCreatePayload({
      ...baseInput, customer: { ...baseInput.customer, pincode: "123" },
    })).toThrow(/pincode/);
    expect(() => buildShadowfaxCreatePayload({
      ...baseInput, customer: { ...baseInput.customer, contact: "12345" },
    })).toThrow(/contact/);
    expect(() => buildShadowfaxCreatePayload({ ...baseInput, productValue: 0 })).toThrow(/zero/);
    expect(() => buildShadowfaxCreatePayload({ ...baseInput, clientOrderId: " " })).toThrow(/client_order_id/);
  });
  it("rejects invalid phone handling (fake/repeated numbers)", () => {
    expect(validateIndianPhone("6666666666")).toBeNull();
    expect(validateIndianPhone("9876543210")).toBeNull();
    expect(validateIndianPhone("919810273645".slice(-10))).toBe("9810273645");
    expect(validatePincode("500034")).toBe("500034");
    expect(validatePincode("5000")).toBeNull();
  });
  it("resolves states for metros, falls back otherwise", () => {
    expect(resolveIndianState("Hyderabad")).toBe("Telangana");
    expect(resolveIndianState("Bengaluru")).toBe("Karnataka");
    expect(resolveIndianState("Atlantis", "Telangana")).toBe("Telangana");
    expect(resolveIndianState("Atlantis")).toBeNull();
  });
});

describe("create response handling (spec K: HTTP200+Failure, duplicates)", () => {
  it("treats HTTP 200 + message Failure as failure", async () => {
    stubFetchJson({ message: "Failure", data: null });
    const provider = getDeliveryProvider();
    await expect(provider.createDelivery(baseInput)).rejects.toThrow();
  });
  it("recovers the AWB on duplicate echoes", async () => {
    stubFetchJson({ message: "Order already exists", data: { awb_number: "SF610198449AAA" } });
    const provider = getDeliveryProvider();
    const res = await provider.createDelivery(baseInput);
    expect(res.success).toBe(true);
    expect(res.awbNumber).toBe("SF610198449AAA");
    expect(res.duplicateRecovered).toBe(true);
  });
  it("throws Duplicate without AWB", async () => {
    stubFetchJson({ message: "duplicate order" });
    const provider = getDeliveryProvider();
    await expect(provider.createDelivery(baseInput)).rejects.toBeInstanceOf(ShadowfaxDuplicateOrderError);
  });
  it("requires Success + awb_number", async () => {
    stubFetchJson({ message: "Success", data: { awb_number: "SF1", id: 42, status: "new" } });
    const provider = getDeliveryProvider();
    const res = await provider.createDelivery(baseInput);
    expect(res.success).toBe(true);
    expect(res.awbNumber).toBe("SF1");
    expect(res.shadowfaxId).toBe(42);
  });
  it("disabled provider refuses creation (spec Q)", async () => {
    process.env.SHADOWFAX_ENABLED = "false";
    const provider = getDeliveryProvider();
    await expect(provider.createDelivery(baseInput)).rejects.toThrow(/disabled/);
  });
  it("missing token is an authentication error", async () => {
    delete process.env.SHADOWFAX_TOKEN;
    const provider = getDeliveryProvider();
    await expect(provider.createDelivery(baseInput)).rejects.toThrow(/SHADOWFAX_TOKEN/);
  });
  it("provider timeout surfaces as timeout, not a crash", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      const err = new Error("aborted");
      err.name = "AbortError";
      throw err;
    }));
    const provider = getDeliveryProvider();
    await expect(provider.trackDelivery("SF1")).rejects.toBeInstanceOf(ShadowfaxTimeoutError);
  });
});

describe("tracking mapping (spec K)", () => {
  it("stores customer_track_url when returned", async () => {
    stubFetchJson({ order_details: { status: "ofd" }, customer_track_url: "https://track.example/SF1" });
    const provider = getDeliveryProvider();
    const res = await provider.trackDelivery("SF1");
    expect(res.success).toBe(true);
    expect(res.trackingUrl).toBe("https://track.example/SF1");
    expect(res.status).toBe("ofd");
  });
});

describe("cancellation mapping (spec J)", () => {
  it("responseCode 200 → CANCELLED", async () => {
    stubFetchJson({ responseMsg: "Request has been marked as cancelled", responseCode: 200 });
    const provider = getDeliveryProvider();
    const res = await provider.cancelDelivery({ awbNumber: "SF1" });
    expect(res.outcome).toBe("CANCELLED");
  });
  it("responseCode 304 → CANCELLATION_PENDING (not a redirect)", async () => {
    stubFetchJson({ responseMsg: "Request is queued for cancellation.", responseCode: 304 });
    const provider = getDeliveryProvider();
    const res = await provider.cancelDelivery({ awbNumber: "SF1" });
    expect(res.outcome).toBe("CANCELLATION_PENDING");
  });
  it("rejection → FAILED with message", async () => {
    stubFetchJson({ responseMsg: "Already delivered", responseCode: 400 });
    const provider = getDeliveryProvider();
    const res = await provider.cancelDelivery({ awbNumber: "SF1" });
    expect(res.outcome).toBe("FAILED");
    expect(res.error).toContain("Already delivered");
  });
});

describe("status mapping (spec section 20)", () => {
  const cases: Array<[string, string]> = [
    ["new", "REQUESTED"],
    ["assigned_for_seller_pickup", "RIDER_ASSIGNED"],
    ["assigned_for_pickup", "RIDER_ASSIGNED"],
    ["ofp", "RIDER_GOING_TO_PICKUP"],
    ["picked", "PICKED_UP"],
    ["recd_at_rev_hub", "IN_TRANSIT"],
    ["item_manifested", "IN_TRANSIT"],
    ["bag_in_transit", "IN_TRANSIT"],
    ["bag_received", "IN_TRANSIT"],
    ["bag_received_at_via", "IN_TRANSIT"],
    ["recd_at_fwd_dc", "IN_TRANSIT"],
    ["recd_at_fwd_hub", "IN_TRANSIT"],
    ["assigned_for_delivery", "RIDER_ASSIGNED"],
    ["ofd", "OUT_FOR_DELIVERY"],
    ["delivered", "DELIVERED"],
    ["cancelled_by_customer", "CANCELLED"],
    ["cancelled_by_seller", "CANCELLED"],
    ["rts", "RETURNING_TO_RESTAURANT"],
    ["rts_in_process", "RETURNING_TO_RESTAURANT"],
    ["in_transit_return", "RETURNING_TO_RESTAURANT"],
    ["rts_ofd", "RETURNING_TO_RESTAURANT"],
    ["rts_d", "RETURNED"],
    ["rts_nd", "DELIVERY_EXCEPTION"],
    ["nc", "DELIVERY_EXCEPTION"],
    ["na", "DELIVERY_EXCEPTION"],
    ["pickup_not_attempted", "DELIVERY_EXCEPTION"],
    ["pickup_on_hold", "DELIVERY_EXCEPTION"],
    ["on_hold", "DELIVERY_EXCEPTION"],
    ["lost", "DELIVERY_EXCEPTION"],
    ["item_misrouted", "DELIVERY_EXCEPTION"],
    ["cid", "DELIVERY_EXCEPTION"],
    ["seller_initiated_delay", "DELIVERY_EXCEPTION"],
  ];
  for (const [raw, expected] of cases) {
    it(`${raw} → ${expected}`, () => {
      expect(mapShadowfaxStatusToDeliveryStatus(raw)).toBe(expected);
    });
  }
  it("unknown future status → DELIVERY_EXCEPTION without crashing", () => {
    expect(mapShadowfaxStatusToDeliveryStatus("hyperloop_teleported")).toBe("DELIVERY_EXCEPTION");
    expect(mapShadowfaxStatusToDeliveryStatus(null)).toBe("DELIVERY_EXCEPTION");
  });
  it("hub noise never advances the customer order", () => {
    expect(mapDeliveryStatusToOrderStatus("IN_TRANSIT")).toBe("PICKED_UP");
    expect(mapDeliveryStatusToOrderStatus("RETURNING_TO_RESTAURANT")).toBeNull();
    expect(mapDeliveryStatusToOrderStatus("DELIVERY_EXCEPTION")).toBeNull();
    expect(mapDeliveryStatusToOrderStatus("CANCELLED")).toBeNull();
    expect(mapDeliveryStatusToOrderStatus("DELIVERED")).toBe("DELIVERED");
    expect(mapDeliveryStatusToOrderStatus("OUT_FOR_DELIVERY")).toBe("OUT_FOR_DELIVERY");
  });
});

describe("webhook auth (spec O: secret, no HMAC)", () => {
  const secret = "our-random-callback-secret-xyz";
  it("accepts the exact secret and Token-prefixed form", () => {
    expect(isValidShadowfaxCallbackSecret(secret, secret)).toBe(true);
    expect(isValidShadowfaxCallbackSecret(`Token ${secret}`, secret)).toBe(true);
  });
  it("rejects wrong / missing secrets (incl. the API token)", () => {
    expect(isValidShadowfaxCallbackSecret("wrong", secret)).toBe(false);
    expect(isValidShadowfaxCallbackSecret(undefined, secret)).toBe(false);
    expect(isValidShadowfaxCallbackSecret("Token test-token-123", secret)).toBe(false);
    expect(isValidShadowfaxCallbackSecret(secret, "")).toBe(false);
  });
});

describe("webhook normalization + dedupe (spec F/G/H/I)", () => {
  const payload = {
    awb_number: "SF610198449AAA",
    order_id: "ORD-1",
    event_timestamp: "2026-09-08 16:22:13",
    current_location: "BLR_LOCATION",
    comments: "Item Out For Delivery",
    event: "ofd",
    status: "Out For Delivery",
    otp_verified: "NA",
    rider_name: "Delivery Partner",
    rider_contact: "9810273646",
    client_id: 2245,
    type: "FWD",
  };
  it("normalizes the spec example payload", () => {
    const u = normalizeShadowfaxWebhook(payload)!;
    expect(u.awbNumber).toBe("SF610198449AAA");
    expect(u.clientOrderId).toBe("ORD-1");
    expect(u.status).toBe("OUT_FOR_DELIVERY");
    expect(u.riderName).toBe("Delivery Partner");
    expect(u.riderPhone).toBe("9810273646");
    expect(u.timestamp.getFullYear()).toBe(2026);
  });
  it("null rider info never breaks processing", () => {
    const u = normalizeShadowfaxWebhook({ ...payload, rider_name: null, rider_contact: null, event: "picked" })!;
    expect(u.status).toBe("PICKED_UP");
    expect(u.riderName).toBeUndefined();
    expect(u.riderPhone).toBeUndefined();
  });
  it("missing AWB → null (acknowledge, don't process)", () => {
    expect(normalizeShadowfaxWebhook({ event: "ofd" })).toBeNull();
    expect(normalizeShadowfaxWebhook(null)).toBeNull();
  });
  it("dedupe key covers provider-event-time", () => {
    expect(buildWebhookDedupeKey({ awbNumber: "SF1", event: "ofd", timestamp: "t" })).toBe("SF1:ofd:t");
  });
  it("each lifecycle event maps (new→REQUESTED … rts_d→RETURNED)", () => {
    const ev = (event: string) => normalizeShadowfaxWebhook({ awb_number: "SF1", event, event_timestamp: "2026-09-08 16:22:13" })!.status;
    expect(ev("new")).toBe("REQUESTED");
    expect(ev("assigned_for_seller_pickup")).toBe("RIDER_ASSIGNED");
    expect(ev("ofp")).toBe("RIDER_GOING_TO_PICKUP");
    expect(ev("picked")).toBe("PICKED_UP");
    expect(ev("ofd")).toBe("OUT_FOR_DELIVERY");
    expect(ev("delivered")).toBe("DELIVERED");
    expect(ev("cancelled_by_customer")).toBe("CANCELLED");
    expect(ev("rts")).toBe("RETURNING_TO_RESTAURANT");
    expect(ev("rts_d")).toBe("RETURNED");
    expect(ev("nc")).toBe("DELIVERY_EXCEPTION");
    expect(ev("on_hold")).toBe("DELIVERY_EXCEPTION");
    expect(ev("something_new_2027")).toBe("DELIVERY_EXCEPTION");
  });
});

describe("unserviceable handling (spec: never assume)", () => {
  it("unserviceable pincodes surface cleanly", async () => {
    stubFetchJson({ data: [{ pincode: "560034", serviceable: false }] });
    const provider = getDeliveryProvider();
    const res = await provider.checkPincodeServiceability({ pickupPincode: "560038", deliveryPincode: "560034" });
    expect(res.serviceable).toBe(false);
  });
  it("invalid pincodes throw validation before HTTP", async () => {
    const fetchSpy = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
    vi.stubGlobal("fetch", fetchSpy);
    const provider = getDeliveryProvider();
    await expect(provider.checkPincodeServiceability({ pickupPincode: "12", deliveryPincode: "560034" }))
      .rejects.toBeInstanceOf(ShadowfaxValidationError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
