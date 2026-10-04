-- Per-item GST: reserve NULL for "not configured", so the restaurant's
-- gst_percentage actually applies.
--
-- menu_items.tax_percent defaulted to "0" and createMenuItem hardcoded "0", so
-- every dish looked like a deliberately zero-rated item. That forced
-- orderPricing into its per-item branch for every cart, where each line is
-- taxed at ITS OWN rate — so taxPaise was 0 on every order and the restaurant's
-- configured 5/12/18% was silently never collected. The quote response even
-- returned taxPercent: 5 next to taxPaise: 0.
--
-- No code path ever wrote a deliberate per-item rate (updateMenuItem does not
-- include taxPercent), so every existing "0" is the default rather than an
-- intentional zero-rating. Converting them to NULL restores the restaurant rate.
-- An explicit 0 can still be set later for a genuinely zero-rated item.

ALTER TABLE "menu_items" ALTER COLUMN "tax_percent" DROP DEFAULT;

-- Guarded so a replay is a no-op.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "menu_items" WHERE "tax_percent" = 0) THEN
    UPDATE "menu_items" SET "tax_percent" = NULL WHERE "tax_percent" = 0;
  END IF;
END $$;
