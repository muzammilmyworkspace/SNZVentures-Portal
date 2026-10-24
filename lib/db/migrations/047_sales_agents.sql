-- ---------------------------------------------------------------------------
-- SALES AGENTS, THE STUDENTS THEY BRING, AND THE INITIAL-PROCESS PLAN.
--
-- AdmitsFair's sales team works leads in the CRM (crm.admitsfair.com). When a
-- lead is ready, the CRM asks the portal to email the student a sign-up link
-- that is tagged to the agent. The agent gets a portal login of their own with
-- the role `sales`: they see their own students and nothing else.
--
-- A sales agent is NOT a consultant. The student is not put in
-- staff_assignments (that is the consultant relationship, with its agreements
-- and commissions); the agent is recorded on the student as sales_agent_id, so
-- the student stays with AdmitsFair (the Super Admin) to be handled.
--
-- The value 'sales' is only ADDED here and not used, so it is safe inside the
-- migration's transaction (see 037 for the same pattern).
-- ---------------------------------------------------------------------------

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'sales';

-- The agent's ID in the CRM (AF-001). Same code in both places, so a sale in
-- one is the same person in the other.
ALTER TABLE users ADD COLUMN IF NOT EXISTS crm_code TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS users_crm_code_key ON users (upper(crm_code)) WHERE crm_code IS NOT NULL;

-- On a student: which sales agent brought them, and when the agent handed the
-- case to the Super Admin ("Push to Super Admin"). After the hand-over the
-- agent can still see the student, read-only.
ALTER TABLE users ADD COLUMN IF NOT EXISTS sales_agent_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS sales_handover_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS users_sales_agent ON users (sales_agent_id) WHERE sales_agent_id IS NOT NULL;

-- The CRM lead an invite came from, so events can be posted back to it.
ALTER TABLE student_invites ADD COLUMN IF NOT EXISTS crm_lead_id TEXT;

-- When the CRM was told that this payment made a sale (NULL = not yet / failed).
ALTER TABLE fee_submissions ADD COLUMN IF NOT EXISTS crm_synced_at TIMESTAMPTZ;

-- The student's choice for paying AdmitsFair's process fee, and their
-- acceptance of the terms (the fee is non-refundable) when they chose it.
--   one_time      initial fee now, the rest when the offer letter arrives
--   installments  initial fee now, then at the offer letter, then at the visa
-- The amounts themselves live in portal_settings so the Super Admin can change
-- them; the plan row records what the student agreed to.
CREATE TABLE IF NOT EXISTS payment_plans (
  user_id            UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  plan               TEXT NOT NULL CHECK (plan IN ('one_time', 'installments')),
  schedule           JSONB NOT NULL DEFAULT '[]'::jsonb,
  currency           TEXT NOT NULL DEFAULT 'EUR',
  terms_version      TEXT NOT NULL,
  terms_accepted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip                 TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Small settings the Super Admin edits in the portal (bank details on the fee
-- voucher, plan amounts). One JSON value per key.
CREATE TABLE IF NOT EXISTS portal_settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE payment_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_settings ENABLE ROW LEVEL SECURITY;

-- Supabase's API roles must not reach these tables (same pattern as 023).
DO $$
DECLARE
  api_role TEXT;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON payment_plans FROM %I', api_role);
      EXECUTE format('REVOKE ALL ON portal_settings FROM %I', api_role);
    END IF;
  END LOOP;
END
$$;
