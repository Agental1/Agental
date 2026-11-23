-- Round 10, group 2: the 6-digit code that verifies a sign-up email. Additive.
-- Only a keyed hash of the code is stored. RLS on, no policy, no privilege for
-- the Data API roles (the app reaches it as the table owner).
CREATE TABLE IF NOT EXISTS "EmailVerificationCode" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailVerificationCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "EmailVerificationCode_userId_createdAt_idx" ON "EmailVerificationCode" ("userId", "createdAt");

ALTER TABLE "EmailVerificationCode" ENABLE ROW LEVEL SECURITY;
