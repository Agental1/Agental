-- Round 8c, group 4: the notification bell hears about new notifications at
-- once, through Supabase Realtime Broadcast. Additive only: one trigger
-- function, one trigger on "Notification", one policy on Supabase's own
-- realtime.messages table.
--
-- What travels: an empty "notification" event on the private topic
-- "notifications:<userId>". No notification content goes over Realtime; the
-- bell then reloads through the app's server route, which checks the session.
--
-- Who can listen: a private topic needs a token. The app signs one per signed-in
-- person (/api/realtime/token, role "authenticated", sub = the user id), and
-- the policy below lets that token read its own topic only. Nothing in the
-- public schema is granted to an API role: the tables stay closed to the Data
-- API as before.
--
-- Where Realtime does not exist (the local database), the trigger does nothing
-- and the policy is skipped.

CREATE OR REPLACE FUNCTION public.agental_notify_realtime() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."userId" IS NULL THEN
    RETURN NEW;
  END IF;
  IF to_regprocedure('realtime.send(jsonb, text, text, boolean)') IS NOT NULL THEN
    PERFORM realtime.send('{}'::jsonb, 'notification', 'notifications:' || NEW."userId", true);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- A broadcast that fails never blocks the notification itself.
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.agental_notify_realtime() FROM PUBLIC;

DROP TRIGGER IF EXISTS "Notification_realtime" ON "Notification";
CREATE TRIGGER "Notification_realtime"
  AFTER INSERT ON "Notification"
  FOR EACH ROW EXECUTE FUNCTION public.agental_notify_realtime();

DO $$
BEGIN
  IF to_regclass('realtime.messages') IS NOT NULL
     AND to_regprocedure('realtime.topic()') IS NOT NULL
     AND to_regnamespace('auth') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_policies
        WHERE schemaname = 'realtime' AND tablename = 'messages'
          AND policyname = 'agental_bell_own_topic'
     ) THEN
    EXECUTE $p$
      CREATE POLICY agental_bell_own_topic ON realtime.messages
        FOR SELECT TO authenticated
        USING (
          realtime.messages.extension = 'broadcast'
          AND realtime.topic() = 'notifications:' || (auth.jwt() ->> 'sub')
        )
    $p$;
  END IF;
END;
$$;
