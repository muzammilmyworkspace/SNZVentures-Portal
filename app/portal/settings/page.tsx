import { requireUser } from "@/lib/auth/guard";
import { ROLE_LABEL } from "@/lib/auth/types";
import { PortalHeading, Panel, BackendRequired } from "@/components/portal/Pieces";
import { ChangePassword } from "@/components/portal/ChangePassword";
import { ChangeEmail } from "@/components/portal/ChangeEmail";

export default async function SettingsPage() {
  const { session } = await requireUser();

  return (
    <>
      <PortalHeading
        title="Settings"
        lead="Your account, your data and how we contact you."
      />

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Panel title="Security">
          {/*
            Changing a password no longer means shell access to the database.
            The same control serves every role, including the super admin —
            there is nothing role-specific about proving who you are and
            choosing a new secret.
          */}
          <ChangePassword />
        </Panel>

        {/*
          Moving the sign-in address sits beside changing the password, not
          under "Account" with the read-only details. They are the same kind of
          thing — the two ways into this account — and separating them is how
          somebody ends up asking a developer to run an UPDATE.
        */}
        <Panel title="Email address">
          <ChangeEmail current={session.email} />
        </Panel>

        <Panel title="Account">
          <dl className="space-y-4">
            <div className="flex items-baseline justify-between gap-4 border-b border-line pb-3">
              <dt className="label text-faint">Name</dt>
              <dd className="text-[0.9rem] text-fg">{session.name}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 border-b border-line pb-3">
              <dt className="label text-faint">Email</dt>
              <dd className="text-[0.9rem] text-fg">{session.email}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="label text-faint">Account type</dt>
              <dd className="text-[0.9rem] text-fg">{ROLE_LABEL[session.role]}</dd>
            </div>
          </dl>
        </Panel>

        <Panel title="Your data">
          <p className="text-[0.9rem] leading-relaxed text-muted">
            Under the GDPR you can ask us for a copy of your data, ask us to
            correct it, or ask us to delete it. Email{" "}
            <a href="mailto:info@snzventures.com" className="text-accent underline underline-offset-4">
              info@snzventures.com
            </a>{" "}
            and we will respond within the statutory period.
          </p>
          <p className="mt-4 text-[0.85rem] leading-relaxed text-faint">
            Deleting your account removes your profile and messages. Records we
            are legally required to retain — for example accounting records —
            are kept for the statutory period and nothing longer.
          </p>
        </Panel>
      </div>

      <div className="mt-8">
        <BackendRequired
          feature="Account management"
          needs={[
            "Change password and change email flows with re-authentication",
            "Email verification before an address change takes effect",
            "Self-service data export and account deletion, with an audit trail",
            // The notify_* columns landed in migration 003; nothing reads them yet.
            "Reading the notification preference columns when sending",
          ]}
        />
      </div>
    </>
  );
}
