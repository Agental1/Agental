-- Round 8b, group 4: "Choose" on a plan. No payment is taken.
-- Additive: two nullable User columns and two new tables (RLS on, no policy:
-- only the app's server role reads or writes them).

-- "USC student verified" and when, from a 6-digit code sent to a @usc.edu address.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "uscVerifiedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "uscVerifiedEmail" TEXT;
-- One @usc.edu address verifies one account (the column is new, so empty).
CREATE UNIQUE INDEX IF NOT EXISTS "User_uscVerifiedEmail_key" ON "User" ("uscVerifiedEmail");

-- One code per send. Only a keyed hash of the code is stored; it expires after
-- 10 minutes and allows 5 attempts.
CREATE TABLE IF NOT EXISTS "PromoVerificationCode" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "promotionId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PromoVerificationCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "PromoVerificationCode_userId_createdAt_idx" ON "PromoVerificationCode" ("userId", "createdAt");

-- Who chose which plan while card payments are closed (plan, price, promotion,
-- date), so the team can contact them when payments open.
CREATE TABLE IF NOT EXISTS "PlanChoice" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "plan" TEXT NOT NULL,
  "priceCents" INTEGER NOT NULL,
  "promotionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlanChoice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "PlanChoice_createdAt_idx" ON "PlanChoice" ("createdAt");
CREATE INDEX IF NOT EXISTS "PlanChoice_userId_createdAt_idx" ON "PlanChoice" ("userId", "createdAt");

ALTER TABLE "PromoVerificationCode" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PlanChoice" ENABLE ROW LEVEL SECURITY;
