import { NextResponse } from "next/server";
import { apiRequireSuperAdmin } from "@/lib/auth/guard";
import * as invoices from "@/lib/db/repos/invoices";
import { validateDraft, STATUSES, type InvoiceStatus } from "@/lib/invoices/model";
import { audit } from "@/lib/db/repos/audit";
import { clientIp, rateLimit } from "@/lib/auth/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * RAISING AND MOVING AN INVOICE — SUPER ADMIN ONLY.
 *
 * Deliberately narrower than the rest of the admin area, which admins share.
 * An invoice is the firm speaking about money in its own name; who may issue
 * one is a smaller question than who may review a document.
 */

export async function POST(request: Request) {
  const guard = await apiRequireSuperAdmin();
  if (!guard.ok) return guard.response;
  const { session } = guard;

  if (!rateLimit(`invoice:${session.userId}`, { limit: 60, windowMs: 60 * 60_000 }).ok) {
    return NextResponse.json(
      { ok: false, errors: ["That is a lot of invoices in an hour. Try again shortly."] },
      { status: 429 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, errors: ["That request was not valid JSON."] }, { status: 400 });
  }

  /*
    VALIDATED SERVER-SIDE, NOT MERELY IN THE FORM.

    The browser's checks are a courtesy to whoever is typing; this is the one
    that decides. Totals are recomputed here from the lines rather than taken
    from the request, so a figure cannot be sent that disagrees with the lines
    printed beside it — and the schema's own CHECK refuses the row if it did.
  */
  const checked = validateDraft({
    billToName: String(body.billToName ?? ""),
    billToEmail: String(body.billToEmail ?? ""),
    billToAddress: String(body.billToAddress ?? ""),
    currency: String(body.currency ?? "EUR"),
    vatPercent: String(body.vatPercent ?? "0"),
    issuedOn: String(body.issuedOn ?? ""),
    dueOn: String(body.dueOn ?? ""),
    notes: String(body.notes ?? ""),
    lines: Array.isArray(body.lines)
      ? (body.lines as { desc?: unknown; amount?: unknown }[]).map((l) => ({
          desc: String(l?.desc ?? ""),
          amount: String(l?.amount ?? ""),
        }))
      : [],
  });

  if (!checked.ok) {
    return NextResponse.json({ ok: false, errors: checked.errors }, { status: 400 });
  }

  const clientId = typeof body.clientId === "string" && body.clientId ? body.clientId : null;

  let saved;
  try {
    saved = await invoices.create({ ...checked.value, clientId }, session.userId);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[invoices] create failed:", error);
    return NextResponse.json(
      { ok: false, errors: ["The invoice could not be saved. Nothing was raised — try again."] },
      { status: 500 }
    );
  }

  await audit({
    action: "invoice.created",
    actorId: session.userId,
    actorEmail: session.email,
    entity: "invoice",
    entityId: saved.id,
    // The number and who it is for. Never the amounts — an audit log is a
    // record of actions, and the document itself holds the figures.
    meta: { number: saved.number, billTo: saved.billToName, currency: saved.currency },
    ip: clientIp(request),
  });

  return NextResponse.json({ ok: true, invoice: saved });
}

export async function PATCH(request: Request) {
  const guard = await apiRequireSuperAdmin();
  if (!guard.ok) return guard.response;
  const { session } = guard;

  let body: { id?: unknown; status?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "That request was not valid JSON." }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id : "";
  const status = String(body.status ?? "") as InvoiceStatus;
  if (!id) return NextResponse.json({ ok: false, error: "Which invoice?" }, { status: 400 });
  if (!STATUSES.includes(status)) {
    return NextResponse.json({ ok: false, error: "That is not a status." }, { status: 400 });
  }

  const updated = await invoices.setStatus(id, status);
  if (!updated) {
    // Same answer for "no such invoice" and "already void": a voided invoice is
    // final, and reopening one would put a cancelled number back in circulation
    // after the payer has been told to ignore it.
    return NextResponse.json(
      { ok: false, error: "That invoice cannot be changed. A voided invoice is final." },
      { status: 409 }
    );
  }

  await audit({
    action: "invoice.status_changed",
    actorId: session.userId,
    actorEmail: session.email,
    entity: "invoice",
    entityId: id,
    meta: { number: updated.number, status },
    ip: clientIp(request),
  });

  return NextResponse.json({ ok: true, invoice: updated });
}
