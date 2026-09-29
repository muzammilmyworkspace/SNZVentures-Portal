-- ---------------------------------------------------------------------------
-- EMAIL, CONFIGURED FROM THE PORTAL INSTEAD OF FROM THE DEPLOYMENT.
--
-- Sending has been switched off in production for weeks, not because anything
-- is broken but because turning it on means having the Vercel dashboard open,
-- knowing that a variable saved there does nothing until a redeploy, and
-- getting the name exactly right. Nothing about that is visible from inside
-- the portal, so every attempt looked identical to the last one: still not
-- configured.
--
-- That is a bad place for a setting whose absence silently breaks password
-- resets, email verification and consultant invitations. The people who
-- operate this portal should be able to fix it from the portal.
--
-- ENVIRONMENT VARIABLES STILL WIN where they are set. A deployment that
-- configures RESEND_API_KEY keeps behaving exactly as it did, and this table
-- is ignored — a value in the environment is a deliberate act by whoever
-- deploys, and a row in a table must not quietly override it. The admin screen
-- says which one is in force rather than leaving it to be guessed.
--
-- THE KEY IS STORED ENCRYPTED, the same way Drive's refresh token is (012):
-- AES-256-GCM under AUTH_SECRET, via lib/integrations/secret-box. It is a
-- credential that can send mail as this firm, and a database dump or a backup
-- on somebody's laptop should not be a route to it.
--
-- ONE ROW, enforced by a fixed primary key — so "which settings are live" is
-- never a question, and a second row cannot be created by accident.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS mail_settings (
  id           BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),

  -- AES-256-GCM, base64. Never the raw key, and never returned to a browser.
  api_key      TEXT NOT NULL,

  -- The verified sender. Kept in the clear: it is printed on the provider's
  -- own dashboard and on every message that goes out.
  from_address TEXT NOT NULL,

  updated_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- What the provider said the last time a message failed, so the admin screen
  -- can show the actual reason rather than "not delivered".
  last_error   TEXT,
  last_sent_at TIMESTAMPTZ
);

ALTER TABLE mail_settings ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE mail_settings IS
  'Resend credentials entered through the admin screen. Ignored whenever '
  'RESEND_API_KEY is set in the environment.';
COMMENT ON COLUMN mail_settings.api_key IS
  'Sealed with AES-256-GCM under AUTH_SECRET. Rotating AUTH_SECRET makes this '
  'unreadable, which is the intended behaviour: re-enter the key.';
