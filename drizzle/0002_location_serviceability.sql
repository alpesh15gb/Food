-- Migration 0002: Delivery location serviceability
-- Adds accuracy, source, and place ID to customer_addresses.

-- 1. Add location metadata columns to customer_addresses
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customer_addresses'
    AND column_name = 'accuracy_meters'
  ) THEN
    ALTER TABLE "customer_addresses" ADD COLUMN "accuracy_meters" integer;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customer_addresses'
    AND column_name = 'location_source'
  ) THEN
    ALTER TABLE "customer_addresses" ADD COLUMN "location_source" varchar(32);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customer_addresses'
    AND column_name = 'place_id'
  ) THEN
    ALTER TABLE "customer_addresses" ADD COLUMN "place_id" varchar(256);
  END IF;
END $$;
