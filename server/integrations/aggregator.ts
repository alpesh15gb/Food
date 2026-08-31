export type AggregatorSource = "DIRECT" | "ZOMATO" | "SWIGGY" | "PHONE" | "WALK_IN";

export interface SyncResult {
  synced: number;
  failed: number;
  errors: string[];
}

export interface ParsedOrder {
  aggregatorOrderId: string;
  source: AggregatorSource;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  items: Array<{
    name: string;
    quantity: number;
    unitPricePaise: number;
  }>;
  totalPaise: number;
  paymentMethod: string;
  paymentStatus: "PAID" | "COD";
  notes?: string;
}

export interface MenuDiff {
  missingOnAggregator: string[];
  extraOnAggregator: string[];
  priceMismatch: Array<{ itemName: string; localPrice: number; aggregatorPrice: number }>;
}

export interface AggregatorAdapter {
  name: "zomato" | "swiggy";
  syncMenu(restaurantId: string, items: Array<{ id: string; name: string; pricePaise: number }>): Promise<SyncResult>;
  receiveOrder(webhookPayload: unknown): Promise<ParsedOrder>;
  updateOrderStatus(orderId: string, status: string): Promise<void>;
  getMenuDiff(restaurantId: string): Promise<MenuDiff>;
  isConnected(restaurantId: string): Promise<boolean>;
}

// =============================================================================
// Mock Adapters (for testing/demo until real API access is granted)
// =============================================================================

export class MockZomatoAdapter implements AggregatorAdapter {
  name = "zomato" as const;

  async syncMenu(_restaurantId: string, _items: Array<{ id: string; name: string; pricePaise: number }>): Promise<SyncResult> {
    return { synced: 0, failed: 0, errors: ["Zomato Partner API access not yet granted. Requires 50+ active restaurants."] };
  }

  async receiveOrder(_webhookPayload: unknown): Promise<ParsedOrder> {
    throw new Error("Zomato webhook endpoint not available. Use manual order entry instead.");
  }

  async updateOrderStatus(_orderId: string, _status: string): Promise<void> {
    // No-op in mock mode
  }

  async getMenuDiff(_restaurantId: string): Promise<MenuDiff> {
    return { missingOnAggregator: [], extraOnAggregator: [], priceMismatch: [] };
  }

  async isConnected(_restaurantId: string): Promise<boolean> {
    return false;
  }
}

export class MockSwiggyAdapter implements AggregatorAdapter {
  name = "swiggy" as const;

  async syncMenu(_restaurantId: string, _items: Array<{ id: string; name: string; pricePaise: number }>): Promise<SyncResult> {
    return { synced: 0, failed: 0, errors: ["Swiggy Partner API access not yet granted. Requires 50+ active restaurants."] };
  }

  async receiveOrder(_webhookPayload: unknown): Promise<ParsedOrder> {
    throw new Error("Swiggy webhook endpoint not available. Use manual order entry instead.");
  }

  async updateOrderStatus(_orderId: string, _status: string): Promise<void> {
    // No-op in mock mode
  }

  async getMenuDiff(_restaurantId: string): Promise<MenuDiff> {
    return { missingOnAggregator: [], extraOnAggregator: [], priceMismatch: [] };
  }

  async isConnected(_restaurantId: string): Promise<boolean> {
    return false;
  }
}

export function getAggregatorAdapter(name: "zomato" | "swiggy"): AggregatorAdapter {
  switch (name) {
    case "zomato": return new MockZomatoAdapter();
    case "swiggy": return new MockSwiggyAdapter();
  }
}
