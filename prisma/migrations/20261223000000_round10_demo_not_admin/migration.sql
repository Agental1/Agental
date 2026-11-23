-- Round 10 (founder's request, W14, 2026-11-22): no @demo.agental.co account
-- keeps the admin role. DECISIONS: "Admin role: contact@agental.co only".
-- Data only, no schema change, no row deleted. Each change is in the audit log
-- with the value it had before.

INSERT INTO "AuditLog" ("id", "actorUserId", "action", "resourceType", "resourceId", "before", "after", "createdAt")
SELECT 'r10_demo_admin_' || md5(u.id || clock_timestamp()::text), NULL, 'admin.account.admin_role', 'User', u.id,
       '{"isAdmin":true}',
       '{"isAdmin":false,"by":"round 10 migration, founder request (W14)"}', now()
FROM "User" u
WHERE lower(u.email) LIKE '%@demo.agental.co'
  AND u."isAdmin" = true;

UPDATE "User"
SET "isAdmin" = false
WHERE lower(email) LIKE '%@demo.agental.co'
  AND "isAdmin" = true;
