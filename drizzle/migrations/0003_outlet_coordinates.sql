-- Add coordinates_confirmed_at to outlets for admin-confirmed pickup pin tracking
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'outlets' AND column_name = 'coordinates_confirmed_at') THEN
    ALTER TABLE "outlets" ADD COLUMN "coordinates_confirmed_at" timestamp;
  END IF;
END $$;
