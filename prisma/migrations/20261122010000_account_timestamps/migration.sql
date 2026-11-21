-- When a sign-in method (Google, Apple) joined an account and when it was last
-- used, for the Connected accounts screen.
--
-- Added in two steps on purpose: a column created with a default would stamp
-- every existing connection with the time of this migration, which would be a
-- false "connected on" date. Existing rows stay empty; new rows get the time.
ALTER TABLE "public"."Account" ADD COLUMN "createdAt" TIMESTAMP(3);
ALTER TABLE "public"."Account" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "public"."Account" ADD COLUMN "lastUsedAt" TIMESTAMP(3);
