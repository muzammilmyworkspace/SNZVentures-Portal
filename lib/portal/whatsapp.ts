/**
 * A wa.me link for a phone number somebody typed into a form.
 *
 * WhatsApp needs the full international number, digits only. "+92 332…" and
 * "0092 332…" both say which country; "0332…" does not, and guessing would
 * open a chat with a stranger in the wrong country. So a number that does not
 * say its country gets no link, and the button says why.
 */
export function whatsappNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const t = phone.trim();
  let digits = t.replace(/\D/g, "");
  if (t.startsWith("00")) digits = digits.slice(2);
  else if (!t.startsWith("+") && digits.startsWith("0")) return null;
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

export function whatsappLink(phone: string | null | undefined, text?: string): string | null {
  const n = whatsappNumber(phone);
  if (!n) return null;
  return `https://wa.me/${n}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}
