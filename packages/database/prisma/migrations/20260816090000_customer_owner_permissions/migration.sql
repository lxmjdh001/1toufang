INSERT INTO "RolePermission" ("id", "roleId", "permissionId")
SELECT
  'rp_' || md5(random()::text || clock_timestamp()::text || r."id" || p."id"),
  r."id",
  p."id"
FROM "Role" r
CROSS JOIN "Permission" p
WHERE r."name" = 'Owner'
  AND p."code" IN (
    'ad_accounts.view',
    'ad_accounts.manage',
    'campaigns.create',
    'campaigns.publish',
    'campaigns.budget.update',
    'campaigns.status.update',
    'campaigns.delete',
    'media.manage',
    'copywriting.manage',
    'targeting.manage',
    'strategies.manage',
    'automation.manage',
    'pixels.manage',
    'finance.view',
    'reports.view',
    'reports.export'
  )
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
