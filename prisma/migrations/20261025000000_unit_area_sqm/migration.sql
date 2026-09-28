-- Rentable floor area per unit, in square metres. Nullable: existing units
-- simply have no area recorded until someone enters one.
ALTER TABLE "units" ADD COLUMN IF NOT EXISTS "area_sqm" DECIMAL(12,2);
