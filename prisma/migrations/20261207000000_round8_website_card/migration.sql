-- Round 8, group 4: a performer who already has a website can hide the
-- dashboard's "Improve your website" line for good. Additive: one nullable column.
ALTER TABLE "ArtistProfile" ADD COLUMN IF NOT EXISTS "websiteCardDismissedAt" TIMESTAMP(3);
