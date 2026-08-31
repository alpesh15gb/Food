-- PREFLIGHT: Check for duplicate non-null mobile numbers before
-- creating unique index on customer_profiles.mobile_number.
--
-- Run BEFORE applying migration 0001.
-- If duplicates exist, this script shows them so you can decide
-- how to resolve before applying the unique index.

-- Show duplicate phones (if any)
SELECT mobile_number, COUNT(*) as cnt, array_agg(id) as profile_ids
FROM customer_profiles
WHERE mobile_number IS NOT NULL AND mobile_number != ''
GROUP BY mobile_number
HAVING COUNT(*) > 1;

-- If duplicates are found, you have three options:
-- 1. Manually merge the duplicate profiles (recommended)
-- 2. Keep the most recent profile, archive the rest
-- 3. Set older duplicate mobile_numbers to NULL
--
-- Example: keep only the most recent profile per phone:
-- WITH ranked AS (
--   SELECT id, mobile_number,
--          ROW_NUMBER() OVER (PARTITION BY mobile_number ORDER BY created_at DESC) as rn
--   FROM customer_profiles
--   WHERE mobile_number IS NOT NULL AND mobile_number != ''
-- )
-- UPDATE customer_profiles SET mobile_number = NULL
-- WHERE id IN (SELECT id FROM ranked WHERE rn > 1);
