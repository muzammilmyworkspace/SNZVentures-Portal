import { NextResponse, after } from "next/server";
import { apiRequireUser } from "@/lib/auth/guard";
import * as fees from "@/lib/db/repos/fees";
import * as repo from "@/lib/db/repos/portal";
import { recordConsent } from "@/lib/db/repos/consents";
import { audit } from "@/lib/db/repos/audit";
import { clientIp, rateLimit } from "@/lib/auth/rate-limit";
import {
  putObject,
  buildKey,
  validateUpload,
  isStorageConfigured,
  MAX_UPLOAD_BYTES,
} from "@/lib/storage";
import {
  PAYMENT_CONSENT_KIND,
  PAYMENT_CONSENT_VERSION,
  FEE_TYPES,
  PAYMENT_METHODS,
  CURRENCIES,
  passportError,
  dobError,
} from "@/lib/portal/payment-consent";
import { studentStage } from "@/lib/portal/stage";
import { classifyFault } from "@/lib/errors";
import { mirrorToDrive } from "@/lib/integrations/drive-mirror";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * FEE VERIFICATION — the student's own declaration, plus the receipt.
 *
 * ONE REQUEST, ON PURPOSE. The receipt and the declaration arrive together as
 * multipart. Splitting them into "upload, then declare" would leave a receipt
 * in storage with no record pointing at it whenever the second call failed —
 * an orphaned financial document belonging to a named person, which is exactly
 * the thing not to have lying around. Here the row is written last: if the
 * upload fails there is no row, and if the row fails the upload is the only
 * thing to clean up.
 *
 * STUDENTS ONLY. The gate exists for the study pathway; a job seeker or a
 * business has no fee stage, and letting them post here would create rows that
 * nothing reads and a queue entry staff cannot action.
 */
export async function POST(request: Request) {
  const guard = await apiRequireUser();
  if (!guard.ok) return guard.response;
  const { session } = guard;

  if (session.role !== "student") {
    return NextResponse.json(
      { ok: false, error: "Fee verification applies to student accounts." },
      { status: 403 }
    );
  }

  const ip = clientIp(request);
  if (!rateLimit(`fee:${session.userId}`, { limit: 10, windowMs: 30 * 60_000 }).ok) {
    return NextResponse.json(
      { ok: false, error: "Too many attempts. Please wait a few minutes." },
      { status: 429 }
    );
  }

  /*
    A student who already has a live submission must not create a second one.
    The unique index enforces this in the database, but catching it here means
    an honest message rather than a 500 from a constraint violation.
  */
  const { stage } = await studentStage(session.userId);
  if (stage === "fee_review") {
    return NextResponse.json(
      { ok: false, error: "Your fee verification is already with us for checking." },
      { status: 409 }
    );
  }
  if (stage !== "fee_due" && stage !== "fee_rejected") {
    return NextResponse.json(
      { ok: false, error: "Your fee has already been verified." },
      { status: 409 }
    );
  }

  if (!isStorageConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Secure document storage is not configured on this deployment, so receipts cannot be accepted.",
      },
      { status: 503 }
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid submission." }, { status: 400 });
  }

  const str = (k: string, max = 200) => String(form.get(k) ?? "").trim().slice(0, max);

  // Identity — panel 2 of the source document.
  const name = str("name", 120);
  const father = str("father", 120);
  const passport = str("passport", 40).toUpperCase();
  const nationality = str("nationality", 60);
  const dob = str("dob", 10);
  const email = str("email");
  const phone = str("phone", 40);
  const city = str("city");
  const address = str("address", 400);

  // The payment — panel 3.
  const university = str("university");
  const programme = str("programme");
  const feeType = str("feeType", 60);
  const currency = str("currency", 8);
  const amountRaw = str("amount", 24).replace(/,/g, "");
  const method = str("method", 60);
  const txnRef = str("txnRef", 80);
  const payDate = str("payDate", 10);
  const thirdParty = form.get("thirdParty") === "true";
  const payerName = str("payerName");
  const payerRelation = str("payerRelation", 80);
  const signedName = str("signedName", 120) || name;
  const signaturePng = String(form.get("signaturePng") ?? "");

  /* -------------------------------------------------- validation, server-side */

  const bad = (error: string) => NextResponse.json({ ok: false, error }, { status: 400 });

  /*
    Re-validated here, not just in the dialog. The browser is not the place
    this is decided: anything can post to this endpoint, and these values end
    up written verbatim into a signed declaration.
  */
  if (name.length < 2) return bad("Enter your full name.");
  // The same functions the dialog uses. One rule, not two copies of one.
  const passportBad = passportError(passport);
  if (passportBad) return bad(passportBad);
  if (!nationality) return bad("Enter your nationality.");
  const dobBad = dobError(dob);
  if (dobBad) return bad(dobBad);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return bad("Enter a valid email address.");
  if (!phone) return bad("Enter a contact number.");
  if (!city) return bad("Enter your city and country.");

  if (!university) return bad("Enter the institution you applied to.");
  if (!(FEE_TYPES as readonly string[]).includes(feeType)) return bad("Choose what the fee is for.");
  if (!(CURRENCIES as readonly string[]).includes(currency)) return bad("Choose a currency.");
  if (!(PAYMENT_METHODS as readonly string[]).includes(method)) return bad("Choose a payment method.");

  const amount = Number(amountRaw);
  if (!isFinite(amount) || amount <= 0) return bad("Enter the amount as a number.");
  if (amount > 1_000_000) return bad("Please check that amount.");

  if (payDate && !/^\d{4}-\d{2}-\d{2}$/.test(payDate)) return bad("Enter a valid transfer date.");
  if (thirdParty && (!payerName || !payerRelation))
    return bad("Enter the payer's name and their relationship to you.");

  /*
    The typed name is the signature on the paper form, and the drawn one is the
    evidence. Both are required: a drawing alone cannot be read back as a name,
    and a name alone is not what the document asks for.
  */
  if (signedName.length < 2) return bad("Type your full name as your signature.");
  if (!signaturePng.startsWith("data:image/png;base64,"))
    return bad("Draw your signature before submitting.");
  // ~1.4MB of base64. A signature is a few KB; anything larger is not one.
  if (signaturePng.length > 1_400_000) return bad("That signature image is too large.");

  const file = form.get("receipt");
  if (!(file instanceof File)) return bad("Attach your payment receipt.");
  const invalid = validateUpload({ size: file.size, type: file.type, name: file.name });
  if (invalid) return bad(invalid);

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length > MAX_UPLOAD_BYTES)
    return NextResponse.json({ ok: false, error: "Files must be 15 MB or smaller." }, { status: 413 });

  /* ------------------------------------------------------------------ write */

  let documentId: string | null = null;
  try {
    const stored = await putObject(buildKey(session.userId, file.name), buffer, file.type);
    documentId = await repo.createDocument({
      storageProvider: stored.provider,
      ownerId: session.userId, // never from the request
      name: `Payment receipt — ${university}`.slice(0, 120),
      category: "Payment",
      storageKey: stored.key,
      mimeType: file.type,
      sizeBytes: buffer.length,
    });

    const feeId = await fees.createFeeSubmission({
      userId: session.userId,
      declarantName: name,
      declarantFather: father || null,
      declarantPassport: passport,
      declarantNationality: nationality,
      declarantDob: dob || null,
      declarantEmail: email,
      declarantPhone: phone,
      declarantCity: city,
      declarantAddress: address || null,
      university,
      programme: programme || null,
      feeType,
      currency,
      amount: amount.toFixed(2),
      method,
      txnRef: txnRef || null,
      payDate: payDate || null,
      thirdParty,
      payerName: thirdParty ? payerName : null,
      payerRelation: thirdParty ? payerRelation : null,
      receiptDocumentId: documentId,
      signaturePng,
      signedName,
      consentVersion: PAYMENT_CONSENT_VERSION,
      ip,
      userAgent: request.headers.get("user-agent"),
    });

    /*
      The consent row is written with the version from the SERVER's constant,
      never from the request — a browser must not be able to claim it accepted a
      different document, or an older one, than the one it was shown.
    */
    await recordConsent({
      userId: session.userId,
      kind: PAYMENT_CONSENT_KIND,
      version: PAYMENT_CONSENT_VERSION,
      signedName,
      ip,
      userAgent: request.headers.get("user-agent"),
    });

    await audit({
      action: "fee.submitted",
      actorId: session.userId,
      actorEmail: session.email,
      entity: "fee_submission",
      entityId: feeId,
      meta: { currency, amount: amount.toFixed(2), feeType, university },
      ip,
    });

    // The receipt is usually the first document a student ever sends us, so
    // it is the first thing in their Drive folder. After the response — see
    // the note in the documents route.
    after(
      repo.notifyStaff({
        title: `${session.name} sent a payment receipt`,
        body: `${currency} ${amount.toFixed(2)} — ${feeType}, ${university}`,
        href: "/portal/admin/fees",
        kind: "status",
        aboutUserId: session.userId,
        actorId: session.userId,
      })
    );

    after(
      mirrorToDrive({
        userId: session.userId,
        studentName: session.name,
        studentEmail: session.email,
        fileName: `Payment receipt — ${university}`,
        bytes: buffer,
        mimeType: file.type,
      })
    );

    return NextResponse.json({ ok: true, id: feeId });
  } catch (error) {
    /*
      A missing table and a dropped connection both land here, and only one
      of them is worth retrying. Saying which turns an unanswerable red box
      into something the student can act on and staff can find.
    */
    const fault = classifyFault(error);
    // eslint-disable-next-line no-console
    console.error(`[fee] submission failed (${fault.kind}):`, fault.detail);
    return NextResponse.json(
      { ok: false, error: fault.message, kind: fault.kind },
      { status: fault.status }
    );
  }
}
