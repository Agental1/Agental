-- Round 9, group 6: automatic emails (roles found digest, application
-- updates, new reply in Messages, welcome). Additive columns, and the
-- Candidature notification also covers REJECTED ("declined"), which the
-- performer is meant to see.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "notifyRolesFound" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "welcomeEmailAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "rolesDigestAt" TIMESTAMP(3);
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "emailedAt" TIMESTAMP(3);
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "emailedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "Notification_kind_emailedAt_idx" ON "Notification" ("kind", "emailedAt");

CREATE OR REPLACE FUNCTION agental_notify_candidature() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_user TEXT; v_role TEXT;
BEGIN
  IF NEW."artistProfileId" IS NULL OR NEW.status IS NOT DISTINCT FROM OLD.status
     OR NEW.status NOT IN ('SELFTAPE_REQUESTED', 'INVITED', 'CONTRACTED', 'REJECTED') THEN
    RETURN NEW;
  END IF;
  SELECT p."userId" INTO v_user FROM "ArtistProfile" p WHERE p.id = NEW."artistProfileId";
  SELECT pr.title INTO v_role FROM "Project" pr WHERE pr.id = NEW."projectId";
  PERFORM agental_notify(v_user, 'STATUS', 'Application update', v_role, '/talents/app/candidatures',
    jsonb_build_object('role', v_role, 'status', NEW.status));
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION agental_notify_candidature() FROM PUBLIC;
