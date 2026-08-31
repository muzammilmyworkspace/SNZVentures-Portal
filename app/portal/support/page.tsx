import { requireUser } from "@/lib/auth/guard";
import { company } from "@/data/company";
import { PortalHeading, Panel } from "@/components/portal/Pieces";

export default async function SupportPage() {
  const { session } = await requireUser();

  const contacts = [
    { label: "Email", value: company.contact.email, href: `mailto:${company.contact.email}` },
    { label: "WhatsApp", value: company.contact.phone, href: `https://wa.me/${company.contact.whatsapp}` },
    { label: "Phone", value: company.contact.phone, href: `tel:${company.contact.phoneHref}` },
  ];

  return (
    <>
      <PortalHeading
        title="Support"
        lead="A real person answers. If we are not the right firm for what you need, we will tell you that too."
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Reach us directly">
          <ul className="space-y-3">
            {contacts.map((c) => (
              <li key={c.label} className="flex items-center justify-between gap-4 border-b border-line pb-3 last:border-0">
                <span className="label text-faint">{c.label}</span>
                <a
                  href={c.href}
                  target={c.href.startsWith("http") ? "_blank" : undefined}
                  rel={c.href.startsWith("http") ? "noopener noreferrer" : undefined}
                  className="text-[0.9rem] text-accent underline underline-offset-4"
                >
                  {c.value}
                </a>
              </li>
            ))}
          </ul>
          <address className="mt-6 not-italic border-t border-line pt-5">
            <span className="label block text-faint">Office</span>
            <p className="mt-2 text-[0.9rem] leading-relaxed text-muted">
              {company.contact.streetAddress}
              <br />
              {company.contact.postalCode} {company.contact.city}
              <br />
              {company.contact.country}
            </p>
          </address>
        </Panel>

        <Panel title="What we can and cannot do">
          <p className="text-[0.9rem] leading-relaxed text-muted">
            {company.regulatoryNotice}
          </p>
          <p className="mt-4 text-[0.9rem] leading-relaxed text-muted">
            We do not guarantee admission, employment, banking, licensing or
            immigration outcomes. Those decisions rest with institutions,
            employers, financial institutions and national authorities.
          </p>
        </Panel>
      </div>
    </>
  );
}
