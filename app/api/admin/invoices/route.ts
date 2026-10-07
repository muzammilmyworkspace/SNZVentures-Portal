import { NextResponse } from "next/server";
import { apiRequireRole } from "@/lib/auth/guard";
import type { Session } from "@/lib/auth/types";
import * as invoices from "@/lib/db/repos/invoices";
import { validateDraft, STATUSES, type InvoiceStatus } from "@/lib/invoices/model";
import { audit } from "@/lib/db/repos/audit";
import { clientIp, rateLimit } from "@/lib/auth/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * RAISING, MOVING AND DELETING AN INVOICE — super admin and consultants.
 *
 * Still narrower than the admin area, which admins share: an invoice is
 * somebody speaking about money. A consultant raises their own and can touch
 * only those; the super admin sees and moves all of them. Only a draft can be
 * deleted; an issued one is voided.
 */

const ROLES = ["super_admin", "advisor"] as const;

/** The invoice, if this person may act on it. */
async function mine(session: Session, id: string) {
  const inv = await invoices.getById(id);
  if (!inv) return null;
  if (session.role === "super_admin") return inv;
  return inv.createdById === session.userId ? inv : null;
}

export async function POST(request: Request) {
  const guard = await apiRequireRole([...ROLES]);
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
  const guard = await apiRequireRole([...ROLES]);
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
  if (!(await mine(session, id))) {
    return NextResponse.json({ ok: false, error: "Invoice not found." }, { status: 404 });
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

export async function DELETE(request: Request) {
  const guard = await apiRequireRole([...ROLES]);
  if (!guard.ok) return guard.response;
  const { session } = guard;

  const id = new URL(request.url).searchParams.get("id") ?? "";
  const inv = id ? await mine(session, id) : null;
  if (!inv) return NextResponse.json({ ok: false, error: "Invoice not found." }, { status: 404 });
  if (inv.status !== "draft") {
    return NextResponse.json(
      { ok: false, error: `${inv.number} has been issued, so it is kept. Void it instead.` },
      { status: 409 }
    );
  }
  if (!(await invoices.deleteDraft(id))) {
    return NextResponse.json({ ok: false, error: "That invoice could not be deleted." }, { status: 409 });
  }

  await audit({
    action: "invoice.status_changed",
    actorId: session.userId,
    actorEmail: session.email,
    entity: "invoice",
    entityId: id,
    meta: { number: inv.number, deleted: true },
    ip: clientIp(request),
  });
  return NextResponse.json({ ok: true });
}
