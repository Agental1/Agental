-- Round 3 Group 4. Additive only: nullable columns and one new table.

-- Profile picture.
ALTER TABLE "public"."ArtistProfile" ADD COLUMN "avatarKey" TEXT;
ALTER TABLE "public"."ArtistProfile" ADD COLUMN "avatarUpdatedAt" TIMESTAMP(3);

-- College student discount by school email: the address that proved it.
-- Unique, so one school address verifies one account. NULLs do not collide.
ALTER TABLE "public"."User" ADD COLUMN "studentEmail" TEXT;
CREATE UNIQUE INDEX "User_studentEmail_key" ON "public"."User"("studentEmail");

CREATE TABLE "public"."StudentEmailClaim" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StudentEmailClaim_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StudentEmailClaim_tokenHash_key" ON "public"."StudentEmailClaim"("tokenHash");
CREATE INDEX "StudentEmailClaim_userId_createdAt_idx" ON "public"."StudentEmailClaim"("userId", "createdAt");
CREATE INDEX "StudentEmailClaim_email_idx" ON "public"."StudentEmailClaim"("email");
ALTER TABLE "public"."StudentEmailClaim" ADD CONSTRAINT "StudentEmailClaim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- No Data API access, as for every table (RLS on, no policy).
ALTER TABLE "public"."StudentEmailClaim" ENABLE ROW LEVEL SECURITY;
