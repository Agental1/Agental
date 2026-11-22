-- Round 8, group 3: the picked location and the phone in E.164 on the profile.
-- Additive: four nullable columns. The free-text "city" and "phone" columns
-- stay as they were; the backfills below write only into the new columns.
ALTER TABLE "ArtistProfile" ADD COLUMN IF NOT EXISTS "countryCode" TEXT;
ALTER TABLE "ArtistProfile" ADD COLUMN IF NOT EXISTS "admin1Code" TEXT;
ALTER TABLE "ArtistProfile" ADD COLUMN IF NOT EXISTS "cityGeonameId" INTEGER;
ALTER TABLE "ArtistProfile" ADD COLUMN IF NOT EXISTS "phoneE164" TEXT;

-- Link free-text cities ("Los Angeles, USA", "Paris") when exactly one place
-- matches: the name before the first comma, and the country or US state after
-- it when there is one. Ambiguous or unknown cities stay as typed (they still
-- count as filled until the performer edits the field).
WITH src AS (
  SELECT
    a.id,
    lower(trim(split_part(a.city, ',', 1))) AS name,
    upper(trim(split_part(a.city, ',', 2))) AS hint
  FROM "ArtistProfile" a
  WHERE a.city IS NOT NULL AND trim(a.city) <> '' AND a."cityGeonameId" IS NULL
),
hinted AS (
  SELECT
    s.id, s.name, s.hint,
    CASE
      WHEN s.hint IN ('USA', 'US', 'U.S.', 'U.S.A.', 'UNITED STATES', 'UNITED STATES OF AMERICA') THEN 'US'
      WHEN s.hint IN ('UK', 'U.K.', 'ENGLAND', 'SCOTLAND', 'WALES') THEN 'GB'
      ELSE (SELECT g.code FROM "GeoCountry" g WHERE upper(g.name) = s.hint OR g.code = s.hint LIMIT 1)
    END AS country
  FROM src s
),
matches AS (
  SELECT h.id, c."geonameId", c."countryCode", c."admin1Code"
  FROM hinted h
  JOIN "GeoCity" c ON (lower(c.name) = h.name OR lower(c."asciiName") = h.name)
  WHERE h.hint = ''
     OR c."countryCode" = h.country
     OR (c."countryCode" = 'US' AND c."admin1Code" = h.hint)
),
unique_match AS (
  SELECT id, min("geonameId") AS gid, min("countryCode") AS cc, min("admin1Code") AS adm
  FROM matches GROUP BY id HAVING count(*) = 1
)
UPDATE "ArtistProfile" a
SET "cityGeonameId" = u.gid, "countryCode" = u.cc, "admin1Code" = NULLIF(u.adm, '')
FROM unique_match u
WHERE a.id = u.id;

-- US numbers that parse cleanly become E.164 (+1 and ten digits, area code and
-- exchange starting 2-9). Anything else, or a number with another country
-- prefix, is left for the performer.
UPDATE "ArtistProfile"
SET "phoneE164" = '+1' || right(regexp_replace(phone, '[^0-9]', '', 'g'), 10)
WHERE "phoneE164" IS NULL
  AND phone IS NOT NULL
  AND phone !~ '^\s*\+\s*[02-9]'
  AND (
    regexp_replace(phone, '[^0-9]', '', 'g') ~ '^[2-9][0-9]{2}[2-9][0-9]{6}$'
    OR regexp_replace(phone, '[^0-9]', '', 'g') ~ '^1[2-9][0-9]{2}[2-9][0-9]{6}$'
  );
