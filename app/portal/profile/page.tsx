import { requireUser } from "@/lib/auth/guard";
import * as store from "@/lib/auth/store";
import { PROFILE_FIELDS } from "@/lib/portal/data";
import { PortalHeading } from "@/components/portal/Pieces";
import { ProfileForm } from "@/components/portal/ProfileForm";

export default async function ProfilePage() {
  const { session } = await requireUser("/portal/profile");

  const user = await store.findById(session.userId);
  const fields = PROFILE_FIELDS[session.role] ?? [];

  return (
    <>
      <PortalHeading
        title="Your profile"
        lead="The more of this we have, the more specific our answer can be. Add what you know — you can return to it any time."
      />
      <ProfileForm
        fields={fields}
        initial={user?.profile ?? {}}
        name={session.name}
        email={session.email}
      />
    </>
  );
}
