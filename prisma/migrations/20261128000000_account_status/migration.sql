-- Round 7: account status set by staff, and the agents opt-in. Additive only.
ALTER TABLE "public"."User" ADD COLUMN IF NOT EXISTS "accountStatus" TEXT NOT NULL DEFAULT 'UNREVIEWED';
ALTER TABLE "public"."User" ADD COLUMN IF NOT EXISTS "agentsOptInAt" TIMESTAMP(3);
ALTER TABLE "public"."User" ADD COLUMN IF NOT EXISTS "autoSearchOptIn" BOOLEAN NOT NULL DEFAULT false;

-- Carry over the older classification (workflowAccess) so nothing reviewed is lost.
UPDATE "public"."User" SET "accountStatus" = 'TEST' WHERE "workflowAccess" = 'TEST' AND "accountStatus" = 'UNREVIEWED';
UPDATE "public"."User" SET "accountStatus" = 'APPROVED' WHERE "workflowAccess" = 'ELIGIBLE' AND "accountStatus" = 'UNREVIEWED';

-- A first click on "Start finding roles" before this column existed counts as the opt-in.
UPDATE "public"."User" u SET "agentsOptInAt" = r.first
FROM (SELECT "userId", MIN("createdAt") AS first FROM "public"."role_search_requests" GROUP BY "userId") r
WHERE r."userId" = u.id AND u."agentsOptInAt" IS NULL;

CREATE INDEX IF NOT EXISTS "User_accountStatus_idx" ON "public"."User" ("accountStatus");
