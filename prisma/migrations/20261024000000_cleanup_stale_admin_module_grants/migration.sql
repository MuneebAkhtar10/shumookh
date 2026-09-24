-- The Postgres "AdminModule" type has carried a batch of unused legacy
-- values ("prop_building_contracts", "prop_tenant_report", ...) from an
-- earlier, more granular per-report permission design that was dropped
-- before this table existed. Because CREATE TYPE is only run guarded by
-- "EXCEPTION WHEN duplicate_object" in 20261013000000_super_admin_module_permissions,
-- it silently kept those old labels instead of trimming the type down to
-- the current 17 modules — and that same migration's bulk grant
-- (`enum_range(NULL::"AdminModule")`) then handed every admin every one of
-- those dead labels. `grantedAdminModules()` in lib/permissions.ts can't
-- deserialize a module value that isn't in the Prisma schema's enum, so any
-- admin holding one of these grants gets a PrismaClientKnownRequestError
-- the moment their dashboard/nav loads.
--
-- Postgres enum labels can't be dropped without recreating the type, so this
-- only deletes the grants referencing them — safe and idempotent (deleting
-- rows that don't exist is a no-op) on every environment that inherited the
-- same bulk grant.
DELETE FROM "admin_module_grants"
WHERE "module"::text NOT IN (
  'dashboard', 'onboarding', 'properties', 'tenancies', 'maintenance',
  'finances', 'service_charges', 'invoices', 'expenses', 'communications',
  'reports', 'suppliers', 'people', 'rejections', 'qr_code', 'dynamics',
  'settings'
);
