-- Repair for 20261024000000_cleanup_stale_admin_module_grants, which used to
-- delete the per-button "prop_*" Properties permissions from every admin.
-- Re-applies the same rule as 20261015000100_property_button_permissions_
-- backfill: anyone who can open Properties gets every property-page button.
-- Idempotent (ON CONFLICT DO NOTHING), so it is a no-op on databases where
-- the grants were never removed.
INSERT INTO admin_module_grants (id, user_id, module, created_at)
SELECT gen_random_uuid(), g.user_id, f.feature::"AdminModule", now()
FROM admin_module_grants g
CROSS JOIN (VALUES ('prop_building_contracts'),('prop_tenancy_terms'),('prop_tenant_report'),('prop_owner_report'),('prop_landlord_statement'),('prop_services_invoice'),('prop_annual_budget'),('prop_building_expenses'),('prop_management_report'),('prop_suppliers'),('prop_expenses'),('prop_rent_position'),('prop_rent_summary'),('prop_invoices'),('prop_unit_ledgers'),('prop_service_charge'),('prop_collection_position'),('prop_cash_flow')) AS f(feature)
WHERE g.module = 'properties'
ON CONFLICT (user_id, module) DO NOTHING;
