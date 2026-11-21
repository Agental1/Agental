-- Two optional profile links: an IMDb name page and a portfolio or website.
-- Additive only: nullable columns, no default, nothing rewritten.
ALTER TABLE "public"."ArtistProfile" ADD COLUMN "imdbUrl" TEXT;
ALTER TABLE "public"."ArtistProfile" ADD COLUMN "portfolioUrl" TEXT;
