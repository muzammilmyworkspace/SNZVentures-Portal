import { getSession } from "@/lib/auth/session";
import { FormsSwitch } from "@/components/portal/FormsSwitch";

/**
 * Setup › Forms: the application form and the consent form, one menu item with
 * a switch between them. Each page still guards itself; this only draws the
 * switch (the application form is the super admin's alone).
 */
export default async function FormsLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  return (
    <>
      <FormsSwitch canEditApplication={session?.role === "super_admin"} />
      {children}
    </>
  );
}
