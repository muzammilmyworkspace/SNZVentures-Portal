import { requireUser } from "@/lib/auth/guard";
import { ROLE_LABEL, CLIENT_ROLES, type Role } from "@/lib/auth/types";
import { codeContext } from "@/lib/db/repos/invites";
import { ConsultantCodeForm } from "@/components/portal/ConsultantCodeForm";
import { PortalHeading, Panel, BackendRequired } from "@/components/portal/Pieces";
import { ChangePassword } from "@/components/portal/ChangePassword";
import { ChangeEmail } from "@/components/portal/ChangeEmail";
import { ProfilePhoto } from "@/components/portal/ProfilePhoto";
import { getAvatar } from "@/lib/db/repos/users";

export default async function SettingsPage() {
  const { session } = await requireUser();
  const codes = await codeContext(session.userId);
  const isClient = (CLIENT_ROLES as readonly Role[]).includes(session.role);

  return (
    <>
      <PortalHeading
        title="Settings"
        lead="Your account, your data and how we contact you."
      />

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Panel title="Profile photo">
          <ProfilePhoto name={session.name} current={await getAvatar(session.userId)} />
        </Panel>

        {/* Staff: the code to give students. Clients: who brought them, or add a code. */}
        {codes.ownCode ? (
          <Panel title="Your consultant code">
            <p className="font-mono text-[1.6rem] font-semibold tracking-wider text-accent">{codes.ownCode}</p>
            <p className="mt-2 text-[0.85rem] leading-relaxed text-muted">
              Give this to your students. When they enter it at sign-up (or later in their Settings), they
              become your student and show your name in every list.
            </p>
          </Panel>
        ) : isClient ? (
          <Panel title="Your consultant">
            {codes.consultantName ? (
              <p className="text-[0.95rem] text-fg">
                <strong className="font-semibold">{codes.consultantName}</strong> is your consultant.
              </p>
            ) : (
              <ConsultantCodeForm />
            )}
          </Panel>
        ) : null}

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
            <a href="mailto:study@snzventures.com" className="text-accent underline underline-offset-4">
              study@snzventures.com
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
