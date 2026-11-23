-- Round 9: switches staff change in Admin > Controls (which automatic email
-- categories may go out, and in group 9 the pause switch). Additive: one new
-- table, RLS on, no policy. Every change is also in the audit log.
CREATE TABLE IF NOT EXISTS "AppSetting" (
  "key" TEXT PRIMARY KEY,
  "value" TEXT NOT NULL,
  "updatedById" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE "AppSetting" ENABLE ROW LEVEL SECURITY;
