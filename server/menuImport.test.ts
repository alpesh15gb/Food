import { describe, expect, it } from "vitest";
import { previewMenuImport } from "./menuImport";

const header = "category,name,description,price,dietary_type,availability,image_url,tag,customizable";

describe("menu CSV preview", () => {
  it("accepts valid menu rows and normalizes money to paise", () => {
    const preview = previewMenuImport(`${header}\nBurgers,House Burger,With local vegetables,245,veg,AVAILABLE,,,yes`);
    expect(preview.valid).toBe(1);
    expect(preview.rows[0]).toMatchObject({ pricePaise: 24500, dietaryType: "veg", customizable: true });
  });

  it("stops invalid rows before a menu is published", () => {
    const preview = previewMenuImport(`${header}\n,,Missing values,0,meat,MAYBE,,,`);
    expect(preview.invalid).toBe(1);
    expect(preview.rows[0]?.errors.length).toBeGreaterThan(2);
  });
});
