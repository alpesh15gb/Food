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
        .orderBy(asc(rawMaterials.name));
    }),

  createMaterial: requirePermission("menu:write").input(z.object({
    restaurantId: z.string().min(4),
    name: z.string().min(1).max(180),
    unit: z.string().min(1).max(16),
    minStock: z.number().min(0).optional(),
    costPerUnitPaise: z.number().int().min(0).optional(),
    supplierId: z.string().optional(),
    category: z.string().max(64).optional(),
  }))
    .mutation(async ({ input }) => {
      const db = await import("../db").then(m => m.getDb());
      if (!db) throw new Error("Database unavailable");
      const { rawMaterials } = await import("../../drizzle/schema");
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
    name: z.string().min(1).max(180).optional(),
    unit: z.string().min(1).max(16).optional(),
    minStock: z.number().min(0).optional(),
    costPerUnitPaise: z.number().int().min(0).optional(),
    supplierId: z.string().nullish(),
    category: z.string().max(64).nullish(),
  }))
    .mutation(async ({ input }) => {
      const db = await import("../db").then(m => m.getDb());
      if (!db) throw new Error("Database unavailable");
      const { rawMaterials } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const updates: Record<string, unknown> = {};
      if (input.name !== undefined) updates.name = input.name;
      if (input.unit !== undefined) updates.unit = input.unit;
      if (input.minStock !== undefined) updates.minStock = String(input.minStock);
      if (input.costPerUnitPaise !== undefined) updates.costPerUnitPaise = input.costPerUnitPaise;
      if (input.supplierId !== undefined) updates.supplierId = input.supplierId;
      if (input.category !== undefined) updates.category = input.category;
      await db.update(rawMaterials).set(updates).where(eq(rawMaterials.id, input.id));
      return { success: true };
    }),

  recordWastage: requirePermission("menu:write").input(z.object({
    materialId: z.string().min(4),
    restaurantId: z.string().min(4),
    quantity: z.number().positive(),
    reason: z.string().max(500).optional(),
  }))
    .mutation(async ({ input }) => {
      const db = await import("../db").then(m => m.getDb());
      if (!db) throw new Error("Database unavailable");
      const { rawMaterials, stockMovements } = await import("../../drizzle/schema");
      const { eq, sql } = await import("drizzle-orm");
      const { nanoid } = await import("nanoid");

      await db.update(rawMaterials)
        .set({ currentStock: sql`${rawMaterials.currentStock} - ${String(input.quantity)}` })
        .where(eq(rawMaterials.id, input.materialId));

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
    quantity: z.number(),
    notes: z.string().max(500).optional(),
  }))
    .mutation(async ({ input }) => {
      const db = await import("../db").then(m => m.getDb());
      if (!db) throw new Error("Database unavailable");
      const { rawMaterials, stockMovements } = await import("../../drizzle/schema");
      const { eq, sql } = await import("drizzle-orm");
      const { nanoid } = await import("nanoid");

      const op = input.quantity >= 0 ? "+" : "-";
      const absQty = Math.abs(input.quantity);
      await db.update(rawMaterials)
        .set({ currentStock: sql`${rawMaterials.currentStock} ${sql.raw(op)} ${String(absQty)}` })
        .where(eq(rawMaterials.id, input.materialId));

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
        .orderBy(asc(suppliers.name));
    }),

  createSupplier: requirePermission("menu:write").input(z.object({
    restaurantId: z.string().min(4),
    name: z.string().min(1).max(180),
    phone: z.string().max(24).optional(),
    email: z.string().email().max(320).optional(),
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
  getRecipe: requirePermission("menu:read").input(z.object({ menuItemId: z.string().min(4) }))
    .query(async ({ input }) => {
      const db = await import("../db").then(m => m.getDb());
      if (!db) return null;
      const { recipes, recipeIngredients, rawMaterials } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");

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
    notes: z.string().optional(),
    ingredients: z.array(z.object({
      rawMaterialId: z.string().min(4),
      quantityPerServing: z.number().positive(),
      unit: z.string().min(1).max(16),
    })),
  }))
    .mutation(async ({ input }) => {
      const db = await import("../db").then(m => m.getDb());
      if (!db) throw new Error("Database unavailable");
      const { recipes, recipeIngredients } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const { nanoid } = await import("nanoid");

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
        .orderBy(desc(purchaseOrders.createdAt));
    }),

  receivePurchaseOrder: requirePermission("menu:write").input(z.object({ poId: z.string().min(4), restaurantId: z.string().min(4) }))
    .mutation(async ({ input }) => {
      const db = await import("../db").then(m => m.getDb());
      if (!db) throw new Error("Database unavailable");
      const { purchaseOrders, purchaseOrderItems, rawMaterials, stockMovements } = await import("../../drizzle/schema");
      const { eq, sql } = await import("drizzle-orm");
      const { nanoid } = await import("nanoid");

      await db.update(purchaseOrders)
        .set({ status: "RECEIVED", receivedAt: new Date() })
        .where(eq(purchaseOrders.id, input.poId));

      const items = await db.select().from(purchaseOrderItems)
        .where(eq(purchaseOrderItems.purchaseOrderId, input.poId));

      for (const item of items) {
        await db.update(rawMaterials)
          .set({ currentStock: sql`${rawMaterials.currentStock} + ${item.quantity}` })
          .where(eq(rawMaterials.id, item.rawMaterialId));

        await db.insert(stockMovements).values({
          id: nanoid(18),
          restaurantId: input.restaurantId,
          rawMaterialId: item.rawMaterialId,
          type: "IN",
          quantity: item.quantity,
          referenceType: "PURCHASE",
          referenceId: input.poId,
        });
      }

      return { success: true, itemsReceived: items.length };
    }),
});
