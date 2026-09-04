/**
 * Shadowfax Delivery Provider Adapter
 *
 * Pluggable delivery provider interface. In TEST/MOCK mode, returns simulated
 * responses. Production mode requires real Shadowfax API credentials.
 *
 * Issue 12: Added MANUAL provider for when Shadowfax is unavailable.
 * Kitchen staff can manually dispatch and track delivery.
 */

import { readIntegrationSecret } from "../security/secretVault";
import { eq, and } from "drizzle-orm";
import { deliveries, deliveryStatusHistory, orders, orderStatusHistory } from "../../drizzle/schema";
import { getDb } from "../db";
import { nanoid } from "nanoid";

// =============================================================================
// Types
// =============================================================================

export type DeliveryAddress = {
  name: string;
  phone: string;
  address: string;
  city: string;
  pincode: string;
  latitude?: number;
  longitude?: number;
};

export type CreateDeliveryRequest = {
  orderId: string;
  orderNumber: string;
  restaurantName: string;
  pickupAddress: DeliveryAddress;
  dropAddress: DeliveryAddress;
  items: Array<{ name: string; quantity: number }>;
  totalAmountPaise: number;
  estimatedPreparationMinutes: number;
  specialInstructions?: string;
};

export type DeliveryStatus =
  | "PENDING"
  | "ASSIGNED"
  | "RIDER_EN_ROUTE_TO_PICKUP"
  | "ARRIVED_AT_PICKUP"
  | "PICKED_UP"
  | "RIDER_EN_ROUTE_TO_DROP"
  | "ARRIVED_AT_DROP"
  | "DELIVERED"
  | "CANCELLED"
  | "FAILED"
  | "REASSIGNED";

export type DeliveryResponse = {
  success: boolean;
  deliveryId?: string;
  trackingId?: string;
  estimatedPickup?: Date;
  estimatedDelivery?: Date;
  quotedChargePaise?: number;
  riderName?: string;
  riderPhone?: string;
  trackingUrl?: string;
  error?: string;
  rawPayload?: Record<string, unknown>;
};

export type DeliveryStatusUpdate = {
  deliveryId: string;
  status: DeliveryStatus;
  timestamp: Date;
  riderName?: string;
  riderPhone?: string;
  riderLocation?: { lat: number; lng: number };
  note?: string;
  rawPayload?: Record<string, unknown>;
};

// =============================================================================
// Provider Interface
// =============================================================================

export interface DeliveryProvider {
  name: string;
  checkServiceability(pincode: string): Promise<{ serviceable: boolean; estimatedMinutes?: number }>;
  checkRouteServiceability?(pickup: { lat: number; lng: number }, drop: { lat: number; lng: number }): Promise<{ serviceable: boolean; estimatedMinutes?: number }>;
  createDelivery(request: CreateDeliveryRequest): Promise<DeliveryResponse>;
  getDelivery(deliveryId: string): Promise<DeliveryResponse>;
  cancelDelivery(deliveryId: string, reason?: string): Promise<{ success: boolean; error?: string }>;
  handleWebhook(payload: Record<string, unknown>, signature?: string): Promise<DeliveryStatusUpdate | null>;
}

// =============================================================================
// Shadowfax Production Adapter
// CONTRACT STATUS: UNVERIFIED — These types and payload shapes are based on
// Shadowfax API documentation. No sandbox verification has been performed.
// All production calls should be monitored for contract drift.
// =============================================================================

const SHADOWFAX_API_BASE = process.env.SHADOWFAX_API_URL || "https://api.shadowfax.in";

class ShadowfaxProductionAdapter implements DeliveryProvider {
  name = "shadowfax";
  private restaurantId?: string;

  setRestaurantId(id: string) { this.restaurantId = id; }

  private async getCredentials() {
    // Canonical vault provider is "shadowfax"; fall back to legacy "delivery" rows.
    const readBoth = async (keyName: string) => {
      if (!this.restaurantId) return null;
      const canonical = await readIntegrationSecret(this.restaurantId, "shadowfax", keyName);
      if (canonical) return canonical;
      return readIntegrationSecret(this.restaurantId, "delivery", keyName);
    };
    const merchantId = (await readBoth("SHADOWFAX_MERCHANT_ID"))
      ?? process.env.SHADOWFAX_MERCHANT_ID;
    const apiKey = (await readBoth("SHADOWFAX_API_KEY"))
      ?? process.env.SHADOWFAX_API_KEY;
    if (!merchantId || !apiKey) {
      throw new Error("Shadowfax credentials not configured. Add SHADOWFAX_MERCHANT_ID and SHADOWFAX_API_KEY.");
    }
    return { merchantId, apiKey };
  }

  private async request(path: string, method: string, body?: Record<string, unknown>) {
    const { merchantId, apiKey } = await this.getCredentials();
    const url = `${SHADOWFAX_API_BASE}${path}`;
    const response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "X-Merchant-Id": merchantId,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      throw new Error(`Shadowfax API error (${response.status}): ${errorText}`);
    }
    return response.json();
  }

  async checkServiceability(pincode: string) {
    try {
      const data = await this.request(`/v1/serviceability/${pincode}`, "GET");
      return {
        serviceable: Boolean(data?.serviceable),
        estimatedMinutes: data?.estimated_minutes,
      };
    } catch {
      return { serviceable: false };
    }
  }

  // CONTRACT STATUS: UNVERIFIED — endpoint shape assumed from docs
  async checkRouteServiceability(pickup: { lat: number; lng: number }, drop: { lat: number; lng: number }) {
    try {
      const data = await this.request("/v1/serviceability/route", "POST", {
        pickup_lat: pickup.lat,
        pickup_lng: pickup.lng,
        drop_lat: drop.lat,
        drop_lng: drop.lng,
      });
      return {
        serviceable: Boolean(data?.serviceable),
        estimatedMinutes: data?.estimated_minutes,
      };
    } catch {
      return { serviceable: false };
    }
  }

  async createDelivery(request: CreateDeliveryRequest) {
    try {
      const data = await this.request("/v1/orders", "POST", {
        order_id: request.orderNumber,
        pickup: {
          name: request.restaurantName,
          phone: request.pickupAddress.phone,
          address: request.pickupAddress.address,
          city: request.pickupAddress.city,
          pincode: request.pickupAddress.pincode,
          lat: request.pickupAddress.latitude,
          lng: request.pickupAddress.longitude,
        },
        drop: {
          name: request.dropAddress.name,
          phone: request.dropAddress.phone,
          address: request.dropAddress.address,
          city: request.dropAddress.city,
          pincode: request.dropAddress.pincode,
          lat: request.dropAddress.latitude,
          lng: request.dropAddress.longitude,
        },
        order_value: request.totalAmountPaise,
        // P0: thread line items + prep time so provider can quote/route correctly.
        items: request.items.map(i => ({ name: i.name, quantity: i.quantity })),
        estimated_preparation_minutes: request.estimatedPreparationMinutes,
        instructions: request.specialInstructions,
      });
      return {
        success: true,
        deliveryId: data?.order_id,
        trackingId: data?.tracking_id,
        estimatedPickup: data?.estimated_pickup ? new Date(data.estimated_pickup) : undefined,
        estimatedDelivery: data?.estimated_delivery ? new Date(data.estimated_delivery) : undefined,
        quotedChargePaise: data?.delivery_charge,
        trackingUrl: data?.tracking_url,
        rawPayload: data,
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Delivery creation failed" };
    }
  }

  async getDelivery(deliveryId: string) {
    try {
      const data = await this.request(`/v1/orders/${deliveryId}`, "GET");
      return {
        success: true,
        deliveryId: data?.order_id,
        trackingId: data?.tracking_id,
        quotedChargePaise: data?.delivery_charge,
        trackingUrl: data?.tracking_url,
        rawPayload: data,
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Failed to fetch delivery" };
    }
  }

  async cancelDelivery(deliveryId: string, reason?: string) {
    try {
      await this.request(`/v1/orders/${deliveryId}/cancel`, "POST", { reason });
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Cancel failed" };
    }
  }

  async handleWebhook(payload: Record<string, unknown>, signature?: string): Promise<DeliveryStatusUpdate | null> {
    const webhookSecret = process.env.SHADOWFAX_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error("[Shadowfax] SHADOWFAX_WEBHOOK_SECRET not configured. Rejecting webhook.");
      return null;
    }
    if (!signature) {
      console.warn("[Shadowfax] Webhook received without signature. Rejecting.");
      return null;
    }
    {
      const { createHmac, timingSafeEqual } = await import("node:crypto");
      const rawBody = JSON.stringify(payload);
      const expectedSig = createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
      if (expectedSig.length !== signature.length || !timingSafeEqual(Buffer.from(expectedSig), Buffer.from(signature))) {
        console.warn("[Shadowfax] Webhook signature verification failed");
        return null;
      }
    }

    const status = payload.status as string;
    const orderId = payload.order_id as string;
    if (!status || !orderId) return null;

    const statusMap: Record<string, DeliveryStatus> = {
      "assigned": "ASSIGNED",
      "rider_assigned": "ASSIGNED",
      "picked_up": "PICKED_UP",
      "in_transit": "RIDER_EN_ROUTE_TO_DROP",
      "delivered": "DELIVERED",
      "cancelled": "CANCELLED",
      "failed": "FAILED",
    };
    // P0: unknown provider statuses must not be coerced to PENDING — return null.
    const mapped = statusMap[status];
    if (!mapped) {
      console.warn(`[Shadowfax] Unknown webhook status "${status}" — ignoring.`);
      return null;
    }

    return {
      deliveryId: orderId,
      status: mapped,
      timestamp: new Date(),
      riderName: (payload.rider_name as string) ?? undefined,
      riderPhone: (payload.rider_phone as string) ?? undefined,
      riderLocation: payload.rider_lat && payload.rider_lng
        ? { lat: payload.rider_lat as number, lng: payload.rider_lng as number }
        : undefined,
      note: payload.note as string | undefined,
      rawPayload: payload,
    };
  }
}

// =============================================================================
// Mock Adapter (Development / Testing)
// =============================================================================

class MockDeliveryAdapter implements DeliveryProvider {
  name = "shadowfax_mock";

  async checkServiceability(pincode: string) {
    return { serviceable: true, estimatedMinutes: 35 };
  }

  async checkRouteServiceability(pickup: { lat: number; lng: number }, drop: { lat: number; lng: number }) {
    return { serviceable: true, estimatedMinutes: 35 };
  }

  async createDelivery(request: CreateDeliveryRequest) {
    const deliveryId = `mock_del_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date();
    return {
      success: true,
      deliveryId,
      trackingId: `TRK-${Math.floor(100000 + Math.random() * 900000)}`,
      estimatedPickup: new Date(now.getTime() + request.estimatedPreparationMinutes * 60 * 1000),
      estimatedDelivery: new Date(now.getTime() + (request.estimatedPreparationMinutes + 25) * 60 * 1000),
      quotedChargePaise: 3900,
      trackingUrl: `https://track.shadowfax.in/${deliveryId}`,
      rawPayload: { mock: true },
    };
  }

  async getDelivery(deliveryId: string) {
    return {
      success: true,
      deliveryId,
      trackingId: `TRK-${Math.floor(100000 + Math.random() * 900000)}`,
      quotedChargePaise: 3900,
      rawPayload: { mock: true },
    };
  }

  async cancelDelivery(deliveryId: string) {
    return { success: true };
  }

  async handleWebhook(payload: Record<string, unknown>): Promise<DeliveryStatusUpdate | null> {
    return null;
  }
}

// =============================================================================
// Issue 12: Manual Delivery Provider
// =============================================================================

/**
 * Issue 12: Manual delivery fallback for when Shadowfax is unavailable.
 * Creates delivery records manually and allows admin to update status.
 */
export async function createManualDelivery(
  orderId: string,
  riderInfo: { riderName: string; riderPhone: string; notes?: string }
): Promise<{ success: boolean; deliveryId?: string; error?: string }> {
  const db = await getDb();
  if (!db) return { success: false, error: "Database not available." };

  // Check order exists and is in a valid state for delivery
  const order = (await db.select().from(orders).where(eq(orders.id, orderId)).limit(1))[0];
  if (!order) return { success: false, error: "Order not found." };

  if (!["READY_FOR_PICKUP", "DELIVERY_REQUESTED"].includes(order.status)) {
    return { success: false, error: "Order must be ready for pickup before dispatching delivery." };
  }

  const deliveryId = nanoid(18);

  // Create delivery record
  await db.insert(deliveries).values({
    id: deliveryId,
    orderId,
    provider: "manual",
    status: "ASSIGNED",
    riderName: riderInfo.riderName,
    riderPhone: riderInfo.riderPhone,
    finalChargePaise: 0, // manual delivery, no automated charge
  });

  // Record delivery status history
  await db.insert(deliveryStatusHistory).values({
    id: nanoid(18),
    deliveryId,
    status: "ASSIGNED",
    note: `Manually dispatched. Rider: ${riderInfo.riderName} (${riderInfo.riderPhone}).${riderInfo.notes ? ` Notes: ${riderInfo.notes}` : ""}`,
  });

  // Update order status to RIDER_ASSIGNED
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
// Factory
// =============================================================================

const _providerCache = new Map<string, DeliveryProvider>();

/** L-11 fix: Per-restaurant provider instances to prevent cross-tenant state sharing.
 * Canonical vault provider is "shadowfax" (see secretVault); env is fallback.
 * Mock is explicit opt-in via SHADOWFAX_MOCK=true. In production with
 * SHADOWFAX_REQUIRE_REAL=true, missing credentials throw instead of silently mocking.
 */
export function getDeliveryProvider(restaurantId?: string): DeliveryProvider {
  const cacheKey = restaurantId ?? "__default__";
  const cached = _providerCache.get(cacheKey);
  if (cached) return cached;

  const mockOptIn = process.env.SHADOWFAX_MOCK === "true" || process.env.DELIVERY_PROVIDER === "mock";
  const isProd = process.env.NODE_ENV === "production";
  const requireReal = process.env.SHADOWFAX_REQUIRE_REAL === "true";
  const hasEnvCreds = Boolean(
    process.env.SHADOWFAX_API_KEY && process.env.SHADOWFAX_MERCHANT_ID
  );

  let provider: DeliveryProvider;
  if (mockOptIn) {
    provider = new MockDeliveryAdapter();
    console.log(`[Delivery] Using shadowfax_mock adapter for ${cacheKey} (explicit MOCK opt-in)`);
  } else if (isProd) {
    // Production: always real adapter (vault + env resolved per-request).
    // getCredentials() throws when missing; REQUIRE_REAL makes it fail fast here too.
    if (!hasEnvCreds && requireReal) {
      // Vault may still hold creds (async check at request time), but without any
      // env creds and REQUIRE_REAL we fail fast rather than silently mocking.
      // Note: per-restaurant vault creds are checked in getCredentials().
      if (!restaurantId) {
        throw new Error("Shadowfax credentials not configured. Add SHADOWFAX_API_KEY/SHADOWFAX_MERCHANT_ID or per-restaurant vault secrets.");
      }
    }
    const adapter = new ShadowfaxProductionAdapter();
    if (restaurantId) adapter.setRestaurantId(restaurantId);
    provider = adapter;
  } else if (hasEnvCreds || restaurantId) {
    // Non-prod with creds or tenant context: real adapter (vault + env).
    const adapter = new ShadowfaxProductionAdapter();
    if (restaurantId) adapter.setRestaurantId(restaurantId);
    provider = adapter;
  } else {
    // Non-prod without creds and without explicit opt-in: Mock for local dev only.
    provider = new MockDeliveryAdapter();
    console.log(`[Delivery] Using shadowfax_mock adapter for ${cacheKey} (dev fallback; set SHADOWFAX_MOCK=true to make explicit)`);
  }

  _providerCache.set(cacheKey, provider);
  console.log(`[Delivery] Using ${provider.name} adapter for ${cacheKey}`);
  return provider;
}

/**
 * Map internal delivery statuses to order statuses.
 */
export function mapDeliveryStatusToOrderStatus(
  deliveryStatus: DeliveryStatus
): string | null {
  const mapping: Record<DeliveryStatus, string | null> = {
    PENDING: null,
    ASSIGNED: "RIDER_ASSIGNED",
    RIDER_EN_ROUTE_TO_PICKUP: "RIDER_ASSIGNED",
    ARRIVED_AT_PICKUP: "RIDER_ASSIGNED",
    PICKED_UP: "PICKED_UP",
    RIDER_EN_ROUTE_TO_DROP: "OUT_FOR_DELIVERY",
    ARRIVED_AT_DROP: "OUT_FOR_DELIVERY",
    DELIVERED: "DELIVERED",
    CANCELLED: null,
    FAILED: null,
    REASSIGNED: "RIDER_ASSIGNED",
  };
  return mapping[deliveryStatus] ?? null;
}
