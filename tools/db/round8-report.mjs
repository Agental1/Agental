// Round 8: a read-only count for the owner's report, printed in the
// production build log. Aggregates only (numbers, no names, no emails), and it
// never fails the build. Remove after round 8.
//
// Why here: nobody holds the production database password locally; the build
// does (see migrate-on-production-build.mjs).
import pg from "pg";
import { migrationUrl } from "./migration-url.mjs";

if ((process.env.VERCEL_ENV ?? "") !== "production") process.exit(0);
const target = migrationUrl(process.env);
if (!target) process.exit(0);

const SQL = `
WITH p AS (
  SELECT
    "completenessScore" = 100 AS was_complete,
    NOT (
      (coalesce(trim("legalFirstName"), '') <> '' AND coalesce(trim("legalLastName"), '') <> '')
      OR position(' ' IN trim(coalesce("legalName", ''))) > 0
    ) AS no_legal_name,
    coalesce(trim(gender), '') = '' AS no_gender,
    coalesce(trim(phone), '') = '' AS no_phone,
    coalesce(trim(city), '') = '' AS no_city,
    coalesce(trim(bio), '') = '' AS no_bio,
    "birthDate" IS NULL AS no_birth_date,
    physical NOT LIKE '%"languages":["%' AS no_languages,
    physical NOT LIKE '%"heightCm":%' AS no_height,
    physical NOT LIKE '%"hair":"_%' AS no_hair,
    physical NOT LIKE '%"eyes":"_%' AS no_eyes,
    preferences NOT LIKE '%"playableAgeMin":%' AS no_age_range,
    preferences NOT LIKE '%"compensation":%' AS no_compensation,
    NOT EXISTS (SELECT 1 FROM "Media" m WHERE m."profileId" = a.id AND m.type = 'PHOTO' AND coalesce(m.category, 'SELF') = 'SELF') AS no_photo
  FROM "ArtistProfile" a
)
SELECT
  count(*) AS profiles,
  count(*) FILTER (WHERE was_complete) AS complete_before_r8,
  count(*) FILTER (WHERE was_complete AND no_legal_name) AS dropped_legal_name,
  count(*) FILTER (WHERE was_complete AND no_gender) AS dropped_gender,
  count(*) FILTER (WHERE was_complete AND no_age_range) AS dropped_age_range,
  count(*) FILTER (WHERE was_complete AND no_compensation) AS dropped_compensation,
  count(*) FILTER (WHERE was_complete AND no_phone) AS dropped_phone,
  count(*) FILTER (WHERE was_complete AND no_languages) AS dropped_languages,
  count(*) FILTER (WHERE was_complete AND no_eyes) AS dropped_eyes,
  count(*) FILTER (WHERE was_complete AND no_hair) AS dropped_hair,
  count(*) FILTER (WHERE was_complete AND no_photo) AS dropped_photo,
  count(*) FILTER (WHERE no_city) AS no_city,
  count(*) FILTER (WHERE NOT no_city) AS with_city_text,
  count(*) FILTER (WHERE NOT no_phone) AS with_phone
FROM p`;

const client = new pg.Client({ connectionString: target.url, ssl: { rejectUnauthorized: false } });
try {
  await client.connect();
  const { rows } = await client.query(SQL);
  console.log(`[round8-report] ${JSON.stringify(rows[0])}`);
} catch (error) {
  console.log(`[round8-report] skipped: ${error instanceof Error ? error.message.split("\n")[0] : "error"}`);
} finally {
  await client.end().catch(() => undefined);
}
