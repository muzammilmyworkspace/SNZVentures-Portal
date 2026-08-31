/**
 * EMAIL TEMPLATES
 * ---------------------------------------------------------------------------
 * Written for email clients, not browsers. That means tables, inline styles and
 * no external stylesheet — Outlook and Gmail strip <style> blocks, and a layout
 * that depends on flexbox arrives as a stack of unstyled paragraphs.
 *
 * EVERY TEMPLATE RETURNS BOTH PARTS. The plain-text version carries the full
 * URL rather than "click the button above", because it is what plain-text
 * readers and screen readers actually get — and because HTML-only mail scores
 * worse with spam filters. A password reset in the spam folder is a password
 * reset that did not happen.
 */

const NAVY = "#0F3257";
const MOSS = "#5BA82E";
const INK = "#1E2B5E";
const MUTED = "#5A6478";
const LINE = "#E3E8F0";

/** Escapes anything interpolated into the HTML. A name is user-supplied. */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function shell(inner: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
</head>
<body style="margin:0;padding:0;background:#F4F6FA;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F6FA;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFFFF;border:1px solid ${LINE};border-radius:12px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<tr><td style="background:${NAVY};padding:20px 28px;">
<span style="color:#FFFFFF;font-size:17px;font-weight:700;letter-spacing:-0.01em;">SnZ Ventures</span>
</td></tr>
${inner}
<tr><td style="padding:18px 28px 24px;border-top:1px solid ${LINE};">
<p style="margin:0;color:${MUTED};font-size:12px;line-height:1.6;">
SnZ Ventures · Vilnius, Lithuania<br>
This is an automated message from the client portal.
</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

/**
 * Password reset.
 *
 * The link appears TWICE on purpose: once as a button, and once as visible
 * text underneath. Corporate mail clients routinely rewrite or strip button
 * markup, and a reset email where the only route forward has been eaten is
 * indistinguishable from a broken product.
 */
export function passwordResetEmail(opts: {
  name: string;
  link: string;
  minutes: number;
}): { subject: string; text: string; html: string } {
  const name = opts.name.split(" ")[0] || "there";

  const text = [
    `Hello ${name},`,
    "",
    `Someone asked to reset the password on your SnZ Ventures account. Open the link below to choose a new one. It expires in ${opts.minutes} minutes and can only be used once.`,
    "",
    opts.link,
    "",
    "If this wasn't you, ignore this email — your password has not changed and nobody has been given access.",
    "",
    "SnZ Ventures",
  ].join("\n");

  const html = shell(`
<tr><td style="padding:28px 28px 8px;">
<h1 style="margin:0 0 14px;color:${INK};font-size:21px;line-height:1.3;font-weight:700;">Reset your password</h1>
<p style="margin:0 0 16px;color:${INK};font-size:15px;line-height:1.6;">Hello ${esc(name)},</p>
<p style="margin:0 0 22px;color:${MUTED};font-size:15px;line-height:1.6;">
Someone asked to reset the password on your SnZ Ventures account. Choose a new one using the button below.
</p>
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:8px;background:${MOSS};">
<a href="${esc(opts.link)}" style="display:inline-block;padding:14px 28px;color:#FFFFFF;font-size:15px;font-weight:600;text-decoration:none;border-radius:8px;">Set a new password</a>
</td></tr></table>
<p style="margin:22px 0 6px;color:${MUTED};font-size:13px;line-height:1.6;">
This link expires in ${opts.minutes} minutes and can only be used once.
</p>
<p style="margin:0 0 4px;color:${MUTED};font-size:13px;line-height:1.6;">
If the button doesn't work, copy this into your browser:
</p>
<p style="margin:0 0 20px;word-break:break-all;">
<a href="${esc(opts.link)}" style="color:${NAVY};font-size:13px;">${esc(opts.link)}</a>
</p>
<p style="margin:0;padding-top:16px;border-top:1px solid ${LINE};color:${MUTED};font-size:13px;line-height:1.6;">
If this wasn't you, ignore this email. Your password has not changed and nobody has been given access.
</p>
</td></tr>`);

  return { subject: "Reset your SnZ Ventures password", text, html };
}
