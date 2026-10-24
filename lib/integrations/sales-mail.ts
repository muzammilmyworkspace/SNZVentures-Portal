import "server-only";
import { sendMail, mailConfigured } from "@/lib/mail";

/** The sign-up email a student gets from a sales agent. Shared with the agent's own invite form. */
export async function emailStudentInvite(i: { to: string; name: string; agentName: string; agentEmail: string; link: string }) {
  if (!(await mailConfigured())) return false;
  try {
    await sendMail({
      to: i.to,
      subject: "Start your study abroad process with AdmitsFair",
      text: [
        `Hello ${i.name.split(/\s+/)[0]},`,
        "",
        `${i.agentName} from AdmitsFair has invited you to the AdmitsFair student portal.`,
        "",
        "Open this link to create your account. It works once and expires in 14 days:",
        i.link,
        "",
        "After you sign up you will choose a payment plan, pay the initial process fee",
        "and upload your receipt. Once it is verified, your application form opens.",
        "",
        "If you were not expecting this, ignore this message. Nothing is created",
        "until you fill in the form yourself.",
        "",
        "AdmitsFair",
      ].join("\n"),
      replyTo: i.agentEmail,
    });
    return true;
  } catch (error) {
    console.error("[invite] sales invite email failed:", error);
    return false;
  }
}
