import { z } from "zod";
import { adminProcedure, requirePermission, router } from "../_core/trpc";

export const inventoryRouter = router({
  // ===========================================================================
  // Raw Materials
  // ===========================================================================
  listMaterials: requirePermission("menu:read").input(z.object({ restaurantId: z.string().min(4) }))
    .query(async ({ input }) => {
      const db = await import("../db").then(m => m.getDb());
      if (!db) return [];
      const { rawMaterials } = await import("../../drizzle/schema");
      const { eq, asc } = await import("drizzle-orm");
      return db.select().from(rawMaterials)
        .where(eq(rawMaterials.restaurantId, input.restaurantId))
        .orderBy(asc(rawMaterials.name))
        .limit(500);
    }),

  createMaterial: requirePermission("menu:write").input(z.object({
    restaurantId: z.string().min(4),
    name: z.string().trim().min(1).max(180),
    unit: z.string().min(1).max(16),
    minStock: z.number().finite().min(0).optional(),
    costPerUnitPaise: z.number().int().min(0).optional(),
    supplierId: z.string().optional(),
    category: z.string().max(64).optional(),
  }))
    .mutation(async ({ input }) => {
      const db = await import("../db").then(m => m.getDb());
      if (!db) throw new Error("Database unavailable");
      const { rawMaterials, suppliers } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      if (input.supplierId) {
        const [sup] = await db.select().from(suppliers).where(eq(suppliers.id, input.supplierId)).limit(1);
        if (!sup || sup.restaurantId !== input.restaurantId) {
          throw new Error("Supplier does not belong to this restaurant.");
        }
      }
      const { nanoid } = await import("nanoid");
      const id = nanoid(18);
      await db.insert(rawMaterials).values({
        id,
        restaurantId: input.restaurantId,
        name: input.name,
        unit: input.unit,
        minStock: String(input.minStock ?? 0),
        costPerUnitPaise: input.costPerUnitPaise ?? 0,
        supplierId: input.supplierId,
        category: input.category,
      });
      return { id };
    }),

  updateMaterial: requirePermission("menu:write").input(z.object({
    id: z.string().min(4),
    restaurantId: z.string().min(4).optional(),
    name: z.string().min(1).max(180).optional(),
    unit: z.string().min(1).max(16).optional(),
    minStock: z.number().min(0).optional(),
    costPerUnitPaise: z.number().int().min(0).optional(),
    supplierId: z.string().nullish(),
    category: z.string().max(64).nullish(),
  }))
    .mutation(async ({ ctx, input }) => {
      const db = await import("../db").then(m => m.getDb());
      if (!db) throw new Error("Database unavailable");
      const { rawMaterials, suppliers } = await import("../../drizzle/schema");
      const { eq, and } = await import("drizzle-orm");
      const scopeId = input.restaurantId ?? ctx.restaurantId;
      const [existing] = await db.select().from(rawMaterials).where(eq(rawMaterials.id, input.id)).limit(1);
      if (!existing) throw new Error("Material not found.");
      if (scopeId && existing.restaurantId !== scopeId) {
        throw new Error("Material does not belong to this restaurant.");
      }
      if (input.supplierId) {
        const [sup] = await db.select().from(suppliers).where(eq(suppliers.id, input.supplierId)).limit(1);
        if (!sup || sup.restaurantId !== existing.restaurantId) {
          throw new Error("Supplier does not belong to this restaurant.");
        }
      }
      const updates: Record<string, unknown> = {};
      if (input.name !== undefined) updates.name = input.name;
      if (input.unit !== undefined) updates.unit = input.unit;
      if (input.minStock !== undefined) updates.minStock = String(input.minStock);
      if (input.costPerUnitPaise !== undefined) updates.costPerUnitPaise = input.costPerUnitPaise;
      if (input.supplierId !== undefined) updates.supplierId = input.supplierId;
      if (input.category !== undefined) updates.category = input.category;
      await db.update(rawMaterials).set(updates).where(and(eq(rawMaterials.id, input.id), eq(rawMaterials.restaurantId, existing.restaurantId)));
      return { success: true };
    }),

  // H-11: Atomic stock operations with negative-stock prevention
  recordWastage: requirePermission("menu:write").input(z.object({
    materialId: z.string().min(4),
    restaurantId: z.string().min(4),
    quantity: z.number().finite().positive(),
    reason: z.string().max(500).optional(),
  }))
    .mutation(async ({ input }) => {
      const db = await import("../db").then(m => m.getDb());
      if (!db) throw new Error("Database unavailable");
      const { rawMaterials, stockMovements } = await import("../../drizzle/schema");
      const { eq, and, sql } = await import("drizzle-orm");
      const { nanoid } = await import("nanoid");

      // Validate sufficient stock before deducting + tenant ownership.
      const [material] = await db.select({ currentStock: rawMaterials.currentStock, restaurantId: rawMaterials.restaurantId })
        .from(rawMaterials).where(eq(rawMaterials.id, input.materialId)).limit(1);
      if (!material) throw new Error("Material not found.");
      if (material.restaurantId !== input.restaurantId) {
        throw new Error("Material does not belong to this restaurant.");
      }
      if (parseFloat(String(material.currentStock)) < input.quantity) {
        throw new Error(`Insufficient stock. Available: ${material.currentStock}, requested: ${input.quantity}`);
      }

      // Atomic deduction — only deduct if stock remains non-negative
      const updated = await db.update(rawMaterials)
        .set({ currentStock: sql`${rawMaterials.currentStock} - ${String(input.quantity)}` })
        .where(and(
          eq(rawMaterials.id, input.materialId),
          sql`${rawMaterials.currentStock} >= ${String(input.quantity)}`,
        ))
        .returning({ id: rawMaterials.id });
      if (updated.length === 0) {
        throw new Error("Insufficient stock or material not found (concurrent update).");
      }

      await db.insert(stockMovements).values({
        id: nanoid(18),
        restaurantId: input.restaurantId,
        rawMaterialId: input.materialId,
        type: "WASTAGE",
        quantity: String(input.quantity),
        referenceType: "WASTAGE",
        notes: input.reason,
      });

      return { success: true };
    }),

  adjustStock: requirePermission("menu:write").input(z.object({
    materialId: z.string().min(4),
    restaurantId: z.string().min(4),
    quantity: z.number().finite(),
    notes: z.string().max(500).optional(),
  }))
    .mutation(async ({ input }) => {
      const db = await import("../db").then(m => m.getDb());
      if (!db) throw new Error("Database unavailable");
      const { rawMaterials, stockMovements } = await import("../../drizzle/schema");
      const { eq, and, sql } = await import("drizzle-orm");
      const { nanoid } = await import("nanoid");

      if (!Number.isFinite(input.quantity) || input.quantity === 0) {
        throw new Error("Quantity must be a non-zero number.");
      }
      const [owner] = await db.select({ restaurantId: rawMaterials.restaurantId })
        .from(rawMaterials).where(eq(rawMaterials.id, input.materialId)).limit(1);
      if (!owner) throw new Error("Material not found.");
      if (owner.restaurantId !== input.restaurantId) {
        throw new Error("Material does not belong to this restaurant.");
      }
      const absQty = Math.abs(input.quantity);
      // H-11: Atomic stock adjustment — deductions guarded by WHERE stock >= qty.
      if (input.quantity < 0) {
        const updated = await db.update(rawMaterials)
          .set({ currentStock: sql`${rawMaterials.currentStock} - ${String(absQty)}` })
          .where(and(
            eq(rawMaterials.id, input.materialId),
            sql`${rawMaterials.currentStock} >= ${String(absQty)}`,
          ))
          .returning({ id: rawMaterials.id });
        if (updated.length === 0) {
          throw new Error("Insufficient stock or material not found (concurrent update).");
        }
      } else {
        const updated = await db.update(rawMaterials)
          .set({ currentStock: sql`${rawMaterials.currentStock} + ${String(absQty)}` })
          .where(eq(rawMaterials.id, input.materialId))
          .returning({ id: rawMaterials.id });
        if (updated.length === 0) {
          throw new Error("Material not found.");
        }
      }

      await db.insert(stockMovements).values({
        id: nanoid(18),
        restaurantId: input.restaurantId,
        rawMaterialId: input.materialId,
        type: "ADJUSTMENT",
        quantity: String(absQty),
        referenceType: "MANUAL",
        notes: input.notes,
      });

      return { success: true };
    }),

  getLowStockAlerts: requirePermission("menu:read").input(z.object({ restaurantId: z.string().min(4) }))
    .query(async ({ input }) => {
      const db = await import("../db").then(m => m.getDb());
      if (!db) return [];
      const { rawMaterials } = await import("../../drizzle/schema");
      const { eq, and, sql } = await import("drizzle-orm");
      return db.select().from(rawMaterials)
        .where(and(
          eq(rawMaterials.restaurantId, input.restaurantId),
          sql`${rawMaterials.currentStock} <= ${rawMaterials.minStock}`,
        ));
    }),

  // ===========================================================================
  // Suppliers
  // ===========================================================================
  listSuppliers: requirePermission("menu:read").input(z.object({ restaurantId: z.string().min(4) }))
    .query(async ({ input }) => {
      const db = await import("../db").then(m => m.getDb());
      if (!db) return [];
      const { suppliers } = await import("../../drizzle/schema");
      const { eq, asc } = await import("drizzle-orm");
      return db.select().from(suppliers)
        .where(eq(suppliers.restaurantId, input.restaurantId))
        .orderBy(asc(suppliers.name))
        .limit(500);
    }),

  createSupplier: requirePermission("menu:write").input(z.object({
    restaurantId: z.string().min(4),
    name: z.string().trim().min(1).max(180),
    phone: z.string().trim().max(24).optional(),
    email: z.string().trim().email().max(320).optional(),
    address: z.string().max(500).optional(),
  }))
    .mutation(async ({ input }) => {
      const db = await import("../db").then(m => m.getDb());
      if (!db) throw new Error("Database unavailable");
      const { suppliers } = await import("../../drizzle/schema");
      const { nanoid } = await import("nanoid");
      const id = nanoid(18);
      await db.insert(suppliers).values({ id, ...input });
      return { id };
    }),

  // ===========================================================================
  // Recipes
  // ===========================================================================
  getRecipe: requirePermission("menu:read").input(z.object({ menuItemId: z.string().min(4), restaurantId: z.string().min(4).optional() }))
    .query(async ({ ctx, input }) => {
      const db = await import("../db").then(m => m.getDb());
      if (!db) return null;
      const { recipes, recipeIngredients, rawMaterials, menuItems } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");

      const scopeId = input.restaurantId ?? ctx.restaurantId;
      if (scopeId) {
        const [menuItem] = await db.select().from(menuItems).where(eq(menuItems.id, input.menuItemId)).limit(1);
        if (!menuItem) return null;
        if (menuItem.restaurantId !== scopeId) throw new Error("Menu item does not belong to this restaurant.");
      }
      const [recipe] = await db.select().from(recipes)
        .where(eq(recipes.menuItemId, input.menuItemId)).limit(1);
      if (!recipe) return null;

      const ingredients = await db.select({
        id: recipeIngredients.id,
        rawMaterialId: recipeIngredients.rawMaterialId,
        quantityPerServing: recipeIngredients.quantityPerServing,
        unit: recipeIngredients.unit,
        materialName: rawMaterials.name,
      })
        .from(recipeIngredients)
        .innerJoin(rawMaterials, eq(recipeIngredients.rawMaterialId, rawMaterials.id))
        .where(eq(recipeIngredients.recipeId, recipe.id));

      return { ...recipe, ingredients };
    }),

  saveRecipe: requirePermission("menu:write").input(z.object({
    menuItemId: z.string().min(4),
    restaurantId: z.string().min(4).optional(),
    notes: z.string().max(2000).optional(),
    ingredients: z.array(z.object({
      rawMaterialId: z.string().min(4),
      quantityPerServing: z.number().finite().positive(),
      unit: z.string().min(1).max(16),
    })).max(100),
  }))
    .mutation(async ({ ctx, input }) => {
      const db = await import("../db").then(m => m.getDb());
      if (!db) throw new Error("Database unavailable");
      const { recipes, recipeIngredients, menuItems, rawMaterials } = await import("../../drizzle/schema");
      const { eq, inArray } = await import("drizzle-orm");
      const { nanoid } = await import("nanoid");

      const scopeId = input.restaurantId ?? ctx.restaurantId;
      const [menuItem] = await db.select().from(menuItems).where(eq(menuItems.id, input.menuItemId)).limit(1);
      if (!menuItem) throw new Error("Menu item not found.");
      if (scopeId && menuItem.restaurantId !== scopeId) {
        throw new Error("Menu item does not belong to this restaurant.");
      }
      if (input.ingredients.length > 0) {
        const ids = Array.from(new Set(input.ingredients.map(i => i.rawMaterialId)));
        const mats = await db.select().from(rawMaterials).where(inArray(rawMaterials.id, ids));
        if (mats.length !== ids.length || mats.some(m => m.restaurantId !== menuItem.restaurantId)) {
          throw new Error("All ingredients must belong to the same restaurant as the menu item.");
        }
      }
      const [existing] = await db.select().from(recipes)
        .where(eq(recipes.menuItemId, input.menuItemId)).limit(1);

      let recipeId: string;
      if (existing) {
        recipeId = existing.id;
        await db.update(recipes).set({ notes: input.notes }).where(eq(recipes.id, recipeId));
        await db.delete(recipeIngredients).where(eq(recipeIngredients.recipeId, recipeId));
      } else {
        recipeId = nanoid(18);
        await db.insert(recipes).values({ id: recipeId, menuItemId: input.menuItemId, notes: input.notes });
      }

      if (input.ingredients.length > 0) {
        await db.insert(recipeIngredients).values(
          input.ingredients.map(ing => ({
            id: nanoid(18),
            recipeId,
            rawMaterialId: ing.rawMaterialId,
            quantityPerServing: String(ing.quantityPerServing),
            unit: ing.unit,
          }))
        );
      }

      return { recipeId };
    }),

  // ===========================================================================
  // Purchase Orders
  // ===========================================================================
  listPurchaseOrders: requirePermission("menu:read").input(z.object({ restaurantId: z.string().min(4) }))
    .query(async ({ input }) => {
      const db = await import("../db").then(m => m.getDb());
      if (!db) return [];
      const { purchaseOrders, suppliers } = await import("../../drizzle/schema");
      const { eq, desc } = await import("drizzle-orm");
      return db.select({
        id: purchaseOrders.id,
        status: purchaseOrders.status,
        totalPaise: purchaseOrders.totalPaise,
        createdAt: purchaseOrders.createdAt,
        receivedAt: purchaseOrders.receivedAt,
        supplierName: suppliers.name,
      })
        .from(purchaseOrders)
        .leftJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
        .where(eq(purchaseOrders.restaurantId, input.restaurantId))
        .orderBy(desc(purchaseOrders.createdAt))
        .limit(200);
    }),

  receivePurchaseOrder: requirePermission("menu:write").input(z.object({ poId: z.string().min(4), restaurantId: z.string().min(4) }))
    .mutation(async ({ input }) => {
      const db = await import("../db").then(m => m.getDb());
      if (!db) throw new Error("Database unavailable");
      const { purchaseOrders, purchaseOrderItems, rawMaterials, stockMovements } = await import("../../drizzle/schema");
      const { eq, and, sql } = await import("drizzle-orm");
      const { nanoid } = await import("nanoid");

      // H-16: Verify PO belongs to this restaurant
      const [po] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, input.poId)).limit(1);
      if (!po) throw new Error("Purchase order not found.");
      if (po.restaurantId !== input.restaurantId) {
        throw new Error("Purchase order does not belong to this restaurant.");
      }
      // Status guard: only DRAFT/SENT can transition to RECEIVED.
      if (po.status === "RECEIVED") {
        throw new Error("Purchase order has already been received.");
      }
      if (po.status === "CANCELLED") {
        throw new Error("Cancelled purchase orders cannot be received.");
      }

      const items = await db.select().from(purchaseOrderItems)
        .where(eq(purchaseOrderItems.purchaseOrderId, input.poId));

      // Atomic receive: PO status flip + stock increments + movements in one tx.
      await db.transaction(async (tx) => {
        const bumped = await tx.update(purchaseOrders)
          .set({ status: "RECEIVED", receivedAt: new Date() })
          .where(and(eq(purchaseOrders.id, input.poId), eq(purchaseOrders.status, po.status)))
          .returning({ id: purchaseOrders.id });
        if (bumped.length === 0) {
          throw new Error("Purchase order was modified concurrently. Please retry.");
        }
        for (const item of items) {
          await tx.update(rawMaterials)
            .set({ currentStock: sql`${rawMaterials.currentStock} + ${item.quantity}` })
            .where(eq(rawMaterials.id, item.rawMaterialId));

          await tx.insert(stockMovements).values({
            id: nanoid(18),
            restaurantId: input.restaurantId,
            rawMaterialId: item.rawMaterialId,
            type: "IN",
            quantity: item.quantity,
            referenceType: "PURCHASE",
            referenceId: input.poId,
          });
        }
      });

      return { success: true, itemsReceived: items.length };
    }),
});
