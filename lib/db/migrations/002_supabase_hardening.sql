-- ---------------------------------------------------------------------------
-- 002 — Lock the schema against Supabase's auto-generated REST API.
--
-- WHY THIS EXISTS
--
-- Supabase runs PostgREST over the `public` schema and ships default grants
-- that hand `anon` and `authenticated` full table privileges. `anon` is the
-- key that is *published in the browser*. So on a stock Supabase project, any
-- table created in `public` is readable by anyone on the internet who has the
-- project URL — and that URL is not a secret.
--
-- This application never uses PostgREST. It talks to Postgres directly over
-- the pooled connection string, as the owning role. So the correct posture is
-- to close the REST surface entirely:
--
--   1. ENABLE ROW LEVEL SECURITY on every table, and define NO policies.
--      With no policy, RLS denies every row to every role that is subject to
--      it. The owning role (and any role with BYPASSRLS, which is how the
--      app connects) is unaffected, so the application keeps working exactly
--      as before while `anon` and `authenticated` see nothing.
--
--   2. REVOKE the default grants as well. RLS alone is enough, but a single
--      future `CREATE POLICY` written by someone exploring the dashboard
--      should not be able to open a table to the public. Two independent
--      barriers means one mistake is not a breach.
--
-- These tables hold passports, transcripts and financial records. Defence in
-- depth is proportionate.
--
-- PORTABILITY
--
-- The `anon` and `authenticated` roles exist only on Supabase. Every grant
-- statement below is wrapped in a role-existence check so this migration is a
-- clean no-op on Neon, RDS, plain Postgres and the PGlite instance used by
-- `npm run db:verify`. RLS itself is core Postgres and applies everywhere,
-- where it is simply redundant rather than harmful.
-- ---------------------------------------------------------------------------

-- 1. RLS on, policies none. Core Postgres, safe everywhere.
ALTER TABLE users                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_tokens           ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE professional_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_profiles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_assignments     ENABLE ROW LEVEL SECURITY;
ALTER TABLE cases                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE opportunities         ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications          ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents             ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments          ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages              ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications         ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs            ENABLE ROW LEVEL SECURITY;

-- 2. Strip the Supabase API roles of every privilege, present and future.
DO $$
DECLARE
  api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN

      EXECUTE format(
        'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', api_role);
      EXECUTE format(
        'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', api_role);
      EXECUTE format(
        'REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I', api_role);

      -- Without this, the next CREATE TABLE re-grants everything and the
      -- hole reopens silently.
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I',
        api_role);
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I',
        api_role);

      -- Belt and braces: no schema access at all. PostgREST can then not even
      -- introspect the table names, so the API surface is empty rather than
      -- merely empty-handed.
      EXECUTE format('REVOKE USAGE ON SCHEMA public FROM %I', api_role);

      RAISE NOTICE 'Revoked public-schema access from role %', api_role;
    END IF;
  END LOOP;
END
$$;
