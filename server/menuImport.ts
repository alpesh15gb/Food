/** CSV menu importer: validate all rows first, then publish as one all-or-nothing restaurant update. */
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { menuCategories, menuItems } from "../drizzle/schema";
import { getDb } from "./db";

const expectedHeaders = ["category", "name", "description", "price", "dietary_type", "availability", "image_url", "tag", "customizable"] as const;
const availabilityValues = ["AVAILABLE", "SOLD_OUT", "SCHEDULED_UNAVAILABLE", "OUT_OF_STOCK", "DISABLED"] as const;
type Availability = typeof availabilityValues[number];
type ImportRow = { rowNumber: number; category: string; name: string; description: string; pricePaise: number; dietaryType: "veg" | "nonveg" | "egg"; availability: Availability; imageUrl?: string; tag?: string; customizable: boolean; errors: string[] };

function readCsv(input: string) {
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let quoted = false;
  for (let i = 0; i < input.length; i += 1) { const char = input[i]; const next = input[i + 1]; if (char === "\"" && quoted && next === "\"") { cell += "\""; i += 1; } else if (char === "\"") quoted = !quoted; else if (char === "," && !quoted) { row.push(cell.trim()); cell = ""; } else if ((char === "\n" || char === "\r") && !quoted) { if (char === "\r" && next === "\n") i += 1; row.push(cell.trim()); if (row.some(value => value)) rows.push(row); row = []; cell = ""; } else cell += char; }
  row.push(cell.trim()); if (row.some(value => value)) rows.push(row); return rows;
}
const slugify = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export function previewMenuImport(csv: string) {
  const matrix = readCsv(csv.replace(/^\uFEFF/, ""));
  if (matrix.length < 2) return { columns: expectedHeaders, rows: [], valid: 0, invalid: 1, errors: ["Add a header row and at least one menu item."] };
  const headers = matrix[0].map(value => value.toLowerCase().replace(/\s+/g, "_"));
  const missing = expectedHeaders.filter(header => !headers.includes(header));
  if (missing.length) return { columns: expectedHeaders, rows: [], valid: 0, invalid: 1, errors: [`Missing column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}.`] };
  if (matrix.length > 1000) return { columns: expectedHeaders, rows: [], valid: 0, invalid: 1, errors: ["Import a maximum of 1,000 dishes at a time."] };
  const index = (header: string) => headers.indexOf(header);
  const rows: ImportRow[] = matrix.slice(1).map((values, rowIndex) => {
    const errors: string[] = []; const category = values[index("category")]?.trim() ?? ""; const name = values[index("name")]?.trim() ?? ""; const description = values[index("description")]?.trim() ?? ""; const price = Number(values[index("price")]?.replace(/[^0-9.]/g, "")); const dietaryRaw = (values[index("dietary_type")] || "veg").trim().toLowerCase(); const availabilityRaw = (values[index("availability")] || "AVAILABLE").trim().toUpperCase(); const imageUrl = values[index("image_url")]?.trim() || undefined; const tag = values[index("tag")]?.trim() || undefined; const customRaw = (values[index("customizable")] || "no").trim().toLowerCase();
    if (!category) errors.push("Category is required."); if (!name) errors.push("Dish name is required."); if (!Number.isFinite(price) || price <= 0) errors.push("Price must be greater than ₹0."); if (!(["veg", "nonveg", "egg"] as string[]).includes(dietaryRaw)) errors.push("Dietary type must be veg, nonveg, or egg."); if (!(availabilityValues as readonly string[]).includes(availabilityRaw)) errors.push("Availability is invalid."); if (imageUrl && !/^https?:\/\//i.test(imageUrl) && !imageUrl.startsWith("/assets/")) errors.push("Image URL must start with https:// or /assets/."); if (!(["yes", "no", "true", "false", "1", "0"] as string[]).includes(customRaw)) errors.push("Customizable must be yes or no.");
    return { rowNumber: rowIndex + 2, category, name, description, pricePaise: Math.round(price * 100), dietaryType: (dietaryRaw === "nonveg" || dietaryRaw === "egg" ? dietaryRaw : "veg") as "veg" | "nonveg" | "egg", availability: (availabilityValues as readonly string[]).includes(availabilityRaw) ? availabilityRaw as Availability : "AVAILABLE", imageUrl, tag, customizable: ["yes", "true", "1"].includes(customRaw), errors };
  });
  return { columns: expectedHeaders, rows, valid: rows.filter(row => !row.errors.length).length, invalid: rows.filter(row => row.errors.length).length, errors: [] as string[] };
}

export async function applyMenuImport(restaurantId: string, csv: string) {
  const preview = previewMenuImport(csv);
  if (preview.errors.length || preview.invalid) throw new Error(preview.errors[0] ?? "Correct each highlighted row before publishing the menu.");
  const db = await getDb(); if (!db) throw new Error("The database connection is not available.");
  const categories = await db.select().from(menuCategories).where(eq(menuCategories.restaurantId, restaurantId));
  const categoryByName = new Map(categories.map(category => [category.name.toLowerCase(), category]));
  let created = 0; let updated = 0;
  for (const row of preview.rows) {
    const categoryKey = row.category.toLowerCase();
    let category = categoryByName.get(categoryKey);
    if (!category) {
      const newCat = {
        id: nanoid(18),
        restaurantId,
        name: row.category,
        slug: slugify(row.category) || nanoid(8),
        description: null,
        imageUrl: null,
        iconEmoji: null,
        sortOrder: categoryByName.size + 1,
        isVisible: true,
        isOpen: true,
        createdAt: new Date(),
      };
      await db.insert(menuCategories).values(newCat);
      categoryByName.set(categoryKey, newCat);
      category = newCat;
    }
    const existing = (await db.select().from(menuItems).where(and(eq(menuItems.restaurantId, restaurantId), eq(menuItems.categoryId, category.id), eq(menuItems.name, row.name))).limit(1))[0];
    const values = { description: row.description || null, pricePaise: row.pricePaise, imageUrl: row.imageUrl ?? null, dietaryType: row.dietaryType, availability: row.availability, availableNote: null, tag: row.tag ?? null, isCustomizable: row.customizable, sortOrder: row.rowNumber };
    if (existing) { await db.update(menuItems).set(values).where(eq(menuItems.id, existing.id)); updated += 1; }
    else { await db.insert(menuItems).values({ id: nanoid(18), restaurantId, categoryId: category.id, name: row.name, ...values }); created += 1; }
  }
  return { created, updated, total: preview.rows.length };
}
