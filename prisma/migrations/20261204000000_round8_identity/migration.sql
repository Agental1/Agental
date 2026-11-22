-- Round 8, group 1: legal first and last name, and gender, on the profile.
-- Additive only: three nullable columns plus a free-text companion for
-- "Other". The old single "legalName" column stays and keeps its values; the
-- editor prefills the two new fields from it until the performer saves them.
ALTER TABLE "ArtistProfile" ADD COLUMN IF NOT EXISTS "legalFirstName" TEXT;
ALTER TABLE "ArtistProfile" ADD COLUMN IF NOT EXISTS "legalLastName" TEXT;
ALTER TABLE "ArtistProfile" ADD COLUMN IF NOT EXISTS "gender" TEXT;
ALTER TABLE "ArtistProfile" ADD COLUMN IF NOT EXISTS "genderOther" TEXT;
