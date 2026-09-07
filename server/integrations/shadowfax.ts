/**
 * Shadowfax Delivery Provider — Unified API (Forward Integration specification).
 *
 * PRODUCT NOTE: the provided spec ("Shadowfax Unified API for Forward
 * Integrations") describes marketplace seller / warehouse logistics, NOT an
 * instant hyperlocal food-dispatch API. Statuses like recd_at_rev_hub /
 * bag_in_transit are e-commerce hub milestones. This module implements the
 * spec faithfully behind the generic DeliveryProvider abstraction — it does
 * NOT invent fare quotes, rider search, live GPS, or route-ETA endpoints.
 * If Shadowfax ships a separate Hyperlocal/Flash API for restaurant delivery,
 * it should replace/extend THIS provider file (same interface).
 *
 * ACTIVATION: dispatch stays OFF until Shadowfax confirms this API/account is
 * valid for restaurant-to-customer deliveries. Gate: SHADOWFAX_ENABLED=true.
 *
 * Auth (per spec): every request carries `Authorization: Token <SHADOWFAX_TOKEN>`.
 * Only SHADOWFAX_TOKEN is required. There is deliberately NO
 * SHADOWFAX_MERCHANT_ID / SHADOWFAX_CLIENT_CODE anywhere in this file.
 * Webhook auth is a separate OUR-side secret (SHADOWFAX_WEBHOOK_SECRET),
 * compared by constant-time equality — no HMAC is invented (per spec).
 *
 * Endpoints implemented (and ONLY these):
 *   GET  /v1/clients/serviceability/      pincode-pair serviceability
 *   POST /v3/clients/orders/               marketplace order creation
 *   GET  /v4/clients/orders/{awb}/track/   single-order tracking
 *   POST /v4/clients/bulk_track/           bulk tracking (<=50 AWBs)
 *   POST /v3/clients/orders/cancel/        cancellation
 */

import { readIntegrationSecret } from "../security/secretVault";
import { eq, and } from "drizzle-orm";
import { deliveries, deliveryStatusHistory, orders, orderStatusHistory } from "../../drizzle/schema";
import { getDb } from "../db";
import { nanoid } from "nanoid";

// =============================================================================
// Configuration
// =============================================================================

export const SHADOWFAX_PROVIDER_CODE = "SHADOWFAX" as const;
const DEFAULT_TIMEOUT_MS = 15000;

export function isShadowfaxEnabled(): boolean {
  return process.env.SHADOWFAX_ENABLED === "true";
}

export function shadowfaxBaseUrl(): string {
  const raw = process.env.SHADOWFAX_API_BASE_URL
    ?? process.env.SHADOWFAX_API_URL
    ?? "https://dale.shadowfax.in/api";
  return raw.replace(/\/+$/, "");
}

/** Resolve Token-auth config. Vault holds an optional per-restaurant override. */
export async function resolveShadowfaxConfig(restaurantId?: string): Promise<{
  enabled: boolean;
  baseUrl: string;
  token: string | null;
}> {
  const baseUrl = shadowfaxBaseUrl();
  const enabled = isShadowfaxEnabled();
  let token: string | null = null;
  if (restaurantId) {
    try {
      token = (await readIntegrationSecret(restaurantId, "shadowfax", "SHADOWFAX_TOKEN")) ?? null;
    } catch {
      token = null;
    }
  }
  token = token ?? process.env.SHADOWFAX_TOKEN ?? null;
  if (token && token.trim().length === 0) token = null;
  return { enabled, baseUrl, token };
}

/** Canonical "can we dispatch" gate used by serviceability + dispatch paths. */
export async function isDeliveryProviderConfigured(restaurantId?: string): Promise<boolean> {
  const cfg = await resolveShadowfaxConfig(restaurantId).catch(() => null);
  return Boolean(cfg && cfg.enabled && cfg.token);
}

/** Exact header format per spec: `Token <token>` (never Bearer). */
export function shadowfaxAuthHeader(token: string): Record<string, string> {
  return {
    Authorization: `Token ${token}`,
    "Content-Type": "application/json",
  };
}

// =============================================================================
// Errors (provider-specific; callers translate to user-safe messages)
// =============================================================================

export class ShadowfaxError extends Error {
  code: string;
  providerMessage?: string;
  constructor(code: string, message: string, providerMessage?: string) {
    super(message);
    this.name = "ShadowfaxError";
    this.code = code;
    this.providerMessage = providerMessage;
  }
}
export class ShadowfaxAuthenticationError extends ShadowfaxError {
  constructor(providerMessage?: string) {
    super("AUTH", "Shadowfax authentication failed. Check SHADOWFAX_TOKEN.", providerMessage);
    this.name = "ShadowfaxAuthenticationError";
  }
}
export class ShadowfaxValidationError extends ShadowfaxError {
  constructor(message: string) {
    super("VALIDATION", message);
    this.name = "ShadowfaxValidationError";
  }
}
export class ShadowfaxServiceabilityError extends ShadowfaxError {
  constructor(message: string, providerMessage?: string) {
    super("SERVICEABILITY", message, providerMessage);
    this.name = "ShadowfaxServiceabilityError";
  }
}
export class ShadowfaxDuplicateOrderError extends ShadowfaxError {
  awbNumber?: string;
  constructor(awbNumber?: string, providerMessage?: string) {
    super("DUPLICATE", "Shadowfax reports this order already exists.", providerMessage);
    this.name = "ShadowfaxDuplicateOrderError";
    this.awbNumber = awbNumber;
  }
}
export class ShadowfaxTimeoutError extends ShadowfaxError {
  constructor() {
    super("TIMEOUT", "Shadowfax request timed out. Please retry a read or check status before re-creating.");
    this.name = "ShadowfaxTimeoutError";
  }
}
export class ShadowfaxApiError extends ShadowfaxError {
  constructor(message: string, providerMessage?: string) {
    super("API", message, providerMessage);
    this.name = "ShadowfaxApiError";
  }
}

// =============================================================================
// Types
// =============================================================================

/** Delivery states writable to deliveries.status (matches DB CHECK). */
export type DeliveryStatus =
  | "PENDING"
  | "QUOTED"
  | "REQUESTED"
  | "ASSIGNED"
  | "RIDER_ASSIGNED"
  | "RIDER_GOING_TO_PICKUP"
  | "PICKED_UP"
  | "IN_TRANSIT"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "CANCELLED"
  | "FAILED"
  | "CANCELLATION_PENDING"
  | "RETURNING_TO_RESTAURANT"
  | "RETURNED"
  | "DELIVERY_EXCEPTION";

export type ServiceabilityResult = {
  provider: typeof SHADOWFAX_PROVIDER_CODE;
  serviceable: boolean;
  pickupServiceable: boolean;
  deliveryServiceable: boolean;
  rawResponse: unknown;
};

export type ShadowfaxParty = {
  name: string;
  contact: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  pincode: string;
  latitude?: number;
  longitude?: number;
  uniqueCode?: string;
};

export type ShadowfaxOrderItem = {
  skuId: string;
  skuName: string;
  category: string;
  /** Unit price in RUPEES (spec payload uses rupees, not paise). */
  price: number;
  quantity: number;
};

export type CreateDeliveryInput = {
  clientOrderId: string;
  paymentMode: "Prepaid" | "COD";
  /** SKU value excl. tax, RUPEES. */
  productValue: number;
  /** Total incl. tax, RUPEES. */
  totalAmount: number;
  /** Amount for rider to collect (COD only), RUPEES. */
  codAmount: number;
  customer: ShadowfaxParty;
  pickup: ShadowfaxParty;
  /** Return address — restaurant for food orders. */
  rts: ShadowfaxParty;
  items: ShadowfaxOrderItem[];
};

export type CreateDeliveryResult = {
  success: boolean;
  awbNumber?: string;
  shadowfaxId?: string | number;
  status?: string;
  trackingUrl?: string;
  duplicateRecovered?: boolean;
  error?: string;
  errorCode?: string;
  rawPayload?: Record<string, unknown>;
};

export type TrackDeliveryResult = {
  success: boolean;
  awbNumber: string;
  status?: string;
  trackingUrl?: string;
  rawPayload?: Record<string, unknown>;
  error?: string;
};

export type CancelDeliveryResult = {
  success: boolean;
  outcome: "CANCELLED" | "CANCELLATION_PENDING" | "FAILED";
  error?: string;
  rawPayload?: Record<string, unknown>;
};

export type DeliveryStatusUpdate = {
  awbNumber: string;
  clientOrderId?: string;
  status: DeliveryStatus;
  providerStatus: string;
  timestamp: Date;
  riderName?: string;
  riderPhone?: string;
  note?: string;
  rawPayload?: Record<string, unknown>;
};

// =============================================================================
// Validation helpers
// =============================================================================

export function validatePincode(value: unknown): string | null {
  const s = String(value ?? "").trim();
  return /^\d{6}$/.test(s) ? s : null;
}

/** 10-digit Indian mobile. Same fake-number rules as checkout identity. */
export function validateIndianPhone(value: unknown): string | null {
  if (value == null) return null;
  const digits = String(value).replace(/\D/g, "");
  let p = digits;
  if (p.length === 12 && p.startsWith("91")) p = p.slice(2);
  if (p.length === 11 && p.startsWith("0")) p = p.slice(1);
  if (p.length !== 10 || !/^[6-9]\d{9}$/.test(p)) return null;
  if (/^(\d)\1{9}$/.test(p)) return null;
  if (p === "9876543210" || p === "1234567890" || p === "0123456789") return null;
  return p;
}

/** Lenient check for PROVIDER-supplied contacts (rider info in webhooks).
 * Fake-number policy applies to customer-entered identity only; inbound
 * provider data (including spec-example numbers) must never break processing.
 */
export function validateProviderPhone(value: unknown): string | null {
  if (value == null) return null;
  const digits = String(value).replace(/\D/g, "");
  let p = digits;
  if (p.length === 12 && p.startsWith("91")) p = p.slice(2);
  if (p.length === 11 && p.startsWith("0")) p = p.slice(1);
  if (p.length !== 10 || !/^[6-9]\d{9}$/.test(p)) return null;
  return p;
}

export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "-";
  const d = String(phone).replace(/\D/g, "");
  if (d.length < 4) return "***";
  return `${d.slice(0, 2)}****${d.slice(-2)}`;
}

// Major-city → state resolution. Parties inside one delivery radius almost
// always share the outlet's state; the lookup covers metros explicitly and
// callers fall back to the outlet state (documented assumption).
const INDIAN_STATE_BY_CITY: Record<string, string> = {
  hyderabad: "Telangana", secunderabad: "Telangana", warangal: "Telangana",
  bengaluru: "Karnataka", bangalore: "Karnataka", mysuru: "Karnataka", mysore: "Karnataka",
  mumbai: "Maharashtra", pune: "Maharashtra", nagpur: "Maharashtra", thane: "Maharashtra",
  delhi: "Delhi", "new delhi": "Delhi",
  chennai: "Tamil Nadu", coimbatore: "Tamil Nadu", madurai: "Tamil Nadu",
  kolkata: "West Bengal", howrah: "West Bengal",
  ahmedabad: "Gujarat", surat: "Gujarat", vadodara: "Gujarat",
  jaipur: "Rajasthan", udaipur: "Rajasthan", jodhpur: "Rajasthan",
  lucknow: "Uttar Pradesh", kanpur: "Uttar Pradesh", noida: "Uttar Pradesh", agra: "Uttar Pradesh", varanasi: "Uttar Pradesh",
  kochi: "Kerala", thiruvananthapuram: "Kerala", kozhikode: "Kerala",
  bhubaneswar: "Odisha", cuttack: "Odisha",
  patna: "Bihar", ranchi: "Jharkhand",
  bhopal: "Madhya Pradesh", indore: "Madhya Pradesh",
  chandigarh: "Chandigarh", ludhiana: "Punjab", amritsar: "Punjab",
  dehradun: "Uttarakhand", shimla: "Himachal Pradesh",
  guwahati: "Assam", shillong: "Meghalaya",
  panaji: "Goa", pondicherry: "Puducherry", puducherry: "Puducherry",
  srinagar: "Jammu and Kashmir", jammu: "Jammu and Kashmir",
  raipur: "Chhattisgarh", vijayawada: "Andhra Pradesh", visakhapatnam: "Andhra Pradesh", guntur: "Andhra Pradesh",
  nashik: "Maharashtra", aurangabad: "Maharashtra",
  meerut: "Uttar Pradesh", faridabad: "Haryana", gurgaon: "Haryana", gurugram: "Haryana",
  jalandhar: "Punjab", bathinda: "Punjab",
  kota: "Rajasthan", ajmer: "Rajasthan",
  gwalior: "Madhya Pradesh", jabalpur: "Madhya Pradesh",
  allahabad: "Uttar Pradesh", prayagraj: "Uttar Pradesh",
  thiruchirapalli: "Tamil Nadu", salem: "Tamil Nadu",
  mangaluru: "Karnataka", mangalore: "Karnataka", hubli: "Karnataka",
  ernakulam: "Kerala", thrissur: "Kerala",
  dhanbad: "Jharkhand", jamshedpur: "Jharkhand",
  siliguri: "West Bengal", durgapur: "West Bengal",
  ujjain: "Madhya Pradesh", ratlam: "Madhya Pradesh",
  saharanpur: "Uttar Pradesh", bareilly: "Uttar Pradesh", aligarh: "Uttar Pradesh", moradabad: "Uttar Pradesh",
};

export function resolveIndianState(city: unknown, fallbackState?: string): string | null {
  const key = String(city ?? "").trim().toLowerCase();
  if (key && INDIAN_STATE_BY_CITY[key]) return INDIAN_STATE_BY_CITY[key];
  const fb = String(fallbackState ?? "").trim();
  return fb ? fb : null;
}

// =============================================================================
// Financial mapping (spec section 11)
// =============================================================================

/**
 * Our order/payment DB is the financial source of truth; Shadowfax only
 * receives logistics/collection info. ASSUMPTION: menu prices are
 * tax-inclusive (Indian restaurant norm), so product_value backs tax out:
 *   productValue = (itemTotal - coupon) / (1 + gstRate)
 * Delivery/platform fees, tips and gateway charges NEVER enter product_value.
 * All values returned in RUPEES (spec payload unit).
 */
export function mapOrderFinancialsToShadowfax(args: {
  itemTotalPaise: number;
  couponDiscountPaise?: number;
  gstPercent?: number;
  totalPaise: number;
  paymentMode: "Prepaid" | "COD";
}): { productValue: number; totalAmount: number; codAmount: number; paymentMode: "Prepaid" | "COD" } {
  const { itemTotalPaise, totalPaise, paymentMode } = args;
  if (!Number.isInteger(itemTotalPaise) || itemTotalPaise < 0) {
    throw new ShadowfaxValidationError("Invalid item total for Shadowfax mapping.");
  }
  if (!Number.isInteger(totalPaise) || totalPaise < 0) {
    throw new ShadowfaxValidationError("Invalid order total for Shadowfax mapping.");
  }
  const coupon = args.couponDiscountPaise ?? 0;
  if (!Number.isInteger(coupon) || coupon < 0 || coupon > itemTotalPaise) {
    throw new ShadowfaxValidationError("Invalid coupon discount for Shadowfax mapping.");
  }
  const gst = args.gstPercent ?? 0;
  if (!Number.isFinite(gst) || gst < 0 || gst > 100) {
    throw new ShadowfaxValidationError("Invalid GST rate for Shadowfax mapping.");
  }
  const netPaise = itemTotalPaise - coupon;
  const productValue = Math.round((netPaise / (1 + gst / 100)) * 100) / 100 / 100;
  const totalAmount = Math.round(totalPaise) / 100;
  const codAmount = paymentMode === "COD" ? totalAmount : 0;
  if (paymentMode === "Prepaid" && codAmount !== 0) {
    throw new ShadowfaxValidationError("Prepaid orders must not carry a COD amount.");
  }
  return {
    productValue: Math.round(productValue * 100) / 100,
    totalAmount: Math.round(totalAmount * 100) / 100,
    codAmount,
    paymentMode,
  };
}

// =============================================================================
// Payload builder (spec sections 7-9, validates before any HTTP call)
// =============================================================================

function requirePartyField(party: ShadowfaxParty, field: keyof ShadowfaxParty, label: string): string {
  const v = party[field];
  if (typeof v !== "string" || v.trim().length === 0) {
    throw new ShadowfaxValidationError(`Shadowfax ${label} is required.`);
  }
  return v.trim();
}

export function buildShadowfaxCreatePayload(input: CreateDeliveryInput): Record<string, unknown> {
  if (!input.clientOrderId || input.clientOrderId.trim().length === 0) {
    throw new ShadowfaxValidationError("Shadowfax client_order_id is required.");
  }
  if (!Number.isFinite(input.productValue) || input.productValue < 0) {
    throw new ShadowfaxValidationError("Shadowfax product_value must be >= 0.");
  }
  if (input.productValue === 0) {
    throw new ShadowfaxValidationError("Shadowfax product_value is zero — free orders cannot be dispatched.");
  }
  if (input.paymentMode !== "Prepaid" && input.paymentMode !== "COD") {
    throw new ShadowfaxValidationError("Shadowfax payment_mode must be Prepaid or COD.");
  }
  if (input.paymentMode === "Prepaid" && input.codAmount !== 0) {
    throw new ShadowfaxValidationError("Prepaid Shadowfax orders must have cod_amount 0.");
  }
  if (input.paymentMode === "COD" && (!Number.isFinite(input.codAmount) || input.codAmount <= 0)) {
    throw new ShadowfaxValidationError("COD Shadowfax orders need a positive cod_amount.");
  }
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new ShadowfaxValidationError("Shadowfax product_details needs at least one item.");
  }
  for (const it of input.items) {
    if (!it.skuName || it.skuName.trim().length === 0) throw new ShadowfaxValidationError("Shadowfax item sku_name is required.");
    if (!Number.isFinite(it.price) || it.price < 0) throw new ShadowfaxValidationError(`Shadowfax item price invalid for "${it.skuName}".`);
    if (!Number.isInteger(it.quantity) || it.quantity < 1) throw new ShadowfaxValidationError(`Shadowfax item quantity invalid for "${it.skuName}".`);
  }

  const party = (p: ShadowfaxParty, role: string) => {
    const pincode = validatePincode(p.pincode);
    if (!pincode) throw new ShadowfaxValidationError(`Shadowfax ${role} needs a valid 6-digit pincode.`);
    const contact = validateIndianPhone(p.contact);
    if (!contact) throw new ShadowfaxValidationError(`Shadowfax ${role} needs a valid 10-digit contact.`);
    return {
      name: requirePartyField(p, "name", `${role} name`),
      contact,
      address_line_1: requirePartyField(p, "addressLine1", `${role} address_line_1`),
      ...(p.addressLine2?.trim() ? { address_line_2: p.addressLine2.trim() } : {}),
      city: requirePartyField(p, "city", `${role} city`),
      state: requirePartyField(p, "state", `${role} state`),
      pincode: Number(pincode),
      ...(p.latitude != null && p.longitude != null && Number.isFinite(p.latitude) && Number.isFinite(p.longitude)
        ? { latitude: String(p.latitude), longitude: String(p.longitude) }
        : {}),
      ...(p.uniqueCode?.trim() ? { unique_code: p.uniqueCode.trim() } : {}),
    };
  };

  return {
    order_type: "marketplace",
    order_details: {
      client_order_id: input.clientOrderId.trim(),
      product_value: input.productValue,
      payment_mode: input.paymentMode,
      cod_amount: input.codAmount,
      total_amount: input.totalAmount,
      order_service: "regular",
    },
    customer_details: party(input.customer, "customer"),
    pickup_details: party(input.pickup, "pickup"),
    rts_details: party(input.rts, "rts"),
    product_details: input.items.map((it) => ({
      sku_id: (it.skuId || it.skuName).slice(0, 64),
      sku_name: it.skuName.slice(0, 180),
      category: it.category || "Food",
      price: it.price,
      additional_details: { quantity: it.quantity },
    })),
  };
}

// =============================================================================
// Status mapping (spec section 20) — centralized, unknown-safe
// =============================================================================

export function mapShadowfaxStatusToDeliveryStatus(raw: unknown): DeliveryStatus {
  const s = String(raw ?? "").trim().toLowerCase();
  switch (s) {
    case "new":
      return "REQUESTED";
    case "assigned_for_pickup":
    case "assigned_for_seller_pickup":
      return "RIDER_ASSIGNED";
    case "ofp":
      return "RIDER_GOING_TO_PICKUP";
    case "picked":
      return "PICKED_UP";
    case "recd_at_rev_hub":
    case "item_manifested":
    case "bag_in_transit":
    case "bag_received":
    case "bag_received_at_via":
    case "recd_at_fwd_dc":
    case "recd_at_fwd_hub":
      return "IN_TRANSIT";
    case "assigned_for_delivery":
      return "RIDER_ASSIGNED";
    case "ofd":
      return "OUT_FOR_DELIVERY";
    case "delivered":
      return "DELIVERED";
    case "cancelled_by_customer":
    case "cancelled_by_seller":
      return "CANCELLED";
    case "rts":
    case "rts_in_process":
    case "in_transit_return":
    case "rts_ofd":
      return "RETURNING_TO_RESTAURANT";
    case "rts_d":
      return "RETURNED";
    case "rts_nd":
    case "nc":
    case "na":
    case "pickup_not_attempted":
    case "pickup_on_hold":
    case "on_hold":
    case "lost":
    case "item_misrouted":
    case "cid":
    case "seller_initiated_delay":
      return "DELIVERY_EXCEPTION";
    default:
      // Unknown future status: never crash, keep raw + exception state.
      console.warn(`[Shadowfax] Unknown provider status "${String(raw ?? "")}" — mapped to DELIVERY_EXCEPTION.`);
      return "DELIVERY_EXCEPTION";
  }
}

/**
 * Delivery → ORDER status for the customer timeline. Only milestones that
 * genuinely advance the order; hub/bag noise, returns and exceptions NEVER
 * touch orders.status (order cancellation/refund rules stay separate).
 */
export function mapDeliveryStatusToOrderStatus(deliveryStatus: DeliveryStatus): string | null {
  const mapping: Record<DeliveryStatus, string | null> = {
    PENDING: null,
    QUOTED: null,
    REQUESTED: "DELIVERY_REQUESTED",
    ASSIGNED: "RIDER_ASSIGNED",
    RIDER_ASSIGNED: "RIDER_ASSIGNED",
    RIDER_GOING_TO_PICKUP: "RIDER_ASSIGNED",
    PICKED_UP: "PICKED_UP",
    IN_TRANSIT: "PICKED_UP",
    OUT_FOR_DELIVERY: "OUT_FOR_DELIVERY",
    DELIVERED: "DELIVERED",
    CANCELLED: null,
    FAILED: null,
    CANCELLATION_PENDING: null,
    RETURNING_TO_RESTAURANT: null,
    RETURNED: null,
    DELIVERY_EXCEPTION: null,
  };
  return mapping[deliveryStatus] ?? null;
}

/** Webhook dedupe key: provider + awb + event + timestamp (spec section 18). */
export function buildWebhookDedupeKey(args: { awbNumber: string; event: string; timestamp: string }): string {
  return `${args.awbNumber}:${args.event}:${args.timestamp}`;
}

// =============================================================================
// HTTP client (single place for base URL, auth, timeouts, error normalization)
// =============================================================================

async function sfFetch(args: {
  path: string;
  method: "GET" | "POST";
  token: string;
  body?: unknown;
  timeoutMs?: number;
  restaurantId?: string;
}): Promise<unknown> {
  const cfg = await resolveShadowfaxConfig(args.restaurantId);
  const url = `${cfg.baseUrl}${args.path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      method: args.method,
      headers: shadowfaxAuthHeader(args.token),
      body: args.body !== undefined ? JSON.stringify(args.body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw new ShadowfaxTimeoutError();
    throw new ShadowfaxApiError("Shadowfax request failed.", err instanceof Error ? err.message : undefined);
  } finally {
    clearTimeout(timer);
  }
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    throw new ShadowfaxApiError(`Shadowfax returned non-JSON (HTTP ${res.status}).`);
  }
  if (res.status === 401 || res.status === 403) {
    throw new ShadowfaxAuthenticationError(`HTTP ${res.status}`);
  }
  return json;
}

function readMessage(json: unknown): string | undefined {
  if (json && typeof json === "object" && "message" in json) {
    const m = (json as Record<string, unknown>).message;
    return typeof m === "string" ? m : undefined;
  }
  return undefined;
}

function isDuplicateFailure(message: string | undefined): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return m.includes("duplicate") || m.includes("already exists") || m.includes("already created");
}

// =============================================================================
// Provider implementation
// =============================================================================

export interface DeliveryProvider {
  name: string;
  providerCode: string;
  /** False until SHADOWFAX_ENABLED=true AND a token resolves. */
  isEnabled(): Promise<boolean>;
  checkPincodeServiceability(input: { pickupPincode: string; deliveryPincode: string }): Promise<ServiceabilityResult>;
  createDelivery(input: CreateDeliveryInput): Promise<CreateDeliveryResult>;
  trackDelivery(awbNumber: string): Promise<TrackDeliveryResult>;
  bulkTrackDeliveries(awbNumbers: string[]): Promise<TrackDeliveryResult[]>;
  cancelDelivery(input: { awbNumber?: string; clientOrderId?: string; reason?: string }): Promise<CancelDeliveryResult>;
}

class ShadowfaxUnifiedProvider implements DeliveryProvider {
  name = "shadowfax";
  providerCode = SHADOWFAX_PROVIDER_CODE;
  private restaurantId?: string;

  setRestaurantId(id: string) { this.restaurantId = id; }

  async isEnabled(): Promise<boolean> {
    return isDeliveryProviderConfigured(this.restaurantId);
  }

  private async token(): Promise<string> {
    const cfg = await resolveShadowfaxConfig(this.restaurantId);
    if (!cfg.enabled) {
      throw new ShadowfaxApiError("Shadowfax dispatch is disabled (SHADOWFAX_ENABLED=false).");
    }
    if (!cfg.token) {
      throw new ShadowfaxAuthenticationError("SHADOWFAX_TOKEN not configured.");
    }
    return cfg.token;
  }

  /** Spec section 6: BOTH pickup (seller_pickup) and delivery (customer_delivery) must pass. */
  async checkPincodeServiceability(input: { pickupPincode: string; deliveryPincode: string }): Promise<ServiceabilityResult> {
    const pickup = validatePincode(input.pickupPincode);
    const delivery = validatePincode(input.deliveryPincode);
    if (!pickup || !delivery) {
      throw new ShadowfaxValidationError("Both pickup and delivery pincodes must be 6 digits.");
    }
    const token = await this.token();
    const check = async (service: "seller_pickup" | "customer_delivery", pincode: string): Promise<{ ok: boolean; raw: unknown }> => {
      const qs = new URLSearchParams({ service, page: "1", count: "10", pincodes: pincode });
      let json: unknown;
      try {
        json = await sfFetch({ path: `/v1/clients/serviceability/?${qs.toString()}`, method: "GET", token, restaurantId: this.restaurantId });
      } catch (err) {
        if (err instanceof ShadowfaxAuthenticationError) throw err;
        console.error(`[Shadowfax][metric=serviceability_failure] service=${service} pincode=${pincode} err=${err instanceof Error ? err.message : String(err)}`);
        return { ok: false, raw: null };
      }
      // Spec shape: serviceability entries per pincode; treat an explicit
      // serviceable/servicable true (or status success with non-empty data)
      // as serviceable, anything else as not.
      const ok = isPincodeMarkedServiceable(json, pincode);
      console.log(`[Shadowfax][metric=serviceability_${ok ? "success" : "failure"}] service=${service} pincode=${pincode}`);
      return { ok, raw: json };
    };
    const [pick, drop] = await Promise.all([
      check("seller_pickup", pickup),
      check("customer_delivery", delivery),
    ]);
    return {
      provider: SHADOWFAX_PROVIDER_CODE,
      serviceable: pick.ok && drop.ok,
      pickupServiceable: pick.ok,
      deliveryServiceable: drop.ok,
      rawResponse: { seller_pickup: pick.raw, customer_delivery: drop.raw },
    };
  }

  /** Spec sections 7-13. Never retried blindly — caller owns idempotency. */
  async createDelivery(input: CreateDeliveryInput): Promise<CreateDeliveryResult> {
    const token = await this.token();
    const payload = buildShadowfaxCreatePayload(input);
    console.log(`[Shadowfax][metric=create_request] client_order_id=${input.clientOrderId} items=${input.items.length} cod=${input.codAmount}`);
    let json: unknown;
    try {
      json = await sfFetch({ path: "/v3/clients/orders/", method: "POST", token, body: payload, restaurantId: this.restaurantId });
    } catch (err) {
      if (err instanceof ShadowfaxError) throw err;
      throw new ShadowfaxApiError("Shadowfax order creation failed.");
    }
    const message = readMessage(json);
    const data = (json && typeof json === "object" && "data" in json
      ? (json as Record<string, unknown>).data as Record<string, unknown> | null
      : null) ?? null;
    const awb = data && typeof data.awb_number === "string" && data.awb_number ? data.awb_number : undefined;
    // CRITICAL: HTTP 200 with message "Failure" is a FAILURE (spec section 12).
    if (message !== "Success" || !awb) {
      console.error(`[Shadowfax][metric=create_failure] client_order_id=${input.clientOrderId} message=${message ?? "n/a"}`);
      if (isDuplicateFailure(message)) {
        // Duplicate recovery: adopt the existing AWB when the provider echoes it.
        if (awb) return { success: true, awbNumber: awb, duplicateRecovered: true, rawPayload: json as Record<string, unknown> };
        throw new ShadowfaxDuplicateOrderError(undefined, message);
      }
      const lower = (message ?? "").toLowerCase();
      if (lower.includes("invalid") || lower.includes("validation") || lower.includes("required") || lower.includes("pincode") || lower.includes("contact") || lower.includes("service")) {
        throw new ShadowfaxValidationError(`Shadowfax rejected the order: ${message ?? "validation failure"}.`);
      }
      throw new ShadowfaxApiError(`Shadowfax order creation failed: ${message ?? "unknown provider failure"}.`, message);
    }
    console.log(`[Shadowfax][metric=create_success] client_order_id=${input.clientOrderId} awb=${awb}`);
    return {
      success: true,
      awbNumber: awb,
      shadowfaxId: data && (typeof data.id === "string" || typeof data.id === "number") ? data.id : undefined,
      status: typeof data?.status === "string" ? data.status : undefined,
      rawPayload: json as Record<string, unknown>,
    };
  }

  /** Spec section 22: tracking is a fallback/reconciliation read, not a poll loop. */
  async trackDelivery(awbNumber: string): Promise<TrackDeliveryResult> {
    const awb = awbNumber.trim();
    if (!awb) throw new ShadowfaxValidationError("AWB number is required for tracking.");
    const token = await this.token();
    let json: unknown;
    try {
      json = await sfFetch({ path: `/v4/clients/orders/${encodeURIComponent(awb)}/track/`, method: "GET", token, restaurantId: this.restaurantId });
    } catch (err) {
      if (err instanceof ShadowfaxError) throw err;
      throw new ShadowfaxApiError("Shadowfax tracking failed.");
    }
    const root = (json && typeof json === "object" ? json as Record<string, unknown> : {}) as Record<string, unknown>;
    const orderDetails = root.order_details as Record<string, unknown> | undefined;
    const status = typeof orderDetails?.status === "string"
      ? orderDetails.status
      : typeof root.status === "string" ? root.status : undefined;
    const trackingUrl = typeof root.customer_track_url === "string" && root.customer_track_url
      ? root.customer_track_url
      : undefined;
    console.log(`[Shadowfax][metric=track_success] awb=${awb}`);
    return { success: true, awbNumber: awb, status, trackingUrl, rawPayload: json as Record<string, unknown> };
  }

  /** Spec section 24: <=50 AWBs per request; chunks internally. */
  async bulkTrackDeliveries(awbNumbers: string[]): Promise<TrackDeliveryResult[]> {
    const awbs = Array.from(new Set(awbNumbers.map((a) => a.trim()).filter(Boolean)));
    if (awbs.length === 0) return [];
    const token = await this.token();
    const out: TrackDeliveryResult[] = [];
    for (let i = 0; i < awbs.length; i += 50) {
      const chunk = awbs.slice(i, i + 50);
      let json: unknown;
      try {
        json = await sfFetch({ path: "/v4/clients/bulk_track/", method: "POST", token, body: { awb_numbers: chunk }, restaurantId: this.restaurantId });
      } catch (err) {
        console.error(`[Shadowfax][metric=tracking_failure] bulk chunk failed: ${err instanceof Error ? err.message : String(err)}`);
        for (const awb of chunk) out.push({ success: false, awbNumber: awb, error: "Bulk tracking request failed." });
        continue;
      }
      const byAwb = indexBulkTrackResponse(json);
      for (const awb of chunk) {
        const hit = byAwb.get(awb);
        out.push(hit ?? { success: false, awbNumber: awb, error: "No tracking data returned.", rawPayload: json as Record<string, unknown> });
      }
    }
    return out;
  }

  /** Spec sections 25-26. Prefers stored AWB; 200 → CANCELLED, 304 → PENDING. */
  async cancelDelivery(input: { awbNumber?: string; clientOrderId?: string; reason?: string }): Promise<CancelDeliveryResult> {
    const token = await this.token();
    const requestId = input.awbNumber?.trim() || input.clientOrderId?.trim();
    if (!requestId) throw new ShadowfaxValidationError("AWB or client order ID is required to cancel.");
    let json: unknown;
    try {
      json = await sfFetch({
        path: "/v3/clients/orders/cancel/",
        method: "POST",
        token,
        body: { request_id: requestId, cancel_remarks: (input.reason ?? "Request cancelled").slice(0, 500) },
        restaurantId: this.restaurantId,
      });
    } catch (err) {
      if (err instanceof ShadowfaxError) throw err;
      throw new ShadowfaxApiError("Shadowfax cancellation failed.");
    }
    // responseCode lives INSIDE the JSON (200 ≠ HTTP status; 304 ≠ redirect).
    const root = (json && typeof json === "object" ? json as Record<string, unknown> : {}) as Record<string, unknown>;
    const code = root.responseCode ?? root.response_code ?? root.code;
    const msg = typeof root.responseMsg === "string" ? root.responseMsg : readMessage(json);
    console.log(`[Shadowfax][metric=cancel_response] request_id=${requestId} code=${String(code ?? "?")}`);
    if (code === 200 || code === "200") {
      console.log(`[Shadowfax][metric=cancel_success] request_id=${requestId}`);
      return { success: true, outcome: "CANCELLED", rawPayload: json as Record<string, unknown> };
    }
    if (code === 304 || code === "304") {
      console.log(`[Shadowfax][metric=cancel_pending] request_id=${requestId}`);
      return { success: true, outcome: "CANCELLATION_PENDING", rawPayload: json as Record<string, unknown> };
    }
    console.error(`[Shadowfax][metric=cancel_failure] request_id=${requestId} msg=${msg ?? "n/a"}`);
    return { success: false, outcome: "FAILED", error: msg ?? "Cancellation rejected by Shadowfax.", rawPayload: json as Record<string, unknown> };
  }
}

/** Lenient reader for the serviceability payload shape. Exported for tests. */
export function isPincodeMarkedServiceable(json: unknown, pincode: string): boolean {
  if (!json || typeof json !== "object") return false;
  const root = json as Record<string, unknown>;
  const candidates: unknown[] = [];
  for (const key of ["data", "results", "pincodes", "serviceability"]) {
    const v = root[key];
    if (Array.isArray(v)) candidates.push(...v);
    else if (v && typeof v === "object") candidates.push(v);
  }
  if (candidates.length === 0) candidates.push(root);
  for (const c of candidates) {
    if (!c || typeof c !== "object") continue;
    const rec = c as Record<string, unknown>;
    const pin = String(rec.pincode ?? rec.pin_code ?? rec.pin ?? "");
    if (pin && pin !== pincode) continue;
    for (const k of ["serviceable", "servicable", "is_serviceable", "is_servicable", "available", "active"]) {
      if (typeof rec[k] === "boolean") return rec[k] as boolean;
      if (typeof rec[k] === "string" && ["true", "yes", "y", "1"].includes((rec[k] as string).toLowerCase())) return true;
      if (typeof rec[k] === "number") return (rec[k] as number) !== 0;
    }
    const status = String(rec.status ?? "").toLowerCase();
    if (status === "success" && !pin) return true;
  }
  // Explicit false anywhere for our pincode fails closed; absence of any
  // positive marker also fails closed (never assume serviceable).
  return false;
}

function indexBulkTrackResponse(json: unknown): Map<string, TrackDeliveryResult> {
  const map = new Map<string, TrackDeliveryResult>();
  if (!json || typeof json !== "object") return map;
  const root = json as Record<string, unknown>;
  const list = Array.isArray(root.data) ? root.data : Array.isArray(root.results) ? root.results : [];
  for (const entry of list as Record<string, unknown>[]) {
    if (!entry || typeof entry !== "object") continue;
    const awb = String(entry.awb_number ?? entry.awb ?? "");
    if (!awb) continue;
    const orderDetails = entry.order_details as Record<string, unknown> | undefined;
    map.set(awb, {
      success: true,
      awbNumber: awb,
      status: typeof orderDetails?.status === "string" ? orderDetails.status : undefined,
      trackingUrl: typeof entry.customer_track_url === "string" ? entry.customer_track_url : undefined,
      rawPayload: entry,
    });
  }
  return map;
}

// =============================================================================
// Webhook payload normalization (auth happens in the route, not here)
// =============================================================================

export function normalizeShadowfaxWebhook(payload: unknown): DeliveryStatusUpdate | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  const awb = typeof p.awb_number === "string" && p.awb_number.trim() ? p.awb_number.trim() : null;
  if (!awb) return null;
  // Event key prefers `event`; falls back to human `status` text.
  const event = typeof p.event === "string" && p.event.trim() ? p.event.trim() : null;
  const statusText = typeof p.status === "string" ? p.status : "";
  const mapped = mapShadowfaxStatusToDeliveryStatus(event ?? statusText);
  const tsRaw = typeof p.event_timestamp === "string" ? p.event_timestamp : null;
  // Spec format "2026-09-08 16:22:13" is not ISO — normalize for Date parsing.
  const timestamp = tsRaw ? new Date(tsRaw.replace(" ", "T")) : new Date();
  const riderName = typeof p.rider_name === "string" && p.rider_name.trim() ? p.rider_name.trim() : undefined;
  const riderPhone = validateProviderPhone(p.rider_contact) ?? undefined;
  const comments = typeof p.comments === "string" ? p.comments.slice(0, 500) : undefined;
  return {
    awbNumber: awb,
    clientOrderId: typeof p.order_id === "string" ? p.order_id : undefined,
    status: mapped,
    providerStatus: event ?? statusText,
    timestamp: Number.isNaN(timestamp.getTime()) ? new Date() : timestamp,
    riderName,
    riderPhone,
    note: comments ?? `Provider status: ${event ?? statusText}`,
    rawPayload: payload as Record<string, unknown>,
  };
}

// =============================================================================
// Manual fallback (internal-rider placeholder; NOT Shadowfax)
// =============================================================================

/**
 * Manual delivery fallback for when no provider is available. Kept as the
 * "internal riders" limb of the provider abstraction (spec section 3).
 */
export async function createManualDelivery(
  orderId: string,
  riderInfo: { riderName: string; riderPhone: string; notes?: string }
): Promise<{ success: boolean; deliveryId?: string; error?: string }> {
  const db = await getDb();
  if (!db) return { success: false, error: "Database not available." };

  const order = (await db.select().from(orders).where(eq(orders.id, orderId)).limit(1))[0];
  if (!order) return { success: false, error: "Order not found." };

  if (!["READY_FOR_PICKUP", "DELIVERY_REQUESTED"].includes(order.status)) {
    return { success: false, error: "Order must be ready for pickup before dispatching delivery." };
  }

  const deliveryId = nanoid(18);

  await db.insert(deliveries).values({
    id: deliveryId,
    orderId,
    provider: "manual",
    status: "ASSIGNED",
    riderName: riderInfo.riderName,
    riderPhone: riderInfo.riderPhone,
    finalChargePaise: 0,
  });

  await db.insert(deliveryStatusHistory).values({
    id: nanoid(18),
    deliveryId,
    status: "ASSIGNED",
    note: `Manually dispatched. Rider: ${riderInfo.riderName} (${riderInfo.riderPhone}).${riderInfo.notes ? ` Notes: ${riderInfo.notes}` : ""}`,
  });

  const currentOrder = (await db.select().from(orders).where(eq(orders.id, orderId)).limit(1))[0];
  if (currentOrder && ["READY_FOR_PICKUP", "DELIVERY_REQUESTED"].includes(currentOrder.status)) {
    await db.update(orders).set({ status: "RIDER_ASSIGNED" }).where(eq(orders.id, orderId));
    await db.insert(orderStatusHistory).values({
      id: nanoid(18),
      orderId,
      status: "RIDER_ASSIGNED",
      note: `Manual delivery dispatched to ${riderInfo.riderName}.`,
    });
  }

  return { success: true, deliveryId };
}

// =============================================================================
// Factory (DeliveryService selection point for current + future providers)
// =============================================================================

const _providerCache = new Map<string, DeliveryProvider>();

class MockDeliveryAdapter implements DeliveryProvider {
  name = "shadowfax_mock";
  providerCode = "MOCK";
  async isEnabled() { return true; }
  async checkPincodeServiceability() {
    return { provider: SHADOWFAX_PROVIDER_CODE, serviceable: true, pickupServiceable: true, deliveryServiceable: true, rawResponse: { mock: true } };
  }
  async createDelivery() {
    return { success: false as const, error: "Mock provider cannot create real shipments." };
  }
  async trackDelivery(awbNumber: string) {
    return { success: true, awbNumber, rawPayload: { mock: true } };
  }
  async bulkTrackDeliveries(awbs: string[]) {
    return awbs.map((a) => ({ success: true, awbNumber: a, rawPayload: { mock: true } }));
  }
  async cancelDelivery() {
    return { success: true as const, outcome: "CANCELLED" as const };
  }
}

/**
 * Provider selection (spec section 39). Real Unified provider requires
 * SHADOWFAX_ENABLED=true + token; explicit SHADOWFAX_MOCK=true keeps the
 * dev mock. Production with no token fails at call time with a clear
 * authentication error (never silently mocked).
 */
export function getDeliveryProvider(restaurantId?: string): DeliveryProvider {
  const cacheKey = restaurantId ?? "__default__";
  const cached = _providerCache.get(cacheKey);
  if (cached) return cached;

  const mockOptIn = process.env.SHADOWFAX_MOCK === "true" || process.env.DELIVERY_PROVIDER === "mock";
  let provider: DeliveryProvider;
  if (mockOptIn) {
    provider = new MockDeliveryAdapter();
    console.log(`[Delivery] Using shadowfax_mock adapter for ${cacheKey} (explicit MOCK opt-in)`);
  } else {
    provider = new ShadowfaxUnifiedProvider();
    if (restaurantId) (provider as ShadowfaxUnifiedProvider).setRestaurantId(restaurantId);
    console.log(`[Delivery] Using shadowfax_unified adapter for ${cacheKey} (base=${shadowfaxBaseUrl()}, enabled=${isShadowfaxEnabled()})`);
  }
  _providerCache.set(cacheKey, provider);
  return provider;
}
