-- Round 8, group 5: in-app notifications (bell), staff announcements, and how
-- a performer wants to hear about roles found. Additive only: new columns on
-- the existing (unused) "Notification" table, two new tables, three nullable
-- columns on "ArtistProfile", and triggers that insert into "Notification".
-- In-app only: nothing here sends an email, a text or a push.
--
-- Access: RLS is on for every new table and no API role has a grant (as for
-- every table since 20261119000000_lock_public_grants). The app reads and
-- writes through the server only: a person sees and marks their own
-- notifications; only admins write announcements (src/domain/admin.ts).

ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "title" TEXT;
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "body" TEXT;
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "link" TEXT;
CREATE INDEX IF NOT EXISTS "Notification_userId_createdAt_idx" ON "Notification" ("userId", "createdAt");

CREATE TABLE IF NOT EXISTS "Announcement" (
  "id" TEXT PRIMARY KEY,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "link" TEXT,
  -- TALENT (all performers) | CASTING (all casting) | ALL (everyone)
  "audience" TEXT NOT NULL DEFAULT 'ALL',
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "archivedAt" TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS "Announcement_audience_createdAt_idx" ON "Announcement" ("audience", "createdAt");

CREATE TABLE IF NOT EXISTS "AnnouncementRead" (
  "announcementId" TEXT NOT NULL REFERENCES "Announcement"("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("announcementId", "userId")
);

ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Announcement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AnnouncementRead" ENABLE ROW LEVEL SECURITY;

-- How we tell a performer about a role found: email (default), sms or both.
-- A text needs explicit consent, recorded with the text's version and date.
ALTER TABLE "ArtistProfile" ADD COLUMN IF NOT EXISTS "roleAlertChannel" TEXT;
ALTER TABLE "ArtistProfile" ADD COLUMN IF NOT EXISTS "smsConsentAt" TIMESTAMP(3);
ALTER TABLE "ArtistProfile" ADD COLUMN IF NOT EXISTS "smsConsentVersion" TEXT;

-- ── Triggers: results that arrive later (from n8n or staff) notify without
-- touching n8n. Titles are stored in English for staff; the bell shows each
-- kind in the reader's language from `kind` and `payload`.

CREATE OR REPLACE FUNCTION agental_notify(p_user TEXT, p_kind TEXT, p_title TEXT, p_body TEXT, p_link TEXT, p_payload JSONB)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  IF p_user IS NULL THEN RETURN; END IF;
  INSERT INTO "Notification" ("id", "userId", "kind", "payload", "title", "body", "link", "createdAt")
  VALUES (gen_random_uuid()::text, p_user, p_kind, coalesce(p_payload, '{}'::jsonb)::text, p_title, p_body, p_link, CURRENT_TIMESTAMP);
END $$;

-- Roles found: a role drafted for the performer (ApplicationDraft).
CREATE OR REPLACE FUNCTION agental_notify_draft_insert() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_user TEXT; v_role TEXT;
BEGIN
  SELECT p."userId" INTO v_user FROM "ArtistProfile" p WHERE p.id = NEW."profileId";
  SELECT coalesce(b."roleName", b.title) INTO v_role FROM "Brief" b WHERE b.id = NEW."briefId";
  PERFORM agental_notify(v_user, 'ROLE_FOUND', 'New role found', v_role,
    '/talents/app/candidatures/' || NEW.id, jsonb_build_object('role', v_role));
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "ApplicationDraft_notify_insert" ON "ApplicationDraft";
CREATE TRIGGER "ApplicationDraft_notify_insert" AFTER INSERT ON "ApplicationDraft"
  FOR EACH ROW EXECUTE FUNCTION agental_notify_draft_insert();

-- Audition updates on a drafted role: none from a trigger. APPROVED, DECLINED
-- and NEEDS_INFO on "ApplicationDraft" are set by the performer themselves
-- (reviewDraft), so notifying them would echo their own click.

-- Audition updates from the Casting side (Candidature): only the statuses a
-- casting team means the performer to see. Never on insert (a match is a
-- private shortlist entry) and never for STARRED, EXCLUDED or SHORTLISTED.
CREATE OR REPLACE FUNCTION agental_notify_candidature() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_user TEXT; v_role TEXT;
BEGIN
  IF NEW."artistProfileId" IS NULL OR NEW.status IS NOT DISTINCT FROM OLD.status
     OR NEW.status NOT IN ('SELFTAPE_REQUESTED', 'INVITED', 'CONTRACTED') THEN
    RETURN NEW;
  END IF;
  SELECT p."userId" INTO v_user FROM "ArtistProfile" p WHERE p.id = NEW."artistProfileId";
  SELECT pr.title INTO v_role FROM "Project" pr WHERE pr.id = NEW."projectId";
  PERFORM agental_notify(v_user, 'STATUS', 'Application update', v_role, '/talents/app/candidatures',
    jsonb_build_object('role', v_role, 'status', NEW.status));
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "Candidature_notify" ON "Candidature";
CREATE TRIGGER "Candidature_notify" AFTER UPDATE OF status ON "Candidature"
  FOR EACH ROW EXECUTE FUNCTION agental_notify_candidature();

-- Messages: a reply from the Agental team or the assistant.
CREATE OR REPLACE FUNCTION agental_notify_message() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_user TEXT;
BEGIN
  IF NOT (NEW."fromTeam" OR NEW."fromAgent") THEN RETURN NEW; END IF;
  SELECT t."userId" INTO v_user FROM "Thread" t WHERE t.id = NEW."threadId";
  PERFORM agental_notify(v_user, 'MESSAGE',
    CASE WHEN NEW."fromAgent" THEN 'The assistant replied' ELSE 'The Agental team replied' END,
    left(NEW.body, 140), '/talents/app/messages',
    jsonb_build_object('from', CASE WHEN NEW."fromAgent" THEN 'assistant' ELSE 'team' END));
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "Message_notify" ON "Message";
CREATE TRIGGER "Message_notify" AFTER INSERT ON "Message"
  FOR EACH ROW EXECUTE FUNCTION agental_notify_message();

-- No API role may call these directly: they run only as triggers.
REVOKE EXECUTE ON FUNCTION agental_notify(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION agental_notify_draft_insert() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION agental_notify_candidature() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION agental_notify_message() FROM PUBLIC;
