import "server-only";
import { open } from "@/lib/integrations/secret-box";
import { stripeBalance, stripeLines, wiseConnect, wiseLines } from "@/lib/integrations/finance-providers";
import { integrationForSync, recordSync, saveBankLines, autoMatch, listIntegrations } from "@/lib/db/repos/finance-integrations";

/**
 * SYNC ONE CONNECTION: the provider's balance now, and its statement lines
 * since the last sync, saved once each and matched to the books where an
 * entry already says the same thing. Returns what happened, in words.
 */
export async function syncIntegration(id: string): Promise<{ ok: boolean; message: string }> {
  const i = await integrationForSync(id);
  if (!i) return { ok: false, message: "Not found." };
  if (!i.secret) return { ok: true, message: "This one is updated by uploading the statement CSV." };
  const token = open(i.secret);
  if (!token) {
    await recordSync(id, { ok: false, error: "The saved token can no longer be read (the server key changed). Connect it again." });
    return { ok: false, message: "The saved token can no longer be read. Connect it again." };
  }
  const currency = i.currency ?? "EUR";

  if (i.provider === "stripe") {
    const bal = await stripeBalance(token, currency);
    if (!bal.ok) {
      await recordSync(id, { ok: false, error: bal.error });
      return { ok: false, message: bal.error };
    }
    const lines = await stripeLines(token, i.lastSyncAt);
    if (!lines.ok) {
      await recordSync(id, { ok: true, error: lines.error, balanceCents: bal.value.cents, currency: bal.value.currency });
      return { ok: true, message: `Balance updated. ${lines.error}` };
    }
    const added = await saveBankLines(id, lines.value);
    const matched = await autoMatch(id);
    await recordSync(id, { ok: true, balanceCents: bal.value.cents, currency: bal.value.currency });
    return { ok: true, message: `Balance updated · ${added} new lines · ${matched} matched to the books.` };
  }

  if (i.provider === "wise") {
    const w = await wiseConnect(token, currency);
    if (!w.ok) {
      await recordSync(id, { ok: false, error: w.error });
      return { ok: false, message: w.error };
    }
    const meta = { profileId: w.value.profileId, balanceId: w.value.balanceId, profileName: w.value.profileName };
    const lines = await wiseLines(token, meta, currency, i.lastSyncAt);
    if (!lines.ok) {
      await recordSync(id, { ok: true, error: lines.error, balanceCents: w.value.cents, currency: w.value.currency, meta });
      return { ok: true, message: `Balance updated. ${lines.error}` };
    }
    const added = await saveBankLines(id, lines.value);
    const matched = await autoMatch(id);
    await recordSync(id, { ok: true, balanceCents: w.value.cents, currency: w.value.currency, meta });
    return { ok: true, message: `Balance updated · ${added} new lines · ${matched} matched to the books.` };
  }

  return { ok: true, message: "This one is updated by uploading the statement CSV." };
}

/** On opening the page: every connection not synced for six hours is synced, quietly. */
export async function syncStale(): Promise<void> {
  const all = await listIntegrations();
  const stale = all.filter((i) => i.hasSecret && (!i.lastSyncAt || Date.now() - Date.parse(i.lastSyncAt) > 6 * 3600_000));
  await Promise.all(stale.map((i) => syncIntegration(i.id).catch(() => null)));
}
