-- Round 8d, group 3: two-factor authentication for the admin role (TOTP, the
-- 6-digit codes of an authenticator app). Additive: one new table, RLS on, no
-- policy: only the app's server role reads or writes it.
--
-- The secret is stored encrypted (AES-256-GCM, key derived from AUTH_SECRET),
-- never in clear. `lastStep` refuses a code used twice.
CREATE TABLE IF NOT EXISTS "AdminTotp" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "secretEnc" TEXT NOT NULL,
  "verifiedAt" TIMESTAMP(3),
  "lastStep" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminTotp_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "AdminTotp_userId_key" ON "AdminTotp" ("userId");

ALTER TABLE "AdminTotp" ENABLE ROW LEVEL SECURITY;
